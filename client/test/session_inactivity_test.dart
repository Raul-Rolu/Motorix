// 008-configuracion-seguridad-reportes, T080 (bloque P2, US6; FR-016, CA-23):
// cierre de sesión por inactividad y renovación del token con la actividad.
//
// - Sin actividad durante la vigencia (el ajuste de inactividad que informa el
//   login) la sesión se cierra y el login muestra «Tu sesión se cerró por
//   inactividad.».
// - Con actividad el token se renueva a lo sumo una vez por `vigencia / 3`
//   (mínimo 60 segundos) y nunca con dos renovaciones en paralelo.
// - La consulta periódica de avisos NO cuenta como actividad ni renueva.
// - Una renovación con 401 cierra la sesión; un fallo de red no.
// - El temporizador se cancela al cerrar sesión.
//
// Sin red y sin esperas reales: un reloj falso (`ahora`) que la prueba avanza y
// un cliente HTTP falso con el formato del contrato.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:motorix_client/config/theme.dart';
import 'package:motorix_client/providers/auth_provider.dart';
import 'package:motorix_client/providers/notifications_provider.dart';
import 'package:motorix_client/providers/session_provider.dart';
import 'package:motorix_client/screens/login_screen.dart';
import 'package:motorix_client/services/api_client.dart';
import 'package:motorix_client/widgets/session_activity.dart';
import 'package:provider/provider.dart';

/// Cliente HTTP falso: login, renovación y avisos.
class _ClienteFalso extends Fake implements http.Client {
  final List<http.Request> peticiones = [];

  /// Minutos de inactividad que informa el login (el ajuste vigente).
  int inactividadMinutos = 30;

  /// Minutos que informa la renovación (por omisión, los mismos del login).
  int? inactividadRenovacion;

  /// Estado de `POST /auth/renew` (200, 401 o 500) y, si se define, una puerta
  /// para simular una respuesta que aún no llega.
  int statusRenovacion = 200;

  /// Estado de `GET /notifications` (401 simula el token ya vencido en el servidor).
  int statusAvisos = 200;
  bool fallaDeRed = false;
  Completer<void>? puerta;

  int get renovaciones => peticiones.where((p) => p.url.path.endsWith('/auth/renew')).length;
  int get consultasAvisos => peticiones.where((p) => p.url.path.endsWith('/notifications')).length;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final peticion = request as http.Request;
    peticiones.add(peticion);
    var status = 200;
    Map<String, dynamic> cuerpo;

    if (peticion.url.path.endsWith('/auth/login')) {
      cuerpo = {
        'token': 't-login',
        'inactividadMinutos': inactividadMinutos,
        'usuario': {
          'id': 1,
          'username': 'admin',
          'email': 'admin@motorix.local',
          'fullName': 'Administrador',
          'role': 'ADMIN',
        },
      };
    } else if (peticion.url.path.endsWith('/auth/renew')) {
      await puerta?.future;
      if (fallaDeRed) throw http.ClientException('sin red');
      status = statusRenovacion;
      cuerpo = status == 200
          ? {
              'token': 't-renovado-$renovaciones',
              'inactividadMinutos': inactividadRenovacion ?? inactividadMinutos,
            }
          : {
              'error': {
                'codigo': status == 401 ? 'SESION_EXPIRADA' : 'ERROR_INTERNO',
                'mensaje': 'Error de prueba.',
              },
            };
    } else if (peticion.url.path.endsWith('/notifications')) {
      status = statusAvisos;
      cuerpo = status == 200
          ? {'total': 0, 'noLeidos': 0, 'datos': <dynamic>[]}
          : {
              'error': {'codigo': 'SESION_EXPIRADA', 'mensaje': 'La sesión expiró.'},
            };
    } else {
      status = 404;
      cuerpo = {'error': {'codigo': 'NO_ENCONTRADO', 'mensaje': 'No encontrado.'}};
    }

    return http.StreamedResponse(
      Stream.value(utf8.encode(jsonEncode(cuerpo))),
      status,
      headers: {'content-type': 'application/json'},
    );
  }
}

/// Entorno con reloj falso: la sesión ya iniciada y el proveedor de sesión creado.
class _Entorno {
  final _ClienteFalso cliente;
  final ApiClient api;
  final AuthProvider auth;
  late final SessionProvider sesion;
  DateTime ahora = DateTime(2026, 1, 5, 9, 0, 0);

  _Entorno._(this.cliente, this.api, this.auth);

  static Future<_Entorno> crear({int inactividadMinutos = 30, bool iniciarSesion = true}) async {
    final cliente = _ClienteFalso()..inactividadMinutos = inactividadMinutos;
    final api = ApiClient(baseUrl: 'http://prueba/api', httpClient: cliente);
    final auth = AuthProvider(api);
    final entorno = _Entorno._(cliente, api, auth);
    entorno.sesion = SessionProvider(
      auth,
      reloj: () => entorno.ahora,
      verificacion: const Duration(seconds: 15),
    );
    if (iniciarSesion) {
      expect(await auth.login('admin', 'Admin123'), isTrue);
    }
    return entorno;
  }

  /// Avanza el reloj falso y ejecuta una verificación (lo que hace el temporizador).
  Future<void> pasar(Duration tiempo) async {
    ahora = ahora.add(tiempo);
    await sesion.verificar();
  }

  void liberar() {
    sesion.dispose();
    auth.dispose();
  }
}

void main() {
  group('inactividad', () {
    test('sin actividad durante la vigencia (30 min por omisión) cierra la sesión por inactividad', () async {
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);
      expect(entorno.auth.autenticado, isTrue);
      expect(entorno.auth.inactividadMinutos, 30);

      await entorno.pasar(const Duration(minutes: 29, seconds: 45));
      expect(entorno.auth.autenticado, isTrue, reason: 'aún no se cumplen los 30 minutos');

      await entorno.pasar(const Duration(seconds: 15));

      expect(entorno.auth.autenticado, isFalse);
      expect(entorno.auth.cierrePorInactividad, isTrue);
      expect(entorno.api.token, isNull);
      expect(entorno.auth.sesionExpirada, isFalse, reason: 'no es una expiración del servidor');
    });

    test('la vigencia sigue el ajuste que informa el login (10 minutos)', () async {
      final entorno = await _Entorno.crear(inactividadMinutos: 10);
      addTearDown(entorno.liberar);

      await entorno.pasar(const Duration(minutes: 9, seconds: 45));
      expect(entorno.auth.autenticado, isTrue);

      await entorno.pasar(const Duration(seconds: 15));
      expect(entorno.auth.cierrePorInactividad, isTrue);
    });

    test('cada actividad reinicia la cuenta de inactividad', () async {
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);

      await entorno.pasar(const Duration(minutes: 25));
      entorno.sesion.registrarActividad();
      await entorno.pasar(const Duration(minutes: 25));

      expect(entorno.auth.autenticado, isTrue, reason: '25 minutos desde la última actividad');

      await entorno.pasar(const Duration(minutes: 5));
      expect(entorno.auth.cierrePorInactividad, isTrue);
    });

    test('el cierre por inactividad avisa para volver al login', () async {
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);
      var avisos = 0;
      entorno.auth.alExpirar = () => avisos++;

      await entorno.pasar(const Duration(minutes: 31));

      expect(avisos, 1);
    });

    testWidgets('el login muestra «Tu sesión se cerró por inactividad.» y lo borra al iniciar de nuevo', (tester) async {
      final entorno = await _Entorno.crear();
      await entorno.pasar(const Duration(minutes: 31));

      await tester.pumpWidget(
        ChangeNotifierProvider<AuthProvider>.value(
          value: entorno.auth,
          child: MaterialApp(theme: temaMotorix(), home: const LoginScreen()),
        ),
      );

      expect(find.text('Tu sesión se cerró por inactividad.'), findsOneWidget);
      expect(find.text('Su sesión expiró; inicie sesión de nuevo.'), findsNothing);

      await entorno.auth.login('admin', 'Admin123');
      expect(entorno.auth.cierrePorInactividad, isFalse);

      // El temporizador de la sesión se libera dentro de la prueba (testWidgets
      // revisa los temporizadores pendientes antes de los addTearDown).
      entorno.liberar();
    });

    test('un cierre de sesión manual no muestra el mensaje de inactividad', () async {
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);

      entorno.auth.cerrarSesion();

      expect(entorno.auth.cierrePorInactividad, isFalse);
      expect(entorno.auth.sesionExpirada, isFalse);
    });
  });

  group('renovación del token con la actividad', () {
    test('sin actividad nunca renueva', () async {
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);

      await entorno.pasar(const Duration(minutes: 15));

      expect(entorno.cliente.renovaciones, 0);
    });

    test('con actividad renueva el token después de vigencia/3 (10 minutos) y guarda el nuevo', () async {
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);

      await entorno.pasar(const Duration(minutes: 9, seconds: 45));
      entorno.sesion.registrarActividad();
      await entorno.pasar(const Duration(seconds: 10));
      expect(entorno.cliente.renovaciones, 0, reason: 'hace menos de 10 minutos del login');

      await entorno.pasar(const Duration(seconds: 15));

      expect(entorno.cliente.renovaciones, 1);
      expect(entorno.api.token, 't-renovado-1');
      expect(entorno.auth.autenticado, isTrue);
    });

    test('a lo sumo una renovación por vigencia/3 aunque haya actividad continua', () async {
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);

      // 35 minutos de actividad constante, verificando cada 15 segundos.
      for (var segundos = 0; segundos < 35 * 60; segundos += 15) {
        entorno.sesion.registrarActividad();
        await entorno.pasar(const Duration(seconds: 15));
      }

      // 35 minutos / 10 = 3 renovaciones como máximo (a los 10, 20 y 30).
      expect(entorno.cliente.renovaciones, lessThanOrEqualTo(3));
      expect(entorno.cliente.renovaciones, greaterThanOrEqualTo(3));
      expect(entorno.auth.autenticado, isTrue);
    });

    test('con actividad la sesión sobrevive más que la vigencia original', () async {
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);

      for (var minuto = 0; minuto < 95; minuto++) {
        entorno.sesion.registrarActividad();
        await entorno.pasar(const Duration(minutes: 1));
      }

      expect(entorno.auth.autenticado, isTrue);
    });

    test('el intervalo mínimo de renovación es 60 segundos (vigencia de 1 minuto)', () async {
      final entorno = await _Entorno.crear(inactividadMinutos: 1);
      addTearDown(entorno.liberar);
      expect(entorno.sesion.intervaloRenovacion, const Duration(seconds: 60));

      entorno.sesion.registrarActividad();
      await entorno.pasar(const Duration(seconds: 45));
      expect(entorno.cliente.renovaciones, 0, reason: 'vigencia/3 serían 20 s, pero el mínimo es 60 s');

      entorno.sesion.registrarActividad();
      await entorno.pasar(const Duration(seconds: 15));
      expect(entorno.cliente.renovaciones, 1);
    });

    test('el intervalo es vigencia/3 para vigencias normales', () async {
      final entorno = await _Entorno.crear(inactividadMinutos: 30);
      addTearDown(entorno.liberar);
      expect(entorno.sesion.intervaloRenovacion, const Duration(minutes: 10));
    });

    test('nunca hay dos renovaciones en paralelo', () async {
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);
      entorno.cliente.puerta = Completer<void>();

      entorno.sesion.registrarActividad();
      final primera = entorno.pasar(const Duration(minutes: 11));
      await Future<void>.delayed(Duration.zero);
      entorno.sesion.registrarActividad();
      await entorno.pasar(const Duration(seconds: 15));
      await entorno.pasar(const Duration(seconds: 15));

      expect(entorno.cliente.renovaciones, 1, reason: 'la primera sigue sin responder');

      entorno.cliente.puerta!.complete();
      await primera;
      expect(entorno.cliente.renovaciones, 1);
    });

    test('una renovación actualiza la vigencia con el ajuste que informa el servidor', () async {
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);
      entorno.cliente.inactividadRenovacion = 15;

      entorno.sesion.registrarActividad();
      await entorno.pasar(const Duration(minutes: 11));

      expect(entorno.auth.inactividadMinutos, 15);
      expect(entorno.sesion.intervaloRenovacion, const Duration(minutes: 5));
    });

    test('la actividad anterior a la renovación no provoca otra renovación inmediata', () async {
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);

      entorno.sesion.registrarActividad();
      await entorno.pasar(const Duration(minutes: 11));
      expect(entorno.cliente.renovaciones, 1);

      await entorno.pasar(const Duration(minutes: 11));

      expect(entorno.cliente.renovaciones, 1, reason: 'sin actividad nueva no se renueva');
    });

    test('la renovación llega aunque la última actividad haya sido antes del intervalo', () async {
      // Actividad a los 9 minutos y luego nada: el token debe renovarse a los 10 para
      // que dure al menos hasta que se cumpla la inactividad (9 + 30 minutos).
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);

      await entorno.pasar(const Duration(minutes: 9));
      entorno.sesion.registrarActividad();
      await entorno.pasar(const Duration(minutes: 2));

      expect(entorno.cliente.renovaciones, 1);
    });
  });

  group('renovación con errores', () {
    test('un 401 al renovar cierra la sesión como expirada (no como inactividad)', () async {
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);
      entorno.cliente.statusRenovacion = 401;

      entorno.sesion.registrarActividad();
      await entorno.pasar(const Duration(minutes: 11));

      expect(entorno.auth.autenticado, isFalse);
      expect(entorno.auth.sesionExpirada, isTrue);
      expect(entorno.auth.cierrePorInactividad, isFalse);
      expect(entorno.api.token, isNull);
    });

    test('un fallo de red al renovar no cierra la sesión y se reintenta más adelante', () async {
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);
      entorno.cliente.fallaDeRed = true;

      entorno.sesion.registrarActividad();
      await entorno.pasar(const Duration(minutes: 11));

      expect(entorno.auth.autenticado, isTrue);
      expect(entorno.api.token, 't-login');

      entorno.cliente.fallaDeRed = false;
      entorno.sesion.registrarActividad();
      await entorno.pasar(const Duration(minutes: 1));

      expect(entorno.auth.autenticado, isTrue);
      expect(entorno.api.token, startsWith('t-renovado'));
    });

    test('un error 500 al renovar tampoco cierra la sesión', () async {
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);
      entorno.cliente.statusRenovacion = 500;

      entorno.sesion.registrarActividad();
      await entorno.pasar(const Duration(minutes: 11));

      expect(entorno.auth.autenticado, isTrue);
    });
  });

  group('la consulta periódica de avisos no cuenta como actividad', () {
    test('consultar avisos no renueva el token ni evita el cierre por inactividad', () async {
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);
      final avisos = NotificationsProvider(entorno.api, entorno.auth, intervalo: const Duration(hours: 1));
      addTearDown(avisos.dispose);
      await Future<void>.delayed(Duration.zero);

      // El proveedor de avisos consulta cada vez; la sesión no se entera.
      for (var minuto = 0; minuto < 29; minuto++) {
        await avisos.cargar(silencioso: true);
        await entorno.pasar(const Duration(minutes: 1));
      }
      expect(entorno.cliente.consultasAvisos, greaterThan(20));
      expect(entorno.cliente.renovaciones, 0, reason: 'solo la actividad del usuario renueva');
      expect(entorno.auth.autenticado, isTrue);

      await avisos.cargar(silencioso: true);
      await entorno.pasar(const Duration(minutes: 2));

      expect(entorno.auth.cierrePorInactividad, isTrue);
    });

    test('el código del proveedor de avisos no usa la sesión ni la actividad', () {
      // La consulta periódica solo conoce AuthProvider y ApiClient: no puede
      // registrar actividad aunque quisiera.
      final fuente = File('lib/providers/notifications_provider.dart').readAsStringSync();

      expect(fuente, isNot(contains('session_provider')));
      expect(fuente, isNot(contains('registrarActividad')));
      expect(fuente, isNot(contains('renovarToken')));
    });
  });

  group('carrera entre el vencimiento del token y la inactividad', () {
    // El token vence a los N minutos de emitirse y el cliente cuenta la inactividad
    // desde que recibe la respuesta; además la revisión puede llegar hasta 15 s
    // tarde. Un sondeo de avisos en esa ventana recibe 401, y el cierre debe seguir
    // explicándose como INACTIVIDAD (el usuario no hizo nada), no como expiración.
    test('un sondeo que recibe 401 justo al vencer el token cierra por inactividad', () async {
      final entorno = await _Entorno.crear(inactividadMinutos: 5);
      addTearDown(entorno.liberar);
      final avisos = NotificationsProvider(entorno.api, entorno.auth, intervalo: const Duration(hours: 1));
      addTearDown(avisos.dispose);
      await Future<void>.delayed(Duration.zero);

      // Pasan exactamente los 5 minutos y el servidor ya rechaza el token; la
      // revisión de 15 s todavía no corrió (el sondeo llegó primero).
      entorno.ahora = entorno.ahora.add(const Duration(minutes: 5));
      entorno.cliente.statusAvisos = 401;
      await avisos.cargar(silencioso: true);

      expect(entorno.auth.autenticado, isFalse);
      expect(entorno.auth.cierrePorInactividad, isTrue);
      expect(entorno.auth.sesionExpirada, isFalse);
    });

    test('también cuando el sondeo llega unos segundos antes de cumplirse la vigencia (latencia del login)', () async {
      final entorno = await _Entorno.crear(inactividadMinutos: 5);
      addTearDown(entorno.liberar);
      final avisos = NotificationsProvider(entorno.api, entorno.auth, intervalo: const Duration(hours: 1));
      addTearDown(avisos.dispose);
      await Future<void>.delayed(Duration.zero);

      entorno.ahora = entorno.ahora.add(const Duration(minutes: 4, seconds: 40));
      entorno.cliente.statusAvisos = 401;
      await avisos.cargar(silencioso: true);

      expect(entorno.auth.cierrePorInactividad, isTrue);
      expect(entorno.auth.sesionExpirada, isFalse);
    });

    test('varios sondeos con 401 a la vez no cambian el motivo del cierre', () async {
      final entorno = await _Entorno.crear(inactividadMinutos: 5);
      addTearDown(entorno.liberar);
      entorno.ahora = entorno.ahora.add(const Duration(minutes: 5));
      entorno.cliente.statusAvisos = 401;

      // Dos peticiones en vuelo que reciben 401 una tras otra.
      await Future.wait([
        entorno.api.get('/notifications').catchError((_) => <String, dynamic>{}),
        entorno.api.get('/notifications').catchError((_) => <String, dynamic>{}),
      ]);

      expect(entorno.auth.cierrePorInactividad, isTrue);
      expect(entorno.auth.sesionExpirada, isFalse);
    });

    test('un 401 con el usuario activo sigue siendo una sesión expirada (p. ej. cuenta desactivada)', () async {
      final entorno = await _Entorno.crear(inactividadMinutos: 5);
      addTearDown(entorno.liberar);
      final avisos = NotificationsProvider(entorno.api, entorno.auth, intervalo: const Duration(hours: 1));
      addTearDown(avisos.dispose);
      await Future<void>.delayed(Duration.zero);

      entorno.ahora = entorno.ahora.add(const Duration(minutes: 2));
      entorno.sesion.registrarActividad();
      entorno.ahora = entorno.ahora.add(const Duration(seconds: 20));
      entorno.cliente.statusAvisos = 401;
      await avisos.cargar(silencioso: true);

      expect(entorno.auth.sesionExpirada, isTrue);
      expect(entorno.auth.cierrePorInactividad, isFalse);
    });

    test('un 401 con poca inactividad (3 de 5 minutos) sigue siendo una sesión expirada', () async {
      final entorno = await _Entorno.crear(inactividadMinutos: 5);
      addTearDown(entorno.liberar);
      entorno.ahora = entorno.ahora.add(const Duration(minutes: 3));
      entorno.cliente.statusAvisos = 401;

      await entorno.api.get('/notifications').catchError((_) => <String, dynamic>{});

      expect(entorno.auth.sesionExpirada, isTrue);
      expect(entorno.auth.cierrePorInactividad, isFalse);
    });

    test('el 401 de credenciales incorrectas en el login no se confunde con inactividad', () async {
      final entorno = await _Entorno.crear(iniciarSesion: false);
      addTearDown(entorno.liberar);
      entorno.ahora = entorno.ahora.add(const Duration(hours: 2));

      // Sin sesión no hay inactividad que valorar.
      entorno.auth.cerrarSesionPorExpiracion();

      expect(entorno.auth.cierrePorInactividad, isFalse);
    });
  });

  group('ciclo de vida del temporizador', () {
    test('se activa al iniciar sesión y se cancela al cerrar sesión', () async {
      final entorno = await _Entorno.crear(iniciarSesion: false);
      addTearDown(entorno.liberar);
      expect(entorno.sesion.temporizadorActivo, isFalse, reason: 'sin sesión no hay temporizador');

      await entorno.auth.login('admin', 'Admin123');
      expect(entorno.sesion.temporizadorActivo, isTrue);

      entorno.auth.cerrarSesion();
      expect(entorno.sesion.temporizadorActivo, isFalse);
    });

    test('se cancela cuando el servidor expira la sesión y cuando se cierra por inactividad', () async {
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);

      entorno.auth.cerrarSesionPorExpiracion();
      expect(entorno.sesion.temporizadorActivo, isFalse);

      await entorno.auth.login('admin', 'Admin123');
      expect(entorno.sesion.temporizadorActivo, isTrue);
      await entorno.pasar(const Duration(minutes: 31));
      expect(entorno.sesion.temporizadorActivo, isFalse);
    });

    test('con la sesión ya iniciada al crearse, el proveedor arranca el temporizador', () async {
      final cliente = _ClienteFalso();
      final api = ApiClient(baseUrl: 'http://prueba/api', httpClient: cliente);
      final auth = AuthProvider(api);
      addTearDown(auth.dispose);
      await auth.login('admin', 'Admin123');

      final sesion = SessionProvider(auth);
      addTearDown(sesion.dispose);

      expect(sesion.temporizadorActivo, isTrue);
    });

    test('registrar actividad sin sesión no hace nada ni lanza', () async {
      final entorno = await _Entorno.crear(iniciarSesion: false);
      addTearDown(entorno.liberar);

      entorno.sesion.registrarActividad();
      await entorno.sesion.verificar();

      expect(entorno.cliente.renovaciones, 0);
    });

    test('al iniciar otra sesión la cuenta de inactividad empieza de cero', () async {
      final entorno = await _Entorno.crear();
      addTearDown(entorno.liberar);
      await entorno.pasar(const Duration(minutes: 31));
      expect(entorno.auth.cierrePorInactividad, isTrue);

      await entorno.auth.login('admin', 'Admin123');
      await entorno.pasar(const Duration(minutes: 5));

      expect(entorno.auth.autenticado, isTrue);
    });
  });

  group('detector de actividad (widget)', () {
    testWidgets('un toque o un movimiento del puntero y una tecla registran actividad; nada más', (tester) async {
      final entorno = await _Entorno.crear();

      await tester.pumpWidget(
        ChangeNotifierProvider<SessionProvider>.value(
          value: entorno.sesion,
          child: const MaterialApp(
            home: ActividadSesion(
              child: Scaffold(body: Center(child: Text('contenido'))),
            ),
          ),
        ),
      );

      // Sin interacción: 11 minutos después no hay renovación.
      await entorno.pasar(const Duration(minutes: 11));
      expect(entorno.cliente.renovaciones, 0);

      // Un toque cuenta como actividad: la siguiente verificación renueva.
      await tester.tap(find.text('contenido'));
      await entorno.pasar(const Duration(minutes: 11));
      expect(entorno.cliente.renovaciones, 1);

      // Una tecla también.
      await tester.sendKeyEvent(LogicalKeyboardKey.keyA);
      await entorno.pasar(const Duration(minutes: 11));
      expect(entorno.cliente.renovaciones, 2);

      entorno.liberar();
    });
  });
}

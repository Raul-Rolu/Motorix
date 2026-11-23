// 008-configuracion-seguridad-reportes, T018 (bloque P1, US1; FR-002, CA-1): la
// pantalla Configuración muestra los datos del taller, los guarda con un mensaje
// de éxito, valida que el nombre sea obligatorio, muestra el error del servidor
// sin trazas y maneja los estados de carga, error y sin permiso
// (docs/design-system.md 8.4). La sección solo se agrega al menú para ADMIN
// (la autorización real es del servidor; aquí se prueba la respuesta 403).
//
// Sin red: un cliente HTTP falso responde con el formato del contrato.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:motorix_client/config/theme.dart';
import 'package:motorix_client/models/user.dart';
import 'package:motorix_client/providers/auth_provider.dart';
import 'package:motorix_client/providers/settings_provider.dart';
import 'package:motorix_client/screens/settings_screen.dart';
import 'package:motorix_client/services/api_client.dart';
import 'package:provider/provider.dart';

/// Respuesta de `GET`/`PUT /api/settings` en P1 (sin el grupo `seguridad`).
Map<String, dynamic> _ajustesJson({
  String nombre = 'Motorix',
  String direccion = 'Av. Taller 123, Col. Centro',
  String telefono = '555-000-0000',
  int margenDias = 30,
  int margenKm = 1000,
  int diasDetenida = 3,
}) =>
    {
      'taller': {'nombre': nombre, 'direccion': direccion, 'telefono': telefono},
      'operacion': {
        'margenProximoDias': margenDias,
        'margenProximoKm': margenKm,
        'diasOrdenDetenida': diasDetenida,
      },
      'limites': {
        'margenProximoDias': [1, 365],
        'margenProximoKm': [100, 50000],
        'diasOrdenDetenida': [1, 90],
      },
    };

/// Cliente HTTP falso de `/api/settings`.
class _ClienteFalso extends Fake implements http.Client {
  final List<http.BaseRequest> peticiones = [];
  Map<String, dynamic> guardado = _ajustesJson();
  int statusLectura = 200;
  int statusEscritura = 200;
  String mensajeError = 'El nombre del taller no puede exceder 100 caracteres.';
  Completer<void>? puerta;

  List<http.Request> get escrituras =>
      peticiones.whereType<http.Request>().where((p) => p.method == 'PUT').toList();

  int get lecturas => peticiones.where((p) => p.method == 'GET').length;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    peticiones.add(request);
    Map<String, dynamic> cuerpo;
    var status = 200;

    if (request.method == 'GET') {
      await puerta?.future;
      status = statusLectura;
      cuerpo = status == 200
          ? guardado
          : {
              'error': {
                'codigo': status == 403 ? 'NO_AUTORIZADO' : 'ERROR_INTERNO',
                'mensaje': status == 403 ? 'No tiene permisos para realizar esta operación.' : 'Error del servidor.',
              },
            };
    } else {
      final datos = jsonDecode((request as http.Request).body) as Map<String, dynamic>;
      status = statusEscritura;
      if (status == 200) {
        final taller = datos['taller'] as Map<String, dynamic>? ?? {};
        final actual = guardado['taller'] as Map<String, dynamic>;
        guardado = {
          ...guardado,
          'taller': {...actual, ...taller},
        };
        cuerpo = guardado;
      } else {
        cuerpo = {'error': {'codigo': 'DATOS_INVALIDOS', 'mensaje': mensajeError}};
      }
    }
    return http.StreamedResponse(
      Stream.fromIterable([utf8.encode(jsonEncode(cuerpo))]),
      status,
      headers: {'content-type': 'application/json'},
    );
  }

  @override
  void close() {}
}

AuthProvider _authComo(String rol, ApiClient api) {
  final auth = AuthProvider(api);
  auth.usuario = Usuario.desdeJson({
    'id': 1,
    'username': rol.toLowerCase(),
    'fullName': 'Usuario de prueba',
    'role': rol,
    'active': true,
  });
  return auth;
}

Future<void> _montar(WidgetTester tester, _ClienteFalso cliente,
    {String rol = 'ADMIN', bool esperar = true}) async {
  final api = ApiClient(httpClient: cliente);
  final auth = _authComo(rol, api);
  await tester.binding.setSurfaceSize(const Size(1200, 900));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider<SettingsProvider>(create: (_) => SettingsProvider(api, auth)),
      ],
      child: MaterialApp(
        theme: temaMotorix(),
        home: const Scaffold(body: SettingsScreen()),
      ),
    ),
  );
  if (esperar) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump();
  }
}

String _valorDe(WidgetTester tester, String clave) =>
    tester.widget<TextFormField>(find.byKey(Key(clave))).controller!.text;

void main() {
  group('datos del taller', () {
    testWidgets('muestra la tarjeta «Datos del taller» con los valores guardados', (tester) async {
      final cliente = _ClienteFalso()
        ..guardado = _ajustesJson(nombre: 'Taller El Pistón', direccion: 'Calle Real 45', telefono: '555-123-4567');

      await _montar(tester, cliente);

      expect(find.text('Configuración'), findsWidgets);
      expect(find.text('Datos del taller'), findsOneWidget);
      expect(_valorDe(tester, 'campoNombreTaller'), 'Taller El Pistón');
      expect(_valorDe(tester, 'campoDireccionTaller'), 'Calle Real 45');
      expect(_valorDe(tester, 'campoTelefonoTaller'), '555-123-4567');
    });

    testWidgets('guardar envía solo el grupo taller y muestra el mensaje de éxito', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);

      await tester.enterText(find.byKey(const Key('campoNombreTaller')), '  Taller Nuevo ');
      await tester.enterText(find.byKey(const Key('campoTelefonoTaller')), '555-777-8888');
      await tester.tap(find.byKey(const Key('botonGuardarTaller')));
      await tester.pumpAndSettle();

      expect(cliente.escrituras, hasLength(1));
      final cuerpo = jsonDecode(cliente.escrituras.single.body) as Map<String, dynamic>;
      expect(cuerpo.keys, ['taller']);
      expect(cuerpo['taller'], {
        'nombre': 'Taller Nuevo',
        'direccion': 'Av. Taller 123, Col. Centro',
        'telefono': '555-777-8888',
      });
      expect(find.text('Datos del taller guardados.'), findsOneWidget);
    });

    testWidgets('con el nombre vacío no envía nada y pide el nombre', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);

      await tester.enterText(find.byKey(const Key('campoNombreTaller')), '   ');
      await tester.tap(find.byKey(const Key('botonGuardarTaller')));
      await tester.pumpAndSettle();

      expect(cliente.escrituras, isEmpty);
      expect(find.text('El nombre del taller es obligatorio.'), findsOneWidget);
    });

    testWidgets('limita los campos a 100, 150 y 30 caracteres', (tester) async {
      await _montar(tester, _ClienteFalso());

      await tester.enterText(find.byKey(const Key('campoNombreTaller')), 'a' * 120);
      await tester.enterText(find.byKey(const Key('campoDireccionTaller')), 'b' * 200);
      await tester.enterText(find.byKey(const Key('campoTelefonoTaller')), '5' * 40);

      expect(_valorDe(tester, 'campoNombreTaller').length, 100);
      expect(_valorDe(tester, 'campoDireccionTaller').length, 150);
      expect(_valorDe(tester, 'campoTelefonoTaller').length, 30);
    });

    testWidgets('un error del servidor se muestra en español, sin trazas, y conserva lo escrito', (tester) async {
      final cliente = _ClienteFalso()..statusEscritura = 400;
      await _montar(tester, cliente);

      await tester.enterText(find.byKey(const Key('campoNombreTaller')), 'Nombre con error');
      await tester.tap(find.byKey(const Key('botonGuardarTaller')));
      await tester.pumpAndSettle();

      expect(find.text('El nombre del taller no puede exceder 100 caracteres.'), findsOneWidget);
      expect(find.textContaining('Exception'), findsNothing);
      expect(_valorDe(tester, 'campoNombreTaller'), 'Nombre con error');
    });
  });

  group('estados de la pantalla (8.4)', () {
    testWidgets('mientras carga muestra un indicador de progreso', (tester) async {
      final cliente = _ClienteFalso()..puerta = Completer<void>();

      await _montar(tester, cliente, esperar: false);

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.byKey(const Key('campoNombreTaller')), findsNothing);

      cliente.puerta!.complete();
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('campoNombreTaller')), findsOneWidget);
    });

    testWidgets('si falla la carga muestra el error con «Reintentar» y se recupera', (tester) async {
      final cliente = _ClienteFalso()..statusLectura = 500;
      await _montar(tester, cliente);

      expect(find.text('No se pudo cargar la configuración.'), findsOneWidget);
      expect(find.text('Reintentar'), findsOneWidget);
      expect(find.byKey(const Key('campoNombreTaller')), findsNothing);

      cliente.statusLectura = 200;
      await tester.tap(find.text('Reintentar'));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('campoNombreTaller')), findsOneWidget);
    });

    testWidgets('con un rol sin permiso (403) muestra el mensaje de permisos y no los campos', (tester) async {
      final cliente = _ClienteFalso()..statusLectura = 403;

      await _montar(tester, cliente, rol: 'RECEPTIONIST');

      expect(find.text('No tiene permisos para ver la configuración.'), findsOneWidget);
      expect(find.byKey(const Key('campoNombreTaller')), findsNothing);
    });
  });
}

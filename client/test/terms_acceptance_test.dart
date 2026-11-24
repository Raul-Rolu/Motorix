// 008-configuracion-seguridad-reportes, T090 (bloque P2, US7; FR-020, CA-16,
// CA-17): tras el login, si falta aceptar la versión vigente de los términos se
// muestra la pantalla con los términos y el aviso de privacidad; «Aceptar» entra;
// «Rechazar» pide confirmación, cierra la sesión y vuelve al login; un
// `403 TERMS_NOT_ACCEPTED` en cualquier petición lleva a la pantalla; sin
// pendiente no se muestra. Sin red: cliente HTTP falso con el formato del contrato.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:motorix_client/config/theme.dart';
import 'package:motorix_client/models/user.dart';
import 'package:motorix_client/providers/auth_provider.dart';
import 'package:motorix_client/providers/terms_provider.dart';
import 'package:motorix_client/screens/login_screen.dart';
import 'package:motorix_client/screens/terms_acceptance_screen.dart';
import 'package:motorix_client/services/api_client.dart';
import 'package:provider/provider.dart';

const _usuarioJson = {
  'id': 7,
  'username': 'recepcion',
  'fullName': 'Recepción del Taller',
  'role': 'RECEPTIONIST',
  'active': true,
};

Map<String, dynamic> _version(int id, int version) => {
      'id': id,
      'version': version,
      'terminos': 'Texto de los términos de la versión $version: uso permitido y confidencialidad.',
      'avisoPrivacidad': 'Texto del aviso de privacidad de la versión $version.',
      'publicadaEn': '2026-11-20T12:00:00.000Z',
    };

class _ClienteFalso extends Fake implements http.Client {
  final List<http.BaseRequest> peticiones = [];

  /// Versión vigente (null = no hay compuerta) y si el usuario ya la aceptó.
  Map<String, dynamic>? vigente = _version(2, 2);
  bool aceptada = false;

  /// Estado con el que responde `GET /terms/current`.
  int statusVigente = 200;

  /// Estado con el que responde `GET /clients` (para simular el 403 de la compuerta).
  int statusClientes = 200;
  String codigoClientes = 'TERMS_NOT_ACCEPTED';

  /// Respuesta de `POST /terms/accept`.
  int statusAceptar = 200;
  Map<String, dynamic>? vigenteTrasRechazo;

  /// Si se asigna, `POST /terms/accept` espera a que se complete (petición en vuelo).
  Completer<void>? puertaAceptar;

  List<http.BaseRequest> de(String ruta) => peticiones.where((p) => p.url.path.endsWith(ruta)).toList();

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    peticiones.add(request);
    final ruta = request.url.path;
    var status = 200;
    Map<String, dynamic> cuerpo;

    if (ruta.endsWith('/auth/login')) {
      cuerpo = {'token': 'token-1', 'inactividadMinutos': 30, 'usuario': _usuarioJson};
    } else if (ruta.endsWith('/terms/current')) {
      status = statusVigente;
      cuerpo = status == 200
          ? {'vigente': vigente, 'aceptada': vigente == null ? true : aceptada}
          : {'error': {'codigo': 'ERROR_INTERNO', 'mensaje': 'Error del servidor.'}};
    } else if (ruta.endsWith('/terms/accept')) {
      await puertaAceptar?.future;
      status = statusAceptar;
      if (status == 200) {
        aceptada = true;
        cuerpo = {'aceptada': true, 'version': vigente!['version']};
      } else if (status == 409) {
        if (vigenteTrasRechazo != null) vigente = vigenteTrasRechazo;
        cuerpo = {
          'error': {'codigo': 'TERMS_VERSION_OUTDATED', 'mensaje': 'Esa versión ya no es la vigente.'},
        };
      } else {
        cuerpo = {'error': {'codigo': 'ERROR_INTERNO', 'mensaje': 'Error del servidor.'}};
      }
    } else if (ruta.endsWith('/clients')) {
      status = statusClientes;
      cuerpo = status == 200
          ? {'datos': []}
          : {
              'error': {
                'codigo': codigoClientes,
                'mensaje': codigoClientes == 'TERMS_NOT_ACCEPTED'
                    ? 'No ha aceptado la versión vigente de los términos y condiciones.'
                    : 'No tiene permisos para realizar esta operación.',
              },
            };
    } else {
      cuerpo = {};
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

class _Entorno {
  final _ClienteFalso cliente;
  final ApiClient api;
  final AuthProvider auth;
  final TermsProvider terminos;
  final GlobalKey<NavigatorState> navegador;

  _Entorno(this.cliente, this.api, this.auth, this.terminos, this.navegador);

  /// Una petición cualquiera de un módulo (la que recibiría el 403 de la compuerta).
  Future<void> pedirClientes() async {
    try {
      await api.get('/clients');
    } on ExcepcionApi {
      // El 403 lo gestiona el callback; la pantalla que llamó solo ve el error.
    }
  }
}

/// Monta la app mínima: login real, la pantalla de términos y un «inicio» de
/// prueba. Conecta el callback de pendientes igual que `main.dart`.
Future<_Entorno> _montar(
  WidgetTester tester,
  _ClienteFalso cliente, {
  bool conSesion = false,
}) async {
  final api = ApiClient(httpClient: cliente);
  final auth = AuthProvider(api);
  if (conSesion) {
    auth.usuario = Usuario.desdeJson(Map<String, dynamic>.from(_usuarioJson));
    api.token = 'token-1';
  }
  final terminos = TermsProvider(api, auth);
  final navegador = GlobalKey<NavigatorState>();
  terminos.alPendiente = () {
    navegador.currentState?.pushNamedAndRemoveUntil('/terminos', (ruta) => false);
  };
  auth.alExpirar = () {
    navegador.currentState?.pushNamedAndRemoveUntil('/login', (ruta) => false);
  };

  await tester.binding.setSurfaceSize(const Size(1200, 900));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider<TermsProvider>.value(value: terminos),
      ],
      child: MaterialApp(
        theme: temaMotorix(),
        navigatorKey: navegador,
        home: conSesion ? const _Inicio() : const LoginScreen(),
        routes: {
          '/login': (_) => const LoginScreen(),
          '/inicio': (_) => const _Inicio(),
          '/terminos': (_) => const TermsAcceptanceScreen(),
        },
      ),
    ),
  );
  await tester.pumpAndSettle();
  return _Entorno(cliente, api, auth, terminos, navegador);
}

/// Pantalla de inicio de prueba con un botón que hace una petición de un módulo.
class _Inicio extends StatelessWidget {
  const _Inicio();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          const Text('Pantalla de inicio'),
          TextButton(
            key: const Key('botonPedirClientes'),
            onPressed: () async {
              try {
                await context.read<AuthProvider>().api.get('/clients');
              } on ExcepcionApi {
                // El error ya lo gestiona el callback de la compuerta.
              }
            },
            child: const Text('Consultar clientes'),
          ),
        ],
      ),
    );
  }
}

Future<void> _iniciarSesion(WidgetTester tester) async {
  await tester.enterText(find.byKey(const Key('campoIdentificacion')), 'recepcion');
  await tester.enterText(find.byKey(const Key('campoContrasena')), 'Usuario123');
  await tester.tap(find.byKey(const Key('botonIniciarSesion')));
  await tester.pumpAndSettle();
}

void main() {
  group('tras el inicio de sesión', () {
    testWidgets('con una versión sin aceptar se muestra la pantalla con términos y aviso', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);

      await _iniciarSesion(tester);

      expect(find.byKey(const Key('pantallaTerminos')), findsOneWidget);
      expect(find.text('Versión 2'), findsOneWidget);
      expect(find.byKey(const Key('textoTerminos')), findsOneWidget);
      expect(find.textContaining('Texto de los términos de la versión 2'), findsOneWidget);
      expect(find.byKey(const Key('textoAvisoPrivacidad')), findsOneWidget);
      expect(find.textContaining('Texto del aviso de privacidad de la versión 2'), findsOneWidget);
      expect(find.byKey(const Key('botonAceptarTerminos')), findsOneWidget);
      expect(find.byKey(const Key('botonRechazarTerminos')), findsOneWidget);
      expect(find.text('Pantalla de inicio'), findsNothing);
    });

    testWidgets('sin versión publicada no se muestra y entra directo', (tester) async {
      final cliente = _ClienteFalso()..vigente = null;
      await _montar(tester, cliente);

      await _iniciarSesion(tester);

      expect(find.byKey(const Key('pantallaTerminos')), findsNothing);
      expect(find.text('Pantalla de inicio'), findsOneWidget);
    });

    testWidgets('con la versión ya aceptada no se muestra', (tester) async {
      final cliente = _ClienteFalso()..aceptada = true;
      await _montar(tester, cliente);

      await _iniciarSesion(tester);

      expect(find.byKey(const Key('pantallaTerminos')), findsNothing);
      expect(find.text('Pantalla de inicio'), findsOneWidget);
    });

    testWidgets('si la consulta de términos falla, entra (el servidor decide con el 403)', (tester) async {
      final cliente = _ClienteFalso()..statusVigente = 500;
      await _montar(tester, cliente);

      await _iniciarSesion(tester);

      // Un error al consultar no bloquea ni muestra la pantalla por sí solo.
      expect(find.byKey(const Key('pantallaTerminos')), findsNothing);
      expect(find.text('Pantalla de inicio'), findsOneWidget);
    });
  });

  group('aceptar', () {
    testWidgets('«Aceptar» envía la versión, guarda la aceptación y entra al sistema', (tester) async {
      final cliente = _ClienteFalso();
      final entorno = await _montar(tester, cliente);
      await _iniciarSesion(tester);

      await tester.tap(find.byKey(const Key('botonAceptarTerminos')));
      await tester.pumpAndSettle();

      final envio = cliente.de('/terms/accept').single as http.Request;
      expect(jsonDecode(envio.body), {'termsVersionId': 2});
      expect(find.byKey(const Key('pantallaTerminos')), findsNothing);
      expect(find.text('Pantalla de inicio'), findsOneWidget);
      expect(entorno.terminos.pendiente, isFalse);
      expect(entorno.auth.autenticado, isTrue);
    });

    testWidgets('mientras guarda, el botón se deshabilita (no se acepta dos veces)', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);
      await _iniciarSesion(tester);

      cliente.puertaAceptar = Completer<void>();
      await tester.tap(find.byKey(const Key('botonAceptarTerminos')));
      await tester.pump(); // la petición está en vuelo
      final boton = tester.widget<FilledButton>(find.byKey(const Key('botonAceptarTerminos')));
      expect(boton.onPressed, isNull);
      final rechazar = tester.widget<OutlinedButton>(find.byKey(const Key('botonRechazarTerminos')));
      expect(rechazar.onPressed, isNull);
      cliente.puertaAceptar!.complete();
      await tester.pumpAndSettle();

      expect(cliente.de('/terms/accept'), hasLength(1));
    });

    testWidgets('si se publicó otra versión (409) muestra el aviso y la versión nueva', (tester) async {
      final cliente = _ClienteFalso()
        ..statusAceptar = 409
        ..vigenteTrasRechazo = _version(3, 3);
      await _montar(tester, cliente);
      await _iniciarSesion(tester);

      await tester.tap(find.byKey(const Key('botonAceptarTerminos')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('pantallaTerminos')), findsOneWidget);
      expect(find.text('Versión 3'), findsOneWidget);
      expect(find.byKey(const Key('mensajeErrorTerminos')), findsOneWidget);
      expect(find.textContaining('Se publicó una versión nueva'), findsOneWidget);
    });

    testWidgets('un error del servidor se muestra sin trazas y deja reintentar', (tester) async {
      final cliente = _ClienteFalso()..statusAceptar = 500;
      final entorno = await _montar(tester, cliente);
      await _iniciarSesion(tester);

      await tester.tap(find.byKey(const Key('botonAceptarTerminos')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('pantallaTerminos')), findsOneWidget);
      expect(find.text('Error del servidor.'), findsOneWidget);
      expect(find.textContaining('Exception'), findsNothing);
      expect(entorno.terminos.pendiente, isTrue);
      final boton = tester.widget<FilledButton>(find.byKey(const Key('botonAceptarTerminos')));
      expect(boton.onPressed, isNotNull);
    });
  });

  group('rechazar', () {
    testWidgets('pide confirmación y «Volver» conserva la pantalla y la sesión', (tester) async {
      final cliente = _ClienteFalso();
      final entorno = await _montar(tester, cliente);
      await _iniciarSesion(tester);

      await tester.tap(find.byKey(const Key('botonRechazarTerminos')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('dialogoRechazo')), findsOneWidget);

      await tester.tap(find.byKey(const Key('botonCancelarRechazo')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('dialogoRechazo')), findsNothing);
      expect(find.byKey(const Key('pantallaTerminos')), findsOneWidget);
      expect(entorno.auth.autenticado, isTrue);
    });

    testWidgets('al confirmar cierra la sesión y vuelve al login sin aceptar nada', (tester) async {
      final cliente = _ClienteFalso();
      final entorno = await _montar(tester, cliente);
      await _iniciarSesion(tester);

      await tester.tap(find.byKey(const Key('botonRechazarTerminos')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('botonConfirmarRechazo')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('botonIniciarSesion')), findsOneWidget);
      expect(find.byKey(const Key('pantallaTerminos')), findsNothing);
      expect(entorno.auth.autenticado, isFalse);
      expect(entorno.api.token, isNull);
      expect(entorno.terminos.pendiente, isFalse);
      expect(cliente.de('/terms/accept'), isEmpty);
    });

    testWidgets('al volver a entrar sin aceptar, la pantalla aparece otra vez', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);
      await _iniciarSesion(tester);
      await tester.tap(find.byKey(const Key('botonRechazarTerminos')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('botonConfirmarRechazo')));
      await tester.pumpAndSettle();

      await _iniciarSesion(tester);

      expect(find.byKey(const Key('pantallaTerminos')), findsOneWidget);
    });
  });

  group('403 TERMS_NOT_ACCEPTED en cualquier petición', () {
    testWidgets('lleva a la pantalla de aceptación aunque ya hubiera entrado', (tester) async {
      final cliente = _ClienteFalso()..statusClientes = 403;
      await _montar(tester, cliente, conSesion: true);
      expect(find.text('Pantalla de inicio'), findsOneWidget);

      await tester.tap(find.byKey(const Key('botonPedirClientes')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('pantallaTerminos')), findsOneWidget);
      expect(find.text('Versión 2'), findsOneWidget);
      expect(find.text('Pantalla de inicio'), findsNothing);
    });

    testWidgets('varias peticiones rechazadas a la vez muestran una sola pantalla', (tester) async {
      final cliente = _ClienteFalso()..statusClientes = 403;
      final entorno = await _montar(tester, cliente, conSesion: true);

      await Future.wait([entorno.pedirClientes(), entorno.pedirClientes(), entorno.pedirClientes()]);
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('pantallaTerminos')), findsOneWidget);
      expect(cliente.de('/terms/current'), hasLength(1));
    });

    testWidgets('un 403 tardío con la pantalla ya abierta no repite la consulta ni la navegación', (tester) async {
      final cliente = _ClienteFalso()..statusClientes = 403;
      final entorno = await _montar(tester, cliente, conSesion: true);
      await entorno.pedirClientes();
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('pantallaTerminos')), findsOneWidget);

      // Una petición en vuelo (p. ej. el sondeo de avisos) recibe su 403 después.
      await entorno.pedirClientes();
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('pantallaTerminos')), findsOneWidget);
      expect(cliente.de('/terms/current'), hasLength(1));
    });

    testWidgets('tras aceptar, la sesión sigue y puede volver a pasar por la compuerta', (tester) async {
      final cliente = _ClienteFalso()..statusClientes = 403;
      final entorno = await _montar(tester, cliente, conSesion: true);
      await tester.tap(find.byKey(const Key('botonPedirClientes')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('botonAceptarTerminos')));
      await tester.pumpAndSettle();

      expect(find.text('Pantalla de inicio'), findsOneWidget);
      expect(entorno.terminos.pendiente, isFalse);
      // Una publicación nueva vuelve a bloquear: el aviso se puede repetir.
      cliente.vigente = _version(3, 3);
      cliente.aceptada = false;
      await tester.tap(find.byKey(const Key('botonPedirClientes')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('pantallaTerminos')), findsOneWidget);
      expect(find.text('Versión 3'), findsOneWidget);
    });

    testWidgets('un 403 de permisos (NO_AUTORIZADO) no lleva a la pantalla', (tester) async {
      final cliente = _ClienteFalso()
        ..statusClientes = 403
        ..codigoClientes = 'NO_AUTORIZADO';
      await _montar(tester, cliente, conSesion: true);

      await tester.tap(find.byKey(const Key('botonPedirClientes')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('pantallaTerminos')), findsNothing);
      expect(find.text('Pantalla de inicio'), findsOneWidget);
    });

    testWidgets('si la consulta no devuelve los textos, la pantalla ofrece reintentar', (tester) async {
      final cliente = _ClienteFalso()
        ..statusClientes = 403
        ..statusVigente = 500; // el servidor rechazó, pero no se pueden bajar los textos
      await _montar(tester, cliente, conSesion: true);

      await tester.tap(find.byKey(const Key('botonPedirClientes')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('pantallaTerminos')), findsOneWidget);
      expect(find.byKey(const Key('botonReintentarTerminos')), findsOneWidget);
      expect(find.byKey(const Key('botonAceptarTerminos')), findsNothing);

      cliente.statusVigente = 200;
      await tester.tap(find.byKey(const Key('botonReintentarTerminos')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('botonAceptarTerminos')), findsOneWidget);
      expect(find.text('Versión 2'), findsOneWidget);
    });
  });

  group('sesión', () {
    testWidgets('al cerrar sesión se descarta el estado de términos', (tester) async {
      final cliente = _ClienteFalso();
      final entorno = await _montar(tester, cliente);
      await _iniciarSesion(tester);
      expect(entorno.terminos.pendiente, isTrue);

      entorno.auth.cerrarSesion();
      await tester.pumpAndSettle();

      expect(entorno.terminos.pendiente, isFalse);
      expect(entorno.terminos.vigente, isNull);
    });

    testWidgets('la pantalla no tiene botón para volver atrás', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);
      await _iniciarSesion(tester);

      expect(find.byType(BackButton), findsNothing);
      expect(find.byTooltip('Atrás'), findsNothing);
    });
  });
}

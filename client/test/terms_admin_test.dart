// 008-configuracion-seguridad-reportes, T091 (bloque P2, US7; FR-022, CA-18): la
// sección «Términos» (solo ADMIN) muestra la versión vigente y las aceptaciones
// (paginadas de 50), publica una versión nueva CON confirmación y valida las
// longitudes (20 a 20,000 caracteres). Maneja los estados de carga, vacío, error
// y sin permiso (docs/design-system.md 8.4) y no ofrece editar ni borrar.
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
import 'package:motorix_client/providers/terms_provider.dart';
import 'package:motorix_client/screens/terms_admin_screen.dart';
import 'package:motorix_client/services/api_client.dart';
import 'package:provider/provider.dart';

Map<String, dynamic> _version(int id, int version) => {
      'id': id,
      'version': version,
      'terminos': 'Texto de los términos de la versión $version.',
      'avisoPrivacidad': 'Texto del aviso de privacidad de la versión $version.',
      'publicadaEn': '2026-11-20T12:15:00.000Z',
    };

Map<String, dynamic> _aceptacion(int usuarioId, String nombre, {int version = 2}) => {
      'usuario': {'id': usuarioId, 'nombre': nombre},
      'version': version,
      'aceptadaEn': '2026-11-21T09:30:00.000Z',
    };

class _ClienteFalso extends Fake implements http.Client {
  final List<http.BaseRequest> peticiones = [];

  Map<String, dynamic>? vigente = _version(2, 2);
  bool aceptada = true;

  /// Aceptaciones por página (clave = número de página).
  Map<int, List<Map<String, dynamic>>> paginas = {
    1: [_aceptacion(1, 'Administrador del Taller'), _aceptacion(7, 'Recepción del Taller')],
  };
  int totalPaginas = 1;
  int total = 2;

  int statusAceptaciones = 200;
  int statusPublicar = 201;
  String mensajePublicar = 'Los textos no son válidos.';
  Completer<void>? puerta;

  List<http.Request> get publicaciones =>
      peticiones.whereType<http.Request>().where((p) => p.method == 'POST' && p.url.path.endsWith('/terms')).toList();

  List<http.BaseRequest> get consultasAceptaciones =>
      peticiones.where((p) => p.url.path.endsWith('/terms/acceptances')).toList();

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    peticiones.add(request);
    final ruta = request.url.path;
    var status = 200;
    Map<String, dynamic> cuerpo;

    if (ruta.endsWith('/terms/current')) {
      cuerpo = {'vigente': vigente, 'aceptada': vigente == null ? true : aceptada};
    } else if (ruta.endsWith('/terms/acceptances')) {
      await puerta?.future;
      status = statusAceptaciones;
      if (status == 200) {
        final pagina = int.tryParse(request.url.queryParameters['pagina'] ?? '1') ?? 1;
        cuerpo = {
          'pagina': pagina,
          'totalPaginas': totalPaginas,
          'total': total,
          'vigente': vigente == null ? null : {'id': vigente!['id'], 'version': vigente!['version']},
          'datos': paginas[pagina] ?? [],
        };
      } else {
        cuerpo = {
          'error': {
            'codigo': status == 403 ? 'NO_AUTORIZADO' : 'ERROR_INTERNO',
            'mensaje': status == 403 ? 'No tiene permisos para realizar esta operación.' : 'Error del servidor.',
          },
        };
      }
    } else if (ruta.endsWith('/terms') && request.method == 'POST') {
      status = statusPublicar;
      if (status == 201) {
        final datos = jsonDecode((request as http.Request).body) as Map<String, dynamic>;
        final nueva = (vigente?['version'] as int? ?? 0) + 1;
        vigente = {
          'id': nueva,
          'version': nueva,
          'terminos': datos['terminos'],
          'avisoPrivacidad': datos['avisoPrivacidad'],
          'publicadaEn': '2026-11-24T10:00:00.000Z',
        };
        aceptada = false; // la versión nueva la deben aceptar todos, incluido el autor
        cuerpo = vigente!;
      } else {
        cuerpo = {'error': {'codigo': 'DATOS_INVALIDOS', 'mensaje': mensajePublicar}};
      }
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

Future<TermsProvider> _montar(WidgetTester tester, _ClienteFalso cliente, {bool esperar = true}) async {
  final api = ApiClient(httpClient: cliente);
  final auth = AuthProvider(api)
    ..usuario = Usuario.desdeJson({
      'id': 1,
      'username': 'admin',
      'fullName': 'Administrador del Taller',
      'role': 'ADMIN',
      'active': true,
    });
  late TermsProvider proveedor;
  await tester.binding.setSurfaceSize(const Size(1300, 1100));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider<TermsProvider>(create: (_) => proveedor = TermsProvider(api, auth)),
      ],
      child: MaterialApp(theme: temaMotorix(), home: const Scaffold(body: TermsAdminScreen())),
    ),
  );
  if (esperar) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump();
  }
  return proveedor;
}

String _texto(int longitud) => 'a' * longitud;

Future<void> _escribir(WidgetTester tester, {required String terminos, required String aviso}) async {
  await tester.ensureVisible(find.byKey(const Key('campoTerminosNuevos')));
  await tester.enterText(find.byKey(const Key('campoTerminosNuevos')), terminos);
  await tester.enterText(find.byKey(const Key('campoAvisoNuevo')), aviso);
}

Future<void> _pulsarPublicar(WidgetTester tester) async {
  await tester.ensureVisible(find.byKey(const Key('botonPublicarVersion')));
  await tester.tap(find.byKey(const Key('botonPublicarVersion')));
  await tester.pumpAndSettle();
}

void main() {
  group('versión vigente y aceptaciones', () {
    testWidgets('muestra la versión vigente con sus textos y la fecha de publicación', (tester) async {
      await _montar(tester, _ClienteFalso());

      expect(find.byKey(const Key('versionVigente')), findsOneWidget);
      expect(find.text('Versión vigente: 2'), findsOneWidget);
      expect(find.textContaining('Texto de los términos de la versión 2.'), findsOneWidget);
      expect(find.textContaining('Texto del aviso de privacidad de la versión 2.'), findsOneWidget);
      expect(find.textContaining('Publicada el 20/11/2026'), findsOneWidget);
    });

    testWidgets('lista las aceptaciones con usuario, versión y fecha', (tester) async {
      await _montar(tester, _ClienteFalso());

      expect(find.byKey(const Key('aceptacion-0')), findsOneWidget);
      expect(find.text('Administrador del Taller'), findsWidgets);
      expect(find.text('Recepción del Taller'), findsOneWidget);
      expect(find.text('Versión 2'), findsWidgets);
      expect(find.textContaining('21/11/2026'), findsWidgets);
      expect(find.textContaining('2 aceptaciones'), findsOneWidget);
    });

    testWidgets('sin versión publicada lo indica y ofrece publicar la primera', (tester) async {
      final cliente = _ClienteFalso()
        ..vigente = null
        ..paginas = {}
        ..total = 0;
      await _montar(tester, cliente);

      expect(find.byKey(const Key('sinVersion')), findsOneWidget);
      expect(find.text('Aún no se ha publicado ninguna versión.'), findsOneWidget);
      expect(find.byKey(const Key('botonPublicarVersion')), findsOneWidget);
    });

    testWidgets('sin aceptaciones muestra el estado vacío', (tester) async {
      final cliente = _ClienteFalso()
        ..paginas = {}
        ..total = 0;
      await _montar(tester, cliente);

      expect(find.byKey(const Key('aceptacionesVacias')), findsOneWidget);
      expect(find.text('Nadie ha aceptado todavía la versión vigente.'), findsOneWidget);
    });

    testWidgets('no ofrece editar ni borrar versiones ni aceptaciones', (tester) async {
      await _montar(tester, _ClienteFalso());

      expect(find.byIcon(Icons.delete_outline), findsNothing);
      expect(find.byIcon(Icons.edit_outlined), findsNothing);
      expect(find.text('Editar'), findsNothing);
      expect(find.text('Eliminar'), findsNothing);
    });
  });

  group('paginación de aceptaciones', () {
    testWidgets('pide la página siguiente y la anterior', (tester) async {
      final cliente = _ClienteFalso()
        ..totalPaginas = 2
        ..total = 51
        ..paginas = {
          1: [for (var i = 1; i <= 50; i++) _aceptacion(i, 'Usuario $i')],
          2: [_aceptacion(51, 'Usuario 51')],
        };
      await _montar(tester, cliente);
      expect(find.textContaining('Página 1 de 2'), findsOneWidget);
      expect(find.byKey(const Key('botonPaginaAnteriorAceptaciones')), findsOneWidget);

      await tester.ensureVisible(find.byKey(const Key('botonPaginaSiguienteAceptaciones')));
      await tester.tap(find.byKey(const Key('botonPaginaSiguienteAceptaciones')));
      await tester.pumpAndSettle();

      expect(cliente.consultasAceptaciones.last.url.queryParameters['pagina'], '2');
      expect(find.textContaining('Página 2 de 2'), findsOneWidget);
      expect(find.text('Usuario 51'), findsOneWidget);

      await tester.ensureVisible(find.byKey(const Key('botonPaginaAnteriorAceptaciones')));
      await tester.tap(find.byKey(const Key('botonPaginaAnteriorAceptaciones')));
      await tester.pumpAndSettle();
      expect(cliente.consultasAceptaciones.last.url.queryParameters['pagina'], '1');
    });
  });

  group('estados', () {
    testWidgets('muestra el indicador mientras carga', (tester) async {
      final cliente = _ClienteFalso()..puerta = Completer<void>();
      await _montar(tester, cliente, esperar: false);

      expect(find.byKey(const Key('terminosCargando')), findsOneWidget);

      cliente.puerta!.complete();
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('terminosCargando')), findsNothing);
    });

    testWidgets('un error del servidor muestra el mensaje y permite reintentar', (tester) async {
      final cliente = _ClienteFalso()..statusAceptaciones = 500;
      await _montar(tester, cliente);

      expect(find.byKey(const Key('terminosError')), findsOneWidget);
      expect(find.text('No se pudieron cargar los términos.'), findsOneWidget);
      expect(find.textContaining('Exception'), findsNothing);

      cliente.statusAceptaciones = 200;
      await tester.tap(find.byKey(const Key('botonReintentarTerminos')));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('terminosError')), findsNothing);
      expect(find.byKey(const Key('aceptacion-0')), findsOneWidget);
    });

    testWidgets('un 403 de permisos muestra el mensaje y no ofrece reintentar ni publicar', (tester) async {
      final cliente = _ClienteFalso()..statusAceptaciones = 403;
      await _montar(tester, cliente);

      expect(find.text('No tiene permisos para administrar los términos.'), findsOneWidget);
      expect(find.byKey(const Key('botonReintentarTerminos')), findsNothing);
      expect(find.byKey(const Key('botonPublicarVersion')), findsNothing);
    });
  });

  group('publicar una versión nueva', () {
    testWidgets('con textos válidos pide confirmación y, al confirmar, envía y avisa', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);

      await _escribir(tester, terminos: 'Términos nuevos de la versión tres.', aviso: 'Aviso de privacidad nuevo.');
      await _pulsarPublicar(tester);

      // Antes de confirmar no se envía nada.
      expect(find.byKey(const Key('dialogoPublicar')), findsOneWidget);
      expect(find.textContaining('Todos los usuarios, incluido usted'), findsOneWidget);
      expect(cliente.publicaciones, isEmpty);

      await tester.tap(find.byKey(const Key('botonConfirmarPublicar')));
      await tester.pumpAndSettle();

      expect(cliente.publicaciones, hasLength(1));
      expect(jsonDecode(cliente.publicaciones.single.body), {
        'terminos': 'Términos nuevos de la versión tres.',
        'avisoPrivacidad': 'Aviso de privacidad nuevo.',
      });
      expect(find.text('Versión 3 publicada. Todos los usuarios deberán aceptarla.'), findsOneWidget);
      expect(find.text('Versión vigente: 3'), findsOneWidget);
    });

    testWidgets('«Cancelar» en la confirmación no envía nada y conserva lo escrito', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);
      await _escribir(tester, terminos: 'Términos nuevos de la versión tres.', aviso: 'Aviso de privacidad nuevo.');
      await _pulsarPublicar(tester);

      await tester.tap(find.byKey(const Key('botonCancelarPublicar')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('dialogoPublicar')), findsNothing);
      expect(cliente.publicaciones, isEmpty);
      final campo = tester.widget<TextFormField>(find.byKey(const Key('campoTerminosNuevos')));
      expect(campo.controller!.text, 'Términos nuevos de la versión tres.');
    });

    testWidgets('tras publicar, se avisa de que el autor debe aceptar la versión nueva', (tester) async {
      final cliente = _ClienteFalso();
      final proveedor = await _montar(tester, cliente);
      var avisos = 0;
      proveedor.alPendiente = () => avisos++;
      await _escribir(tester, terminos: 'Términos nuevos de la versión tres.', aviso: 'Aviso de privacidad nuevo.');
      await _pulsarPublicar(tester);

      await tester.tap(find.byKey(const Key('botonConfirmarPublicar')));
      await tester.pumpAndSettle();

      expect(proveedor.pendiente, isTrue);
      expect(avisos, 1);
    });

    testWidgets('los campos se vacían tras publicar', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);
      await _escribir(tester, terminos: 'Términos nuevos de la versión tres.', aviso: 'Aviso de privacidad nuevo.');
      await _pulsarPublicar(tester);

      await tester.tap(find.byKey(const Key('botonConfirmarPublicar')));
      await tester.pumpAndSettle();

      final campo = tester.widget<TextFormField>(find.byKey(const Key('campoTerminosNuevos')));
      expect(campo.controller!.text, isEmpty);
    });

    testWidgets('los límites 20 y 20,000 caracteres se aceptan', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);

      await _escribir(tester, terminos: _texto(20), aviso: _texto(20000));
      await _pulsarPublicar(tester);

      expect(find.byKey(const Key('dialogoPublicar')), findsOneWidget);
      expect(find.text('Debe tener entre 20 y 20,000 caracteres.'), findsNothing);
    });

    for (final caso in [
      ('términos con 19 caracteres', 19, 30),
      ('aviso con 19 caracteres', 30, 19),
      ('términos con 20,001 caracteres', 20001, 30),
      ('aviso con 20,001 caracteres', 30, 20001),
      ('términos vacíos', 0, 30),
    ]) {
      testWidgets('${caso.$1}: muestra el rango y no pide confirmación ni envía', (tester) async {
        final cliente = _ClienteFalso();
        await _montar(tester, cliente);

        await _escribir(tester, terminos: _texto(caso.$2), aviso: _texto(caso.$3));
        await _pulsarPublicar(tester);

        expect(find.text('Debe tener entre 20 y 20,000 caracteres.'), findsOneWidget);
        expect(find.byKey(const Key('dialogoPublicar')), findsNothing);
        expect(cliente.publicaciones, isEmpty);
      });
    }

    testWidgets('espacios en blanco no cuentan como texto', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);

      await _escribir(tester, terminos: ' ' * 40, aviso: _texto(30));
      await _pulsarPublicar(tester);

      expect(find.text('Debe tener entre 20 y 20,000 caracteres.'), findsOneWidget);
      expect(cliente.publicaciones, isEmpty);
    });

    testWidgets('un rechazo del servidor muestra su mensaje sin trazas', (tester) async {
      final cliente = _ClienteFalso()
        ..statusPublicar = 400
        ..mensajePublicar = 'El texto de los términos y condiciones debe tener entre 20 y 20000 caracteres.';
      await _montar(tester, cliente);
      await _escribir(tester, terminos: 'Términos nuevos de la versión tres.', aviso: 'Aviso de privacidad nuevo.');
      await _pulsarPublicar(tester);

      await tester.tap(find.byKey(const Key('botonConfirmarPublicar')));
      await tester.pumpAndSettle();

      expect(find.text('El texto de los términos y condiciones debe tener entre 20 y 20000 caracteres.'), findsOneWidget);
      expect(find.textContaining('Exception'), findsNothing);
      expect(find.text('Versión vigente: 2'), findsOneWidget);
    });
  });
}

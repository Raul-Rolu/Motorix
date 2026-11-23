// 008-configuracion-seguridad-reportes, T034 (bloque P1, US3; FR-006, FR-007,
// CA-4): la sección «Catálogo de servicios» (solo ADMIN) lista los tipos con su
// intervalo, permite crear, editar y desactivar (con confirmación «Confirmar» /
// «Cancelar», docs/design-system.md 8.5), muestra los errores del servidor
// (nombre repetido, sin intervalos) sin trazas y maneja los estados de carga,
// vacío y error. No ofrece borrar. Además, el diálogo «Agregar servicio» de la
// orden permite elegir un tipo activo opcional.
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
import 'package:motorix_client/providers/service_types_provider.dart';
import 'package:motorix_client/screens/service_types_screen.dart';
import 'package:motorix_client/services/api_client.dart';
import 'package:motorix_client/widgets/add_service_dialog.dart';
import 'package:provider/provider.dart';

Map<String, dynamic> _tipo(int id, String nombre, {int? dias, int? km, bool activo = true}) => {
      'id': id,
      'nombre': nombre,
      'intervaloDias': dias,
      'intervaloKm': km,
      'activo': activo,
    };

/// Cliente HTTP falso de `/api/service-types` con una lista mutable.
class _ClienteFalso extends Fake implements http.Client {
  final List<http.BaseRequest> peticiones = [];
  final List<Map<String, dynamic>> tipos;
  int statusLista = 200;
  int statusAlta = 201;
  String mensajeAlta = 'Ya existe un tipo de servicio con ese nombre.';
  Completer<void>? puerta;

  _ClienteFalso(this.tipos);

  List<http.Request> de(String metodo) =>
      peticiones.whereType<http.Request>().where((p) => p.method == metodo).toList();

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    peticiones.add(request);
    Map<String, dynamic> cuerpo = {};
    var status = 200;
    final ruta = request.url.path;

    if (request.method == 'GET') {
      await puerta?.future;
      status = statusLista;
      final incluir = request.url.queryParameters['incluirInactivos'] == 'true';
      cuerpo = status == 200
          ? {
              'datos': tipos.where((t) => incluir || t['activo'] == true).toList(),
            }
          : {'error': {'codigo': 'ERROR_INTERNO', 'mensaje': 'Error del servidor.'}};
    } else if (request.method == 'POST') {
      final datos = jsonDecode((request as http.Request).body) as Map<String, dynamic>;
      status = statusAlta;
      if (status == 201) {
        cuerpo = {'id': 100 + tipos.length, ...datos, 'activo': true};
        tipos.add(cuerpo);
      } else {
        cuerpo = {'error': {'codigo': 'SERVICE_TYPE_DUPLICATE', 'mensaje': mensajeAlta}};
      }
    } else if (request.method == 'PUT') {
      final datos = jsonDecode((request as http.Request).body) as Map<String, dynamic>;
      final id = int.parse(ruta.split('/').last);
      final indice = tipos.indexWhere((t) => t['id'] == id);
      tipos[indice] = {...tipos[indice], ...datos};
      cuerpo = tipos[indice];
    } else if (request.method == 'PATCH') {
      final datos = jsonDecode((request as http.Request).body) as Map<String, dynamic>;
      final id = int.parse(ruta.split('/')[ruta.split('/').length - 2]);
      final indice = tipos.indexWhere((t) => t['id'] == id);
      tipos[indice] = {...tipos[indice], 'activo': datos['activo']};
      cuerpo = tipos[indice];
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

Future<void> _montar(WidgetTester tester, _ClienteFalso cliente, {bool esperar = true}) async {
  final api = ApiClient(httpClient: cliente);
  final auth = AuthProvider(api)
    ..usuario = Usuario.desdeJson({
      'id': 1,
      'username': 'admin',
      'fullName': 'Administrador',
      'role': 'ADMIN',
      'active': true,
    });
  await tester.binding.setSurfaceSize(const Size(1200, 900));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider<ServiceTypesProvider>(create: (_) => ServiceTypesProvider(api, auth)),
      ],
      child: MaterialApp(
        theme: temaMotorix(),
        home: const Scaffold(body: ServiceTypesScreen()),
      ),
    ),
  );
  if (esperar) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump();
  }
}

List<Map<String, dynamic>> _datosIniciales() => [
      _tipo(1, 'Cambio de aceite', dias: 180, km: 5000),
      _tipo(2, 'Revisión de frenos', dias: 90),
      _tipo(3, 'Rotación de neumáticos', km: 10000, activo: false),
    ];

void main() {
  group('lista', () {
    testWidgets('muestra cada tipo con su intervalo y marca los inactivos', (tester) async {
      final cliente = _ClienteFalso(_datosIniciales());

      await _montar(tester, cliente);

      expect(find.text('Catálogo de servicios'), findsWidgets);
      expect(find.text('Cambio de aceite'), findsOneWidget);
      expect(find.text('180 días · 5,000 km'), findsOneWidget);
      expect(find.text('Revisión de frenos'), findsOneWidget);
      expect(find.text('90 días'), findsOneWidget);
      expect(find.text('10,000 km'), findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('tipoFila-3')), matching: find.text('Inactivo')),
          findsOneWidget);
      expect(find.descendant(of: find.byKey(const Key('tipoFila-1')), matching: find.text('Activo')),
          findsOneWidget);
    });

    testWidgets('el administrador consulta incluyendo los inactivos', (tester) async {
      final cliente = _ClienteFalso(_datosIniciales());

      await _montar(tester, cliente);

      final consulta = cliente.peticiones.firstWhere((p) => p.method == 'GET');
      expect(consulta.url.queryParameters['incluirInactivos'], 'true');
    });

    testWidgets('no ofrece borrar tipos', (tester) async {
      await _montar(tester, _ClienteFalso(_datosIniciales()));

      expect(find.byIcon(Icons.delete_outline), findsNothing);
      expect(find.byIcon(Icons.delete), findsNothing);
    });
  });

  group('alta', () {
    testWidgets('guarda un tipo con días y km, muestra el éxito y lo agrega a la lista', (tester) async {
      final cliente = _ClienteFalso(_datosIniciales());
      await _montar(tester, cliente);

      await tester.tap(find.byKey(const Key('botonNuevoTipo')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('campoNombreTipo')), '  Afinación mayor ');
      await tester.enterText(find.byKey(const Key('campoDiasTipo')), '365');
      await tester.enterText(find.byKey(const Key('campoKmTipo')), '10000');
      await tester.tap(find.byKey(const Key('botonGuardarTipo')));
      await tester.pumpAndSettle();

      final alta = cliente.de('POST').single;
      expect(jsonDecode(alta.body), {'nombre': 'Afinación mayor', 'intervaloDias': 365, 'intervaloKm': 10000});
      expect(find.text('Tipo de servicio guardado.'), findsOneWidget);
      expect(find.text('Afinación mayor'), findsOneWidget);
    });

    testWidgets('sin ningún intervalo no envía nada y lo explica', (tester) async {
      final cliente = _ClienteFalso(_datosIniciales());
      await _montar(tester, cliente);

      await tester.tap(find.byKey(const Key('botonNuevoTipo')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('campoNombreTipo')), 'Sin intervalos');
      await tester.tap(find.byKey(const Key('botonGuardarTipo')));
      await tester.pumpAndSettle();

      expect(cliente.de('POST'), isEmpty);
      expect(find.text('Indique al menos un intervalo: días, kilómetros o ambos.'), findsOneWidget);
    });

    testWidgets('un nombre vacío no envía nada', (tester) async {
      final cliente = _ClienteFalso(_datosIniciales());
      await _montar(tester, cliente);

      await tester.tap(find.byKey(const Key('botonNuevoTipo')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('campoDiasTipo')), '30');
      await tester.tap(find.byKey(const Key('botonGuardarTipo')));
      await tester.pumpAndSettle();

      expect(cliente.de('POST'), isEmpty);
      expect(find.text('El nombre del tipo de servicio es obligatorio.'), findsOneWidget);
    });

    testWidgets('un nombre repetido muestra el error del servidor sin trazas y conserva el diálogo', (tester) async {
      final cliente = _ClienteFalso(_datosIniciales())..statusAlta = 409;
      await _montar(tester, cliente);

      await tester.tap(find.byKey(const Key('botonNuevoTipo')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('campoNombreTipo')), 'Cambio de aceite');
      await tester.enterText(find.byKey(const Key('campoDiasTipo')), '30');
      await tester.tap(find.byKey(const Key('botonGuardarTipo')));
      await tester.pumpAndSettle();

      expect(find.text('Ya existe un tipo de servicio con ese nombre.'), findsOneWidget);
      expect(find.textContaining('Exception'), findsNothing);
      expect(find.byKey(const Key('campoNombreTipo')), findsOneWidget);
    });
  });

  group('edición y desactivación', () {
    testWidgets('editar precarga los datos y envía PUT con los cambios', (tester) async {
      final cliente = _ClienteFalso(_datosIniciales());
      await _montar(tester, cliente);

      await tester.tap(find.byKey(const Key('botonEditarTipo-1')));
      await tester.pumpAndSettle();
      expect(tester.widget<TextFormField>(find.byKey(const Key('campoNombreTipo'))).controller!.text,
          'Cambio de aceite');
      expect(tester.widget<TextFormField>(find.byKey(const Key('campoDiasTipo'))).controller!.text, '180');
      expect(tester.widget<TextFormField>(find.byKey(const Key('campoKmTipo'))).controller!.text, '5000');

      await tester.enterText(find.byKey(const Key('campoDiasTipo')), '120');
      await tester.tap(find.byKey(const Key('botonGuardarTipo')));
      await tester.pumpAndSettle();

      final edicion = cliente.de('PUT').single;
      expect(edicion.url.path, endsWith('/service-types/1'));
      expect(jsonDecode(edicion.body), {'nombre': 'Cambio de aceite', 'intervaloDias': 120, 'intervaloKm': 5000});
      expect(find.text('120 días · 5,000 km'), findsOneWidget);
    });

    testWidgets('desactivar pide confirmación; «Cancelar» no cambia nada', (tester) async {
      final cliente = _ClienteFalso(_datosIniciales());
      await _montar(tester, cliente);

      await tester.tap(find.byKey(const Key('botonEstadoTipo-1')));
      await tester.pumpAndSettle();
      expect(find.text('Confirmar'), findsOneWidget);
      expect(find.text('Cancelar'), findsOneWidget);
      await tester.tap(find.text('Cancelar'));
      await tester.pumpAndSettle();

      expect(cliente.de('PATCH'), isEmpty);
    });

    testWidgets('«Confirmar» desactiva el tipo (PATCH activo=false) y lo marca como inactivo', (tester) async {
      final cliente = _ClienteFalso(_datosIniciales());
      await _montar(tester, cliente);

      await tester.tap(find.byKey(const Key('botonEstadoTipo-1')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirmar'));
      await tester.pumpAndSettle();

      final cambio = cliente.de('PATCH').single;
      expect(cambio.url.path, endsWith('/service-types/1/status'));
      expect(jsonDecode(cambio.body), {'activo': false});
      expect(find.descendant(of: find.byKey(const Key('tipoFila-1')), matching: find.text('Inactivo')),
          findsOneWidget);
    });

    testWidgets('reactivar un tipo inactivo no pide confirmación', (tester) async {
      final cliente = _ClienteFalso(_datosIniciales());
      await _montar(tester, cliente);

      await tester.tap(find.byKey(const Key('botonEstadoTipo-3')));
      await tester.pumpAndSettle();

      expect(find.text('Confirmar'), findsNothing);
      expect(jsonDecode(cliente.de('PATCH').single.body), {'activo': true});
    });
  });

  group('diálogo «Agregar servicio» de la orden (FR-007)', () {
    /// Abre el diálogo como lo hace la pantalla de la orden y devuelve lo capturado.
    Future<ValueNotifier<ServicioNuevo?>> abrir(WidgetTester tester, _ClienteFalso cliente,
        {String rol = 'MECHANIC'}) async {
      final api = ApiClient(httpClient: cliente);
      final auth = AuthProvider(api)
        ..usuario = Usuario.desdeJson({
          'id': 3,
          'username': rol.toLowerCase(),
          'fullName': 'Usuario de prueba',
          'role': rol,
          'active': true,
        });
      final resultado = ValueNotifier<ServicioNuevo?>(null);
      await tester.binding.setSurfaceSize(const Size(1200, 900));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<AuthProvider>.value(value: auth),
            ChangeNotifierProvider<ServiceTypesProvider>(create: (_) => ServiceTypesProvider(api, auth)),
          ],
          child: MaterialApp(
            theme: temaMotorix(),
            home: Builder(
              builder: (context) => Scaffold(
                body: TextButton(
                  key: const Key('abrirDialogo'),
                  onPressed: () async {
                    resultado.value = await showDialog<ServicioNuevo>(
                      context: context,
                      builder: (_) => const DialogoAgregarServicio(),
                    );
                  },
                  child: const Text('Abrir'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.byKey(const Key('abrirDialogo')));
      await tester.pumpAndSettle();
      return resultado;
    }

    testWidgets('ofrece solo los tipos activos, con «Sin tipo» por omisión, y los pide sin inactivos si no es ADMIN',
        (tester) async {
      final cliente = _ClienteFalso(_datosIniciales());

      await abrir(tester, cliente);
      await tester.tap(find.byKey(const Key('selectorTipoServicio')));
      await tester.pumpAndSettle();

      expect(find.text('Sin tipo'), findsWidgets);
      expect(find.text('Cambio de aceite'), findsWidgets);
      expect(find.text('Revisión de frenos'), findsWidgets);
      expect(find.text('Rotación de neumáticos'), findsNothing);
      final consulta = cliente.peticiones.firstWhere((p) => p.method == 'GET');
      expect(consulta.url.queryParameters.containsKey('incluirInactivos'), isFalse);
    });

    testWidgets('al elegir un tipo devuelve su id junto con la descripción y el importe', (tester) async {
      final resultado = await abrir(tester, _ClienteFalso(_datosIniciales()));

      await tester.enterText(find.byKey(const Key('campoDescripcionServicio')), '  Cambio de aceite sintético ');
      await tester.enterText(find.byKey(const Key('campoImporteServicio')), '650.50');
      await tester.tap(find.byKey(const Key('selectorTipoServicio')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cambio de aceite').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('botonAgregarServicio')));
      await tester.pumpAndSettle();

      expect(resultado.value, isNotNull);
      expect(resultado.value!.descripcion, 'Cambio de aceite sintético');
      expect(resultado.value!.importe, 650.5);
      expect(resultado.value!.serviceTypeId, 1);
    });

    testWidgets('sin elegir tipo el servicio se agrega sin tipo (opcional)', (tester) async {
      final resultado = await abrir(tester, _ClienteFalso(_datosIniciales()));

      await tester.enterText(find.byKey(const Key('campoDescripcionServicio')), 'Limpieza de inyectores');
      await tester.enterText(find.byKey(const Key('campoImporteServicio')), '350');
      await tester.tap(find.byKey(const Key('botonAgregarServicio')));
      await tester.pumpAndSettle();

      expect(resultado.value!.serviceTypeId, isNull);
    });

    testWidgets('valida descripción obligatoria e importe numérico no negativo', (tester) async {
      final resultado = await abrir(tester, _ClienteFalso(_datosIniciales()));

      await tester.enterText(find.byKey(const Key('campoImporteServicio')), '-5');
      await tester.tap(find.byKey(const Key('botonAgregarServicio')));
      await tester.pumpAndSettle();

      expect(find.text('La descripción del servicio es obligatoria.'), findsOneWidget);
      expect(find.text('Ingrese un importe de 0 o más, con hasta 2 decimales.'), findsOneWidget);
      expect(resultado.value, isNull);
    });

    testWidgets('«Cancelar» cierra sin devolver nada', (tester) async {
      final resultado = await abrir(tester, _ClienteFalso(_datosIniciales()));

      await tester.tap(find.text('Cancelar'));
      await tester.pumpAndSettle();

      expect(resultado.value, isNull);
      expect(find.byKey(const Key('campoDescripcionServicio')), findsNothing);
    });
  });

  group('estados de la pantalla (8.4)', () {
    testWidgets('mientras carga muestra un indicador de progreso', (tester) async {
      final cliente = _ClienteFalso(_datosIniciales())..puerta = Completer<void>();

      await _montar(tester, cliente, esperar: false);

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      cliente.puerta!.complete();
      await tester.pumpAndSettle();
      expect(find.text('Cambio de aceite'), findsOneWidget);
    });

    testWidgets('sin tipos muestra un mensaje útil', (tester) async {
      await _montar(tester, _ClienteFalso([]));

      expect(find.text('No hay tipos de servicio registrados.'), findsOneWidget);
    });

    testWidgets('si falla la carga muestra el error con «Reintentar» y se recupera', (tester) async {
      final cliente = _ClienteFalso(_datosIniciales())..statusLista = 500;
      await _montar(tester, cliente);

      expect(find.text('No se pudo cargar el catálogo de servicios.'), findsOneWidget);
      cliente.statusLista = 200;
      await tester.tap(find.text('Reintentar'));
      await tester.pumpAndSettle();

      expect(find.text('Cambio de aceite'), findsOneWidget);
    });
  });
}

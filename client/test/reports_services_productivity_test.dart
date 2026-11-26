// 008-configuracion-seguridad-reportes, T122 (bloque P3, US9; FR-026, CA-6): las
// pestañas «Servicios» y «Productividad» de la sección «Reportes» (solo ADMIN).
// Comparten el filtro de rango con «Ingresos»: cambiar de pestaña consulta el
// MISMO periodo, cambiar el filtro invalida las demás y volver a una pestaña ya
// cargada con el mismo filtro no vuelve a consultar. Muestran «Sin tipo» y «Sin
// asignar», totales, y los estados de carga, vacío, error (sin trazas) y sin
// permiso (docs/design-system.md 8.4 y 8.10). Importes desde centavos enteros.
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
import 'package:motorix_client/providers/reports_provider.dart';
import 'package:motorix_client/screens/reports_screen.dart';
import 'package:motorix_client/services/api_client.dart';
import 'package:provider/provider.dart';

const _rango = {'desde': '2026-11-01', 'hasta': '2026-11-30'};

Map<String, dynamic> _ingresos() => {
      'rango': _rango,
      'agrupacion': 'DIA',
      'totalCentavos': 50000,
      'total': 500.0,
      'porPeriodo': [
        {'periodo': '2026-11-05', 'totalCentavos': 50000, 'total': 500.0},
      ],
      'porMetodo': [
        {'metodo': 'CASH', 'totalCentavos': 50000, 'total': 500.0},
      ],
    };

Map<String, dynamic> _servicios([List<Map<String, dynamic>>? datos]) => {
      'rango': _rango,
      'datos': datos ??
          [
            {'tipo': 'Cambio de aceite', 'cantidad': 12, 'importeCentavos': 960000, 'importe': 9600.0},
            {'tipo': 'Sin tipo', 'cantidad': 3, 'importeCentavos': 24050, 'importe': 240.5},
            {'tipo': 'Afinación', 'cantidad': 1, 'importeCentavos': 40000, 'importe': 400.0},
          ],
    };

Map<String, dynamic> _productividad([List<Map<String, dynamic>>? datos]) => {
      'rango': _rango,
      'datos': datos ??
          [
            {
              'mecanico': {'id': 3, 'nombre': 'Mecánico del Taller'},
              'ordenes': 8,
              'manoObraCentavos': 240000,
              'manoObra': 2400.0,
            },
            {
              'mecanico': {'id': 4, 'nombre': 'Otro Mecánico'},
              'ordenes': 1,
              'manoObraCentavos': 30000,
              'manoObra': 300.0,
            },
            {'mecanico': null, 'ordenes': 2, 'manoObraCentavos': 0, 'manoObra': 0.0},
          ],
    };

class _ClienteFalso extends Fake implements http.Client {
  final List<http.BaseRequest> peticiones = [];

  /// Respuesta por defecto de cada reporte y respuestas por «ruta?consulta».
  final Map<String, Map<String, dynamic>> cuerpos = {
    'income': _ingresos(),
    'services': _servicios(),
    'productivity': _productividad(),
  };
  final Map<String, Map<String, dynamic>> porConsulta = {};
  final Map<String, Completer<void>> puertas = {};
  final Map<String, int> estados = {};
  String codigoError = 'ERROR_INTERNO';
  String mensajeError = 'Error del servidor.';

  List<http.BaseRequest> de(String reporte) => peticiones.where((p) => p.url.path.endsWith('/reports/$reporte')).toList();

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    peticiones.add(request);
    final reporte = request.url.path.split('/').last;
    final clave = '$reporte?${request.url.query}';
    await puertas[clave]?.future;
    final status = estados[reporte] ?? 200;
    final cuerpo = status == 200
        ? (porConsulta[clave] ?? cuerpos[reporte] ?? {})
        : {
            'error': {'codigo': codigoError, 'mensaje': mensajeError},
          };
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
  final ReportsProvider reportes;
  final AuthProvider auth;
  _Entorno(this.reportes, this.auth);
}

Future<_Entorno> _montar(WidgetTester tester, _ClienteFalso cliente) async {
  final api = ApiClient(httpClient: cliente);
  final auth = AuthProvider(api)
    ..usuario = Usuario.desdeJson({
      'id': 1,
      'username': 'admin',
      'fullName': 'Administrador',
      'role': 'ADMIN',
      'active': true,
    });
  late ReportsProvider reportes;
  await tester.binding.setSurfaceSize(const Size(1300, 1000));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider<ReportsProvider>(create: (_) => reportes = ReportsProvider(api, auth)),
      ],
      child: MaterialApp(theme: temaMotorix(), home: const Scaffold(body: ReportsScreen())),
    ),
  );
  await tester.pumpAndSettle();
  return _Entorno(reportes, auth);
}

Future<void> _abrir(WidgetTester tester, String pestana) async {
  await tester.tap(find.byKey(Key(pestana)));
  await tester.pumpAndSettle();
}

Finder _en(String fila, String texto) => find.descendant(of: find.byKey(Key(fila)), matching: find.text(texto));

void main() {
  group('pestañas', () {
    testWidgets('aparecen Ingresos, Servicios y Productividad, y al abrir solo se consulta Ingresos', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);

      expect(find.byKey(const Key('pestanaIngresos')), findsOneWidget);
      expect(find.byKey(const Key('pestanaServicios')), findsOneWidget);
      expect(find.byKey(const Key('pestanaProductividad')), findsOneWidget);
      expect(cliente.de('income'), hasLength(1));
      expect(cliente.de('services'), isEmpty);
      expect(cliente.de('productivity'), isEmpty);
    });

    testWidgets('abrir Servicios consulta con el mismo filtro (mes actual)', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);

      await _abrir(tester, 'pestanaServicios');

      expect(cliente.de('services'), hasLength(1));
      expect(cliente.de('services').single.url.queryParameters, {'periodo': 'MES_ACTUAL'});
    });

    testWidgets('volver a una pestaña ya cargada con el mismo filtro no vuelve a consultar', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);

      await _abrir(tester, 'pestanaServicios');
      await _abrir(tester, 'pestanaIngresos');
      await _abrir(tester, 'pestanaServicios');

      expect(cliente.de('income'), hasLength(1));
      expect(cliente.de('services'), hasLength(1));
    });

    testWidgets('el filtro es compartido: «Mes anterior» en Servicios invalida las demás pestañas', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);
      await _abrir(tester, 'pestanaServicios');

      await tester.tap(find.byKey(const Key('filtroMesAnterior')));
      await tester.pumpAndSettle();

      expect(cliente.de('services').last.url.queryParameters, {'periodo': 'MES_ANTERIOR'});
      expect(cliente.de('income'), hasLength(1), reason: 'Ingresos no se consulta hasta abrirla');

      await _abrir(tester, 'pestanaIngresos');

      expect(cliente.de('income'), hasLength(2));
      expect(cliente.de('income').last.url.queryParameters, {'periodo': 'MES_ANTERIOR'});
      expect(tester.widget<ChoiceChip>(find.byKey(const Key('filtroMesAnterior'))).selected, isTrue);
    });

    testWidgets('un rango libre se consulta en la pestaña activa', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);
      await _abrir(tester, 'pestanaProductividad');

      await tester.tap(find.byKey(const Key('filtroRangoLibre')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('campoReporteDesde')), '2026-10-01');
      await tester.enterText(find.byKey(const Key('campoReporteHasta')), '2026-10-31');
      await tester.tap(find.byKey(const Key('botonConsultarRango')));
      await tester.pumpAndSettle();

      expect(cliente.de('productivity').last.url.queryParameters, {'desde': '2026-10-01', 'hasta': '2026-10-31'});
    });

    testWidgets('«Actualizar» recarga solo la pestaña activa', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);
      await _abrir(tester, 'pestanaServicios');

      await tester.tap(find.byKey(const Key('botonRefrescarReportes')));
      await tester.pumpAndSettle();

      expect(cliente.de('services'), hasLength(2));
      expect(cliente.de('income'), hasLength(1));
    });
  });

  group('servicios', () {
    testWidgets('muestra el tipo, la cantidad y el importe, con «Sin tipo»', (tester) async {
      await _montar(tester, _ClienteFalso());

      await _abrir(tester, 'pestanaServicios');

      expect(find.text('Tipo de servicio'), findsOneWidget);
      expect(find.byKey(const Key('filaServicio-0')), findsOneWidget);
      expect(_en('filaServicio-0', 'Cambio de aceite'), findsOneWidget);
      expect(_en('filaServicio-0', '12 servicios'), findsOneWidget);
      expect(_en('filaServicio-0', '\$9600.00'), findsOneWidget);
      expect(_en('filaServicio-1', 'Sin tipo'), findsOneWidget);
      expect(_en('filaServicio-1', '\$240.50'), findsOneWidget);
      expect(_en('filaServicio-2', '1 servicio'), findsOneWidget);
    });

    testWidgets('el total suma cantidades e importes en centavos', (tester) async {
      await _montar(tester, _ClienteFalso());

      await _abrir(tester, 'pestanaServicios');

      expect(_en('filaTotalServicios', 'Total'), findsOneWidget);
      expect(_en('filaTotalServicios', '16 servicios'), findsOneWidget);
      expect(_en('filaTotalServicios', '\$10240.50'), findsOneWidget);
    });

    testWidgets('los importes salen de centavos enteros sin errores de coma flotante', (tester) async {
      final cliente = _ClienteFalso()
        ..cuerpos['services'] = _servicios([
          {'tipo': 'Frenos', 'cantidad': 2, 'importeCentavos': 30, 'importe': 0.30000000000000004},
        ]);
      await _montar(tester, cliente);

      await _abrir(tester, 'pestanaServicios');

      expect(_en('filaServicio-0', '\$0.30'), findsOneWidget);
      expect(find.textContaining('0.3000'), findsNothing);
    });

    testWidgets('sin servicios muestra el estado vacío', (tester) async {
      final cliente = _ClienteFalso()..cuerpos['services'] = _servicios([]);
      await _montar(tester, cliente);

      await _abrir(tester, 'pestanaServicios');

      expect(find.byKey(const Key('serviciosVacio')), findsOneWidget);
      expect(find.text('No hay servicios en órdenes cerradas en este rango.'), findsOneWidget);
      expect(find.byKey(const Key('filaTotalServicios')), findsNothing);
    });
  });

  group('productividad', () {
    testWidgets('muestra mecánico, órdenes y mano de obra, con «Sin asignar» al final', (tester) async {
      await _montar(tester, _ClienteFalso());

      await _abrir(tester, 'pestanaProductividad');

      expect(find.text('Mecánico'), findsOneWidget);
      expect(_en('filaMecanico-0', 'Mecánico del Taller'), findsOneWidget);
      expect(_en('filaMecanico-0', '8 órdenes'), findsOneWidget);
      expect(_en('filaMecanico-0', '\$2400.00'), findsOneWidget);
      expect(_en('filaMecanico-1', '1 orden'), findsOneWidget);
      expect(_en('filaMecanico-2', 'Sin asignar'), findsOneWidget);
      expect(_en('filaMecanico-2', '2 órdenes'), findsOneWidget);
      expect(_en('filaMecanico-2', '\$0.00'), findsOneWidget);
    });

    testWidgets('el total suma órdenes y mano de obra', (tester) async {
      await _montar(tester, _ClienteFalso());

      await _abrir(tester, 'pestanaProductividad');

      expect(_en('filaTotalProductividad', 'Total'), findsOneWidget);
      expect(_en('filaTotalProductividad', '11 órdenes'), findsOneWidget);
      expect(_en('filaTotalProductividad', '\$2700.00'), findsOneWidget);
    });

    testWidgets('sin órdenes cerradas muestra el estado vacío', (tester) async {
      final cliente = _ClienteFalso()..cuerpos['productivity'] = _productividad([]);
      await _montar(tester, cliente);

      await _abrir(tester, 'pestanaProductividad');

      expect(find.byKey(const Key('productividadVacia')), findsOneWidget);
      expect(find.text('No hay órdenes cerradas en este rango.'), findsOneWidget);
    });
  });

  group('estados', () {
    testWidgets('muestra el indicador mientras carga la pestaña', (tester) async {
      final cliente = _ClienteFalso();
      cliente.puertas['services?periodo=MES_ACTUAL'] = Completer<void>();
      await _montar(tester, cliente);

      await tester.tap(find.byKey(const Key('pestanaServicios')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(find.byKey(const Key('reporteCargando')), findsOneWidget);

      cliente.puertas['services?periodo=MES_ACTUAL']!.complete();
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('reporteCargando')), findsNothing);
      expect(find.byKey(const Key('filaServicio-0')), findsOneWidget);
    });

    testWidgets('un error en una pestaña no afecta a las demás y permite reintentar solo esa', (tester) async {
      final cliente = _ClienteFalso()..estados['services'] = 500;
      await _montar(tester, cliente);

      await _abrir(tester, 'pestanaServicios');
      expect(find.byKey(const Key('reporteError')), findsOneWidget);
      expect(find.text('No se pudo cargar el reporte.'), findsOneWidget);
      expect(find.textContaining('Exception'), findsNothing);
      expect(find.textContaining('Error del servidor'), findsNothing);

      await _abrir(tester, 'pestanaIngresos');
      expect(find.byKey(const Key('reporteError')), findsNothing);
      expect(find.byKey(const Key('totalIngresos')), findsOneWidget);

      await _abrir(tester, 'pestanaServicios');
      cliente.estados.remove('services');
      await tester.tap(find.byKey(const Key('botonReintentarReporte')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('reporteError')), findsNothing);
      expect(find.byKey(const Key('filaServicio-0')), findsOneWidget);
      expect(cliente.de('income'), hasLength(1));
    });

    testWidgets('un 403 de permisos en cualquier pestaña muestra el mensaje y oculta el filtro', (tester) async {
      final cliente = _ClienteFalso()
        ..estados['productivity'] = 403
        ..codigoError = 'NO_AUTORIZADO'
        ..mensajeError = 'No tiene permisos para realizar esta operación.';
      await _montar(tester, cliente);

      await _abrir(tester, 'pestanaProductividad');

      expect(find.byKey(const Key('reporteSinPermiso')), findsOneWidget);
      expect(find.text('No tiene permisos para ver los reportes.'), findsOneWidget);
      expect(find.byKey(const Key('botonReintentarReporte')), findsNothing);
      expect(find.byKey(const Key('filtroMesActual')), findsNothing);
    });

    testWidgets('el rango inválido según el servidor muestra su mensaje', (tester) async {
      final cliente = _ClienteFalso()
        ..estados['services'] = 400
        ..codigoError = 'RANGO_INVALIDO'
        ..mensajeError = 'El rango no puede exceder 366 días.';
      await _montar(tester, cliente);

      await _abrir(tester, 'pestanaServicios');

      expect(find.text('El rango no puede exceder 366 días.'), findsOneWidget);
    });
  });

  group('consistencia', () {
    testWidgets('una respuesta lenta de un filtro anterior no pisa la de Servicios más reciente', (tester) async {
      final cliente = _ClienteFalso();
      cliente.puertas['services?periodo=MES_ACTUAL'] = Completer<void>();
      cliente.porConsulta['services?periodo=MES_ACTUAL'] = _servicios([
        {'tipo': 'Viejo', 'cantidad': 99, 'importeCentavos': 1, 'importe': 0.01},
      ]);
      cliente.porConsulta['services?periodo=MES_ANTERIOR'] = _servicios([
        {'tipo': 'Nuevo', 'cantidad': 1, 'importeCentavos': 100, 'importe': 1.0},
      ]);
      final entorno = await _montar(tester, cliente);

      await tester.tap(find.byKey(const Key('pestanaServicios')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(find.byKey(const Key('filtroMesAnterior')));
      await tester.pumpAndSettle();
      expect(find.text('Nuevo'), findsOneWidget);

      cliente.puertas['services?periodo=MES_ACTUAL']!.complete();
      await tester.pumpAndSettle();

      expect(find.text('Nuevo'), findsOneWidget);
      expect(find.text('Viejo'), findsNothing);
      expect(entorno.reportes.servicios!.datos.single.tipo, 'Nuevo');
    });

    testWidgets('al cerrar sesión se descartan todos los reportes', (tester) async {
      final cliente = _ClienteFalso();
      final entorno = await _montar(tester, cliente);
      await _abrir(tester, 'pestanaServicios');
      await _abrir(tester, 'pestanaProductividad');
      expect(entorno.reportes.ingresos, isNotNull);
      expect(entorno.reportes.servicios, isNotNull);
      expect(entorno.reportes.productividad, isNotNull);

      entorno.auth.cerrarSesion();
      await tester.pump();

      expect(entorno.reportes.ingresos, isNull);
      expect(entorno.reportes.servicios, isNull);
      expect(entorno.reportes.productividad, isNull);
    });

    testWidgets('no ofrece editar ni borrar en estas pestañas', (tester) async {
      await _montar(tester, _ClienteFalso());
      await _abrir(tester, 'pestanaServicios');
      await _abrir(tester, 'pestanaProductividad');

      expect(find.byIcon(Icons.delete_outline), findsNothing);
      expect(find.byIcon(Icons.edit_outlined), findsNothing);
    });
  });
}

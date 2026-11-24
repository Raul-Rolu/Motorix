// 008-configuracion-seguridad-reportes, T115 (bloque P3, US8; FR-023, CA-6): la
// sección «Reportes» (solo ADMIN) con la pestaña «Ingresos»: filtro de rango con
// «Mes actual» (por omisión), «Mes anterior» y «Rango libre» (validado en la
// interfaz: AAAA-MM-DD, fin no anterior al inicio y máximo 366 días), el total y
// su desglose por periodo y por método, y los estados de carga, vacío, error (sin
// trazas) y sin permiso (docs/design-system.md 8.4). Los importes llegan en
// centavos enteros y se muestran sin pasar por coma flotante.
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

Map<String, dynamic> _ingresos({
  String desde = '2026-11-01',
  String hasta = '2026-11-30',
  String agrupacion = 'DIA',
  int total = 0,
  List<Map<String, dynamic>> porPeriodo = const [],
  List<Map<String, dynamic>> porMetodo = const [],
}) =>
    {
      'rango': {'desde': desde, 'hasta': hasta},
      'agrupacion': agrupacion,
      'totalCentavos': total,
      'total': total / 100,
      'porPeriodo': porPeriodo,
      'porMetodo': porMetodo,
    };

Map<String, dynamic> _conDatos() => _ingresos(
      total: 123450,
      porPeriodo: [
        {'periodo': '2026-11-02', 'totalCentavos': 20000, 'total': 200.0},
        {'periodo': '2026-11-05', 'totalCentavos': 103450, 'total': 1034.5},
      ],
      porMetodo: [
        {'metodo': 'CASH', 'totalCentavos': 100000, 'total': 1000.0},
        {'metodo': 'CARD', 'totalCentavos': 20000, 'total': 200.0},
        {'metodo': 'TRANSFER', 'totalCentavos': 2450, 'total': 24.5},
        {'metodo': 'MERCADO_PAGO', 'totalCentavos': 1000, 'total': 10.0},
      ],
    );

class _ClienteFalso extends Fake implements http.Client {
  final List<http.BaseRequest> peticiones = [];

  /// Respuesta por defecto y respuestas por consulta (clave = query completa).
  Map<String, dynamic> cuerpo = _conDatos();
  final Map<String, Map<String, dynamic>> porConsulta = {};
  final Map<String, Completer<void>> puertas = {};
  int status = 200;
  String codigoError = 'ERROR_INTERNO';
  String mensajeError = 'Error del servidor.';

  List<http.BaseRequest> get consultas => peticiones.where((p) => p.url.path.endsWith('/reports/income')).toList();

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    peticiones.add(request);
    final consulta = request.url.query;
    await puertas[consulta]?.future;
    Map<String, dynamic> respuesta;
    if (status == 200) {
      respuesta = porConsulta[consulta] ?? cuerpo;
    } else {
      respuesta = {
        'error': {'codigo': codigoError, 'mensaje': mensajeError},
      };
    }
    return http.StreamedResponse(
      Stream.fromIterable([utf8.encode(jsonEncode(respuesta))]),
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

Future<_Entorno> _montar(WidgetTester tester, _ClienteFalso cliente, {bool esperar = true}) async {
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
  if (esperar) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump();
  }
  return _Entorno(reportes, auth);
}

Future<void> _rangoLibre(WidgetTester tester, String desde, String hasta) async {
  await tester.tap(find.byKey(const Key('filtroRangoLibre')));
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const Key('campoReporteDesde')), desde);
  await tester.enterText(find.byKey(const Key('campoReporteHasta')), hasta);
  await tester.tap(find.byKey(const Key('botonConsultarRango')));
  await tester.pumpAndSettle();
}

void main() {
  group('filtro de rango', () {
    testWidgets('muestra la sección, la pestaña Ingresos y los tres filtros, con «Mes actual» elegido', (tester) async {
      await _montar(tester, _ClienteFalso());

      expect(find.text('Reportes'), findsWidgets);
      expect(find.byKey(const Key('pestanaIngresos')), findsOneWidget);
      expect(find.byKey(const Key('filtroMesActual')), findsOneWidget);
      expect(find.byKey(const Key('filtroMesAnterior')), findsOneWidget);
      expect(find.byKey(const Key('filtroRangoLibre')), findsOneWidget);
      expect(find.text('Mes actual'), findsOneWidget);
      expect(find.text('Mes anterior'), findsOneWidget);
      expect(find.text('Rango libre'), findsOneWidget);
      expect(tester.widget<ChoiceChip>(find.byKey(const Key('filtroMesActual'))).selected, isTrue);
    });

    testWidgets('al abrir consulta el mes actual', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);

      expect(cliente.consultas, hasLength(1));
      expect(cliente.consultas.single.url.queryParameters, {'periodo': 'MES_ACTUAL'});
    });

    testWidgets('«Mes anterior» consulta ese periodo', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);

      await tester.tap(find.byKey(const Key('filtroMesAnterior')));
      await tester.pumpAndSettle();

      expect(cliente.consultas.last.url.queryParameters, {'periodo': 'MES_ANTERIOR'});
      expect(tester.widget<ChoiceChip>(find.byKey(const Key('filtroMesAnterior'))).selected, isTrue);
      expect(tester.widget<ChoiceChip>(find.byKey(const Key('filtroMesActual'))).selected, isFalse);
    });

    testWidgets('«Rango libre» muestra Desde y Hasta y consulta con las fechas escritas', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);

      await _rangoLibre(tester, ' 2026-10-01 ', '2026-10-15');

      expect(cliente.consultas.last.url.queryParameters, {'desde': '2026-10-01', 'hasta': '2026-10-15'});
    });

    testWidgets('el rango libre es válido con un solo día y con exactamente 366 días', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);

      await _rangoLibre(tester, '2026-11-15', '2026-11-15');
      await _rangoLibre(tester, '2025-11-24', '2026-11-24');

      expect(cliente.consultas, hasLength(3));
      expect(find.byKey(const Key('reporteError')), findsNothing);
    });

    for (final caso in [
      ('formato incorrecto', '01/11/2026', '2026-11-30', 'Use el formato AAAA-MM-DD.'),
      ('fecha inexistente', '2026-02-30', '2026-03-30', 'Use el formato AAAA-MM-DD.'),
      ('vacío', '', '2026-11-30', 'Use el formato AAAA-MM-DD.'),
      ('fin anterior al inicio', '2026-11-30', '2026-11-01', 'La fecha final no puede ser anterior a la inicial.'),
      ('más de 366 días', '2025-11-23', '2026-11-24', 'El rango no puede exceder 366 días.'),
    ]) {
      testWidgets('rango libre con ${caso.$1}: muestra «${caso.$4}» y no consulta', (tester) async {
        final cliente = _ClienteFalso();
        await _montar(tester, cliente);
        final antes = cliente.consultas.length;

        await _rangoLibre(tester, caso.$2, caso.$3);

        expect(find.text(caso.$4), findsOneWidget);
        expect(cliente.consultas.length, antes);
      });
    }
  });

  group('totales y desglose', () {
    testWidgets('muestra el total y el desglose por día con fechas legibles', (tester) async {
      await _montar(tester, _ClienteFalso());

      expect(find.byKey(const Key('totalIngresos')), findsOneWidget);
      expect(find.text('\$1234.50'), findsWidgets);
      expect(find.text('Ingresos por día'), findsOneWidget);
      expect(find.byKey(const Key('filaPeriodo-0')), findsOneWidget);
      expect(find.text('02/11/2026'), findsOneWidget);
      expect(find.text('05/11/2026'), findsOneWidget);
      expect(find.text('\$200.00'), findsWidgets);
      expect(find.text('\$1034.50'), findsOneWidget);
    });

    testWidgets('con agrupación por mes muestra el mes y el año en español', (tester) async {
      final cliente = _ClienteFalso()
        ..cuerpo = _ingresos(
          desde: '2026-09-01',
          hasta: '2026-11-30',
          agrupacion: 'MES',
          total: 600000,
          porPeriodo: [
            {'periodo': '2026-09', 'totalCentavos': 100000, 'total': 1000.0},
            {'periodo': '2026-10', 'totalCentavos': 200000, 'total': 2000.0},
            {'periodo': '2026-11', 'totalCentavos': 300000, 'total': 3000.0},
          ],
          porMetodo: [
            {'metodo': 'CASH', 'totalCentavos': 600000, 'total': 6000.0},
          ],
        );
      await _montar(tester, cliente);

      expect(find.text('Ingresos por mes'), findsOneWidget);
      expect(find.text('Septiembre 2026'), findsOneWidget);
      expect(find.text('Octubre 2026'), findsOneWidget);
      expect(find.text('Noviembre 2026'), findsOneWidget);
    });

    testWidgets('el desglose por método usa los nombres en español', (tester) async {
      await _montar(tester, _ClienteFalso());

      expect(find.text('Por método de pago'), findsOneWidget);
      expect(find.byKey(const Key('filaMetodo-0')), findsOneWidget);
      expect(find.text('Efectivo'), findsOneWidget);
      expect(find.text('Tarjeta'), findsOneWidget);
      expect(find.text('Transferencia'), findsOneWidget);
      expect(find.text('Mercado Pago'), findsOneWidget);
      expect(find.text('\$1000.00'), findsOneWidget);
      expect(find.text('\$24.50'), findsOneWidget);
    });

    testWidgets('los importes salen de centavos enteros sin errores de coma flotante', (tester) async {
      final cliente = _ClienteFalso()
        ..cuerpo = _ingresos(
          total: 30,
          porPeriodo: [
            {'periodo': '2026-11-03', 'totalCentavos': 30, 'total': 0.30000000000000004},
          ],
          porMetodo: [
            {'metodo': 'CASH', 'totalCentavos': 30, 'total': 0.30000000000000004},
          ],
        );
      await _montar(tester, cliente);

      expect(find.text('\$0.30'), findsWidgets);
      expect(find.textContaining('0.3000'), findsNothing);
    });

    testWidgets('un importe de 10 centavos y el máximo se muestran completos', (tester) async {
      final cliente = _ClienteFalso()
        ..cuerpo = _ingresos(
          total: 9999999999,
          porPeriodo: [
            {'periodo': '2026-11-03', 'totalCentavos': 10, 'total': 0.1},
          ],
          porMetodo: [
            {'metodo': 'TRANSFER', 'totalCentavos': 9999999999, 'total': 99999999.99},
          ],
        );
      await _montar(tester, cliente);

      expect(find.text('\$0.10'), findsOneWidget);
      expect(find.text('\$99999999.99'), findsWidgets);
    });

    testWidgets('un método desconocido se muestra con su código (no falla)', (tester) async {
      final cliente = _ClienteFalso()
        ..cuerpo = _ingresos(
          total: 500,
          porPeriodo: [
            {'periodo': '2026-11-03', 'totalCentavos': 500, 'total': 5.0},
          ],
          porMetodo: [
            {'metodo': 'CRIPTO', 'totalCentavos': 500, 'total': 5.0},
          ],
        );
      await _montar(tester, cliente);

      expect(find.text('CRIPTO'), findsOneWidget);
    });
  });

  group('estados', () {
    testWidgets('muestra el indicador mientras carga', (tester) async {
      final cliente = _ClienteFalso();
      cliente.puertas['periodo=MES_ACTUAL'] = Completer<void>();
      await _montar(tester, cliente, esperar: false);

      expect(find.byKey(const Key('reporteCargando')), findsOneWidget);

      cliente.puertas['periodo=MES_ACTUAL']!.complete();
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('reporteCargando')), findsNothing);
      expect(find.byKey(const Key('totalIngresos')), findsOneWidget);
    });

    testWidgets('sin cobros muestra el estado vacío y el rango consultado', (tester) async {
      final cliente = _ClienteFalso()..cuerpo = _ingresos();
      await _montar(tester, cliente);

      expect(find.byKey(const Key('ingresosVacio')), findsOneWidget);
      expect(find.text('No hay cobros en este rango.'), findsOneWidget);
      expect(find.byKey(const Key('filaPeriodo-0')), findsNothing);
    });

    testWidgets('un error del servidor muestra un mensaje sin trazas y permite reintentar', (tester) async {
      final cliente = _ClienteFalso()..status = 500;
      await _montar(tester, cliente);

      expect(find.byKey(const Key('reporteError')), findsOneWidget);
      expect(find.text('No se pudo cargar el reporte.'), findsOneWidget);
      expect(find.textContaining('Exception'), findsNothing);
      expect(find.textContaining('Error del servidor'), findsNothing);

      cliente.status = 200;
      await tester.tap(find.byKey(const Key('botonReintentarReporte')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('reporteError')), findsNothing);
      expect(find.byKey(const Key('totalIngresos')), findsOneWidget);
    });

    testWidgets('un rango inválido según el servidor muestra su mensaje', (tester) async {
      final cliente = _ClienteFalso()
        ..status = 400
        ..codigoError = 'RANGO_INVALIDO'
        ..mensajeError = 'El rango no puede exceder 366 días.';
      await _montar(tester, cliente);

      expect(find.byKey(const Key('reporteError')), findsOneWidget);
      expect(find.text('El rango no puede exceder 366 días.'), findsOneWidget);
    });

    testWidgets('un 403 de permisos muestra el mensaje y no ofrece reintentar', (tester) async {
      final cliente = _ClienteFalso()
        ..status = 403
        ..codigoError = 'NO_AUTORIZADO'
        ..mensajeError = 'No tiene permisos para realizar esta operación.';
      await _montar(tester, cliente);

      expect(find.byKey(const Key('reporteSinPermiso')), findsOneWidget);
      expect(find.text('No tiene permisos para ver los reportes.'), findsOneWidget);
      expect(find.byKey(const Key('botonReintentarReporte')), findsNothing);
      expect(find.byKey(const Key('filtroMesActual')), findsNothing);
    });
  });

  group('consistencia', () {
    testWidgets('una respuesta lenta del filtro anterior no pisa a la más reciente', (tester) async {
      final cliente = _ClienteFalso();
      cliente.puertas['periodo=MES_ACTUAL'] = Completer<void>();
      cliente.porConsulta['periodo=MES_ACTUAL'] = _ingresos(
        total: 111100,
        porPeriodo: [
          {'periodo': '2026-11-03', 'totalCentavos': 111100, 'total': 1111.0},
        ],
      );
      cliente.porConsulta['periodo=MES_ANTERIOR'] = _ingresos(
        desde: '2026-10-01',
        hasta: '2026-10-31',
        total: 222200,
        porPeriodo: [
          {'periodo': '2026-10-03', 'totalCentavos': 222200, 'total': 2222.0},
        ],
      );
      final entorno = await _montar(tester, cliente, esperar: false);

      await tester.tap(find.byKey(const Key('filtroMesAnterior')));
      await tester.pumpAndSettle();
      expect(find.text('\$2222.00'), findsWidgets);

      cliente.puertas['periodo=MES_ACTUAL']!.complete();
      await tester.pumpAndSettle();

      expect(find.text('\$2222.00'), findsWidgets);
      expect(find.text('\$1111.00'), findsNothing);
      expect(tester.widget<ChoiceChip>(find.byKey(const Key('filtroMesAnterior'))).selected, isTrue);
      // El estado del proveedor tampoco guarda la respuesta vieja (aunque no se vea).
      expect(entorno.reportes.ingresos!.totalCentavos, 222200);
      expect(entorno.reportes.filtro, FiltroRango.mesAnterior);
    });

    testWidgets('al cerrar sesión se descarta el reporte', (tester) async {
      final cliente = _ClienteFalso();
      final entorno = await _montar(tester, cliente);
      expect(entorno.reportes.ingresos, isNotNull);

      entorno.auth.cerrarSesion();
      await tester.pump(); // sin sesión el reporte queda vacío; no hay nada que esperar

      expect(entorno.reportes.ingresos, isNull);
    });

    testWidgets('no ofrece exportar ni editar en esta pestaña todavía', (tester) async {
      await _montar(tester, _ClienteFalso());

      expect(find.byIcon(Icons.delete_outline), findsNothing);
      expect(find.byIcon(Icons.edit_outlined), findsNothing);
    });
  });
}

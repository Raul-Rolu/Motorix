// 008-configuracion-seguridad-reportes, T129 (bloque P3, US10; FR-025, FR-026,
// CA-8): las pestañas «Refacciones» (una fila por uso, con costo, precio de venta
// y margen; «sin costo» y «sin precio» fuera de los totales) y «Rotación» («sin
// existencia» con existencia 0) de la sección «Reportes» (solo ADMIN). Ambas son
// paginadas de 50 en 50, comparten el filtro de rango y vuelven a la página 1 al
// cambiarlo. Estados de carga, vacío, error (sin trazas) y sin permiso
// (docs/design-system.md 8.4 y 8.10). Importes desde centavos enteros.
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

Map<String, dynamic> _linea({
  required int ordenId,
  required int parteId,
  required String codigo,
  required String nombre,
  required int cantidad,
  int? venta,
  int? compra,
}) {
  final ventas = venta == null ? null : venta * cantidad;
  final costo = compra == null ? null : compra * cantidad;
  return {
    'ordenId': ordenId,
    'parteId': parteId,
    'codigo': codigo,
    'nombre': nombre,
    'cantidad': cantidad,
    'precioVentaCentavos': venta,
    'precioCompraCentavos': compra,
    'ventasCentavos': ventas,
    'costoCentavos': costo,
    'margenCentavos': ventas != null && costo != null ? ventas - costo : null,
    'sinCosto': compra == null,
    'sinPrecio': venta == null,
  };
}

Map<String, dynamic> _refacciones({
  List<Map<String, dynamic>>? datos,
  int pagina = 1,
  int totalPaginas = 1,
  int? total,
  Map<String, dynamic>? totales,
}) {
  final lista = datos ??
      [
        _linea(ordenId: 12, parteId: 2, codigo: 'FRN-PAS-220', nombre: 'Pastillas de freno', cantidad: 4, venta: 45000, compra: 30000),
        _linea(ordenId: 11, parteId: 7, codigo: 'BAT-12V-60', nombre: 'Batería 12V', cantidad: 1, venta: 90000, compra: null),
        _linea(ordenId: 10, parteId: 4, codigo: 'BUJ-IR-001', nombre: 'Bujía de iridio', cantidad: 2, venta: null, compra: 5500),
        _linea(ordenId: 9, parteId: 1, codigo: 'FLT-OIL-010', nombre: 'Filtro de aceite', cantidad: 2, venta: 0, compra: 7850),
      ];
  return {
    'rango': _rango,
    'pagina': pagina,
    'totalPaginas': totalPaginas,
    'total': total ?? lista.length,
    'totales': totales ??
        {
          'ventasCentavos': 180000,
          'costoCentavos': 135700,
          'margenCentavos': 44300,
          'lineasSinCosto': 1,
          'lineasSinPrecio': 1,
        },
    'datos': lista,
  };
}

Map<String, dynamic> _rotacion({
  List<Map<String, dynamic>>? datos,
  int pagina = 1,
  int totalPaginas = 1,
  int? total,
}) {
  final lista = datos ??
      [
        {'parteId': 3, 'codigo': 'ZAP-001', 'nombre': 'Zapata', 'unidadesSalidas': 8, 'existencia': 2, 'rotacion': 4.0, 'sinExistencia': false},
        {'parteId': 1, 'codigo': 'ACE-001', 'nombre': 'Aceite', 'unidadesSalidas': 5, 'existencia': 10, 'rotacion': 0.5, 'sinExistencia': false},
        {'parteId': 9, 'codigo': 'AGO-001', 'nombre': 'Agotada', 'unidadesSalidas': 100, 'existencia': 0, 'rotacion': null, 'sinExistencia': true},
      ];
  return {'rango': _rango, 'pagina': pagina, 'totalPaginas': totalPaginas, 'total': total ?? lista.length, 'datos': lista};
}

class _ClienteFalso extends Fake implements http.Client {
  final List<http.BaseRequest> peticiones = [];

  final Map<String, Map<String, dynamic>> cuerpos = {
    'income': {
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
    },
    'parts': _refacciones(),
    'rotation': _rotacion(),
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
  await tester.binding.setSurfaceSize(const Size(1300, 1200));
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
  group('Refacciones: filas', () {
    testWidgets('abrir la pestaña consulta con el filtro compartido y la página 1', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);

      await _abrir(tester, 'pestanaRefacciones');

      expect(cliente.de('parts'), hasLength(1));
      expect(cliente.de('parts').single.url.queryParameters, {'periodo': 'MES_ACTUAL', 'pagina': '1'});
    });

    testWidgets('cada fila muestra nombre, código y orden, cantidad, precio, costo y margen', (tester) async {
      await _montar(tester, _ClienteFalso());

      await _abrir(tester, 'pestanaRefacciones');

      // Unitario vs. total de la línea: las etiquetas lo dicen y no se repiten con el resumen.
      for (final encabezado in ['Refacción', 'Cant.', 'Precio unitario', 'Costo total', 'Margen total']) {
        expect(find.text(encabezado), findsOneWidget);
      }
      expect(find.text('Precio de venta'), findsNothing);
      expect(_en('filaRefaccion-0', 'Pastillas de freno'), findsOneWidget);
      expect(_en('filaRefaccion-0', 'FRN-PAS-220 · Orden #12'), findsOneWidget);
      expect(_en('filaRefaccion-0', '4'), findsOneWidget);
      expect(_en('filaRefaccion-0', '\$450.00'), findsOneWidget);
      expect(_en('filaRefaccion-0', '\$1200.00'), findsOneWidget);
      expect(_en('filaRefaccion-0', '\$600.00'), findsOneWidget);
    });

    testWidgets('«sin costo» reemplaza al costo y el margen se muestra «—»', (tester) async {
      await _montar(tester, _ClienteFalso());

      await _abrir(tester, 'pestanaRefacciones');

      expect(_en('filaRefaccion-1', 'sin costo'), findsOneWidget);
      expect(_en('filaRefaccion-1', '—'), findsOneWidget);
      expect(_en('filaRefaccion-1', '\$900.00'), findsOneWidget); // el precio de venta sí se muestra
      expect(find.descendant(of: find.byKey(const Key('filaRefaccion-1')), matching: find.text('\$0.00')), findsNothing);
    });

    testWidgets('«sin precio» reemplaza al precio de venta y el margen se muestra «—»', (tester) async {
      await _montar(tester, _ClienteFalso());

      await _abrir(tester, 'pestanaRefacciones');

      expect(_en('filaRefaccion-2', 'sin precio'), findsOneWidget);
      expect(_en('filaRefaccion-2', '—'), findsOneWidget);
      expect(_en('filaRefaccion-2', '\$110.00'), findsOneWidget); // el costo sí se muestra
    });

    testWidgets('las marcas se escriben en color de advertencia', (tester) async {
      await _montar(tester, _ClienteFalso());

      await _abrir(tester, 'pestanaRefacciones');

      final marca = tester.widget<Text>(_en('filaRefaccion-1', 'sin costo'));
      expect(marca.style?.color, MotorixColores.advertencia);
    });

    testWidgets('un margen negativo (obsequio) se muestra en color de error', (tester) async {
      await _montar(tester, _ClienteFalso());

      await _abrir(tester, 'pestanaRefacciones');

      final margen = tester.widget<Text>(_en('filaRefaccion-3', '-\$157.00'));
      expect(margen.style?.color, MotorixColores.error);
      expect(_en('filaRefaccion-3', '\$0.00'), findsOneWidget); // precio de venta 0 es un precio válido
    });

    testWidgets('los importes salen de centavos enteros sin errores de coma flotante', (tester) async {
      final cliente = _ClienteFalso()
        ..cuerpos['parts'] = _refacciones(
          datos: [_linea(ordenId: 1, parteId: 1, codigo: 'X-1', nombre: 'Prueba', cantidad: 3, venta: 3333, compra: 10)],
          totales: {'ventasCentavos': 9999, 'costoCentavos': 30, 'margenCentavos': 9969, 'lineasSinCosto': 0, 'lineasSinPrecio': 0},
        );
      await _montar(tester, cliente);

      await _abrir(tester, 'pestanaRefacciones');

      expect(_en('filaRefaccion-0', '\$33.33'), findsOneWidget);
      expect(_en('filaRefaccion-0', '\$0.30'), findsOneWidget);
      expect(_en('filaRefaccion-0', '\$99.69'), findsOneWidget);
    });
  });

  group('Refacciones: totales', () {
    testWidgets('muestra Ventas, Costo y Margen de las líneas completas', (tester) async {
      await _montar(tester, _ClienteFalso());

      await _abrir(tester, 'pestanaRefacciones');

      expect(find.text('Ventas'), findsOneWidget);
      expect(find.text('Costo'), findsOneWidget);
      expect(find.text('Margen'), findsOneWidget);
      expect(tester.widget<Text>(find.byKey(const Key('totalVentas'))).data, '\$1800.00');
      expect(tester.widget<Text>(find.byKey(const Key('totalCosto'))).data, '\$1357.00');
      expect(tester.widget<Text>(find.byKey(const Key('totalMargen'))).data, '\$443.00');
    });

    testWidgets('avisa de las líneas sin costo y sin precio que no entran en los totales', (tester) async {
      await _montar(tester, _ClienteFalso());

      await _abrir(tester, 'pestanaRefacciones');

      expect(find.byKey(const Key('avisoLineasExcluidas')), findsOneWidget);
      expect(find.text('1 línea sin costo y 1 sin precio no se incluyen en estos totales.'), findsOneWidget);
    });

    for (final caso in [
      ('solo sin costo (1)', 1, 0, '1 línea sin costo no se incluye en estos totales.'),
      ('solo sin costo (3)', 3, 0, '3 líneas sin costo no se incluyen en estos totales.'),
      ('solo sin precio (2)', 0, 2, '2 líneas sin precio no se incluyen en estos totales.'),
      ('ambos (2 y 1)', 2, 1, '2 líneas sin costo y 1 sin precio no se incluyen en estos totales.'),
    ]) {
      testWidgets('aviso con ${caso.$1}', (tester) async {
        final cliente = _ClienteFalso()
          ..cuerpos['parts'] = _refacciones(
            totales: {'ventasCentavos': 0, 'costoCentavos': 0, 'margenCentavos': 0, 'lineasSinCosto': caso.$2, 'lineasSinPrecio': caso.$3},
          );
        await _montar(tester, cliente);

        await _abrir(tester, 'pestanaRefacciones');

        expect(find.text(caso.$4), findsOneWidget);
      });
    }

    testWidgets('sin líneas incompletas no hay aviso', (tester) async {
      final cliente = _ClienteFalso()
        ..cuerpos['parts'] = _refacciones(
          datos: [_linea(ordenId: 1, parteId: 1, codigo: 'X-1', nombre: 'Completa', cantidad: 1, venta: 100, compra: 50)],
          totales: {'ventasCentavos': 100, 'costoCentavos': 50, 'margenCentavos': 50, 'lineasSinCosto': 0, 'lineasSinPrecio': 0},
        );
      await _montar(tester, cliente);

      await _abrir(tester, 'pestanaRefacciones');

      expect(find.byKey(const Key('avisoLineasExcluidas')), findsNothing);
    });

    testWidgets('un margen total negativo se muestra en color de error', (tester) async {
      final cliente = _ClienteFalso()
        ..cuerpos['parts'] = _refacciones(
          totales: {'ventasCentavos': 1000, 'costoCentavos': 5000, 'margenCentavos': -4000, 'lineasSinCosto': 0, 'lineasSinPrecio': 0},
        );
      await _montar(tester, cliente);

      await _abrir(tester, 'pestanaRefacciones');

      final total = tester.widget<Text>(find.byKey(const Key('totalMargen')));
      expect(total.data, '-\$40.00');
      expect(total.style?.color, MotorixColores.error);
    });

    testWidgets('sin usos muestra el estado vacío y oculta los totales', (tester) async {
      final cliente = _ClienteFalso()
        ..cuerpos['parts'] = _refacciones(
          datos: [],
          totales: {'ventasCentavos': 0, 'costoCentavos': 0, 'margenCentavos': 0, 'lineasSinCosto': 0, 'lineasSinPrecio': 0},
        );
      await _montar(tester, cliente);

      await _abrir(tester, 'pestanaRefacciones');

      expect(find.byKey(const Key('refaccionesVacias')), findsOneWidget);
      expect(find.text('No hay refacciones usadas en órdenes cerradas en este rango.'), findsOneWidget);
      expect(find.byKey(const Key('totalVentas')), findsNothing);
      expect(find.byKey(const Key('paginacionReporte')), findsNothing);
    });
  });

  group('paginación', () {
    _ClienteFalso conPaginas() {
      final cliente = _ClienteFalso();
      for (var pagina = 1; pagina <= 3; pagina++) {
        cliente.porConsulta['parts?periodo=MES_ACTUAL&pagina=$pagina'] = _refacciones(
          pagina: pagina,
          totalPaginas: 3,
          total: 120,
          datos: [
            _linea(ordenId: 100 + pagina, parteId: pagina, codigo: 'PAG-$pagina', nombre: 'Parte de la página $pagina', cantidad: 1, venta: 100, compra: 50),
          ],
        );
        cliente.porConsulta['rotation?periodo=MES_ACTUAL&pagina=$pagina'] = _rotacion(
          pagina: pagina,
          totalPaginas: 3,
          total: 120,
          datos: [
            {'parteId': pagina, 'codigo': 'ROT-$pagina', 'nombre': 'Rotación página $pagina', 'unidadesSalidas': 1, 'existencia': 1, 'rotacion': 1.0, 'sinExistencia': false},
          ],
        );
      }
      return cliente;
    }

    testWidgets('el pie muestra la página, el total y los botones', (tester) async {
      await _montar(tester, conPaginas());

      await _abrir(tester, 'pestanaRefacciones');

      expect(find.text('Página 1 de 3 · 120 líneas'), findsOneWidget);
      expect(tester.widget<OutlinedButton>(find.byKey(const Key('botonPaginaAnteriorReporte'))).onPressed, isNull);
      expect(tester.widget<OutlinedButton>(find.byKey(const Key('botonPaginaSiguienteReporte'))).onPressed, isNotNull);
    });

    testWidgets('«Siguiente» y «Anterior» piden la página correspondiente', (tester) async {
      final cliente = conPaginas();
      await _montar(tester, cliente);
      await _abrir(tester, 'pestanaRefacciones');
      await tester.tap(find.byKey(const Key('botonPaginaSiguienteReporte')));
      await tester.pumpAndSettle();

      expect(cliente.de('parts').last.url.queryParameters, {'periodo': 'MES_ACTUAL', 'pagina': '2'});
      expect(find.text('Parte de la página 2'), findsOneWidget);
      expect(find.text('Página 2 de 3 · 120 líneas'), findsOneWidget);
      await tester.tap(find.byKey(const Key('botonPaginaAnteriorReporte')));
      await tester.pumpAndSettle();

      expect(cliente.de('parts').last.url.queryParameters, {'periodo': 'MES_ACTUAL', 'pagina': '1'});
      expect(find.text('Parte de la página 1'), findsOneWidget);
    });

    testWidgets('en la última página «Siguiente» se deshabilita', (tester) async {
      await _montar(tester, conPaginas());
      await _abrir(tester, 'pestanaRefacciones');
      for (var i = 0; i < 2; i++) {
        await tester.tap(find.byKey(const Key('botonPaginaSiguienteReporte')));
        await tester.pumpAndSettle();
      }

      expect(find.text('Página 3 de 3 · 120 líneas'), findsOneWidget);
      expect(tester.widget<OutlinedButton>(find.byKey(const Key('botonPaginaSiguienteReporte'))).onPressed, isNull);
    });

    testWidgets('cambiar el filtro vuelve a la página 1', (tester) async {
      final cliente = conPaginas();
      await _montar(tester, cliente);
      await _abrir(tester, 'pestanaRefacciones');
      await tester.tap(find.byKey(const Key('botonPaginaSiguienteReporte')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('filtroMesAnterior')));
      await tester.pumpAndSettle();

      expect(cliente.de('parts').last.url.queryParameters, {'periodo': 'MES_ANTERIOR', 'pagina': '1'});
    });

    testWidgets('cambiar de pestaña y volver conserva la página sin consultar otra vez', (tester) async {
      final cliente = conPaginas();
      await _montar(tester, cliente);
      await _abrir(tester, 'pestanaRefacciones');
      await tester.tap(find.byKey(const Key('botonPaginaSiguienteReporte')));
      await tester.pumpAndSettle();

      await _abrir(tester, 'pestanaIngresos');
      await _abrir(tester, 'pestanaRefacciones');

      expect(cliente.de('parts'), hasLength(2));
      expect(find.text('Página 2 de 3 · 120 líneas'), findsOneWidget);
    });

    testWidgets('«Actualizar» recarga la página actual de la pestaña activa', (tester) async {
      final cliente = conPaginas();
      await _montar(tester, cliente);
      await _abrir(tester, 'pestanaRefacciones');
      await tester.tap(find.byKey(const Key('botonPaginaSiguienteReporte')));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(const Key('botonRefrescarReportes')));
      await tester.pumpAndSettle();

      expect(cliente.de('parts').last.url.queryParameters['pagina'], '2');
    });

    testWidgets('una página lenta ya superada no pisa a la más reciente', (tester) async {
      final cliente = conPaginas();
      cliente.puertas['parts?periodo=MES_ACTUAL&pagina=2'] = Completer<void>();
      final entorno = await _montar(tester, cliente);
      await _abrir(tester, 'pestanaRefacciones');
      await tester.tap(find.byKey(const Key('botonPaginaSiguienteReporte'))); // página 2: queda pendiente
      await tester.pump();

      await entorno.reportes.irAPagina(PestanaReporte.refacciones, 3);
      await tester.pumpAndSettle();
      expect(find.text('Parte de la página 3'), findsOneWidget);

      cliente.puertas['parts?periodo=MES_ACTUAL&pagina=2']!.complete();
      await tester.pumpAndSettle();

      expect(find.text('Parte de la página 3'), findsOneWidget);
      expect(find.text('Parte de la página 2'), findsNothing);
      expect(entorno.reportes.refacciones!.pagina, 3);
    });

    testWidgets('con las dos pestañas cargadas hay un solo pie de paginación visible', (tester) async {
      final cliente = conPaginas();
      await _montar(tester, cliente);
      await _abrir(tester, 'pestanaRotacion');
      await _abrir(tester, 'pestanaRefacciones');

      expect(find.byKey(const Key('paginacionReporte')), findsOneWidget);
      expect(find.byKey(const Key('botonPaginaSiguienteReporte')), findsOneWidget);
      expect(find.text('Página 1 de 3 · 120 líneas'), findsOneWidget);
      expect(find.textContaining('refacciones'), findsNothing);
    });

    testWidgets('Rotación tiene su propia paginación', (tester) async {
      final cliente = conPaginas();
      await _montar(tester, cliente);
      await _abrir(tester, 'pestanaRotacion');
      expect(find.text('Página 1 de 3 · 120 refacciones'), findsOneWidget);
      await tester.tap(find.byKey(const Key('botonPaginaSiguienteReporte')));
      await tester.pumpAndSettle();

      expect(cliente.de('rotation').last.url.queryParameters, {'periodo': 'MES_ACTUAL', 'pagina': '2'});
      expect(find.text('Rotación página 2'), findsOneWidget);
    });
  });

  group('Rotación', () {
    testWidgets('muestra salidas, existencia y rotación con dos decimales', (tester) async {
      await _montar(tester, _ClienteFalso());

      await _abrir(tester, 'pestanaRotacion');

      for (final encabezado in ['Refacción', 'Salidas', 'Existencia', 'Rotación']) {
        expect(find.text(encabezado), findsWidgets);
      }
      expect(_en('filaRotacion-0', 'Zapata'), findsOneWidget);
      expect(_en('filaRotacion-0', 'ZAP-001'), findsOneWidget);
      expect(_en('filaRotacion-0', '8'), findsOneWidget);
      expect(_en('filaRotacion-0', '2'), findsOneWidget);
      expect(_en('filaRotacion-0', '4.00'), findsOneWidget);
      expect(_en('filaRotacion-1', '0.50'), findsOneWidget);
    });

    testWidgets('«sin existencia» en color de advertencia cuando la existencia es 0', (tester) async {
      await _montar(tester, _ClienteFalso());

      await _abrir(tester, 'pestanaRotacion');

      expect(_en('filaRotacion-2', 'sin existencia'), findsOneWidget);
      expect(_en('filaRotacion-2', '100'), findsOneWidget);
      expect(tester.widget<Text>(_en('filaRotacion-2', 'sin existencia')).style?.color, MotorixColores.advertencia);
    });

    testWidgets('sin refacciones activas muestra el estado vacío', (tester) async {
      final cliente = _ClienteFalso()..cuerpos['rotation'] = _rotacion(datos: []);
      await _montar(tester, cliente);

      await _abrir(tester, 'pestanaRotacion');

      expect(find.byKey(const Key('rotacionVacia')), findsOneWidget);
      expect(find.text('No hay refacciones activas.'), findsOneWidget);
      expect(find.byKey(const Key('paginacionReporte')), findsNothing);
    });

    testWidgets('no muestra precios ni costos', (tester) async {
      await _montar(tester, _ClienteFalso());

      await _abrir(tester, 'pestanaRotacion');

      expect(find.textContaining('\$'), findsNothing);
      expect(find.text('Costo'), findsNothing);
    });
  });

  group('estados y consistencia', () {
    testWidgets('un error en Refacciones no afecta a las demás y se reintenta solo esa', (tester) async {
      final cliente = _ClienteFalso()..estados['parts'] = 500;
      await _montar(tester, cliente);

      await _abrir(tester, 'pestanaRefacciones');
      expect(find.byKey(const Key('reporteError')), findsOneWidget);
      expect(find.text('No se pudo cargar el reporte.'), findsOneWidget);
      expect(find.textContaining('Exception'), findsNothing);

      await _abrir(tester, 'pestanaRotacion');
      expect(find.byKey(const Key('filaRotacion-0')), findsOneWidget);

      await _abrir(tester, 'pestanaRefacciones');
      cliente.estados.remove('parts');
      await tester.tap(find.byKey(const Key('botonReintentarReporte')));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('filaRefaccion-0')), findsOneWidget);
    });

    testWidgets('un 403 en Rotación muestra «sin permiso» y oculta el filtro', (tester) async {
      final cliente = _ClienteFalso()
        ..estados['rotation'] = 403
        ..codigoError = 'NO_AUTORIZADO'
        ..mensajeError = 'No tiene permisos para realizar esta operación.';
      await _montar(tester, cliente);

      await _abrir(tester, 'pestanaRotacion');

      expect(find.byKey(const Key('reporteSinPermiso')), findsOneWidget);
      expect(find.byKey(const Key('filtroMesActual')), findsNothing);
    });

    testWidgets('al cerrar sesión se descartan Refacciones y Rotación', (tester) async {
      final cliente = _ClienteFalso();
      final entorno = await _montar(tester, cliente);
      await _abrir(tester, 'pestanaRefacciones');
      await _abrir(tester, 'pestanaRotacion');
      expect(entorno.reportes.refacciones, isNotNull);
      expect(entorno.reportes.rotacion, isNotNull);

      entorno.auth.cerrarSesion();
      await tester.pump();

      expect(entorno.reportes.refacciones, isNull);
      expect(entorno.reportes.rotacion, isNull);
    });

    testWidgets('no ofrece editar ni borrar', (tester) async {
      await _montar(tester, _ClienteFalso());
      await _abrir(tester, 'pestanaRefacciones');
      await _abrir(tester, 'pestanaRotacion');

      expect(find.byIcon(Icons.delete_outline), findsNothing);
      expect(find.byIcon(Icons.edit_outlined), findsNothing);
    });
  });
}

// 008-configuracion-seguridad-reportes, T137 (bloque P3, US11; FR-027, CA-9): el
// botón «Exportar CSV» de la sección «Reportes» (solo ADMIN). Pide el archivo al
// servidor con el MISMO filtro de rango y la pestaña activa (sin la página: se
// exporta todo el rango), lo guarda con un nombre saneado y muestra el resultado
// o el error sin trazas (docs/design-system.md 8.10.3). No aparece sin permiso, no
// se puede disparar dos veces a la vez y no recarga ni cambia el reporte que se ve.
//
// Sin red ni disco: un cliente HTTP falso responde con el formato del contrato y
// el guardado de archivos se inyecta en el proveedor.
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
const _csv = '\uFEFFSección,Concepto,Importe\r\nTotal,Total cobrado,500.00\r\nPor método,Efectivo,500.00\r\n';

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

Map<String, dynamic> _refacciones(int pagina) => {
      'rango': _rango,
      'pagina': pagina,
      'totalPaginas': 3,
      'total': 120,
      'totales': {'ventasCentavos': 100, 'costoCentavos': 50, 'margenCentavos': 50, 'lineasSinCosto': 0, 'lineasSinPrecio': 0},
      'datos': [
        {
          'ordenId': 10 + pagina,
          'parteId': 1,
          'codigo': 'X-1',
          'nombre': 'Parte página $pagina',
          'cantidad': 1,
          'precioVentaCentavos': 100,
          'precioCompraCentavos': 50,
          'ventasCentavos': 100,
          'costoCentavos': 50,
          'margenCentavos': 50,
          'sinCosto': false,
          'sinPrecio': false,
        },
      ],
    };

class _ClienteFalso extends Fake implements http.Client {
  final List<http.BaseRequest> peticiones = [];

  /// Estado, cuerpo y nombre de archivo de la exportación.
  int estadoExportacion = 200;
  String cuerpoCsv = _csv;
  String? contentDisposition = 'attachment; filename="motorix-income-2026-11-01-2026-11-30.csv"';
  String codigoError = 'ERROR_INTERNO';
  String mensajeError = 'Error del servidor.';
  Completer<void>? puertaExportacion;

  List<http.BaseRequest> exportaciones(String reporte) =>
      peticiones.where((p) => p.url.path.endsWith('/reports/$reporte/export')).toList();
  List<http.BaseRequest> consultas(String reporte) =>
      peticiones.where((p) => p.url.path.endsWith('/reports/$reporte')).toList();

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    peticiones.add(request);
    final ruta = request.url.path;
    if (ruta.endsWith('/export')) {
      await puertaExportacion?.future;
      if (estadoExportacion != 200) {
        return http.StreamedResponse(
          Stream.fromIterable([
            utf8.encode(jsonEncode({
              'error': {'codigo': codigoError, 'mensaje': mensajeError},
            })),
          ]),
          estadoExportacion,
          headers: {'content-type': 'application/json'},
        );
      }
      return http.StreamedResponse(
        Stream.fromIterable([utf8.encode(cuerpoCsv)]),
        200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': ?contentDisposition,
        },
      );
    }
    final reporte = ruta.split('/').last;
    final pagina = int.tryParse(request.url.queryParameters['pagina'] ?? '1') ?? 1;
    final cuerpo = switch (reporte) {
      'income' => _ingresos(),
      'parts' => _refacciones(pagina),
      'services' => {'rango': _rango, 'datos': []},
      'productivity' => {'rango': _rango, 'datos': []},
      'rotation' => {'rango': _rango, 'pagina': 1, 'totalPaginas': 1, 'total': 0, 'datos': []},
      _ => {},
    };
    return http.StreamedResponse(
      Stream.fromIterable([utf8.encode(jsonEncode(cuerpo))]),
      200,
      headers: {'content-type': 'application/json'},
    );
  }

  @override
  void close() {}
}

class _Guardado {
  final String nombre;
  /// Los bytes EXACTOS del archivo (el BOM incluido: al decodificar a texto Dart lo descarta).
  final List<int> contenido;
  _Guardado(this.nombre, this.contenido);
}

class _Entorno {
  final ReportsProvider reportes;
  final AuthProvider auth;
  final List<_Guardado> guardados;
  _Entorno(this.reportes, this.auth, this.guardados);
}

Future<_Entorno> _montar(WidgetTester tester, _ClienteFalso cliente, {bool fallaElGuardado = false}) async {
  final api = ApiClient(httpClient: cliente);
  final auth = AuthProvider(api)
    ..usuario = Usuario.desdeJson({
      'id': 1,
      'username': 'admin',
      'fullName': 'Administrador',
      'role': 'ADMIN',
      'active': true,
    });
  final guardados = <_Guardado>[];
  late ReportsProvider reportes;
  await tester.binding.setSurfaceSize(const Size(1300, 1000));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider<ReportsProvider>(
          create: (_) => reportes = ReportsProvider(
            api,
            auth,
            guardarArchivo: (nombre, contenido) async {
              if (fallaElGuardado) throw const FormatException('disco lleno C:\\secreto\\ruta');
              guardados.add(_Guardado(nombre, contenido));
              return 'C:\\Descargas\\$nombre';
            },
          ),
        ),
      ],
      child: MaterialApp(theme: temaMotorix(), home: const Scaffold(body: ReportsScreen())),
    ),
  );
  await tester.pumpAndSettle();
  return _Entorno(reportes, auth, guardados);
}

Future<void> _abrir(WidgetTester tester, String pestana) async {
  await tester.tap(find.byKey(Key(pestana)));
  await tester.pumpAndSettle();
}

Future<void> _exportar(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('botonExportarCsv')));
  await tester.pumpAndSettle();
}

void main() {
  group('botón y petición', () {
    testWidgets('el botón «Exportar CSV» está en cada pestaña', (tester) async {
      await _montar(tester, _ClienteFalso());

      for (final pestana in ['pestanaIngresos', 'pestanaServicios', 'pestanaProductividad', 'pestanaRefacciones', 'pestanaRotacion']) {
        await _abrir(tester, pestana);
        expect(find.byKey(const Key('botonExportarCsv')), findsOneWidget, reason: pestana);
      }
      expect(find.text('Exportar CSV'), findsOneWidget);
    });

    testWidgets('exporta la pestaña activa con el filtro activo (mes actual)', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);

      await _exportar(tester);

      expect(cliente.exportaciones('income'), hasLength(1));
      expect(cliente.exportaciones('income').single.url.queryParameters, {'periodo': 'MES_ACTUAL'});
    });

    testWidgets('exporta el reporte de la pestaña en la que está', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);
      await _abrir(tester, 'pestanaProductividad');

      await _exportar(tester);

      expect(cliente.exportaciones('productivity'), hasLength(1));
      expect(cliente.exportaciones('income'), isEmpty);
    });

    testWidgets('usa el filtro «Mes anterior» y el rango libre', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);

      await tester.tap(find.byKey(const Key('filtroMesAnterior')));
      await tester.pumpAndSettle();
      await _exportar(tester);
      expect(cliente.exportaciones('income').last.url.queryParameters, {'periodo': 'MES_ANTERIOR'});

      await tester.tap(find.byKey(const Key('filtroRangoLibre')));
      await tester.pumpAndSettle();
      await tester.enterText(find.byKey(const Key('campoReporteDesde')), '2026-10-01');
      await tester.enterText(find.byKey(const Key('campoReporteHasta')), '2026-10-15');
      await tester.tap(find.byKey(const Key('botonConsultarRango')));
      await tester.pumpAndSettle();
      await _exportar(tester);
      expect(cliente.exportaciones('income').last.url.queryParameters, {'desde': '2026-10-01', 'hasta': '2026-10-15'});
    });

    testWidgets('en una pestaña paginada exporta todo el rango (sin página)', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);
      await _abrir(tester, 'pestanaRefacciones');
      await tester.tap(find.byKey(const Key('botonPaginaSiguienteReporte')));
      await tester.pumpAndSettle();
      expect(cliente.consultas('parts').last.url.queryParameters['pagina'], '2');

      await _exportar(tester);

      final peticion = cliente.exportaciones('parts').single;
      expect(peticion.url.queryParameters, {'periodo': 'MES_ACTUAL'});
      expect(peticion.url.queryParameters.containsKey('pagina'), isFalse);
      expect(peticion.url.queryParameters.containsKey('limite'), isFalse);
    });

    testWidgets('exportar no recarga ni cambia el reporte que se ve', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);
      await _abrir(tester, 'pestanaRefacciones');
      await tester.tap(find.byKey(const Key('botonPaginaSiguienteReporte')));
      await tester.pumpAndSettle();
      final antes = cliente.consultas('parts').length;

      await _exportar(tester);

      expect(cliente.consultas('parts'), hasLength(antes));
      expect(find.text('Parte página 2'), findsOneWidget);
      expect(find.text('Página 2 de 3 · 120 líneas'), findsOneWidget);
    });
  });

  group('guardado y resultado', () {
    testWidgets('guarda los bytes tal cual (con BOM) con el nombre del servidor y muestra la ruta', (tester) async {
      final cliente = _ClienteFalso();
      final entorno = await _montar(tester, cliente);

      await _exportar(tester);

      expect(entorno.guardados, hasLength(1));
      expect(entorno.guardados.single.nombre, 'motorix-income-2026-11-01-2026-11-30.csv');
      expect(entorno.guardados.single.contenido, utf8.encode(_csv));
      expect(entorno.guardados.single.contenido.take(3), [0xEF, 0xBB, 0xBF]);
      expect(find.text('Archivo guardado en C:\\Descargas\\motorix-income-2026-11-01-2026-11-30.csv.'), findsOneWidget);
    });

    testWidgets('el mensaje de éxito va en verde', (tester) async {
      await _montar(tester, _ClienteFalso());

      await _exportar(tester);

      final snack = tester.widget<SnackBar>(find.byType(SnackBar));
      expect(snack.backgroundColor, MotorixColores.exito);
    });

    testWidgets('sanea el nombre de archivo del servidor (sin rutas ni caracteres raros)', (tester) async {
      final cliente = _ClienteFalso()..contentDisposition = 'attachment; filename="..\\..\\evil name:*?.csv"';
      final entorno = await _montar(tester, cliente);

      await _exportar(tester);

      final nombre = entorno.guardados.single.nombre;
      expect(nombre, matches(RegExp(r'^[A-Za-z0-9._-]+$')));
      expect(nombre.contains('..'), isFalse);
      expect(nombre.endsWith('.csv'), isTrue);
      expect(nombre, startsWith('evil'));
    });

    testWidgets('con una ruta tipo /etc/passwd solo queda el nombre del archivo', (tester) async {
      final cliente = _ClienteFalso()..contentDisposition = 'attachment; filename="/etc/passwd"';
      final entorno = await _montar(tester, cliente);

      await _exportar(tester);

      expect(entorno.guardados.single.nombre, 'passwd.csv');
    });

    testWidgets('sin cabecera de nombre usa uno por omisión del reporte', (tester) async {
      final cliente = _ClienteFalso()..contentDisposition = null;
      final entorno = await _montar(tester, cliente);
      await _abrir(tester, 'pestanaServicios');

      await _exportar(tester);

      expect(entorno.guardados.single.nombre, 'motorix-services.csv');
    });
  });

  group('errores (sin trazas)', () {
    testWidgets('un error del servidor muestra un mensaje genérico en rojo', (tester) async {
      final cliente = _ClienteFalso()..estadoExportacion = 500;
      final entorno = await _montar(tester, cliente);

      await _exportar(tester);

      expect(find.text('No se pudo exportar el reporte.'), findsOneWidget);
      expect(find.textContaining('Exception'), findsNothing);
      expect(find.textContaining('Error del servidor'), findsNothing);
      expect(entorno.guardados, isEmpty);
      expect(tester.widget<SnackBar>(find.byType(SnackBar)).backgroundColor, MotorixColores.error);
    });

    testWidgets('si el servidor rechaza el rango o el tamaño, muestra su mensaje en español', (tester) async {
      final cliente = _ClienteFalso()
        ..estadoExportacion = 400
        ..codigoError = 'RANGO_INVALIDO'
        ..mensajeError = 'La exportación supera las 10,000 filas; reduzca el rango.';
      await _montar(tester, cliente);

      await _exportar(tester);

      expect(find.text('La exportación supera las 10,000 filas; reduzca el rango.'), findsOneWidget);
    });

    testWidgets('un 403 de permisos muestra un mensaje de permisos', (tester) async {
      final cliente = _ClienteFalso()
        ..estadoExportacion = 403
        ..codigoError = 'NO_AUTORIZADO'
        ..mensajeError = 'No tiene permisos para realizar esta operación.';
      final entorno = await _montar(tester, cliente);

      await _exportar(tester);

      expect(find.text('No tiene permisos para exportar reportes.'), findsOneWidget);
      expect(entorno.guardados, isEmpty);
    });

    testWidgets('si no se puede escribir el archivo, avisa sin mostrar la ruta ni el detalle del sistema', (tester) async {
      final entorno = await _montar(tester, _ClienteFalso(), fallaElGuardado: true);

      await _exportar(tester);

      expect(find.text('No se pudo guardar el archivo.'), findsOneWidget);
      expect(find.textContaining('secreto'), findsNothing);
      expect(find.textContaining('FormatException'), findsNothing);
      expect(entorno.guardados, isEmpty);
    });

    testWidgets('tras un error se puede volver a exportar', (tester) async {
      final cliente = _ClienteFalso()..estadoExportacion = 500;
      final entorno = await _montar(tester, cliente);
      await _exportar(tester);

      cliente.estadoExportacion = 200;
      await _exportar(tester);

      expect(entorno.guardados, hasLength(1));
    });
  });

  group('exportación en curso', () {
    testWidgets('mientras exporta el botón se deshabilita y muestra progreso; una segunda pulsación no repite', (tester) async {
      final cliente = _ClienteFalso()..puertaExportacion = Completer<void>();
      final entorno = await _montar(tester, cliente);

      await tester.tap(find.byKey(const Key('botonExportarCsv')));
      await tester.pump();

      expect(entorno.reportes.exportando, isTrue);
      expect(find.byKey(const Key('exportandoCsv')), findsOneWidget);
      final boton = tester.widget<OutlinedButton>(find.byKey(const Key('botonExportarCsv')));
      expect(boton.onPressed, isNull);

      cliente.puertaExportacion!.complete();
      await tester.pumpAndSettle();

      expect(cliente.exportaciones('income'), hasLength(1));
      expect(entorno.reportes.exportando, isFalse);
      expect(find.byKey(const Key('exportandoCsv')), findsNothing);
      expect(entorno.guardados, hasLength(1));
    });

    testWidgets('el proveedor rechaza una exportación simultánea', (tester) async {
      final cliente = _ClienteFalso()..puertaExportacion = Completer<void>();
      final entorno = await _montar(tester, cliente);

      final primera = entorno.reportes.exportar();
      final segunda = await entorno.reportes.exportar();
      cliente.puertaExportacion!.complete();
      final resultado = await primera;

      expect(segunda.exito, isFalse);
      expect(resultado.exito, isTrue);
      expect(cliente.exportaciones('income'), hasLength(1));
    });
  });

  group('permisos y sesión', () {
    testWidgets('si el reporte devuelve 403 la sección no ofrece exportar', (tester) async {
      final api = ApiClient(
        httpClient: _Cliente403(),
      );
      final auth = AuthProvider(api)
        ..usuario = Usuario.desdeJson({'id': 1, 'username': 'x', 'fullName': 'X', 'role': 'RECEPTIONIST', 'active': true});
      await tester.binding.setSurfaceSize(const Size(1300, 1000));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        MultiProvider(
          providers: [
            ChangeNotifierProvider<AuthProvider>.value(value: auth),
            ChangeNotifierProvider<ReportsProvider>(create: (_) => ReportsProvider(api, auth)),
          ],
          child: MaterialApp(theme: temaMotorix(), home: const Scaffold(body: ReportsScreen())),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('reporteSinPermiso')), findsOneWidget);
      expect(find.byKey(const Key('botonExportarCsv')), findsNothing);
    });

    testWidgets('sin sesión no exporta nada', (tester) async {
      final cliente = _ClienteFalso();
      final entorno = await _montar(tester, cliente);
      entorno.auth.cerrarSesion();
      await tester.pump();

      final resultado = await entorno.reportes.exportar();

      expect(resultado.exito, isFalse);
      expect(cliente.exportaciones('income'), isEmpty);
    });
  });
}

class _Cliente403 extends Fake implements http.Client {
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    return http.StreamedResponse(
      Stream.fromIterable([
        utf8.encode(jsonEncode({
          'error': {'codigo': 'NO_AUTORIZADO', 'mensaje': 'No tiene permisos para realizar esta operación.'},
        })),
      ]),
      403,
      headers: {'content-type': 'application/json'},
    );
  }

  @override
  void close() {}
}

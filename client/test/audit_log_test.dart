// 008-configuracion-seguridad-reportes, T068 (bloque P2, US5; FR-014, CA-20): la
// sección «Bitácora» (solo ADMIN) lista las entradas (fecha, usuario, acción y
// detalle), filtra por fecha, usuario y acción, pagina de 50 en 50, maneja los
// estados de carga, vacío, error y sin permiso (docs/design-system.md 8.4) y NO
// ofrece editar ni borrar.
//
// Sin red: un cliente HTTP falso responde con el formato del contrato.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:motorix_client/config/theme.dart';
import 'package:motorix_client/models/user.dart';
import 'package:motorix_client/providers/audit_provider.dart';
import 'package:motorix_client/providers/auth_provider.dart';
import 'package:motorix_client/screens/audit_log_screen.dart';
import 'package:motorix_client/services/api_client.dart';
import 'package:provider/provider.dart';

Map<String, dynamic> _entrada(
  int id, {
  String accion = 'USER_ROLE_CHANGED',
  String entidad = 'USER',
  Map<String, dynamic>? usuario = const {'id': 1, 'nombre': 'Administrador del Taller'},
  String? detalle = 'Rol: MECHANIC → RECEPTIONIST',
}) =>
    {
      'id': id,
      'fecha': '2026-11-20T12:15:00.000Z',
      'usuario': usuario,
      'accion': accion,
      'entidad': entidad,
      'entidadId': 3,
      'detalle': detalle,
    };

/// Cliente HTTP falso de `/api/audit-log` (y de `/api/users` para el filtro de usuario).
class _ClienteFalso extends Fake implements http.Client {
  final List<http.BaseRequest> peticiones = [];

  /// Entradas por página (clave = número de página).
  Map<int, List<Map<String, dynamic>>> paginas;
  int totalPaginas;
  int total;
  int statusBitacora = 200;
  Completer<void>? puerta;

  _ClienteFalso({required this.paginas, int? totalPaginas, int? total})
      : totalPaginas = totalPaginas ?? 1,
        total = total ?? paginas.values.fold(0, (suma, lista) => suma + lista.length);

  List<http.BaseRequest> get consultas =>
      peticiones.where((p) => p.url.path.endsWith('/audit-log')).toList();

  Map<String, String> get ultimosFiltros => consultas.last.url.queryParameters;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    peticiones.add(request);
    Map<String, dynamic> cuerpo;
    var status = 200;

    if (request.url.path.endsWith('/users')) {
      cuerpo = {
        'datos': [
          {'id': 1, 'username': 'admin', 'fullName': 'Administrador del Taller', 'role': 'ADMIN', 'active': true},
          {'id': 3, 'username': 'mecanico', 'fullName': 'Mecánico del Taller', 'role': 'MECHANIC', 'active': true},
        ],
      };
    } else {
      await puerta?.future;
      status = statusBitacora;
      if (status == 200) {
        final pagina = int.tryParse(request.url.queryParameters['pagina'] ?? '1') ?? 1;
        cuerpo = {
          'pagina': pagina,
          'totalPaginas': totalPaginas,
          'total': total,
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

Future<void> _montar(WidgetTester tester, _ClienteFalso cliente, {String rol = 'ADMIN', bool esperar = true}) async {
  final api = ApiClient(httpClient: cliente);
  final auth = AuthProvider(api)
    ..usuario = Usuario.desdeJson({
      'id': 1,
      'username': rol.toLowerCase(),
      'fullName': 'Usuario de prueba',
      'role': rol,
      'active': true,
    });
  await tester.binding.setSurfaceSize(const Size(1300, 1000));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider<AuditProvider>(create: (_) => AuditProvider(api, auth)),
      ],
      child: MaterialApp(theme: temaMotorix(), home: const Scaffold(body: AuditLogScreen())),
    ),
  );
  if (esperar) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump();
  }
}

List<Map<String, dynamic>> _cincuenta() => [for (var i = 1; i <= 50; i++) _entrada(i)];

void main() {
  group('lista', () {
    testWidgets('muestra fecha, usuario, acción en español y detalle de cada entrada', (tester) async {
      final cliente = _ClienteFalso(paginas: {
        1: [
          _entrada(2, accion: 'LOGIN_FAILED', entidad: 'SESSION', usuario: null, detalle: 'Identificador: nadie'),
          _entrada(1),
        ],
      });

      await _montar(tester, cliente);

      expect(find.text('Bitácora'), findsWidgets);
      final falla = find.byKey(const Key('entradaBitacora-2'));
      expect(find.descendant(of: falla, matching: find.text('Inicio de sesión fallido')), findsOneWidget);
      expect(find.descendant(of: falla, matching: find.text('Identificador: nadie')), findsOneWidget);
      expect(find.descendant(of: falla, matching: find.text('Sin cuenta')), findsOneWidget);
      final cambio = find.byKey(const Key('entradaBitacora-1'));
      expect(find.descendant(of: cambio, matching: find.text('Cambio de rol')), findsOneWidget);
      expect(find.descendant(of: cambio, matching: find.text('Administrador del Taller')), findsOneWidget);
      expect(find.descendant(of: cambio, matching: find.text('Rol: MECHANIC → RECEPTIONIST')), findsOneWidget);
      expect(find.descendant(of: cambio, matching: find.textContaining('/2026')), findsOneWidget);
    });

    testWidgets('traduce todas las acciones del catálogo', (tester) async {
      const acciones = {
        'LOGIN_FAILED': 'Inicio de sesión fallido',
        'USER_CREATED': 'Usuario creado',
        'USER_DEACTIVATED': 'Usuario desactivado',
        'USER_REACTIVATED': 'Usuario reactivado',
        'USER_ROLE_CHANGED': 'Cambio de rol',
        'SETTINGS_UPDATED': 'Configuración modificada',
        'PART_SALE_PRICE_CHANGED': 'Cambio de precio de venta',
        'PART_PURCHASE_PRICE_CHANGED': 'Cambio de precio de compra',
        'TERMS_PUBLISHED': 'Términos publicados',
      };
      var id = 0;
      final cliente = _ClienteFalso(paginas: {
        1: [for (final accion in acciones.keys) _entrada(++id, accion: accion, detalle: null)],
      });

      await _montar(tester, cliente);

      for (final etiqueta in acciones.values) {
        expect(find.descendant(of: find.byType(ListView), matching: find.text(etiqueta)), findsOneWidget,
            reason: etiqueta);
      }
    });

    testWidgets('NO ofrece editar ni borrar entradas ni exportar', (tester) async {
      await _montar(tester, _ClienteFalso(paginas: {1: [_entrada(1)]}));

      expect(find.byIcon(Icons.delete_outline), findsNothing);
      expect(find.byIcon(Icons.delete), findsNothing);
      expect(find.byIcon(Icons.edit_outlined), findsNothing);
      expect(find.textContaining('Exportar'), findsNothing);
    });
  });

  group('paginación de 50 en 50', () {
    testWidgets('muestra «Página 1 de 3», avanza y retrocede con las páginas del servidor', (tester) async {
      final cliente = _ClienteFalso(
        paginas: {
          1: _cincuenta(),
          2: [for (var i = 51; i <= 100; i++) _entrada(i)],
          3: [for (var i = 101; i <= 120; i++) _entrada(i)],
        },
        totalPaginas: 3,
        total: 120,
      );
      await _montar(tester, cliente);

      expect(find.text('Página 1 de 3 · 120 entradas'), findsOneWidget);
      expect(tester.widget<OutlinedButton>(find.byKey(const Key('botonPaginaAnterior'))).onPressed, isNull);

      await tester.tap(find.byKey(const Key('botonPaginaSiguiente')));
      await tester.pumpAndSettle();
      expect(cliente.ultimosFiltros['pagina'], '2');
      expect(find.text('Página 2 de 3 · 120 entradas'), findsOneWidget);
      expect(find.byKey(const Key('entradaBitacora-51')), findsOneWidget);

      await tester.tap(find.byKey(const Key('botonPaginaSiguiente')));
      await tester.pumpAndSettle();
      expect(find.text('Página 3 de 3 · 120 entradas'), findsOneWidget);
      expect(tester.widget<OutlinedButton>(find.byKey(const Key('botonPaginaSiguiente'))).onPressed, isNull);

      await tester.tap(find.byKey(const Key('botonPaginaAnterior')));
      await tester.pumpAndSettle();
      expect(cliente.ultimosFiltros['pagina'], '2');
    });

    testWidgets('con una sola página los dos botones están deshabilitados', (tester) async {
      await _montar(tester, _ClienteFalso(paginas: {1: [_entrada(1)]}));

      expect(find.text('Página 1 de 1 · 1 entrada'), findsOneWidget);
      expect(tester.widget<OutlinedButton>(find.byKey(const Key('botonPaginaAnterior'))).onPressed, isNull);
      expect(tester.widget<OutlinedButton>(find.byKey(const Key('botonPaginaSiguiente'))).onPressed, isNull);
    });
  });

  group('filtros', () {
    testWidgets('la primera consulta no lleva filtros y pide la página 1', (tester) async {
      final cliente = _ClienteFalso(paginas: {1: [_entrada(1)]});

      await _montar(tester, cliente);

      expect(cliente.ultimosFiltros, {'pagina': '1'});
    });

    testWidgets('filtra por fecha, usuario y acción y vuelve a la página 1', (tester) async {
      final cliente = _ClienteFalso(paginas: {1: [_entrada(1)]}, totalPaginas: 3);
      await _montar(tester, cliente);

      await tester.enterText(find.byKey(const Key('campoDesde')), '2026-11-01');
      await tester.enterText(find.byKey(const Key('campoHasta')), '2026-11-30');
      await tester.tap(find.byKey(const Key('filtroUsuario')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mecánico del Taller').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('filtroAccion')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Inicio de sesión fallido').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('botonAplicarFiltros')));
      await tester.pumpAndSettle();

      expect(cliente.ultimosFiltros, {
        'pagina': '1',
        'desde': '2026-11-01',
        'hasta': '2026-11-30',
        'usuarioId': '3',
        'accion': 'LOGIN_FAILED',
      });
    });

    testWidgets('«Limpiar» quita los filtros y vuelve a consultar sin ellos', (tester) async {
      final cliente = _ClienteFalso(paginas: {1: [_entrada(1)]});
      await _montar(tester, cliente);
      await tester.enterText(find.byKey(const Key('campoDesde')), '2026-11-01');
      await tester.tap(find.byKey(const Key('botonAplicarFiltros')));
      await tester.pumpAndSettle();
      expect(cliente.ultimosFiltros['desde'], '2026-11-01');

      await tester.tap(find.byKey(const Key('botonLimpiarFiltros')));
      await tester.pumpAndSettle();

      expect(cliente.ultimosFiltros, {'pagina': '1'});
      expect(tester.widget<TextFormField>(find.byKey(const Key('campoDesde'))).controller!.text, isEmpty);
    });

    testWidgets('una fecha mal escrita no consulta y explica el formato', (tester) async {
      final cliente = _ClienteFalso(paginas: {1: [_entrada(1)]});
      await _montar(tester, cliente);
      final antes = cliente.consultas.length;

      await tester.enterText(find.byKey(const Key('campoDesde')), 'ayer');
      await tester.tap(find.byKey(const Key('botonAplicarFiltros')));
      await tester.pumpAndSettle();

      expect(cliente.consultas.length, antes);
      expect(find.text('Use el formato AAAA-MM-DD.'), findsOneWidget);
    });

    testWidgets('una fecha final anterior a la inicial no consulta', (tester) async {
      final cliente = _ClienteFalso(paginas: {1: [_entrada(1)]});
      await _montar(tester, cliente);
      final antes = cliente.consultas.length;

      await tester.enterText(find.byKey(const Key('campoDesde')), '2026-11-20');
      await tester.enterText(find.byKey(const Key('campoHasta')), '2026-11-01');
      await tester.tap(find.byKey(const Key('botonAplicarFiltros')));
      await tester.pumpAndSettle();

      expect(cliente.consultas.length, antes);
      expect(find.text('La fecha final no puede ser anterior a la inicial.'), findsOneWidget);
    });
  });

  group('estados de la pantalla (8.4)', () {
    testWidgets('mientras carga muestra un indicador de progreso', (tester) async {
      final cliente = _ClienteFalso(paginas: {1: [_entrada(1)]})..puerta = Completer<void>();

      await _montar(tester, cliente, esperar: false);

      expect(find.byKey(const Key('bitacoraCargando')), findsOneWidget);
      cliente.puerta!.complete();
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('entradaBitacora-1')), findsOneWidget);
    });

    testWidgets('sin entradas muestra un mensaje útil', (tester) async {
      await _montar(tester, _ClienteFalso(paginas: {}));

      expect(find.text('No hay entradas en la bitácora.'), findsOneWidget);
    });

    testWidgets('sin entradas con filtros lo dice y ofrece limpiarlos', (tester) async {
      final cliente = _ClienteFalso(paginas: {});
      await _montar(tester, cliente);
      await tester.enterText(find.byKey(const Key('campoDesde')), '2026-11-01');
      await tester.tap(find.byKey(const Key('botonAplicarFiltros')));
      await tester.pumpAndSettle();

      expect(find.text('No hay entradas con esos filtros.'), findsOneWidget);
    });

    testWidgets('si falla la carga muestra el error con «Reintentar» y se recupera, sin trazas', (tester) async {
      final cliente = _ClienteFalso(paginas: {1: [_entrada(1)]})..statusBitacora = 500;
      await _montar(tester, cliente);

      expect(find.text('No se pudo cargar la bitácora.'), findsOneWidget);
      expect(find.textContaining('Exception'), findsNothing);
      cliente.statusBitacora = 200;
      await tester.tap(find.text('Reintentar'));
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('entradaBitacora-1')), findsOneWidget);
    });

    testWidgets('con un rol sin permiso (403) muestra el mensaje de permisos y no la lista', (tester) async {
      final cliente = _ClienteFalso(paginas: {1: [_entrada(1)]})..statusBitacora = 403;

      await _montar(tester, cliente, rol: 'RECEPTIONIST');

      expect(find.text('No tiene permisos para ver la bitácora.'), findsOneWidget);
      expect(find.byKey(const Key('entradaBitacora-1')), findsNothing);
      expect(find.text('Reintentar'), findsNothing);
    });
  });
}

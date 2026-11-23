// 007-notificaciones-internas, T031 (US3; FR-008, CA-8): compatibilidad del
// centro de notificaciones con la alerta que ya existe en el panel de control.
//
// El insumo describía una insignia en el ícono de Inventario y un
// `StockAlertsProvider` que NO existen en este repositorio: la única alerta
// existente es la tarjeta «Alertas que requieren atención» (`alertasPanel`) del
// panel de control del administrador. Se comprueba que sigue funcionando sin
// cambios, que sus cifras (mantenimientos vencidos y stock bajo) coinciden con
// las del centro de notificaciones y que no hay ninguna insignia en Inventario.
//
// Sin red: un cliente HTTP falso responde con el formato del contrato.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:motorix_client/config/theme.dart';
import 'package:motorix_client/providers/dashboard_provider.dart';
import 'package:motorix_client/providers/parts_provider.dart';
import 'package:motorix_client/screens/dashboard_screen.dart';
import 'package:motorix_client/screens/parts_screen.dart';
import 'package:motorix_client/models/notification.dart';
import 'package:provider/provider.dart';

import 'helpers/avisos_falsos.dart';

/// Panel de control con 2 mantenimientos vencidos, 3 refacciones con stock bajo
/// y 1 cobro digital pendiente.
const String _panelJson = '''
{
  "ordenes": { "RECIBIDO": 1, "DIAGNOSTICO": 0, "EN_REPARACION": 2, "ESPERANDO_REFACCION": 1, "TERMINADO": 0, "ENTREGADO": 1, "CANCELADA": 1 },
  "citas": { "hoy": 3, "proximas": 4 },
  "mantenimientos": { "vencidos": 2, "proximos": 3 },
  "inventario": { "stockBajo": 3 },
  "cobros": { "hoy": 1340.0, "total": 5620.0, "pendientesDigitales": 1 }
}
''';

/// Además de los avisos, responde el panel de control y el inventario (vacío).
class _ClienteCompat extends ClienteAvisosFalso {
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) {
    final ruta = request.url.path;
    if (request.method == 'GET' && (ruta.endsWith('/dashboard') || ruta.endsWith('/parts'))) {
      peticiones.add(request);
      final cuerpo = ruta.endsWith('/dashboard') ? _panelJson : '{"datos": []}';
      return Future.value(http.StreamedResponse(
        Stream.fromIterable([utf8.encode(cuerpo)]),
        200,
        headers: {'content-type': 'application/json'},
      ));
    }
    return super.send(request);
  }
}

/// Avisos del administrador que coinciden con el panel: 2 vencidos y 3 de stock.
Map<String, dynamic> _avisosDelAdministrador() => resumenJson([
      avisoJson(clave: 'MANTENIMIENTO:1:VENCIDO'),
      avisoJson(clave: 'MANTENIMIENTO:2:VENCIDO'),
      avisoJson(
        clave: 'STOCK:2:BAJO',
        grupo: 'STOCK',
        estado: 'BAJO',
        titulo: 'Stock bajo',
        detalle: 'Pastillas · quedan 2, mínimo 5',
        pantalla: 'INVENTARIO',
        id: 2,
      ),
      avisoJson(
        clave: 'STOCK:4:BAJO',
        grupo: 'STOCK',
        estado: 'BAJO',
        titulo: 'Stock bajo',
        detalle: 'Bujía · quedan 8, mínimo 8',
        pantalla: 'INVENTARIO',
        id: 4,
      ),
      avisoJson(
        clave: 'STOCK:7:AGOTADO',
        grupo: 'STOCK',
        estado: 'AGOTADO',
        titulo: 'Stock agotado',
        detalle: 'Batería · sin existencias',
        pantalla: 'INVENTARIO',
        id: 7,
      ),
      // Los próximos y las citas no forman parte de la tarjeta del panel.
      avisoJson(
        clave: 'MANTENIMIENTO:6:PROXIMO',
        grupo: 'MANTENIMIENTO_PROXIMO',
        estado: 'PROXIMO',
        titulo: 'Mantenimiento próximo',
      ),
    ]);

void main() {
  testWidgets('la tarjeta alertasPanel sigue mostrando vencidos, stock bajo y cobros pendientes sin cambios (CA-8)', (tester) async {
    final cliente = _ClienteCompat();
    final panel = DashboardProvider(apiDe(cliente));

    await tester.pumpWidget(
      ChangeNotifierProvider<DashboardProvider>.value(
        value: panel,
        child: MaterialApp(theme: temaMotorix(), home: const DashboardScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('alertasPanel')), findsOneWidget);
    expect(find.text('Alertas que requieren atención'), findsOneWidget);
    expect(find.text('2 mantenimiento(s) vencido(s).'), findsOneWidget);
    expect(find.text('3 refacción(es) con stock bajo.'), findsOneWidget);
    expect(find.text('1 cobro(s) digital(es) pendiente(s) de confirmar.'), findsOneWidget);
    // El panel no incorpora la campana ni el centro de notificaciones.
    expect(find.byKey(const Key('campanaAvisos')), findsNothing);
  });

  probarAvisos('las cifras de la tarjeta coinciden con las del centro de notificaciones (CA-8, CA-5)', (tester) async {
    final cliente = _ClienteCompat()..resumenPorToken['t-1'] = _avisosDelAdministrador();
    final entorno = await montarAvisos(tester, cliente);
    final centro = entorno.proveedor.avisos;
    final vencidosDelCentro = centro.where((a) => a.grupo == GrupoAviso.mantenimientoVencido).length;
    final stockDelCentro = centro.where((a) => a.grupo == GrupoAviso.stock).length;

    // Misma API, mismos datos: se carga el panel de control del administrador.
    final panel = DashboardProvider(entorno.api);
    final carga = panel.cargar();
    await asentar(tester);
    await carga;

    expect(panel.resumen!.mantenimientosVencidos, vencidosDelCentro);
    expect(panel.resumen!.stockBajo, stockDelCentro);

    await tester.pumpWidget(
      ChangeNotifierProvider<DashboardProvider>.value(
        value: panel,
        child: MaterialApp(theme: temaMotorix(), home: const DashboardScreen()),
      ),
    );
    await tester.pumpAndSettle();

    // La tarjeta muestra exactamente las cifras del centro.
    expect(find.text('$vencidosDelCentro mantenimiento(s) vencido(s).'), findsOneWidget);
    expect(find.text('$stockDelCentro refacción(es) con stock bajo.'), findsOneWidget);
  });

  testWidgets('no existe ninguna insignia en la sección Inventario ni en su pantalla (CA-8)', (tester) async {
    final cliente = _ClienteCompat();
    final api = apiDe(cliente);
    final auth = authComoAdmin(api);

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider.value(value: auth),
          ChangeNotifierProvider(create: (_) => PartsProvider(api)),
        ],
        child: MaterialApp(theme: temaMotorix(), home: const Scaffold(body: PartsScreen())),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(Badge), findsNothing);
    expect(find.byKey(const Key('campanaAvisos')), findsNothing);
  });
}

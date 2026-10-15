// T051: pruebas del panel de control (US4, FR-014 a FR-016) con `flutter test`.
//
// Sin red: el cliente HTTP falso responde el panel con el formato del
// contrato. Cubre el modelo de agregados, la vista con sus alertas y la
// visibilidad del acceso únicamente para administración.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:motorix_client/config/theme.dart';
import 'package:motorix_client/models/dashboard.dart';
import 'package:motorix_client/models/user.dart';
import 'package:motorix_client/providers/auth_provider.dart';
import 'package:motorix_client/providers/dashboard_provider.dart';
import 'package:motorix_client/screens/dashboard_screen.dart';
import 'package:motorix_client/screens/home_content.dart';
import 'package:motorix_client/services/api_client.dart';
import 'package:provider/provider.dart';

const String _panelJson = '''
{
  "ordenes": { "RECIBIDO": 1, "DIAGNOSTICO": 0, "EN_REPARACION": 2, "ESPERANDO_REFACCION": 1, "TERMINADO": 0, "ENTREGADO": 1, "CANCELADA": 1 },
  "citas": { "hoy": 3, "proximas": 4 },
  "mantenimientos": { "vencidos": 2, "proximos": 3 },
  "inventario": { "stockBajo": 2 },
  "cobros": { "hoy": 1340.0, "total": 5620.0, "pendientesDigitales": 1 }
}
''';

/// Cliente HTTP falso: el GET devuelve el panel de control.
class _ClienteFalso extends Fake implements http.Client {
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    return http.StreamedResponse(
      Stream.fromIterable([utf8.encode(_panelJson)]),
      200,
      headers: {'content-type': 'application/json'},
    );
  }

  @override
  void close() {}
}

Widget _envolverPanel(DashboardProvider panel) {
  return ChangeNotifierProvider<DashboardProvider>.value(
    value: panel,
    child: MaterialApp(
      theme: temaMotorix(),
      home: const DashboardScreen(),
    ),
  );
}

Widget _envolverInicio(AuthProvider auth) {
  return ChangeNotifierProvider<AuthProvider>.value(
    value: auth,
    child: MaterialApp(
      theme: temaMotorix(),
      home: const Scaffold(body: HomeContent()),
    ),
  );
}

AuthProvider _authComo(String rol) {
  final api = ApiClient(httpClient: _ClienteFalso());
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

void main() {
  test('el modelo lee los agregados del contrato (FR-014 a FR-016)', () {
    final resumen =
        ResumenPanel.desdeJson(jsonDecode(_panelJson) as Map<String, dynamic>);

    expect(resumen.ordenes['EN_REPARACION'], 2);
    expect(resumen.ordenes['CANCELADA'], 1);
    // En curso: RECIBIDO 1 + EN_REPARACION 2 + ESPERANDO_REFACCION 1.
    expect(resumen.ordenesEnCurso, 4);
    expect(resumen.citasHoy, 3);
    expect(resumen.citasProximas, 4);
    expect(resumen.mantenimientosVencidos, 2);
    expect(resumen.stockBajo, 2);
    expect(resumen.cobrosHoy, 1340.0);
    expect(resumen.cobrosTotal, 5620.0);
    expect(resumen.pendientesDigitales, 1);
  });

  testWidgets('la vista muestra los indicadores y las alertas destacadas',
      (tester) async {
    final api = ApiClient(httpClient: _ClienteFalso());
    final provider = DashboardProvider(api);

    await tester.pumpWidget(_envolverPanel(provider));
    await tester.pumpAndSettle();

    expect(find.text('Panel de control'), findsOneWidget);
    expect(find.byKey(const Key('botonRefrescarPanel')), findsOneWidget);
    // Indicadores principales.
    expect(find.text('Órdenes en curso'), findsOneWidget);
    final ordenesEnCurso =
        tester.widget<Text>(find.byKey(const Key('valor_Órdenes en curso')));
    expect(ordenesEnCurso.data, '4'); // 1 + 2 + 1 en curso
    expect(find.text('Cobrado hoy'), findsOneWidget);
    expect(find.text('\$1340.00'), findsOneWidget);
    // Alertas: rojo para vencido/stock bajo, ámbar para el cobro pendiente.
    expect(find.byKey(const Key('alertasPanel')), findsOneWidget);
    expect(
      find.text('2 mantenimiento(s) vencido(s).'),
      findsOneWidget,
    );
    expect(
      find.text('2 refacción(es) con stock bajo.'),
      findsOneWidget,
    );
    expect(
      find.text('1 cobro(s) digital(es) pendiente(s) de confirmar.'),
      findsOneWidget,
    );
    // Órdenes por estado.
    expect(find.text('En reparación'), findsOneWidget);
    expect(find.text('Órdenes por estado'), findsOneWidget);
  });

  testWidgets('el acceso al panel solo aparece para administración (escenario 3)',
      (tester) async {
    await tester.pumpWidget(_envolverInicio(_authComo('ADMIN')));
    expect(find.text('Panel de control'), findsOneWidget);

    await tester.pumpWidget(_envolverInicio(_authComo('RECEPTIONIST')));
    expect(find.text('Panel de control'), findsNothing);

    await tester.pumpWidget(_envolverInicio(_authComo('MECHANIC')));
    expect(find.text('Panel de control'), findsNothing);
  });
}

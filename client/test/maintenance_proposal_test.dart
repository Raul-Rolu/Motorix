// 008-configuracion-seguridad-reportes, T035 (bloque P1, US3; FR-008, CA-5): en
// el formulario de Mantenimientos «Proponer desde una orden» lista las órdenes
// del vehículo elegido, pide la propuesta al servidor y rellena la fecha
// objetivo y el kilometraje, que el usuario puede corregir antes de guardar.
// Sin propuesta (la orden no tiene servicios con tipo e intervalo) muestra un
// mensaje claro y no cambia los campos. La propuesta no crea nada por sí sola.
//
// Sin red: un cliente HTTP falso responde con el formato del contrato.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:motorix_client/config/theme.dart';
import 'package:motorix_client/models/user.dart';
import 'package:motorix_client/providers/auth_provider.dart';
import 'package:motorix_client/providers/maintenances_provider.dart';
import 'package:motorix_client/providers/vehicles_provider.dart';
import 'package:motorix_client/screens/maintenance_form_screen.dart';
import 'package:motorix_client/services/api_client.dart';
import 'package:provider/provider.dart';

Map<String, dynamic> _vehiculo(int id, String placas) => {
      'id': id,
      'clientId': 1,
      'plates': placas,
      'brand': 'Nissan',
      'model': 'Versa',
      'year': 2020,
    };

Map<String, dynamic> _orden(int id, int vehiculoId, String motivo, {String estado = 'TERMINADO'}) => {
      'id': id,
      'vehicleId': vehiculoId,
      'status': estado,
      'reason': motivo,
      'plates': 'ABC-123-A',
      'createdAt': '2026-11-20T10:00:00.000Z',
    };

class _ClienteFalso extends Fake implements http.Client {
  final List<http.BaseRequest> peticiones = [];
  List<Map<String, dynamic>> ordenes = [
    _orden(10, 1, 'Cambio de aceite y filtros'),
    _orden(11, 2, 'Orden de otro vehículo'),
  ];

  /// Respuesta de la propuesta: `null` = la orden no tiene tipos con intervalo.
  Map<String, dynamic>? propuesta = {'fecha': '2027-05-22', 'kilometraje': 55000, 'servicio': 'Cambio de aceite'};
  int statusPropuesta = 200;

  List<http.BaseRequest> get propuestas =>
      peticiones.where((p) => p.url.path.endsWith('/maintenances/proposal')).toList();

  List<http.Request> get altas => peticiones
      .whereType<http.Request>()
      .where((p) => p.method == 'POST' && p.url.path.endsWith('/maintenances'))
      .toList();

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    peticiones.add(request);
    final ruta = request.url.path;
    Map<String, dynamic> cuerpo = {};
    var status = 200;

    if (request.method == 'GET' && ruta.endsWith('/vehicles')) {
      cuerpo = {
        'datos': [_vehiculo(1, 'ABC-123-A'), _vehiculo(2, 'XYZ-999-Z')],
      };
    } else if (request.method == 'GET' && ruta.endsWith('/orders')) {
      cuerpo = {'datos': ordenes};
    } else if (request.method == 'GET' && ruta.endsWith('/maintenances/proposal')) {
      status = statusPropuesta;
      cuerpo = status == 200
          ? {'orderId': int.parse(request.url.queryParameters['orderId']!), 'propuesta': propuesta}
          : {'error': {'codigo': 'FORBIDDEN_ORDER', 'mensaje': 'La orden pertenece a otro mecánico.'}};
    } else if (request.method == 'POST' && ruta.endsWith('/maintenances')) {
      final datos = jsonDecode((request as http.Request).body) as Map<String, dynamic>;
      status = 201;
      cuerpo = {
        'id': 1,
        'vehicleId': datos['vehicleId'],
        'description': datos['descripcion'],
        'targetDate': datos['targetDate'],
        'targetMileage': datos['targetMileage'],
        'status': 'PENDING',
      };
    } else if (request.method == 'GET' && ruta.endsWith('/maintenances')) {
      cuerpo = {'datos': []};
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

Future<void> _montar(WidgetTester tester, _ClienteFalso cliente) async {
  final api = ApiClient(httpClient: cliente);
  final auth = AuthProvider(api)
    ..usuario = Usuario.desdeJson({
      'id': 1,
      'username': 'admin',
      'fullName': 'Administrador',
      'role': 'ADMIN',
      'active': true,
    });
  await tester.binding.setSurfaceSize(const Size(1000, 1400));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider<VehiclesProvider>(create: (_) => VehiclesProvider(api)),
        ChangeNotifierProvider<MaintenancesProvider>(create: (_) => MaintenancesProvider(api)),
      ],
      child: MaterialApp(theme: temaMotorix(), home: const MaintenanceFormScreen()),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _elegirVehiculo(WidgetTester tester, String etiqueta) async {
  await tester.tap(find.byType(DropdownButtonFormField<int>));
  await tester.pumpAndSettle();
  await tester.tap(find.text(etiqueta).last);
  await tester.pumpAndSettle();
}

Future<void> _proponerDesde(WidgetTester tester, String textoDeLaOrden) async {
  await tester.tap(find.byKey(const Key('botonProponerDesdeOrden')));
  await tester.pumpAndSettle();
  await tester.tap(find.textContaining(textoDeLaOrden));
  await tester.pumpAndSettle();
}

String _km(WidgetTester tester) =>
    tester.widget<TextFormField>(find.byKey(const Key('campoKilometrajeObjetivo'))).controller!.text;

void main() {
  testWidgets('«Proponer desde una orden» está deshabilitado hasta elegir un vehículo', (tester) async {
    await _montar(tester, _ClienteFalso());

    expect(tester.widget<OutlinedButton>(find.byKey(const Key('botonProponerDesdeOrden'))).onPressed, isNull);

    await _elegirVehiculo(tester, 'ABC-123-A — Nissan Versa');

    expect(tester.widget<OutlinedButton>(find.byKey(const Key('botonProponerDesdeOrden'))).onPressed, isNotNull);
  });

  testWidgets('lista solo las órdenes del vehículo elegido (consulta por placas)', (tester) async {
    final cliente = _ClienteFalso();
    await _montar(tester, cliente);
    await _elegirVehiculo(tester, 'ABC-123-A — Nissan Versa');

    await tester.tap(find.byKey(const Key('botonProponerDesdeOrden')));
    await tester.pumpAndSettle();

    expect(find.textContaining('Orden #10'), findsOneWidget);
    expect(find.text('Cambio de aceite y filtros'), findsOneWidget);
    expect(find.textContaining('Orden #11'), findsNothing);
    final consulta = cliente.peticiones.firstWhere((p) => p.url.path.endsWith('/orders'));
    expect(consulta.url.queryParameters['texto'], 'ABC-123-A');
  });

  testWidgets('al elegir una orden rellena la fecha y el kilometraje con la propuesta', (tester) async {
    final cliente = _ClienteFalso();
    await _montar(tester, cliente);
    await _elegirVehiculo(tester, 'ABC-123-A — Nissan Versa');

    await _proponerDesde(tester, 'Orden #10');

    expect(cliente.propuestas.single.url.queryParameters['orderId'], '10');
    expect(_km(tester), '55000');
    expect(find.text('Fecha objetivo: 2027-05-22'), findsOneWidget);
    expect(find.text('Se propusieron la fecha y el kilometraje; puede corregirlos antes de guardar.'),
        findsOneWidget);
    // La propuesta por sí sola no crea ningún mantenimiento.
    expect(cliente.altas, isEmpty);
  });

  testWidgets('el usuario corrige el kilometraje propuesto y se guarda lo corregido', (tester) async {
    final cliente = _ClienteFalso();
    await _montar(tester, cliente);
    await _elegirVehiculo(tester, 'ABC-123-A — Nissan Versa');
    await _proponerDesde(tester, 'Orden #10');

    await tester.enterText(find.byKey(const Key('campoKilometrajeObjetivo')), '56000');
    await tester.enterText(find.byKey(const Key('campoDescripcionMantenimiento')), 'Cambio de aceite');
    await tester.ensureVisible(find.text('Guardar mantenimiento'));
    await tester.tap(find.text('Guardar mantenimiento'));
    await tester.pumpAndSettle();

    final alta = jsonDecode(cliente.altas.single.body) as Map<String, dynamic>;
    expect(alta['vehicleId'], 1);
    expect(alta['targetMileage'], 56000);
    expect(alta['targetDate'], '2027-05-22');
    expect(alta['descripcion'], 'Cambio de aceite');
  });

  testWidgets('si la propuesta solo trae kilometraje no cambia la fecha', (tester) async {
    final cliente = _ClienteFalso()
      ..propuesta = {'fecha': null, 'kilometraje': 80000, 'servicio': 'Rotación de neumáticos'};
    await _montar(tester, cliente);
    await _elegirVehiculo(tester, 'ABC-123-A — Nissan Versa');

    await _proponerDesde(tester, 'Orden #10');

    expect(_km(tester), '80000');
    expect(find.textContaining('Fecha objetivo:'), findsNothing);
    expect(find.text('Fecha objetivo (opcional)'), findsOneWidget);
  });

  testWidgets('sin propuesta muestra un mensaje claro y no cambia los campos', (tester) async {
    final cliente = _ClienteFalso()..propuesta = null;
    await _montar(tester, cliente);
    await _elegirVehiculo(tester, 'ABC-123-A — Nissan Versa');
    await tester.enterText(find.byKey(const Key('campoKilometrajeObjetivo')), '12345');

    await _proponerDesde(tester, 'Orden #10');

    expect(find.text('La orden no tiene servicios con tipo e intervalo; capture los umbrales manualmente.'),
        findsOneWidget);
    expect(_km(tester), '12345');
  });

  testWidgets('un vehículo sin órdenes lo dice y no pide propuesta', (tester) async {
    final cliente = _ClienteFalso()..ordenes = [_orden(11, 2, 'Orden de otro vehículo')];
    await _montar(tester, cliente);
    await _elegirVehiculo(tester, 'ABC-123-A — Nissan Versa');

    await tester.tap(find.byKey(const Key('botonProponerDesdeOrden')));
    await tester.pumpAndSettle();

    expect(find.text('Este vehículo no tiene órdenes.'), findsOneWidget);
    expect(cliente.propuestas, isEmpty);
  });

  testWidgets('un error del servidor se muestra en español, sin trazas', (tester) async {
    final cliente = _ClienteFalso()..statusPropuesta = 403;
    await _montar(tester, cliente);
    await _elegirVehiculo(tester, 'ABC-123-A — Nissan Versa');

    await _proponerDesde(tester, 'Orden #10');

    expect(find.text('La orden pertenece a otro mecánico.'), findsOneWidget);
    expect(find.textContaining('Exception'), findsNothing);
  });
}

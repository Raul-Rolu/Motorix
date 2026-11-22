// T021: pruebas del flujo de cobro manual (US1, FR-001 a FR-004) con `flutter test`.
//
// Sin red: el cliente HTTP falso responde la API de pagos con el formato del
// contrato. Cubre el modelo de saldos, el formulario y el registro confirmado.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:motorix_client/config/theme.dart';
import 'package:motorix_client/models/payment.dart';
import 'package:motorix_client/providers/payments_provider.dart';
import 'package:motorix_client/screens/payment_form_screen.dart';
import 'package:motorix_client/services/api_client.dart';
import 'package:provider/provider.dart';

const String _listadoParcial = '''
{
  "total": 1500.0,
  "cobrado": 800.0,
  "saldoPendiente": 700.0,
  "estadoCobro": "PARCIAL",
  "datos": [
    {
      "id": 9,
      "metodo": "TRANSFER",
      "monto": 800.0,
      "estado": "COMPLETED",
      "registradoPor": { "id": 2, "nombreCompleto": "Recepción del Taller" },
      "fecha": "2026-10-11T16:20:00"
    }
  ]
}
''';

const String _listadoLiquidado = '''
{
  "total": 1500.0,
  "cobrado": 1500.0,
  "saldoPendiente": 0.0,
  "estadoCobro": "LIQUIDADA",
  "datos": []
}
''';

// 005-precio-venta-refacciones, T027: orden con total incompleto (FR-009).
const String _listadoIncompleto = '''
{
  "total": 1610.0,
  "cobrado": 0.0,
  "saldoPendiente": 1610.0,
  "estadoCobro": "PENDIENTE",
  "totalCompleto": false,
  "refaccionesSinPrecio": 2,
  "datos": []
}
''';

/// Cliente HTTP falso: el GET devuelve el resumen y el POST confirma el cobro.
class _ClienteFalso extends Fake implements http.Client {
  final bool liquidar;

  /// Resumen alternativo a devolver en el GET (por defecto el parcial).
  final String? listado;
  final List<http.BaseRequest> peticiones = [];

  _ClienteFalso({this.liquidar = false, this.listado});

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    peticiones.add(request);
    if (request.method == 'POST') {
      final cuerpo = jsonDecode((request as http.Request).body);
      final respuesta = jsonEncode({
        'id': 12,
        'metodo': cuerpo['metodo'],
        'monto': cuerpo['monto'],
        'estado': 'COMPLETED',
        'registradoPor': {'id': 2, 'nombreCompleto': 'Recepción del Taller'},
        'fecha': '2026-10-11T17:00:00',
      });
      return http.StreamedResponse(
        Stream.fromIterable([utf8.encode(respuesta)]),
        201,
        headers: {'content-type': 'application/json'},
      );
    }
    final cuerpo = this.listado ??
        (liquidar ? _listadoLiquidado : _listadoParcial);
    return http.StreamedResponse(
      Stream.fromIterable([utf8.encode(cuerpo)]),
      200,
      headers: {'content-type': 'application/json'},
    );
  }

  @override
  void close() {}
}

Widget _envolver(PaymentsProvider pagos, Widget pantalla) {
  return ChangeNotifierProvider<PaymentsProvider>.value(
    value: pagos,
    child: MaterialApp(
      theme: temaMotorix(),
      home: pantalla,
    ),
  );
}

void main() {
  test('el modelo lee los saldos y el estado de cobro (FR-003/FR-004)', () {
    final pagos = PagosDeOrden.desdeJson(
        jsonDecode(_listadoParcial) as Map<String, dynamic>);

    expect(pagos.total, 1500.0);
    expect(pagos.cobrado, 800.0);
    expect(pagos.saldoPendiente, 700.0);
    expect(pagos.estadoCobro, 'PARCIAL');
    expect(pagos.nombreEstadoCobro, 'Parcialmente pagada');
    expect(pagos.pagos.single.nombreMetodo, 'Transferencia');
    expect(pagos.pagos.single.registradoPor, 'Recepción del Taller');

    final liquidada = PagosDeOrden.desdeJson(
        jsonDecode(_listadoLiquidado) as Map<String, dynamic>);
    expect(liquidada.estadoCobro, 'LIQUIDADA');
  });

  testWidgets('el formulario de cobro muestra método, monto y saldo (escenario 1)',
      (tester) async {
    final api = ApiClient(httpClient: _ClienteFalso());
    final provider = PaymentsProvider(api);

    await tester.pumpWidget(_envolver(
      provider,
      const PaymentFormScreen(orderId: 1, saldoPendiente: 700.0),
    ));

    expect(find.text('Saldo pendiente: \$700.00'), findsOneWidget);
    expect(find.text('Efectivo'), findsOneWidget);
    // El monto se prellena con el saldo pendiente para el cobro completo.
    expect(find.byKey(const Key('campoMontoCobro')), findsOneWidget);
    expect(find.text('700.00'), findsOneWidget);
    expect(find.byKey(const Key('botonRegistrarCobro')), findsOneWidget);
  });

  testWidgets('un monto en cero muestra el mensaje de validación (caso límite)',
      (tester) async {
    final api = ApiClient(httpClient: _ClienteFalso());
    final provider = PaymentsProvider(api);

    await tester.pumpWidget(_envolver(
      provider,
      const PaymentFormScreen(orderId: 1, saldoPendiente: 700.0),
    ));

    await tester.enterText(find.byKey(const Key('campoMontoCobro')), '0');
    await tester.tap(find.byKey(const Key('botonRegistrarCobro')));
    await tester.pumpAndSettle();

    expect(find.text('Ingrese un monto mayor que cero.'), findsOneWidget);
  });

  testWidgets('registrar un cobro confirma, envía el POST y muestra éxito',
      (tester) async {
    final cliente = _ClienteFalso(liquidar: true);
    final api = ApiClient(httpClient: cliente);
    final provider = PaymentsProvider(api);

    await tester.pumpWidget(_envolver(
      provider,
      const PaymentFormScreen(orderId: 1, saldoPendiente: 700.0),
    ));

    await tester.tap(find.byKey(const Key('botonRegistrarCobro')));
    await tester.pumpAndSettle();
    // Confirmación obligatoria antes de registrar (FR-006).
    expect(find.text('Confirmar cobro'), findsOneWidget);
    await tester.tap(find.text('Registrar'));
    await tester.pumpAndSettle();

    // El cobro se envía al servidor con el método y el monto elegidos…
    final post = cliente.peticiones
        .where((peticion) => peticion.method == 'POST')
        .firstOrNull as http.Request?;
    expect(post, isNotNull);
    final cuerpo = jsonDecode(post!.body) as Map<String, dynamic>;
    expect(cuerpo['metodo'], 'CASH');
    expect(cuerpo['monto'], 700.0);

    // …y el resumen recargado refleja la liquidación de la orden (FR-004).
    expect(provider.pagos, isNotNull);
    expect(provider.pagos!.estadoCobro, 'LIQUIDADA');
    expect(provider.pagos!.saldoPendiente, 0.0);
  });

  // --- 005-precio-venta-refacciones, T027 (FR-009, FR-010, CA-10) ---

  test('el modelo lee la marca de total incompleto y sus refacciones sin precio', () {
    final pagos = PagosDeOrden.desdeJson(
        jsonDecode(_listadoIncompleto) as Map<String, dynamic>);

    expect(pagos.totalCompleto, isFalse);
    expect(pagos.refaccionesSinPrecio, 2);

    // Con la forma previa del contrato se asume total completo.
    final completo = PagosDeOrden.desdeJson(
        jsonDecode(_listadoParcial) as Map<String, dynamic>);
    expect(completo.totalCompleto, isTrue);
    expect(completo.refaccionesSinPrecio, 0);
  });

  testWidgets(
      'con total incompleto el formulario avisa y bloquea el registro del cobro',
      (tester) async {
    final api = ApiClient(httpClient: _ClienteFalso(listado: _listadoIncompleto));
    final provider = PaymentsProvider(api);

    await tester.pumpWidget(_envolver(
      provider,
      const PaymentFormScreen(
        orderId: 1,
        saldoPendiente: 1610.0,
        totalCompleto: false,
        refaccionesSinPrecio: 2,
      ),
    ));
    await tester.pumpAndSettle();

    // Aviso ámbar de total incompleto (FR-010).
    expect(find.byKey(const Key('avisoTotalIncompleto')), findsOneWidget);
    expect(
      find.textContaining('el total de la orden está incompleto'),
      findsOneWidget,
    );

    // El registro queda bloqueado: el servidor respondería TOTAL_INCOMPLETO.
    final boton =
        tester.widget<ElevatedButton>(find.byKey(const Key('botonRegistrarCobro')));
    expect(boton.onPressed, isNull);
  });

  testWidgets('con total completo el formulario sigue habilitado (regresión)',
      (tester) async {
    final api = ApiClient(httpClient: _ClienteFalso());
    final provider = PaymentsProvider(api);

    await tester.pumpWidget(_envolver(
      provider,
      const PaymentFormScreen(orderId: 1, saldoPendiente: 700.0),
    ));

    expect(find.byKey(const Key('avisoTotalIncompleto')), findsNothing);
    final boton =
        tester.widget<ElevatedButton>(find.byKey(const Key('botonRegistrarCobro')));
    expect(boton.onPressed, isNotNull);
  });
}

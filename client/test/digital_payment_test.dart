// T029: pruebas del flujo de cobro digital con Mercado Pago (US2, FR-008/FR-017).
//
// Sin red: el cliente HTTP falso responde el simulador con el formato del
// contrato. Cubre el modelo del cobro, la generación del enlace de pago y la
// verificación bajo demanda (decisión Q1).
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

const String _cobroCreado = '''
{
  "id": 12,
  "estado": "PENDING",
  "monto": 700.0,
  "enlace": "https://sandbox.mercadopago.com/checkout/preferences/abc-123"
}
''';

const String _cobroConfirmado = '''
{
  "id": 12,
  "metodo": "MERCADO_PAGO",
  "monto": 700.0,
  "estado": "COMPLETED",
  "externalReference": "MP-DEMO-12",
  "registradoPor": { "id": 2, "nombreCompleto": "Recepción del Taller" },
  "fecha": "2026-10-12T10:00:00"
}
''';

const String _listadoLiquidado = '''
{
  "total": 700.0,
  "cobrado": 700.0,
  "saldoPendiente": 0.0,
  "estadoCobro": "LIQUIDADA",
  "datos": [
    {
      "id": 12,
      "metodo": "MERCADO_PAGO",
      "monto": 700.0,
      "estado": "COMPLETED",
      "registradoPor": { "id": 2, "nombreCompleto": "Recepción del Taller" },
      "fecha": "2026-10-12T10:00:00"
    }
  ]
}
''';

/// Cliente HTTP falso: responde el flujo digital (crear → verificar → listar).
class _ClienteFalso extends Fake implements http.Client {
  final List<http.BaseRequest> peticiones = [];

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    peticiones.add(request);
    final ruta = request.url.toString();
    String cuerpo;
    int status;

    if (request.method == 'POST' && ruta.endsWith('/payments/digital')) {
      cuerpo = _cobroCreado;
      status = 201;
    } else if (request.method == 'POST' && ruta.endsWith('/verify')) {
      cuerpo = _cobroConfirmado;
      status = 200;
    } else {
      cuerpo = _listadoLiquidado;
      status = 200;
    }
    return http.StreamedResponse(
      Stream.fromIterable([utf8.encode(cuerpo)]),
      status,
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
  test('el modelo del cobro digital lee el enlace y su estado (FR-017)', () {
    final cobro = CobroDigital.desdeJson(
        jsonDecode(_cobroCreado) as Map<String, dynamic>);

    expect(cobro.id, 12);
    expect(cobro.estado, 'PENDING');
    expect(cobro.monto, 700.0);
    expect(cobro.enlace, contains('https://'));
    expect(cobro.nombreEstado, 'Pendiente de confirmación');
  });

  testWidgets('generar el cobro digital muestra el enlace y el botón verificar',
      (tester) async {
    final cliente = _ClienteFalso();
    final api = ApiClient(httpClient: cliente);
    final provider = PaymentsProvider(api);

    await tester.pumpWidget(_envolver(
      provider,
      const PaymentFormScreen(orderId: 1, saldoPendiente: 700.0),
    ));

    expect(find.byKey(const Key('botonCobroDigital')), findsOneWidget);
    expect(find.byKey(const Key('botonVerificarPago')), findsNothing);

    await tester.tap(find.byKey(const Key('botonCobroDigital')));
    await tester.pumpAndSettle();

    // El enlace de pago queda visible para compartirlo (RN-14: sin tarjeta).
    expect(find.byKey(const Key('textoEnlaceDigital')), findsOneWidget);
    expect(
      find.text('https://sandbox.mercadopago.com/checkout/preferences/abc-123'),
      findsOneWidget,
    );
    expect(find.byKey(const Key('botonVerificarPago')), findsOneWidget);

    final post = cliente.peticiones
        .where((peticion) =>
            peticion.method == 'POST' &&
            peticion.url.toString().endsWith('/payments/digital'))
        .firstOrNull as http.Request?;
    expect(post, isNotNull);
    final cuerpo = jsonDecode(post!.body) as Map<String, dynamic>;
    expect(cuerpo['monto'], 700.0);
  });

  testWidgets('verificar el cobro lo confirma y recarga los saldos (decisión Q1)',
      (tester) async {
    final cliente = _ClienteFalso();
    final api = ApiClient(httpClient: cliente);
    final provider = PaymentsProvider(api);

    await tester.pumpWidget(_envolver(
      provider,
      const PaymentFormScreen(orderId: 1, saldoPendiente: 700.0),
    ));

    await tester.tap(find.byKey(const Key('botonCobroDigital')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('botonVerificarPago')));
    await tester.pumpAndSettle();

    // La verificación apunta al pago creado y la orden queda liquidada (FR-004).
    final verificacion = cliente.peticiones
        .where((peticion) =>
            peticion.method == 'POST' &&
            peticion.url.toString().endsWith('/payments/12/verify'))
        .firstOrNull;
    expect(verificacion, isNotNull);

    expect(provider.cobroDigital, isNotNull);
    expect(provider.cobroDigital!.estado, 'COMPLETED');
    expect(provider.pagos, isNotNull);
    expect(provider.pagos!.estadoCobro, 'LIQUIDADA');
    expect(provider.pagos!.saldoPendiente, 0.0);
  });
}

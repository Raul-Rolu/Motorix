// 006-complemento-precios-compra, T035 (US4, FR-008, CA-6): un cobro digital
// desfasado (STALE) se muestra con el chip "Desfasado", no ofrece verificar o
// confirmar y sí ofrece generar uno nuevo por el saldo actual.
//
// Sin red: el cliente HTTP falso responde con el formato del contrato.
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

/// Cliente HTTP falso: crear (500 y luego 800), verificar → STALE, y listados
/// con el saldo actualizado tras el cambio del total.
class _ClienteFalso extends Fake implements http.Client {
  final List<http.BaseRequest> peticiones = [];
  int _cobrosCreados = 0;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    peticiones.add(request);
    final ruta = request.url.toString();
    Map<String, dynamic> cuerpo;
    int status = 200;

    if (request.method == 'POST' && ruta.endsWith('/payments/digital')) {
      _cobrosCreados++;
      cuerpo = {
        'id': 10 + _cobrosCreados,
        'estado': 'PENDING',
        'monto': _cobrosCreados == 1 ? 500.0 : 800.0,
        'enlace': 'https://sandbox.mercadopago.com/checkout/preferences/c$_cobrosCreados',
      };
      status = 201;
    } else if (request.method == 'POST' && ruta.endsWith('/verify')) {
      // El servidor detecta que el importe ya no coincide con el saldo.
      cuerpo = {
        'id': 11,
        'metodo': 'MERCADO_PAGO',
        'monto': 500.0,
        'estado': 'STALE',
        'fecha': '2026-11-21T10:00:00',
      };
    } else {
      cuerpo = {
        'total': 800.0,
        'cobrado': 0.0,
        'saldoPendiente': 800.0,
        'estadoCobro': 'PENDIENTE',
        'datos': [
          {
            'id': 11,
            'metodo': 'MERCADO_PAGO',
            'monto': 500.0,
            'estado': 'STALE',
            'fecha': '2026-11-21T10:00:00',
          },
        ],
      };
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

Widget _envolver(PaymentsProvider pagos, Widget pantalla) {
  return ChangeNotifierProvider<PaymentsProvider>.value(
    value: pagos,
    child: MaterialApp(theme: temaMotorix(), home: pantalla),
  );
}

void main() {
  test('el modelo traduce el estado STALE como "Desfasado"', () {
    final pago = Pago.desdeJson({'id': 1, 'metodo': 'MERCADO_PAGO', 'monto': 500, 'estado': 'STALE'});
    expect(pago.nombreEstado, 'Desfasado');
    final cobro = CobroDigital.desdeJson(
        {'id': 1, 'estado': 'STALE', 'monto': 500, 'enlace': 'https://x'});
    expect(cobro.nombreEstado, 'Desfasado');
  });

  testWidgets(
      'un cobro desfasado muestra el chip, no ofrece verificar y sí generar uno nuevo',
      (tester) async {
    final cliente = _ClienteFalso();
    final provider = PaymentsProvider(ApiClient(httpClient: cliente));

    await tester.pumpWidget(_envolver(
      provider,
      const PaymentFormScreen(orderId: 1, saldoPendiente: 500.0),
    ));

    await tester.ensureVisible(find.byKey(const Key('botonCobroDigital')));
    await tester.tap(find.byKey(const Key('botonCobroDigital')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('botonVerificarPago')), findsOneWidget);
    expect(find.byKey(const Key('chipCobroDesfasado')), findsNothing);

    await tester.ensureVisible(find.byKey(const Key('botonVerificarPago')));
    await tester.tap(find.byKey(const Key('botonVerificarPago')));
    await tester.pumpAndSettle();

    // Chip con tokens del tema (advertencia), sin opción de confirmar.
    final chip = find.byKey(const Key('chipCobroDesfasado'));
    expect(chip, findsOneWidget);
    expect(find.text('Desfasado'), findsOneWidget);
    expect(find.byKey(const Key('botonVerificarPago')), findsNothing);
    expect(find.byKey(const Key('botonCobroNuevo')), findsOneWidget);

    final decoracion = tester.widget<Container>(chip).decoration as BoxDecoration;
    expect(decoracion.color, MotorixColores.advertenciaSuave);
    expect((decoracion.border as Border).top.color, MotorixColores.advertencia);
  });

  testWidgets('generar un cobro nuevo refresca el saldo y usa el saldo actual',
      (tester) async {
    final cliente = _ClienteFalso();
    final provider = PaymentsProvider(ApiClient(httpClient: cliente));

    await tester.pumpWidget(_envolver(
      provider,
      const PaymentFormScreen(orderId: 1, saldoPendiente: 500.0),
    ));
    await tester.ensureVisible(find.byKey(const Key('botonCobroDigital')));
    await tester.tap(find.byKey(const Key('botonCobroDigital')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('botonVerificarPago')));
    await tester.tap(find.byKey(const Key('botonVerificarPago')));
    await tester.pumpAndSettle();

    // Deja pasar el aviso (SnackBar) para que no tape el botón.
    await tester.pump(const Duration(seconds: 6));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('botonCobroNuevo')));
    await tester.tap(find.byKey(const Key('botonCobroNuevo')));
    await tester.pumpAndSettle();

    // El segundo cobro se crea por el saldo refrescado (800), no por el viejo (500).
    final altas = cliente.peticiones
        .whereType<http.Request>()
        .where((p) => p.method == 'POST' && p.url.toString().endsWith('/payments/digital'))
        .toList();
    expect(altas.length, 2);
    expect((jsonDecode(altas.last.body) as Map<String, dynamic>)['monto'], 800.0);
    expect(provider.cobroDigital!.estado, 'PENDING');
    expect(find.byKey(const Key('chipCobroDesfasado')), findsNothing);
    expect(find.byKey(const Key('botonVerificarPago')), findsOneWidget);
  });
}

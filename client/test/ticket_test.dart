// T037/T039: pruebas del ticket imprimible (US3, FR-011 a FR-013) con `flutter test`.
//
// Sin red: el cliente HTTP falso responde el ticket con el formato del
// contrato. Cubre el modelo, la vista del ticket y el HTML autocontenido que
// se usa para imprimir (research D5: documento temporal + diálogo del sistema).
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:motorix_client/config/theme.dart';
import 'package:motorix_client/models/ticket.dart';
import 'package:motorix_client/providers/ticket_provider.dart';
import 'package:motorix_client/screens/ticket_screen.dart';
import 'package:motorix_client/services/api_client.dart';
import 'package:motorix_client/services/ticket_print.dart';
import 'package:provider/provider.dart';

const String _ticketJson = '''
{
  "folio": "TCK-2026-0007",
  "fecha": "2026-10-12T09:30:00",
  "taller": { "nombre": "Motorix", "direccion": "Av. Taller 123", "telefono": "555-000-0000" },
  "cliente": { "id": 1, "nombreCompleto": "Ana Ticket Díaz" },
  "vehiculo": { "id": 1, "marca": "Toyota", "modelo": "Yaris", "anio": 2020, "placas": "TKT-777-B", "kilometraje": 45120 },
  "servicios": [ { "nombre": "Cambio de aceite", "precio": 650.0 } ],
  "refacciones": [ { "nombre": "Filtro de aceite", "codigo": "FLT-001", "cantidad": 1, "unitPrice": null, "amount": null, "sinPrecio": true } ],
  "manoObra": 200.0,
  "subtotal": 850.0,
  "total": 850.0,
  "totalCompleto": false,
  "metodosDePago": [ { "metodo": "CASH", "monto": 850.0, "estado": "COMPLETED" } ],
  "estadoPago": "LIQUIDADA",
  "saldoPendiente": 0.0
}
''';

// 005-precio-venta-refacciones, T027: ticket con desglose de precios (CA-13).
const String _ticketJsonDesglose = '''
{
  "folio": "TCK-2026-0008",
  "fecha": "2026-10-13T11:00:00",
  "taller": { "nombre": "Motorix", "direccion": "Av. Taller 123", "telefono": "555-000-0000" },
  "cliente": { "id": 2, "nombreCompleto": "Luis Desglose" },
  "vehiculo": { "id": 2, "marca": "Mazda", "modelo": "3", "anio": 2021, "placas": "TDG-111-C", "kilometraje": 22000 },
  "servicios": [ { "nombre": "Cambio de aceite", "precio": 650.0 } ],
  "refacciones": [
    { "nombre": "Aceite 5W30", "codigo": "LUB-0530", "cantidad": 2, "unitPrice": 120.0, "amount": 240.0, "sinPrecio": false },
    { "nombre": "Filtro de aceite", "codigo": "FLT-001", "cantidad": 1, "unitPrice": 80.0, "amount": 80.0, "sinPrecio": false }
  ],
  "manoObra": 200.0,
  "subtotal": 1170.0,
  "total": 1170.0,
  "totalCompleto": true,
  "metodosDePago": [],
  "estadoPago": "PENDIENTE",
  "saldoPendiente": 1170.0
}
''';

/// Cliente HTTP falso: el GET devuelve el ticket con el formato del contrato.
class _ClienteFalso extends Fake implements http.Client {
  /// Cuerpo alternativo a devolver (por defecto el ticket original).
  final String? cuerpo;

  _ClienteFalso({this.cuerpo});

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    return http.StreamedResponse(
      Stream.fromIterable([utf8.encode(cuerpo ?? _ticketJson)]),
      200,
      headers: {'content-type': 'application/json'},
    );
  }

  @override
  void close() {}
}

Widget _envolver(TicketsProvider tickets) {
  return ChangeNotifierProvider<TicketsProvider>.value(
    value: tickets,
    child: MaterialApp(
      theme: temaMotorix(),
      home: const TicketScreen(orderId: 1),
    ),
  );
}

void main() {
  test('el modelo lee el ticket completo del contrato (FR-011)', () {
    final ticket =
        TicketServicio.desdeJson(jsonDecode(_ticketJson) as Map<String, dynamic>);

    expect(ticket.folio, 'TCK-2026-0007');
    expect(ticket.tallerNombre, 'Motorix');
    expect(ticket.clienteNombre, 'Ana Ticket Díaz');
    expect(ticket.vehiculoDescripcion, 'Toyota Yaris 2020');
    expect(ticket.placas, 'TKT-777-B');
    expect(ticket.kilometraje, 45120);
    expect(ticket.servicios.single.precio, 650.0);
    expect(ticket.refacciones.single.codigo, 'FLT-001');
    expect(ticket.total, 850.0);
    expect(ticket.metodosDePago.single.nombreMetodo, 'Efectivo');
    expect(ticket.estadoPago, 'LIQUIDADA');
    expect(ticket.nombreEstadoPago, 'Pagada');
  });

  testWidgets('la vista muestra folio, cliente, servicios y total (escenario 1)',
      (tester) async {
    final api = ApiClient(httpClient: _ClienteFalso());
    final provider = TicketsProvider(api);

    await tester.pumpWidget(_envolver(provider));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('folioTicket')), findsOneWidget);
    expect(find.text('TCK-2026-0007'), findsOneWidget);
    expect(find.text('Ana Ticket Díaz'), findsOneWidget);
    expect(find.text('Cambio de aceite'), findsOneWidget);
    expect(find.text('Filtro de aceite (FLT-001)'), findsOneWidget);
    expect(find.text('Total'), findsOneWidget);
    expect(find.text('\$850.00'), findsWidgets);
    expect(find.text('Pago — Pagada'), findsOneWidget);
    expect(find.byKey(const Key('botonImprimirTicket')), findsOneWidget);
    // Compartir dentro de la app por portapapeles (T039, sin servicios externos).
    expect(find.byKey(const Key('botonCopiarTicket')), findsOneWidget);
  });

  test('el HTML del ticket es autocontenido e incluye folio, importes y pago (T039)', () {
    final ticket =
        TicketServicio.desdeJson(jsonDecode(_ticketJson) as Map<String, dynamic>);

    final html = construirHtmlTicket(ticket);

    expect(html, contains('<!DOCTYPE html>'));
    expect(html, contains('<meta charset="utf-8">'));
    expect(html, contains('TCK-2026-0007'));
    expect(html, contains('Ana Ticket Díaz'));
    expect(html, contains('TKT-777-B'));
    expect(html, contains('Cambio de aceite'));
    expect(html, contains('FLT-001'));
    expect(html, contains('\$850.00'));
    expect(html, contains('Efectivo'));
    expect(html, contains('Pagada'));
    // Sin datos sensibles (RN-14).
    expect(html.toLowerCase(), isNot(contains('tarjeta')));
  });

  test('el texto plano del ticket se comparte por portapapeles (T039)', () {
    final ticket =
        TicketServicio.desdeJson(jsonDecode(_ticketJson) as Map<String, dynamic>);

    final texto = construirTextoTicket(ticket);

    expect(texto, contains('Ticket TCK-2026-0007 — Motorix'));
    expect(texto, contains('Cliente: Ana Ticket Díaz'));
    expect(texto, contains('TKT-777-B'));
    expect(texto, contains('Cambio de aceite: \$650.00'));
    expect(texto, contains('Filtro de aceite (FLT-001) x1'));
    expect(texto, contains('Total: \$850.00'));
    expect(texto, contains('Pago: Pagada'));
    expect(texto, contains('Efectivo: \$850.00'));
    expect(texto, contains('Saldo pendiente: \$0.00'));
    // El portapapeles no lleva datos de tarjeta (RN-14).
    expect(texto.toLowerCase(), isNot(contains('tarjeta')));
  });

  // --- 005-precio-venta-refacciones, T027 (FR-010, FR-013, FR-016, CA-13) ---

  test('el modelo lee el desglose de precios y la marca de total completo', () {
    final desglose =
        TicketServicio.desdeJson(jsonDecode(_ticketJsonDesglose) as Map<String, dynamic>);

    expect(desglose.totalCompleto, isTrue);
    expect(desglose.refacciones, hasLength(2));
    expect(desglose.refacciones.first.unitPrice, 120.0);
    expect(desglose.refacciones.first.amount, 240.0);
    expect(desglose.refacciones.first.sinPrecio, isFalse);
    expect(desglose.total, 1170.0);
  });

  test('el modelo marca una línea sin precio como sinPrecio (FR-016)', () {
    final ticket =
        TicketServicio.desdeJson(jsonDecode(_ticketJson) as Map<String, dynamic>);

    expect(ticket.totalCompleto, isFalse);
    final filtro = ticket.refacciones.single;
    expect(filtro.sinPrecio, isTrue);
    expect(filtro.unitPrice, isNull);
    expect(filtro.amount, isNull);
  });

  testWidgets('la vista muestra precio e importe por refacción (CA-13)',
      (tester) async {
    final api = ApiClient(httpClient: _ClienteFalso(cuerpo: _ticketJsonDesglose));
    final provider = TicketsProvider(api);

    await tester.pumpWidget(_envolver(provider));
    await tester.pumpAndSettle();

    expect(find.text('x2 · \$120.00 c/u'), findsOneWidget);
    expect(find.text('\$240.00'), findsOneWidget);
    expect(find.text('x1 · \$80.00 c/u'), findsOneWidget);
    expect(find.text('\$1170.00'), findsWidgets);
    // Con total completo no hay aviso de datos faltantes.
    expect(find.byKey(const Key('avisoTotalIncompletoTicket')), findsNothing);
  });

  testWidgets(
      'la vista muestra "Sin precio" y el aviso ámbar en una línea sin precio (FR-016)',
      (tester) async {
    final api = ApiClient(httpClient: _ClienteFalso());
    final provider = TicketsProvider(api);

    await tester.pumpWidget(_envolver(provider));
    await tester.pumpAndSettle();

    expect(find.text('x1 · sin precio'), findsOneWidget);
    expect(find.text('Sin precio'), findsOneWidget);
    expect(find.byKey(const Key('avisoTotalIncompletoTicket')), findsOneWidget);
    expect(
      find.textContaining('falta el precio de venta'),
      findsOneWidget,
    );
  });
}

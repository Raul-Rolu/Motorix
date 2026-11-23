// 008-configuracion-seguridad-reportes, T044 (bloque P1, US4; FR-009, CA-14): el
// ticket muestra «Próximo servicio» con la fecha y/o el kilometraje cuando el
// servidor envía `proximoServicio`, y no lo muestra cuando el campo no viene
// (tickets anteriores al sprint o sin servicios con tipo). Cubre el modelo, la
// pantalla del ticket y el HTML que se imprime.
//
// Sin red: un cliente HTTP falso responde con el formato del contrato.
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

/// Ticket del contrato; `proximo` es el JSON de `proximoServicio` (null = campo ausente).
Map<String, dynamic> _ticket({Map<String, dynamic>? proximo}) => {
      'folio': 'TCK-2026-0012',
      'fecha': '2026-11-23T09:30:00',
      'taller': {'nombre': 'Motorix', 'direccion': 'Av. Taller 123', 'telefono': '555-000-0000'},
      'cliente': {'id': 1, 'nombreCompleto': 'Ana Ticket Díaz'},
      'vehiculo': {
        'id': 1,
        'marca': 'Toyota',
        'modelo': 'Yaris',
        'anio': 2020,
        'placas': 'TKT-777-B',
        'kilometraje': 78000,
      },
      'servicios': [
        {'nombre': 'Cambio de aceite', 'precio': 650.0},
      ],
      'refacciones': [],
      'manoObra': 200.0,
      'subtotal': 850.0,
      'total': 850.0,
      'totalCompleto': true,
      'metodosDePago': [],
      'estadoPago': 'PENDIENTE',
      'saldoPendiente': 850.0,
      'proximoServicio': ?proximo,
    };

class _ClienteFalso extends Fake implements http.Client {
  final Map<String, dynamic> cuerpo;

  _ClienteFalso(this.cuerpo);

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    return http.StreamedResponse(
      Stream.fromIterable([utf8.encode(jsonEncode(cuerpo))]),
      200,
      headers: {'content-type': 'application/json'},
    );
  }

  @override
  void close() {}
}

TicketServicio _modelo(Map<String, dynamic> json) => TicketServicio.desdeJson(json);

Future<void> _montar(WidgetTester tester, Map<String, dynamic> cuerpo) async {
  final provider = TicketsProvider(ApiClient(httpClient: _ClienteFalso(cuerpo)));
  await tester.binding.setSurfaceSize(const Size(900, 1400));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    ChangeNotifierProvider<TicketsProvider>.value(
      value: provider,
      child: MaterialApp(theme: temaMotorix(), home: const TicketScreen(orderId: 1)),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('modelo', () {
    test('lee fecha y kilometraje de proximoServicio', () {
      final ticket = _modelo(_ticket(proximo: {'fecha': '2027-05-22', 'kilometraje': 83000}));

      expect(ticket.proximoServicio, isNotNull);
      expect(ticket.proximoServicio!.fecha, '2027-05-22');
      expect(ticket.proximoServicio!.kilometraje, 83000);
    });

    test('acepta solo la fecha o solo el kilometraje', () {
      final soloFecha = _modelo(_ticket(proximo: {'fecha': '2027-02-21', 'kilometraje': null}));
      final soloKm = _modelo(_ticket(proximo: {'fecha': null, 'kilometraje': 88000}));

      expect(soloFecha.proximoServicio!.kilometraje, isNull);
      expect(soloKm.proximoServicio!.fecha, isNull);
    });

    test('sin el campo no hay próximo servicio (tickets anteriores)', () {
      expect(_modelo(_ticket()).proximoServicio, isNull);
    });

    test('el texto combina fecha y kilometraje con separador de miles', () {
      expect(
        _modelo(_ticket(proximo: {'fecha': '2027-05-22', 'kilometraje': 83000})).proximoServicio!.texto,
        '2027-05-22 o 83,000 km',
      );
      expect(
        _modelo(_ticket(proximo: {'fecha': '2027-02-21', 'kilometraje': null})).proximoServicio!.texto,
        '2027-02-21',
      );
      expect(
        _modelo(_ticket(proximo: {'fecha': null, 'kilometraje': 8000})).proximoServicio!.texto,
        '8,000 km',
      );
    });
  });

  group('pantalla del ticket', () {
    testWidgets('muestra «Próximo servicio» con la fecha y el kilometraje', (tester) async {
      await _montar(tester, _ticket(proximo: {'fecha': '2027-05-22', 'kilometraje': 83000}));

      expect(find.text('Próximo servicio'), findsOneWidget);
      expect(find.text('2027-05-22 o 83,000 km'), findsOneWidget);
      expect(find.byKey(const Key('proximoServicioTicket')), findsOneWidget);
    });

    testWidgets('no lo muestra cuando el ticket no trae proximoServicio', (tester) async {
      await _montar(tester, _ticket());

      expect(find.text('Próximo servicio'), findsNothing);
      expect(find.byKey(const Key('proximoServicioTicket')), findsNothing);
      // El resto del ticket sigue igual.
      expect(find.text('TCK-2026-0012'), findsOneWidget);
      expect(find.text('Ana Ticket Díaz'), findsOneWidget);
    });
  });

  group('HTML para imprimir', () {
    test('agrega la línea «Próximo servicio» con fecha y kilometraje', () {
      final html = construirHtmlTicket(_modelo(_ticket(proximo: {'fecha': '2027-05-22', 'kilometraje': 83000})));

      expect(html, contains('Próximo servicio'));
      expect(html, contains('2027-05-22 o 83,000 km'));
    });

    test('sin el campo el HTML no menciona el próximo servicio', () {
      final html = construirHtmlTicket(_modelo(_ticket()));

      expect(html, isNot(contains('Próximo servicio')));
      expect(html, contains('TCK-2026-0012'));
    });
  });
}

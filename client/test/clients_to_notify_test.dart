// 007-notificaciones-internas, T060 (US7; FR-014, FR-015, CA-10, CA-11): la
// pantalla «Clientes por avisar» lista cliente, teléfono, vehículo y motivo;
// «Marcar como avisado» abre un diálogo con nota opcional (máx. 255) y
// «Cancelar» / «Confirmar» (docs/design-system.md 8.5); al confirmar el cliente
// sale de la lista; maneja los estados cargando, vacío y error. El acceso a la
// sección es solo de ADMIN y RECEPTIONIST.
//
// Sin red: un cliente HTTP falso responde con el formato del contrato.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:motorix_client/config/theme.dart';
import 'package:motorix_client/models/user.dart';
import 'package:motorix_client/providers/auth_provider.dart';
import 'package:motorix_client/providers/clients_to_notify_provider.dart';
import 'package:motorix_client/screens/clients_to_notify_screen.dart';
import 'package:motorix_client/services/api_client.dart';
import 'package:provider/provider.dart';

Map<String, dynamic> _hecho({
  required String tipo,
  required int hechoId,
  required String motivo,
  String cliente = 'Ana Sofía Mendoza',
  String telefono = '5534567890',
  String placas = 'JKL-012-D',
}) =>
    {
      'tipo': tipo,
      'hechoId': hechoId,
      'motivo': motivo,
      'cliente': {'id': 3, 'nombreCompleto': cliente, 'telefono': telefono},
      'vehiculo': {'id': 4, 'placas': placas, 'marca': 'Toyota', 'modelo': 'Corolla'},
      'fechaReferencia': '2026-11-21T10:00:00',
    };

/// Cliente HTTP falso de `/client-notices`: la lista es mutable y el alta la modifica.
class _ClienteFalso extends Fake implements http.Client {
  final List<http.BaseRequest> peticiones = [];
  final List<Map<String, dynamic>> pendientes;
  final List<Map<String, dynamic>> altas = [];
  int statusLista = 200;
  int statusAlta = 201;
  Completer<void>? puerta;

  _ClienteFalso(this.pendientes);

  int get consultasDeLista => peticiones.where((p) => p.method == 'GET').length;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    peticiones.add(request);
    Map<String, dynamic> cuerpo;
    var status = 200;

    if (request.method == 'GET') {
      await puerta?.future;
      status = statusLista;
      cuerpo = status == 200
          ? {'total': pendientes.length, 'datos': List<Map<String, dynamic>>.from(pendientes)}
          : {'error': {'codigo': status == 403 ? 'NO_AUTORIZADO' : 'ERROR_INTERNO', 'mensaje': 'x'}};
    } else {
      final datos = jsonDecode((request as http.Request).body) as Map<String, dynamic>;
      status = statusAlta;
      if (status == 201) {
        altas.add(datos);
        pendientes.removeWhere((h) => h['tipo'] == datos['tipo'] && h['hechoId'] == datos['hechoId']);
        cuerpo = {'id': 1, ...datos, 'nota': datos['nota']};
      } else if (status == 409) {
        // Otra persona lo avisó antes: el servidor ya no lo lista.
        pendientes.removeWhere((h) => h['tipo'] == datos['tipo'] && h['hechoId'] == datos['hechoId']);
        cuerpo = {
          'error': {
            'codigo': 'CLIENT_NOTICE_DUPLICATE',
            'mensaje': 'Ese cliente ya fue avisado por este hecho; no se registró un aviso nuevo.',
          },
        };
      } else {
        cuerpo = {'error': {'codigo': 'ERROR_INTERNO', 'mensaje': 'Error del servidor.'}};
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

AuthProvider _authComo(String rol, ApiClient api) {
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

class _Entorno {
  final _ClienteFalso cliente;
  final AuthProvider auth;
  final ClientsToNotifyProvider proveedor;
  _Entorno(this.cliente, this.auth, this.proveedor);
}

Future<_Entorno> _montar(
  WidgetTester tester,
  _ClienteFalso cliente, {
  String rol = 'RECEPTIONIST',
  bool esperar = true,
}) async {
  final api = ApiClient(httpClient: cliente);
  final auth = _authComo(rol, api);
  final proveedor = ClientsToNotifyProvider(api, auth);
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider<ClientsToNotifyProvider>.value(value: proveedor),
      ],
      child: MaterialApp(
        theme: temaMotorix(),
        home: const Scaffold(body: ClientsToNotifyScreen()),
      ),
    ),
  );
  if (esperar) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump();
  }
  return _Entorno(cliente, auth, proveedor);
}

final _orden = _hecho(tipo: 'ORDEN_TERMINADA', hechoId: 6, motivo: 'Vehículo listo (orden #6)');
final _cita = _hecho(
  tipo: 'CITA_MANANA',
  hechoId: 3,
  motivo: 'Cita mañana a las 09:00',
  cliente: 'María López Hernández',
  telefono: '5512345678',
  placas: 'DEF-456-B',
);
final _mantenimiento = _hecho(
  tipo: 'MANTENIMIENTO',
  hechoId: 6,
  motivo: 'Mantenimiento próximo: Cambio de filtros',
  cliente: 'Juan Carlos Ramírez',
  telefono: '5523456789',
  placas: 'GHI-789-C',
);

void main() {
  group('lista', () {
    testWidgets('muestra cliente, teléfono, vehículo y motivo de cada hecho', (tester) async {
      final cliente = _ClienteFalso([_orden, _cita, _mantenimiento]);

      await _montar(tester, cliente);

      expect(find.text('Clientes por avisar'), findsWidgets);
      expect(find.text('Ana Sofía Mendoza'), findsOneWidget);
      expect(find.text('5534567890'), findsOneWidget);
      expect(find.text('JKL-012-D · Toyota Corolla'), findsOneWidget);
      expect(find.text('Vehículo listo (orden #6)'), findsOneWidget);
      expect(find.text('María López Hernández'), findsOneWidget);
      expect(find.text('Cita mañana a las 09:00'), findsOneWidget);
      expect(find.text('Mantenimiento próximo: Cambio de filtros'), findsOneWidget);
      expect(find.byKey(const Key('botonAvisar-ORDEN_TERMINADA-6')), findsOneWidget);
      expect(find.byKey(const Key('botonAvisar-CITA_MANANA-3')), findsOneWidget);
      expect(find.byKey(const Key('botonAvisar-MANTENIMIENTO-6')), findsOneWidget);
    });

    testWidgets('estado cargando: indicador discreto mientras llega la lista', (tester) async {
      final cliente = _ClienteFalso([_orden])..puerta = Completer<void>();

      await _montar(tester, cliente, esperar: false);

      expect(find.byKey(const Key('porAvisarCargando')), findsOneWidget);
      cliente.puerta!.complete();
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('porAvisarCargando')), findsNothing);
      expect(find.text('Ana Sofía Mendoza'), findsOneWidget);
    });

    testWidgets('estado vacío: mensaje útil', (tester) async {
      await _montar(tester, _ClienteFalso([]));

      expect(find.byKey(const Key('porAvisarVacio')), findsOneWidget);
      expect(find.text('No hay clientes por avisar.'), findsOneWidget);
    });

    testWidgets('estado de error: mensaje en español con «Reintentar» y sin trazas', (tester) async {
      final cliente = _ClienteFalso([_orden])..statusLista = 500;

      await _montar(tester, cliente);

      expect(find.byKey(const Key('porAvisarError')), findsOneWidget);
      expect(find.text('No se pudo cargar la lista de clientes por avisar.'), findsOneWidget);
      expect(find.textContaining('Error del servidor'), findsNothing);

      cliente.statusLista = 200;
      await tester.tap(find.byKey(const Key('botonReintentarPorAvisar')));
      await tester.pumpAndSettle();
      expect(find.text('Ana Sofía Mendoza'), findsOneWidget);
    });

    testWidgets('con 403 (rol sin permiso) muestra un mensaje de permisos', (tester) async {
      final cliente = _ClienteFalso([])..statusLista = 403;

      await _montar(tester, cliente, rol: 'MECHANIC');

      expect(find.text('No tiene permisos para ver los clientes por avisar.'), findsOneWidget);
    });
  });

  group('marcar como avisado', () {
    testWidgets('abre un diálogo con nota opcional (máx. 255), «Cancelar» y «Confirmar»', (tester) async {
      final cliente = _ClienteFalso([_orden]);
      await _montar(tester, cliente);

      await tester.tap(find.byKey(const Key('botonAvisar-ORDEN_TERMINADA-6')));
      await tester.pumpAndSettle();

      expect(find.text('Cancelar'), findsOneWidget);
      expect(find.text('Confirmar'), findsOneWidget);
      final campo = tester.widget<TextField>(find.descendant(
        of: find.byKey(const Key('campoNotaAviso')),
        matching: find.byType(TextField),
      ));
      expect(campo.maxLength, 255);
    });

    testWidgets('el campo de nota no admite más de 255 caracteres', (tester) async {
      await _montar(tester, _ClienteFalso([_orden]));
      await tester.tap(find.byKey(const Key('botonAvisar-ORDEN_TERMINADA-6')));
      await tester.pumpAndSettle();

      await tester.enterText(
        find.descendant(of: find.byKey(const Key('campoNotaAviso')), matching: find.byType(TextField)),
        'x' * 300,
      );
      await tester.pump();

      final campo = tester.widget<TextField>(find.descendant(
        of: find.byKey(const Key('campoNotaAviso')),
        matching: find.byType(TextField),
      ));
      expect(campo.controller!.text.length, 255);
      expect(find.text('255/255'), findsOneWidget);
    });

    testWidgets('«Cancelar» cierra el diálogo sin registrar nada', (tester) async {
      final cliente = _ClienteFalso([_orden]);
      await _montar(tester, cliente);
      await tester.tap(find.byKey(const Key('botonAvisar-ORDEN_TERMINADA-6')));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Cancelar'));
      await tester.pumpAndSettle();

      expect(cliente.altas, isEmpty);
      expect(find.text('Confirmar'), findsNothing);
      expect(find.text('Ana Sofía Mendoza'), findsOneWidget);
    });

    testWidgets('«Confirmar» registra el aviso con la nota y el cliente sale de la lista', (tester) async {
      final cliente = _ClienteFalso([_orden, _cita]);
      await _montar(tester, cliente);
      await tester.tap(find.byKey(const Key('botonAvisar-ORDEN_TERMINADA-6')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.descendant(of: find.byKey(const Key('campoNotaAviso')), matching: find.byType(TextField)),
        'No contestó',
      );

      await tester.tap(find.text('Confirmar'));
      await tester.pumpAndSettle();

      expect(cliente.altas, [
        {'tipo': 'ORDEN_TERMINADA', 'hechoId': 6, 'nota': 'No contestó'},
      ]);
      expect(find.text('Ana Sofía Mendoza'), findsNothing);
      expect(find.text('María López Hernández'), findsOneWidget);
      expect(find.text('Cliente marcado como avisado.'), findsOneWidget);
    });

    testWidgets('sin nota no se envía el campo `nota`', (tester) async {
      final cliente = _ClienteFalso([_orden]);
      await _montar(tester, cliente);
      await tester.tap(find.byKey(const Key('botonAvisar-ORDEN_TERMINADA-6')));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Confirmar'));
      await tester.pumpAndSettle();

      expect(cliente.altas, [
        {'tipo': 'ORDEN_TERMINADA', 'hechoId': 6},
      ]);
    });

    testWidgets('si otra persona ya lo avisó (409) se informa y la lista se actualiza', (tester) async {
      final cliente = _ClienteFalso([_orden, _cita])..statusAlta = 409;
      await _montar(tester, cliente);
      final antes = cliente.consultasDeLista;
      await tester.tap(find.byKey(const Key('botonAvisar-ORDEN_TERMINADA-6')));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Confirmar'));
      await tester.pumpAndSettle();

      expect(find.textContaining('ya fue avisado'), findsOneWidget);
      expect(cliente.consultasDeLista, greaterThan(antes));
      expect(find.text('Ana Sofía Mendoza'), findsNothing);
      expect(find.text('María López Hernández'), findsOneWidget);
    });

    testWidgets('si el servidor falla se informa y el cliente sigue en la lista', (tester) async {
      final cliente = _ClienteFalso([_orden])..statusAlta = 500;
      await _montar(tester, cliente);
      await tester.tap(find.byKey(const Key('botonAvisar-ORDEN_TERMINADA-6')));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Confirmar'));
      await tester.pumpAndSettle();

      expect(find.text('No se pudo registrar el aviso.'), findsOneWidget);
      expect(find.text('Ana Sofía Mendoza'), findsOneWidget);
    });
  });

  group('acceso y sesión', () {
    test('la sección «Clientes por avisar» es solo de ADMIN y RECEPTIONIST', () {
      final api = ApiClient(httpClient: _ClienteFalso([]));

      expect(_authComo('ADMIN', api).puedeGestionarClientes, isTrue);
      expect(_authComo('RECEPTIONIST', api).puedeGestionarClientes, isTrue);
      expect(_authComo('MECHANIC', api).puedeGestionarClientes, isFalse);
    });

    testWidgets('al cerrar sesión se descarta la lista del usuario anterior', (tester) async {
      final cliente = _ClienteFalso([_orden]);
      final entorno = await _montar(tester, cliente);
      expect(entorno.proveedor.hechos, hasLength(1));

      entorno.auth.cerrarSesion();
      await tester.pump();

      expect(entorno.proveedor.hechos, isEmpty);
      expect(find.text('Ana Sofía Mendoza'), findsNothing);
    });
  });
}

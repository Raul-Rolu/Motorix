// 008-configuracion-seguridad-reportes, T025 (bloque P1, US2; FR-004, CA-2): la
// sección «Operación» de Configuración muestra los márgenes de mantenimiento
// próximo (días y km) y los días de orden detenida con sus límites, los guarda
// de forma independiente a los datos del taller con un mensaje de éxito y
// muestra el error del servidor sin trazas.
//
// Sin red: un cliente HTTP falso responde con el formato del contrato.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:motorix_client/config/theme.dart';
import 'package:motorix_client/models/user.dart';
import 'package:motorix_client/providers/auth_provider.dart';
import 'package:motorix_client/providers/settings_provider.dart';
import 'package:motorix_client/screens/settings_screen.dart';
import 'package:motorix_client/services/api_client.dart';
import 'package:provider/provider.dart';

Map<String, dynamic> _ajustesJson({int dias = 30, int km = 1000, int detenida = 3}) => {
      'taller': {
        'nombre': 'Motorix',
        'direccion': 'Av. Taller 123, Col. Centro',
        'telefono': '555-000-0000',
      },
      'operacion': {
        'margenProximoDias': dias,
        'margenProximoKm': km,
        'diasOrdenDetenida': detenida,
      },
      'limites': {
        'margenProximoDias': [1, 365],
        'margenProximoKm': [100, 50000],
        'diasOrdenDetenida': [1, 90],
      },
    };

class _ClienteFalso extends Fake implements http.Client {
  final List<http.BaseRequest> peticiones = [];
  Map<String, dynamic> guardado = _ajustesJson();
  int statusEscritura = 200;
  String mensajeError = 'El margen de mantenimiento próximo en días debe ser un número entero entre 1 y 365.';

  List<http.Request> get escrituras =>
      peticiones.whereType<http.Request>().where((p) => p.method == 'PUT').toList();

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    peticiones.add(request);
    Map<String, dynamic> cuerpo;
    var status = 200;
    if (request.method == 'GET') {
      cuerpo = guardado;
    } else {
      final datos = jsonDecode((request as http.Request).body) as Map<String, dynamic>;
      status = statusEscritura;
      if (status == 200) {
        final operacion = datos['operacion'] as Map<String, dynamic>? ?? {};
        guardado = {
          ...guardado,
          'operacion': {...(guardado['operacion'] as Map<String, dynamic>), ...operacion},
        };
        cuerpo = guardado;
      } else {
        cuerpo = {'error': {'codigo': 'DATOS_INVALIDOS', 'mensaje': mensajeError}};
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
  await tester.binding.setSurfaceSize(const Size(1200, 1400));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider<SettingsProvider>(create: (_) => SettingsProvider(api, auth)),
      ],
      child: MaterialApp(
        theme: temaMotorix(),
        home: const Scaffold(body: SettingsScreen()),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

String _valorDe(WidgetTester tester, String clave) =>
    tester.widget<TextFormField>(find.byKey(Key(clave))).controller!.text;

Future<void> _tocarGuardarOperacion(WidgetTester tester) async {
  await tester.ensureVisible(find.byKey(const Key('botonGuardarOperacion')));
  await tester.tap(find.byKey(const Key('botonGuardarOperacion')));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('muestra la sección «Operación» con los valores vigentes y sus límites', (tester) async {
    final cliente = _ClienteFalso()..guardado = _ajustesJson(dias: 15, km: 500, detenida: 5);

    await _montar(tester, cliente);

    expect(find.text('Operación'), findsOneWidget);
    expect(_valorDe(tester, 'campoMargenDias'), '15');
    expect(_valorDe(tester, 'campoMargenKm'), '500');
    expect(_valorDe(tester, 'campoDiasDetenida'), '5');
    expect(find.textContaining('Entre 1 y 365'), findsOneWidget);
    expect(find.textContaining('Entre 100 y 50000'), findsOneWidget);
    expect(find.textContaining('Entre 1 y 90'), findsOneWidget);
  });

  testWidgets('guardar envía solo el grupo operacion (enteros) y muestra el mensaje de éxito', (tester) async {
    final cliente = _ClienteFalso();
    await _montar(tester, cliente);

    await tester.enterText(find.byKey(const Key('campoMargenDias')), '15');
    await tester.enterText(find.byKey(const Key('campoMargenKm')), '500');
    await tester.enterText(find.byKey(const Key('campoDiasDetenida')), '5');
    await _tocarGuardarOperacion(tester);

    expect(cliente.escrituras, hasLength(1));
    final cuerpo = jsonDecode(cliente.escrituras.single.body) as Map<String, dynamic>;
    expect(cuerpo.keys, ['operacion']);
    expect(cuerpo['operacion'], {
      'margenProximoDias': 15,
      'margenProximoKm': 500,
      'diasOrdenDetenida': 5,
    });
    expect(find.text('Ajustes de operación guardados.'), findsOneWidget);
  });

  testWidgets('un valor vacío, decimal o fuera de límites no envía nada y explica el rango', (tester) async {
    final cliente = _ClienteFalso();
    await _montar(tester, cliente);

    await tester.enterText(find.byKey(const Key('campoMargenDias')), '0');
    await tester.enterText(find.byKey(const Key('campoMargenKm')), '99');
    await tester.enterText(find.byKey(const Key('campoDiasDetenida')), '');
    await _tocarGuardarOperacion(tester);

    expect(cliente.escrituras, isEmpty);
    expect(find.text('Debe ser un número entero entre 1 y 365.'), findsOneWidget);
    expect(find.text('Debe ser un número entero entre 100 y 50000.'), findsOneWidget);
    expect(find.text('Debe ser un número entero entre 1 y 90.'), findsOneWidget);
  });

  testWidgets('un error del servidor se muestra en español, sin trazas', (tester) async {
    final cliente = _ClienteFalso()..statusEscritura = 400;
    await _montar(tester, cliente);

    await tester.enterText(find.byKey(const Key('campoMargenDias')), '20');
    await _tocarGuardarOperacion(tester);

    expect(find.text('El margen de mantenimiento próximo en días debe ser un número entero entre 1 y 365.'),
        findsOneWidget);
    expect(find.textContaining('Exception'), findsNothing);
  });

  testWidgets('guardar la operación no envía los datos del taller (secciones independientes)', (tester) async {
    final cliente = _ClienteFalso();
    await _montar(tester, cliente);

    await tester.enterText(find.byKey(const Key('campoNombreTaller')), 'Nombre sin guardar');
    await tester.enterText(find.byKey(const Key('campoMargenDias')), '20');
    await _tocarGuardarOperacion(tester);

    final cuerpo = jsonDecode(cliente.escrituras.single.body) as Map<String, dynamic>;
    expect(cuerpo.containsKey('taller'), isFalse);
  });
}

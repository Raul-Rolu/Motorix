// 008-configuracion-seguridad-reportes, T085 (bloque P2, US6; FR-016, CA-23): la
// pantalla Configuración tiene la sección «Seguridad» con los minutos de
// inactividad de la sesión (5 a 120). Muestra el valor guardado y su rango,
// valida en la interfaz, guarda SOLO el grupo `seguridad` y muestra el error del
// servidor sin trazas. Sin red: cliente HTTP falso con el formato del contrato.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:motorix_client/config/theme.dart';
import 'package:motorix_client/models/app_settings.dart';
import 'package:motorix_client/models/user.dart';
import 'package:motorix_client/providers/auth_provider.dart';
import 'package:motorix_client/providers/settings_provider.dart';
import 'package:motorix_client/screens/settings_screen.dart';
import 'package:motorix_client/services/api_client.dart';
import 'package:provider/provider.dart';

Map<String, dynamic> _ajustesJson({int minutos = 30, bool conSeguridad = true}) => {
      'taller': {'nombre': 'Motorix', 'direccion': 'Av. Taller 123', 'telefono': '555-000-0000'},
      'operacion': {'margenProximoDias': 30, 'margenProximoKm': 1000, 'diasOrdenDetenida': 3},
      if (conSeguridad) 'seguridad': {'minutosInactividad': minutos},
      'limites': {
        'margenProximoDias': [1, 365],
        'margenProximoKm': [100, 50000],
        'diasOrdenDetenida': [1, 90],
        if (conSeguridad) 'minutosInactividad': [5, 120],
      },
    };

class _ClienteFalso extends Fake implements http.Client {
  final List<http.BaseRequest> peticiones = [];
  Map<String, dynamic> guardado = _ajustesJson();
  int statusEscritura = 200;
  String mensajeError = 'Los minutos de inactividad deben ser un número entero entre 5 y 120.';

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
        final seguridad = datos['seguridad'] as Map<String, dynamic>? ?? {};
        guardado = {
          ...guardado,
          'seguridad': {...(guardado['seguridad'] as Map<String, dynamic>? ?? {}), ...seguridad},
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

Future<SettingsProvider> _montar(WidgetTester tester, _ClienteFalso cliente) async {
  final api = ApiClient(httpClient: cliente);
  final auth = AuthProvider(api)
    ..usuario = Usuario.desdeJson({
      'id': 1,
      'username': 'admin',
      'fullName': 'Administrador',
      'role': 'ADMIN',
      'active': true,
    });
  late SettingsProvider proveedor;
  await tester.binding.setSurfaceSize(const Size(1200, 1200));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: auth),
        ChangeNotifierProvider<SettingsProvider>(create: (_) => proveedor = SettingsProvider(api, auth)),
      ],
      child: MaterialApp(
        theme: temaMotorix(),
        home: const Scaffold(body: SettingsScreen()),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return proveedor;
}

String _minutos(WidgetTester tester) =>
    tester.widget<TextFormField>(find.byKey(const Key('campoMinutosInactividad'))).controller!.text;

void main() {
  testWidgets('muestra la sección «Seguridad» con el valor guardado y su rango', (tester) async {
    await _montar(tester, _ClienteFalso()..guardado = _ajustesJson(minutos: 45));

    await tester.ensureVisible(find.byKey(const Key('campoMinutosInactividad')));
    expect(find.text('Seguridad'), findsOneWidget);
    expect(_minutos(tester), '45');
    expect(find.text('Entre 5 y 120 minutos.'), findsOneWidget);
  });

  testWidgets('sin el grupo en la respuesta usa 30 minutos y el rango 5 a 120', (tester) async {
    await _montar(tester, _ClienteFalso()..guardado = _ajustesJson(conSeguridad: false));

    await tester.ensureVisible(find.byKey(const Key('campoMinutosInactividad')));
    expect(_minutos(tester), '30');
    expect(find.text('Entre 5 y 120 minutos.'), findsOneWidget);
  });

  testWidgets('guardar envía solo el grupo seguridad y muestra el mensaje de éxito', (tester) async {
    final cliente = _ClienteFalso();
    final proveedor = await _montar(tester, cliente);

    await tester.ensureVisible(find.byKey(const Key('campoMinutosInactividad')));
    await tester.enterText(find.byKey(const Key('campoMinutosInactividad')), ' 15 ');
    await tester.tap(find.byKey(const Key('botonGuardarSeguridad')));
    await tester.pumpAndSettle();

    expect(cliente.escrituras, hasLength(1));
    final cuerpo = jsonDecode(cliente.escrituras.single.body) as Map<String, dynamic>;
    expect(cuerpo, {
      'seguridad': {'minutosInactividad': 15},
    });
    expect(find.text('Ajustes de seguridad guardados.'), findsOneWidget);
    expect(proveedor.ajustes!.seguridad.minutosInactividad, 15);
  });

  testWidgets('los límites 5 y 120 se aceptan', (tester) async {
    final cliente = _ClienteFalso();
    await _montar(tester, cliente);

    for (final valor in ['5', '120']) {
      await tester.ensureVisible(find.byKey(const Key('campoMinutosInactividad')));
      await tester.enterText(find.byKey(const Key('campoMinutosInactividad')), valor);
      await tester.tap(find.byKey(const Key('botonGuardarSeguridad')));
      await tester.pumpAndSettle();
    }

    expect(cliente.escrituras, hasLength(2));
  });

  for (final invalido in ['4', '121', '0', '-5', '7.5', 'abc', '']) {
    testWidgets('el valor «$invalido» no se envía y se muestra el rango', (tester) async {
      final cliente = _ClienteFalso();
      await _montar(tester, cliente);

      await tester.ensureVisible(find.byKey(const Key('campoMinutosInactividad')));
      await tester.enterText(find.byKey(const Key('campoMinutosInactividad')), invalido);
      await tester.tap(find.byKey(const Key('botonGuardarSeguridad')));
      await tester.pumpAndSettle();

      expect(cliente.escrituras, isEmpty);
      expect(find.text('Debe ser un número entero entre 5 y 120.'), findsOneWidget);
    });
  }

  testWidgets('un rechazo del servidor muestra su mensaje sin trazas', (tester) async {
    final cliente = _ClienteFalso()..statusEscritura = 400;
    await _montar(tester, cliente);

    await tester.ensureVisible(find.byKey(const Key('campoMinutosInactividad')));
    await tester.enterText(find.byKey(const Key('campoMinutosInactividad')), '20');
    await tester.tap(find.byKey(const Key('botonGuardarSeguridad')));
    await tester.pumpAndSettle();

    expect(find.text('Los minutos de inactividad deben ser un número entero entre 5 y 120.'), findsOneWidget);
    expect(find.textContaining('Exception'), findsNothing);
  });

  test('el modelo lee el grupo seguridad y tolera su ausencia', () {
    expect(AppSettings.desdeJson(_ajustesJson(minutos: 60)).seguridad.minutosInactividad, 60);
    expect(AppSettings.desdeJson(_ajustesJson(conSeguridad: false)).seguridad.minutosInactividad, 30);
  });
}

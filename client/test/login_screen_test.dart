// T031: pruebas de la pantalla de login (US1) con `flutter test`.
//
// Valida la interfaz sin depender de red: mensajes de campos vacíos y
// renderizado del formulario con el tema propio.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:motorix_client/config/theme.dart';
import 'package:motorix_client/providers/auth_provider.dart';
import 'package:motorix_client/screens/login_screen.dart';
import 'package:motorix_client/services/api_client.dart';
import 'package:provider/provider.dart';

Widget _envolver(AuthProvider auth) {
  return ChangeNotifierProvider<AuthProvider>.value(
    value: auth,
    child: MaterialApp(
      theme: temaMotorix(),
      home: const LoginScreen(),
    ),
  );
}

void main() {
  testWidgets('el formulario de login muestra los campos y el botón', (tester) async {
    final api = ApiClient(httpClient: _ClienteFalso());
    await tester.pumpWidget(_envolver(AuthProvider(api)));

    expect(find.text('Motorix'), findsOneWidget);
    expect(find.byKey(const Key('campoIdentificacion')), findsOneWidget);
    expect(find.byKey(const Key('campoContrasena')), findsOneWidget);
    expect(find.byKey(const Key('botonIniciarSesion')), findsOneWidget);
  });

  testWidgets('con campos vacíos aparecen los mensajes de validación', (tester) async {
    final api = ApiClient(httpClient: _ClienteFalso());
    await tester.pumpWidget(_envolver(AuthProvider(api)));

    await tester.tap(find.byKey(const Key('botonIniciarSesion')));
    await tester.pumpAndSettle();

    expect(find.text('Ingrese su usuario o correo electrónico.'), findsOneWidget);
    expect(find.text('Ingrese su contraseña.'), findsOneWidget);
  });

  testWidgets('un error del servidor se muestra en la interfaz', (tester) async {
    final api = ApiClient(httpClient: _ClienteFalso());
    await tester.pumpWidget(_envolver(AuthProvider(api)));

    await tester.enterText(
        find.byKey(const Key('campoIdentificacion')), 'prueba');
    await tester.enterText(find.byKey(const Key('campoContrasena')), 'Mala99999');
    await tester.tap(find.byKey(const Key('botonIniciarSesion')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('mensajeError')), findsOneWidget);
  });
}

/// Cliente HTTP falso que responde 401 con el formato del contrato, para no
/// depender de la red en las pruebas de widget.
class _ClienteFalso extends Fake implements http.Client {
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final cuerpo = '{"error":{"codigo":"CREDENCIALES_INVALIDAS","mensaje":"Credenciales inválidas."}}';
    return http.StreamedResponse(
      Stream.value(cuerpo.codeUnits),
      401,
      headers: {'content-type': 'application/json'},
    );
  }

  @override
  void close() {}
}

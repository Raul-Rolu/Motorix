// 006-complemento-precios-compra, T009 (US1): categoría, marca y precio de
// compra en el modelo, el listado de inventario y el formulario (FR-001,
// FR-002, FR-004, FR-014, CA-1).
//
// Sin red: el cliente HTTP falso responde con el formato del contrato.
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:motorix_client/config/theme.dart';
import 'package:motorix_client/models/part.dart';
import 'package:motorix_client/models/user.dart';
import 'package:motorix_client/providers/auth_provider.dart';
import 'package:motorix_client/providers/parts_provider.dart';
import 'package:motorix_client/screens/part_form_screen.dart';
import 'package:motorix_client/screens/parts_screen.dart';
import 'package:motorix_client/services/api_client.dart';
import 'package:provider/provider.dart';

const String _listado = '''
{
  "datos": [
    {
      "id": 1, "name": "Pastillas de freno", "code": "FRN-PAS-220",
      "category": "FRENOS", "brand": "Brembo",
      "stock": 6, "minStock": 3, "salePrice": 150.0, "purchasePrice": 95.5,
      "isActive": true, "lowStock": false
    },
    {
      "id": 2, "name": "Tornillo suelto", "code": "TOR-001",
      "category": null, "brand": null,
      "stock": 20, "minStock": 5, "salePrice": 10.0, "purchasePrice": null,
      "isActive": true, "lowStock": false
    }
  ]
}
''';

/// Cliente HTTP falso: el GET devuelve el listado y el POST/PUT confirma el
/// guardado (opcionalmente con la advertencia de venta menor a compra).
class _ClienteFalso extends Fake implements http.Client {
  final String? advertencia;
  final List<http.Request> peticiones = [];

  _ClienteFalso({this.advertencia});

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final peticion = request as http.Request;
    peticiones.add(peticion);
    String cuerpo;
    int status = 200;
    if (peticion.method == 'GET') {
      cuerpo = _listado;
    } else {
      final enviado = jsonDecode(peticion.body) as Map<String, dynamic>;
      status = peticion.method == 'POST' ? 201 : 200;
      cuerpo = jsonEncode({
        'id': 9,
        'name': enviado['name'],
        'code': enviado['code'],
        'category': enviado['category'],
        'brand': enviado['brand'],
        'stock': 0,
        'minStock': 0,
        'salePrice': enviado['salePrice'],
        'purchasePrice': enviado['purchasePrice'],
        'isActive': true,
        'lowStock': false,
        if (advertencia != null) 'advertencia': advertencia,
      });
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

Widget _envolver(PartsProvider partes, AuthProvider auth, Widget pantalla) {
  return MultiProvider(
    providers: [
      ChangeNotifierProvider<PartsProvider>.value(value: partes),
      ChangeNotifierProvider<AuthProvider>.value(value: auth),
    ],
    child: MaterialApp(theme: temaMotorix(), home: Scaffold(body: pantalla)),
  );
}

void main() {
  test('desdeJson lee categoría, marca y precio de compra', () {
    final parte = Part.desdeJson(
        (jsonDecode(_listado) as Map<String, dynamic>)['datos'][0]
            as Map<String, dynamic>);

    expect(parte.category, 'FRENOS');
    expect(parte.brand, 'Brembo');
    expect(parte.purchasePrice, 95.5);
    expect(parte.nombreCategoria, 'Frenos');
  });

  test('desdeJson tolera la ausencia de los tres campos (respaldo nulo)', () {
    final parte = Part.desdeJson({
      'id': 2,
      'name': 'Tornillo suelto',
      'code': 'TOR-001',
      'stock': 1,
      'minStock': 0,
    });

    expect(parte.category, isNull);
    expect(parte.brand, isNull);
    expect(parte.purchasePrice, isNull);
    expect(parte.nombreCategoria, '');
  });

  test('el catálogo de categorías coincide con la lista fija del servidor', () {
    expect(kCategoriasRefaccion.keys, [
      'FRENOS',
      'MOTOR',
      'SUSPENSION',
      'ELECTRICO',
      'TRANSMISION',
      'CLIMA',
      'NEUMATICOS',
      'LUBRICANTES',
      'OTRO',
    ]);
    expect(kCategoriasRefaccion['SUSPENSION'], 'Suspensión');
    expect(kCategoriasRefaccion['ELECTRICO'], 'Eléctrico');
    expect(kCategoriasRefaccion['NEUMATICOS'], 'Neumáticos');
  });

  testWidgets(
      'el listado muestra categoría y marca de cada refacción, vacías con guion (FR-014)',
      (tester) async {
    final api = ApiClient(httpClient: _ClienteFalso());
    final partes = PartsProvider(api);

    await tester.pumpWidget(
        _envolver(partes, _authComo('ADMIN', api), const PartsScreen()));
    await tester.pumpAndSettle();

    expect(find.text('Categoría: Frenos · Marca: Brembo'), findsOneWidget);
    // La refacción sin datos opcionales sigue en el listado, con el campo vacío.
    expect(find.text('Tornillo suelto'), findsOneWidget);
    expect(find.text('Categoría: — · Marca: —'), findsOneWidget);
  });

  testWidgets(
      'el formulario ofrece categoría, marca y precio de compra al administrador (CA-1)',
      (tester) async {
    final falso = _ClienteFalso();
    final api = ApiClient(httpClient: falso);
    final partes = PartsProvider(api);

    await tester.pumpWidget(_envolver(
        partes, _authComo('ADMIN', api), const PartFormScreen()));

    expect(find.byKey(const Key('campoCategoria')), findsOneWidget);
    expect(find.byKey(const Key('campoMarca')), findsOneWidget);
    expect(find.byKey(const Key('campoPrecioCompra')), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextFormField, 'Nombre *'),
        'Pastillas de freno');
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Código *'), 'FRN-PAS-220');
    await tester.enterText(find.byKey(const Key('campoMarca')), 'Brembo');
    await tester.enterText(
        find.byKey(const Key('campoPrecioCompra')), '95.50');
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Precio de venta'), '150');

    await tester.tap(find.byKey(const Key('campoCategoria')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Frenos').last);
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Guardar refacción'));
    await tester.tap(find.text('Guardar refacción'));
    await tester.pumpAndSettle();

    final envio =
        falso.peticiones.firstWhere((p) => p.method == 'POST');
    final cuerpo = jsonDecode(envio.body) as Map<String, dynamic>;
    expect(cuerpo['category'], 'FRENOS');
    expect(cuerpo['brand'], 'Brembo');
    expect(cuerpo['purchasePrice'], 95.5);
    expect(cuerpo['salePrice'], 150.0);
  });

  testWidgets(
      'una marca de más de 50 caracteres se rechaza en el formulario (CA-1)',
      (tester) async {
    final falso = _ClienteFalso();
    final api = ApiClient(httpClient: falso);

    await tester.pumpWidget(_envolver(PartsProvider(api),
        _authComo('ADMIN', api), const PartFormScreen()));

    final campo = tester.widget<TextFormField>(find.byKey(const Key('campoMarca')));
    expect(campo.controller, isNotNull);
    // El campo limita la captura a 50 caracteres (maxLength).
    await tester.enterText(find.byKey(const Key('campoMarca')), 'B' * 60);
    expect(campo.controller!.text.length, lessThanOrEqualTo(50));
  });

  testWidgets(
      'al guardar con venta menor a compra se muestra la advertencia sin impedir el guardado (FR-004)',
      (tester) async {
    final falso = _ClienteFalso(
        advertencia: 'El precio de venta es menor al precio de compra.');
    final api = ApiClient(httpClient: falso);

    // Como en la app: el formulario se abre encima del inventario, que es
    // quien muestra el aviso al cerrarse el formulario.
    await tester.pumpWidget(_envolver(
      PartsProvider(api),
      _authComo('ADMIN', api),
      Builder(
        builder: (contexto) => TextButton(
          onPressed: () => Navigator.of(contexto).push(
            MaterialPageRoute(builder: (_) => const PartFormScreen()),
          ),
          child: const Text('Abrir formulario'),
        ),
      ),
    ));
    await tester.tap(find.text('Abrir formulario'));
    await tester.pumpAndSettle();

    await tester.enterText(
        find.widgetWithText(TextFormField, 'Nombre *'), 'Filtro');
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Código *'), 'FLT-1');
    await tester.enterText(find.byKey(const Key('campoPrecioCompra')), '95.5');
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Precio de venta'), '80');
    await tester.ensureVisible(find.text('Guardar refacción'));
    await tester.tap(find.text('Guardar refacción'));
    // Sin pumpAndSettle: el aviso (SnackBar) desaparece solo a los 4 s.
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }

    expect(falso.peticiones.where((p) => p.method == 'POST').length, 1);
    expect(find.text('El precio de venta es menor al precio de compra.'),
        findsOneWidget);
  });

  testWidgets(
      'sin ser administrador el formulario no muestra el precio de compra',
      (tester) async {
    final api = ApiClient(httpClient: _ClienteFalso());

    await tester.pumpWidget(_envolver(PartsProvider(api),
        _authComo('RECEPTIONIST', api), const PartFormScreen()));

    expect(find.byKey(const Key('campoPrecioCompra')), findsNothing);
    // Categoría y marca sí se muestran: no son datos financieros.
    expect(find.byKey(const Key('campoCategoria')), findsOneWidget);
    expect(find.byKey(const Key('campoMarca')), findsOneWidget);
  });

  // 006, T027 (US3, CA-3): el precio de compra solo se muestra al
  // administrador. El cliente falso devuelve `purchasePrice` aunque el rol no
  // sea ADMIN para comprobar que la interfaz tampoco lo muestra (la
  // protección real es la del backend, que ni siquiera lo envía).
  testWidgets('el listado muestra el precio de compra al administrador (CA-3)',
      (tester) async {
    final api = ApiClient(httpClient: _ClienteFalso());

    await tester.pumpWidget(_envolver(
        PartsProvider(api), _authComo('ADMIN', api), const PartsScreen()));
    await tester.pumpAndSettle();

    expect(find.text('Compra: \$95.50'), findsOneWidget);
    // Pendiente de captura: se avisa solo a quien puede capturarlo.
    expect(find.text('Compra: pendiente'), findsOneWidget);
  });

  for (final rol in ['RECEPTIONIST', 'MECHANIC']) {
    testWidgets('el listado no muestra el precio de compra con rol $rol (CA-3)',
        (tester) async {
      final api = ApiClient(httpClient: _ClienteFalso());

      await tester.pumpWidget(_envolver(
          PartsProvider(api), _authComo(rol, api), const PartsScreen()));
      await tester.pumpAndSettle();

      expect(find.text('Pastillas de freno'), findsOneWidget);
      expect(find.textContaining('Compra'), findsNothing);
      expect(find.textContaining('95.50'), findsNothing);
    });

    testWidgets(
        'el formulario de edición con rol $rol no muestra ni precarga el precio de compra (CA-3)',
        (tester) async {
      final api = ApiClient(httpClient: _ClienteFalso());
      const parte = Part(
        id: 1,
        name: 'Pastillas de freno',
        code: 'FRN-PAS-220',
        purchasePrice: 95.5,
      );

      await tester.pumpWidget(_envolver(PartsProvider(api),
          _authComo(rol, api), const PartFormScreen(parte: parte)));

      expect(find.byKey(const Key('campoPrecioCompra')), findsNothing);
      expect(find.text('95.50'), findsNothing);
    });
  }
}

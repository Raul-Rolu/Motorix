// Utilidades de prueba del centro de notificaciones (007, US1): cliente HTTP
// falso con respuestas por usuario, constructores de JSON del contrato y un
// entorno que monta la campana y el panel con los proveedores reales.
import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:motorix_client/config/theme.dart';
import 'package:motorix_client/providers/auth_provider.dart';
import 'package:motorix_client/providers/notifications_provider.dart';
import 'package:motorix_client/services/api_client.dart';
import 'package:motorix_client/widgets/notification_bell.dart';
import 'package:motorix_client/widgets/notifications_panel.dart';
import 'package:provider/provider.dart';

/// Aviso en el formato de `GET /api/notifications` (contracts/api-rest.md).
Map<String, dynamic> avisoJson({
  required String clave,
  String grupo = 'MANTENIMIENTO_VENCIDO',
  String estado = 'VENCIDO',
  String titulo = 'Mantenimiento vencido',
  String detalle = 'Cambio de aceite · GHI-789-C · vencido hace 10 día(s)',
  bool leido = false,
  String pantalla = 'VEHICULO',
  int? id = 3,
}) =>
    {
      'clave': clave,
      'grupo': grupo,
      'estado': estado,
      'titulo': titulo,
      'detalle': detalle,
      'leido': leido,
      'destino': {'pantalla': pantalla, 'id': id},
    };

/// Respuesta completa del servidor: `total` = avisos y `noLeidos` = sin leer.
Map<String, dynamic> resumenJson(List<Map<String, dynamic>> avisos, {int? noLeidos}) => {
      'total': avisos.length,
      'noLeidos': noLeidos ?? avisos.where((a) => a['leido'] != true).length,
      'datos': avisos,
    };

Map<String, dynamic> usuarioJson(int id, String rol, String username) => {
      'id': id,
      'username': username,
      'email': '$username@motorix.local',
      'fullName': 'Usuario $username',
      'role': rol,
      'active': true,
    };

/// Cliente HTTP falso: atiende el login y `GET /notifications`.
///
/// - El login devuelve el usuario cuyo `username` coincide con `identificacion`
///   (`admin` = ADMIN id 1, `mecanico` = MECHANIC id 3) y el token `t-<id>`.
/// - `GET /notifications` responde `resumenPorToken[token]` (o vacío), con el
///   estado `statusAvisos`, y espera a `puerta` si está definida (para simular
///   una respuesta que aún no llega).
class ClienteAvisosFalso extends Fake implements http.Client {
  final List<http.BaseRequest> peticiones = [];
  final Map<String, Map<String, dynamic>> resumenPorToken = {};
  final Map<String, Map<String, dynamic>> usuarios = {
    'admin': usuarioJson(1, 'ADMIN', 'admin'),
    'mecanico': usuarioJson(3, 'MECHANIC', 'mecanico'),
  };

  int statusAvisos = 200;
  Completer<void>? puerta;

  int get consultasAvisos => peticiones
      .where((p) => p.method == 'GET' && p.url.path.endsWith('/notifications'))
      .length;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    peticiones.add(request);
    final ruta = request.url.path;
    Map<String, dynamic> cuerpo;
    var status = 200;

    if (request.method == 'POST' && ruta.endsWith('/auth/login')) {
      final datos = jsonDecode((request as http.Request).body) as Map<String, dynamic>;
      final usuario = usuarios[datos['identificacion']];
      if (usuario == null) {
        cuerpo = {'error': {'codigo': 'CREDENCIALES_INVALIDAS', 'mensaje': 'Credenciales inválidas.'}};
        status = 401;
      } else {
        cuerpo = {'token': 't-${usuario['id']}', 'usuario': usuario};
      }
    } else if (request.method == 'GET' && ruta.endsWith('/notifications')) {
      final espera = puerta;
      if (espera != null) {
        await espera.future;
      }
      final token = (request.headers['Authorization'] ?? '').replaceFirst('Bearer ', '');
      status = statusAvisos;
      if (status == 200) {
        cuerpo = resumenPorToken[token] ?? resumenJson([]);
      } else if (status == 401) {
        cuerpo = {'error': {'codigo': 'SESION_EXPIRADA', 'mensaje': 'La sesión ha expirado; inicie sesión de nuevo.'}};
      } else {
        cuerpo = {'error': {'codigo': 'ERROR_INTERNO', 'mensaje': 'Error del servidor.'}};
      }
    } else {
      cuerpo = {};
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

/// Proveedores reales montados con el cliente falso.
class EntornoAvisos {
  final ClienteAvisosFalso cliente;
  late final ApiClient api;
  late final AuthProvider auth;
  late final NotificationsProvider proveedor;

  EntornoAvisos(this.cliente);
}

/// Deja que se resuelvan las respuestas pendientes del cliente falso.
Future<void> asentar(WidgetTester tester) async {
  await tester.pump();
  await tester.pump();
}

/// Monta la campana y el panel (como en el `AppShell`).
///
/// Si `iniciarSesionComo` no es null se inicia sesión con ese usuario ANTES de
/// crear el proveedor (como cuando el usuario ya entró al abrir el shell).
/// Con `crearProveedorAntesDelLogin` el proveedor existe antes de iniciar sesión.
Future<EntornoAvisos> montarAvisos(
  WidgetTester tester,
  ClienteAvisosFalso cliente, {
  String? iniciarSesionComo = 'admin',
  bool crearProveedorAntesDelLogin = false,
  Duration intervalo = const Duration(seconds: 60),
}) async {
  final entorno = EntornoAvisos(cliente);
  entorno.api = ApiClient(httpClient: cliente);
  entorno.auth = AuthProvider(entorno.api);

  Future<void> iniciar() async {
    if (iniciarSesionComo == null) return;
    final login = entorno.auth.login(iniciarSesionComo, 'Usuario123');
    await asentar(tester);
    await login;
  }

  if (crearProveedorAntesDelLogin) {
    entorno.proveedor = NotificationsProvider(entorno.api, entorno.auth, intervalo: intervalo);
    await iniciar();
  } else {
    await iniciar();
    entorno.proveedor = NotificationsProvider(entorno.api, entorno.auth, intervalo: intervalo);
  }

  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: entorno.auth),
        // Con `create` el árbol libera el proveedor (y su temporizador) al desmontarse.
        ChangeNotifierProvider<NotificationsProvider>(
          lazy: false,
          create: (_) => entorno.proveedor,
        ),
      ],
      child: MaterialApp(
        theme: temaMotorix(),
        home: Scaffold(
          appBar: AppBar(title: const Text('Prueba'), actions: const [CampanaAvisos()]),
          endDrawer: const PanelAvisos(),
          body: const SizedBox.shrink(),
        ),
      ),
    ),
  );
  await asentar(tester);
  return entorno;
}

/// Prueba de widget que libera el proveedor al terminar (cancela su temporizador).
void probarAvisos(
  String descripcion,
  Future<void> Function(WidgetTester tester) cuerpo,
) {
  testWidgets(descripcion, (tester) async {
    await cuerpo(tester);
    // Se desmonta el árbol: los temporizadores se cancelan en `dispose`.
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

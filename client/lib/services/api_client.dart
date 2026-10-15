/// Cliente HTTP contra la API REST del backend (T016, research D13).
///
/// Adjunta el token de sesión en `Authorization` y notifica al cerrar la
/// sesión cuando el servidor responde 401 (token expirado o usuario
/// desactivado), para que el AuthProvider redirija al login.
library;

import 'dart:convert';

import 'package:http/http.dart' as http;

/// URL base de la API; configurable en tiempo de compilación con
/// `--dart-define=API_BASE_URL=http://otro-host:3000/api`.
const String kBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://localhost:3000/api',
);

/// Error de la API con el formato centralizado del contrato.
class ExcepcionApi implements Exception {
  final int status;
  final String codigo;
  final String mensaje;

  const ExcepcionApi(this.status, this.codigo, this.mensaje);

  @override
  String toString() => mensaje;
}

class ApiClient {
  final String baseUrl;
  final http.Client _http;

  String? token;

  /// Se invoca cuando el servidor responde 401 (sesión expirada).
  void Function()? onSesionExpirada;

  ApiClient({this.baseUrl = kBaseUrl, http.Client? httpClient})
      : _http = httpClient ?? http.Client();

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<Map<String, dynamic>> get(String path) =>
      _enviar('GET', path, cuerpo: null);

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> cuerpo) =>
      _enviar('POST', path, cuerpo: cuerpo);

  Future<Map<String, dynamic>> put(String path, Map<String, dynamic> cuerpo) =>
      _enviar('PUT', path, cuerpo: cuerpo);

  Future<Map<String, dynamic>> patch(String path, Map<String, dynamic> cuerpo) =>
      _enviar('PATCH', path, cuerpo: cuerpo);

  Future<Map<String, dynamic>> delete(String path) =>
      _enviar('DELETE', path, cuerpo: null);

  Future<Map<String, dynamic>> _enviar(
    String metodo,
    String path, {
    required Map<String, dynamic>? cuerpo,
  }) async {
    final uri = Uri.parse('$baseUrl$path');
    final peticion = http.Request(metodo, uri);
    peticion.headers.addAll(_headers);
    if (cuerpo != null) {
      peticion.body = jsonEncode(cuerpo);
    }

    final http.StreamedResponse respuesta = await _http.send(peticion);
    final texto = await respuesta.stream.bytesToString();

    Map<String, dynamic> json = {};
    if (texto.isNotEmpty) {
      try {
        json = jsonDecode(texto) as Map<String, dynamic>;
      } on FormatException {
        json = {};
      }
    }

    if (respuesta.statusCode >= 200 && respuesta.statusCode < 300) {
      return json;
    }

    // Sesión inválita o expirada: se limpia la sesión en la interfaz.
    if (respuesta.statusCode == 401) {
      onSesionExpirada?.call();
    }

    final error = json['error'] as Map<String, dynamic>?;
    throw ExcepcionApi(
      respuesta.statusCode,
      error?['codigo'] as String? ?? 'ERROR',
      error?['mensaje'] as String? ?? 'No se pudo completar la operación.',
    );
  }

  void cerrar() => _http.close();
}

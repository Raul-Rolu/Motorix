/// Cliente HTTP contra la API REST del backend (T016, research D13).
///
/// Adjunta el token de sesión en `Authorization` y notifica al cerrar la
/// sesión cuando el servidor responde 401 (token expirado o usuario
/// desactivado), para que el AuthProvider redirija al login. Con
/// `403 TERMS_NOT_ACCEPTED` avisa para llevar al usuario a la pantalla de
/// aceptación de términos (008).
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

/// Un archivo descargado del servidor (por ejemplo, un CSV de reportes). Se conservan
/// los BYTES: al decodificarlos a texto Dart descarta el BOM de UTF-8, y Excel lo
/// necesita para leer bien los acentos.
class RespuestaArchivo {
  final List<int> bytes;

  /// Cabecera `Content-Disposition` tal cual la envió el servidor (puede ser nula).
  final String? contentDisposition;

  const RespuestaArchivo(this.bytes, this.contentDisposition);
}

class ApiClient {
  final String baseUrl;
  final http.Client _http;

  String? token;

  /// Se invoca cuando el servidor responde 401 (sesión expirada).
  void Function()? onSesionExpirada;

  /// Se invoca cuando el servidor responde `403 TERMS_NOT_ACCEPTED` (008, FR-021):
  /// el usuario debe aceptar la versión vigente de los términos y condiciones.
  void Function()? onTerminosPendientes;

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
    final json = _leerJson(texto);

    if (respuesta.statusCode >= 200 && respuesta.statusCode < 300) {
      return json;
    }
    _lanzarError(respuesta.statusCode, json);
  }

  /// Descarga un archivo (GET) y devuelve sus bytes y la cabecera de nombre. Los
  /// errores se tratan igual que en las demás peticiones (401 cierra la sesión y
  /// `403 TERMS_NOT_ACCEPTED` lleva a la pantalla de términos).
  Future<RespuestaArchivo> descargar(String path) async {
    final peticion = http.Request('GET', Uri.parse('$baseUrl$path'));
    peticion.headers.addAll(_headers);

    final http.StreamedResponse respuesta = await _http.send(peticion);
    final bytes = await respuesta.stream.toBytes();

    if (respuesta.statusCode >= 200 && respuesta.statusCode < 300) {
      return RespuestaArchivo(bytes, respuesta.headers['content-disposition']);
    }
    _lanzarError(respuesta.statusCode, _leerJson(utf8.decode(bytes, allowMalformed: true)));
  }

  /// JSON de una respuesta (vacío si no hay cuerpo o no es JSON).
  Map<String, dynamic> _leerJson(String texto) {
    if (texto.isEmpty) return {};
    try {
      return jsonDecode(texto) as Map<String, dynamic>;
    } on FormatException {
      return {};
    }
  }

  /// Avisa de los casos con efecto global (401 y términos pendientes) y lanza el error de la API.
  Never _lanzarError(int status, Map<String, dynamic> json) {
    // Sesión inválida o expirada: se limpia la sesión en la interfaz.
    if (status == 401) {
      onSesionExpirada?.call();
    }

    final error = json['error'] as Map<String, dynamic>?;
    final codigo = error?['codigo'] as String? ?? 'ERROR';

    // Compuerta de términos: falta aceptar la versión vigente.
    if (status == 403 && codigo == 'TERMS_NOT_ACCEPTED') {
      onTerminosPendientes?.call();
    }

    throw ExcepcionApi(
      status,
      codigo,
      error?['mensaje'] as String? ?? 'No se pudo completar la operación.',
    );
  }

  void cerrar() => _http.close();
}

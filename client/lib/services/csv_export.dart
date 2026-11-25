/// Guardado de los archivos CSV de los reportes (008-configuracion-seguridad-
/// reportes, T140; FR-027, CA-9). Solo `dart:io` (sin dependencias nuevas), igual que
/// la impresión del ticket (`ticket_print.dart`), pero el CSV se guarda en la carpeta
/// Descargas del usuario y no en la carpeta temporal.
library;

import 'dart:io';

/// Guarda un archivo y devuelve su ruta (se inyecta en el proveedor para las pruebas).
typedef GuardarArchivo = Future<String> Function(String nombre, List<int> contenido);

final RegExp _caracteresInvalidos = RegExp(r'[^A-Za-z0-9._-]');
final RegExp _nombreEnCabecera = RegExp(r'filename\*?=\s*(?:"([^"]*)"|([^;]+))', caseSensitive: false);

/// Nombre de archivo seguro a partir de la cabecera `Content-Disposition` del
/// servidor: solo el último tramo de la ruta, solo letras, números, punto, guion y
/// guion bajo, sin `..` ni puntos iniciales y terminado en `.csv`. Si no queda nada
/// útil se usa [respaldo].
String sanearNombreCsv(String? contentDisposition, String respaldo) {
  var nombre = '';
  final coincidencia = contentDisposition == null ? null : _nombreEnCabecera.firstMatch(contentDisposition);
  if (coincidencia != null) {
    nombre = (coincidencia.group(1) ?? coincidencia.group(2) ?? '').trim();
  }
  nombre = nombre.split(RegExp(r'[\\/]')).last.replaceAll(_caracteresInvalidos, '_');
  while (nombre.contains('..')) {
    nombre = nombre.replaceAll('..', '.');
  }
  nombre = nombre.replaceFirst(RegExp(r'^[._]+'), '');
  if (nombre.isEmpty) return respaldo;
  return nombre.toLowerCase().endsWith('.csv') ? nombre : '$nombre.csv';
}

/// Carpeta Descargas del usuario (o la carpeta temporal si no existe).
Directory _carpetaDeDescargas() {
  final inicio = Platform.isWindows ? Platform.environment['USERPROFILE'] : Platform.environment['HOME'];
  if (inicio != null) {
    final descargas = Directory('$inicio${Platform.pathSeparator}Downloads');
    if (descargas.existsSync()) return descargas;
  }
  return Directory.systemTemp;
}

/// Guarda los bytes tal cual (el BOM incluido) en Descargas sin pisar un archivo
/// existente: si ya hay uno con ese nombre agrega ` (1)`, ` (2)`… Devuelve la ruta.
Future<String> guardarCsvEnDescargas(String nombre, List<int> contenido) async {
  final carpeta = _carpetaDeDescargas();
  final base = nombre.toLowerCase().endsWith('.csv') ? nombre.substring(0, nombre.length - 4) : nombre;
  var archivo = File('${carpeta.path}${Platform.pathSeparator}$base.csv');
  var numero = 1;
  while (await archivo.exists()) {
    archivo = File('${carpeta.path}${Platform.pathSeparator}$base ($numero).csv');
    numero += 1;
  }
  await archivo.writeAsBytes(contenido, flush: true);
  return archivo.path;
}

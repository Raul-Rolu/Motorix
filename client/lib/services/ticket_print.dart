/// Generación e impresión del ticket de servicio (Sprint 4, US3; research D5).
///
/// El ticket se serializa como un documento HTML autocontenido, se escribe en
/// un archivo temporal y se abre con el programa predeterminado del sistema:
/// desde ahí el usuario usa el diálogo de impresión nativo. Sin librerías
/// nuevas (research D5): solo `dart:io`.
library;

import 'dart:io';

import '../models/ticket.dart';

/// Moneda legible para los importes del ticket ($ 1,234.50).
String formatearMoneda(double valor) => '\$${valor.toStringAsFixed(2)}';

/// Construye el HTML autocontenido del ticket (función pura, testeable).
String construirHtmlTicket(TicketServicio ticket) {
  final servicios = ticket.servicios
      .map((servicio) =>
          '<tr><td>${_escapar(servicio.nombre)}</td>'
          '<td class="num">${formatearMoneda(servicio.precio)}</td></tr>')
      .join('\n');
  final refacciones = ticket.refacciones.isEmpty
      ? '<tr><td colspan="2">Sin refacciones registradas.</td></tr>'
      : ticket.refacciones
          .map((refaccion) =>
              '<tr><td>${_escapar(refaccion.nombre)} '
              '(${_escapar(refaccion.codigo)})</td>'
              '<td class="num">x${refaccion.cantidad}</td></tr>')
          .join('\n');
  final pagos = ticket.metodosDePago.isEmpty
      ? '<tr><td colspan="2">Sin pagos registrados.</td></tr>'
      : ticket.metodosDePago
          .map((pago) =>
              '<tr><td>${_escapar(pago.nombreMetodo)}</td>'
              '<td class="num">${formatearMoneda(pago.monto)}</td></tr>')
          .join('\n');

  return '''
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Ticket ${_escapar(ticket.folio)} — Motorix</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; margin: 24px auto; max-width: 640px; }
  h1 { font-size: 20px; margin: 0; }
  h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td, th { padding: 4px 6px; text-align: left; }
  .num { text-align: right; white-space: nowrap; }
  .totales td { font-weight: 600; }
  .encabezado { display: flex; justify-content: space-between; align-items: baseline; }
  .folio { font-weight: 700; }
  .metodo { color: #6b7280; font-size: 12px; }
</style>
</head>
<body>
  <div class="encabezado">
    <div>
      <h1>${_escapar(ticket.tallerNombre)}</h1>
      <div class="metodo">${_escapar(ticket.tallerDireccion)} · ${_escapar(ticket.tallerTelefono)}</div>
    </div>
    <div class="folio">${_escapar(ticket.folio)}</div>
  </div>

  <h2>Cliente y vehículo</h2>
  <table>
    <tr><td>Cliente</td><td class="num">${_escapar(ticket.clienteNombre)}</td></tr>
    <tr><td>Vehículo</td><td class="num">${_escapar(ticket.vehiculoDescripcion)} · ${_escapar(ticket.placas)}</td></tr>
    <tr><td>Kilometraje registrado</td><td class="num">${ticket.kilometraje} km</td></tr>
    <tr><td>Fecha</td><td class="num">${_escapar(ticket.fecha)}</td></tr>
  </table>

  <h2>Servicios</h2>
  <table>
$servicios
  </table>

  <h2>Refacciones</h2>
  <table>
$refacciones
  </table>

  <h2>Mano de obra y totales</h2>
  <table class="totales">
    <tr><td>Mano de obra</td><td class="num">${formatearMoneda(ticket.manoObra)}</td></tr>
    <tr><td>Subtotal</td><td class="num">${formatearMoneda(ticket.subtotal)}</td></tr>
    <tr><td>Total</td><td class="num">${formatearMoneda(ticket.total)}</td></tr>
  </table>

  <h2>Pago — ${_escapar(ticket.nombreEstadoPago)}</h2>
  <table>
$pagos
    <tr><td>Saldo pendiente</td><td class="num">${formatearMoneda(ticket.saldoPendiente)}</td></tr>
  </table>

  <p class="metodo">Gracias por su confianza en ${_escapar(ticket.tallerNombre)}.</p>
</body>
</html>
''';
}

/// Escribe el ticket en un archivo temporal y lo abre para imprimir (D5).
Future<File> abrirParaImprimir(TicketServicio ticket) async {
  final html = construirHtmlTicket(ticket);
  final nombre = 'ticket_${ticket.folio}.html';
  final archivo = File(
      '${Directory.systemTemp.path}${Platform.pathSeparator}$nombre');
  await archivo.writeAsString(html, flush: true);

  // Abre el documento con el programa predeterminado del sistema; desde ahí
  // se usa el diálogo de impresión nativo (sin librerías nuevas).
  if (Platform.isWindows) {
    await Process.run('cmd', ['/c', 'start', '', archivo.path]);
  } else if (Platform.isMacOS) {
    await Process.run('open', [archivo.path]);
  } else {
    await Process.run('xdg-open', [archivo.path]);
  }
  return archivo;
}

/// Escapa el texto para insertarlo sin romper el HTML.
String _escapar(String texto) => texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

/// Versión en texto plano del ticket para compartirla dentro de la app
/// (T039: acción de compartir por portapapeles; FR-018 prohíbe servicios
/// externos y archivos descargables).
String construirTextoTicket(TicketServicio ticket) {
  final buffer = StringBuffer()
    ..writeln('Ticket ${ticket.folio} — ${ticket.tallerNombre}')
    ..writeln('${ticket.tallerDireccion} · ${ticket.tallerTelefono}')
    ..writeln('Cliente: ${ticket.clienteNombre}')
    ..writeln(
        'Vehículo: ${ticket.vehiculoDescripcion} · ${ticket.placas} · ${ticket.kilometraje} km')
    ..writeln('Fecha: ${ticket.fecha}')
    ..writeln('Servicios:');
  for (final servicio in ticket.servicios) {
    buffer.writeln('  - ${servicio.nombre}: ${formatearMoneda(servicio.precio)}');
  }
  if (ticket.refacciones.isNotEmpty) {
    buffer.writeln('Refacciones:');
    for (final refaccion in ticket.refacciones) {
      buffer.writeln(
          '  - ${refaccion.nombre} (${refaccion.codigo}) x${refaccion.cantidad}');
    }
  }
  buffer
    ..writeln('Mano de obra: ${formatearMoneda(ticket.manoObra)}')
    ..writeln('Total: ${formatearMoneda(ticket.total)}')
    ..writeln('Pago: ${ticket.nombreEstadoPago}');
  for (final pago in ticket.metodosDePago) {
    buffer.writeln('  - ${pago.nombreMetodo}: ${formatearMoneda(pago.monto)}');
  }
  buffer.write('Saldo pendiente: ${formatearMoneda(ticket.saldoPendiente)}');
  return buffer.toString();
}

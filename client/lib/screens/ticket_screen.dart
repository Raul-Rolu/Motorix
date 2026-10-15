/// Vista del ticket de servicio (Sprint 4, US3; FR-011 a FR-013).
///
/// Muestra el contenido vivo del ticket (folio único por orden, CA-4) y
/// permite imprimirlo: el documento se genera como HTML temporal y se abre
/// con el diálogo de impresión del sistema (research D5, sin librerías nuevas).
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/ticket.dart';
import '../providers/ticket_provider.dart';
import '../services/ticket_print.dart';

class TicketScreen extends StatefulWidget {
  final int orderId;

  const TicketScreen({super.key, required this.orderId});

  @override
  State<TicketScreen> createState() => _TicketScreenState();
}

class _TicketScreenState extends State<TicketScreen> {
  bool _imprimiendo = false;

  @override
  void initState() {
    super.initState();
    // El servidor emite el ticket si aún no existe (folio reutilizable).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<TicketsProvider>().cargar(widget.orderId);
    });
  }

  /// Genera el HTML temporal y abre el diálogo de impresión del sistema (D5).
  Future<void> _imprimir() async {
    final ticket = context.read<TicketsProvider>().ticket;
    if (ticket == null) return;

    setState(() => _imprimiendo = true);
    try {
      await abrirParaImprimir(ticket);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
              'Ticket ${ticket.folio} abierto; use el diálogo de impresión para imprimirlo.'),
          backgroundColor: MotorixColores.exito,
        ),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No se pudo abrir el ticket para imprimir.'),
          backgroundColor: MotorixColores.error,
        ),
      );
    } finally {
      if (mounted) {
        setState(() => _imprimiendo = false);
      }
    }
  }

  /// Comparte el ticket dentro de la app: lo copia como texto al portapapeles
  /// (T039; FR-018 prohíbe servicios externos y archivos descargables).
  Future<void> _copiar() async {
    final ticket = context.read<TicketsProvider>().ticket;
    if (ticket == null) return;

    await Clipboard.setData(ClipboardData(text: construirTextoTicket(ticket)));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Ticket ${ticket.folio} copiado al portapapeles.'),
        backgroundColor: MotorixColores.exito,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<TicketsProvider>();
    final ticket = provider.ticket;

    return Scaffold(
      appBar: AppBar(
        title: Text(ticket == null ? 'Ticket' : 'Ticket ${ticket.folio}'),
        actions: [
          if (ticket != null)
            IconButton(
              key: const Key('botonCopiarTicket'),
              icon: const Icon(Icons.copy_outlined),
              tooltip: 'Copiar ticket',
              onPressed: _imprimiendo ? null : _copiar,
            ),
          if (ticket != null)
            IconButton(
              key: const Key('botonImprimirTicket'),
              icon: _imprimiendo
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.print_outlined),
              tooltip: 'Imprimir ticket',
              onPressed: _imprimiendo ? null : _imprimir,
            ),
        ],
      ),
      body: _contenido(provider, ticket),
    );
  }

  Widget _contenido(TicketsProvider provider, TicketServicio? ticket) {
    if (provider.cargando && ticket == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (ticket == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          child: Text(
            provider.error ?? 'No se pudo cargar el ticket.',
            style: const TextStyle(color: MotorixColores.error),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(MotorixEspaciados.m),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(MotorixEspaciados.m),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        ticket.tallerNombre,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      Text(
                        ticket.folio,
                        key: const Key('folioTicket'),
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          color: MotorixColores.acento,
                        ),
                      ),
                    ],
                  ),
                  Text(
                    '${ticket.tallerDireccion} · ${ticket.tallerTelefono}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: MotorixColores.textoSecundario,
                    ),
                  ),
                  const Divider(),
                  _fila('Cliente', ticket.clienteNombre),
                  _fila('Vehículo',
                      '${ticket.vehiculoDescripcion} · ${ticket.placas}'),
                  _fila('Kilometraje registrado',
                      '${ticket.kilometraje} km'),
                  _fila('Fecha', ticket.fecha),
                ],
              ),
            ),
          ),
          const SizedBox(height: MotorixEspaciados.m),
          _seccionPartidas('Servicios', ticket.servicios),
          if (ticket.refacciones.isNotEmpty) ...[
            const SizedBox(height: MotorixEspaciados.m),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(MotorixEspaciados.m),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Refacciones',
                        style: Theme.of(context).textTheme.titleMedium),
                    for (final refaccion in ticket.refacciones)
                      ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.inventory_2_outlined,
                            size: 18, color: MotorixColores.textoSecundario),
                        title: Text(
                            '${refaccion.nombre} (${refaccion.codigo})'),
                        trailing: Text('x${refaccion.cantidad}'),
                      ),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: MotorixEspaciados.m),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(MotorixEspaciados.m),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _fila('Mano de obra', formatearMoneda(ticket.manoObra)),
                  _fila('Subtotal', formatearMoneda(ticket.subtotal)),
                  _fila('Total', formatearMoneda(ticket.total),
                      enfatizado: true),
                  const Divider(),
                  Text(
                    'Pago — ${ticket.nombreEstadoPago}',
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      color: ticket.estadoPago == 'LIQUIDADA'
                          ? MotorixColores.exito
                          : MotorixColores.textoSecundario,
                    ),
                  ),
                  if (ticket.metodosDePago.isEmpty)
                    const Padding(
                      padding:
                          EdgeInsets.symmetric(vertical: MotorixEspaciados.xs),
                      child: Text('Sin pagos registrados.'),
                    )
                  else
                    for (final pago in ticket.metodosDePago)
                      _fila(
                          '${pago.nombreMetodo} (${pago.estado})',
                          formatearMoneda(pago.monto)),
                  _fila('Saldo pendiente',
                      formatearMoneda(ticket.saldoPendiente)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _seccionPartidas(String titulo, List<TicketPartida> partidas) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(MotorixEspaciados.m),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(titulo, style: Theme.of(context).textTheme.titleMedium),
            if (partidas.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: MotorixEspaciados.xs),
                child: Text('Sin partidas registradas.'),
              )
            else
              for (final partida in partidas)
                _fila(partida.nombre, formatearMoneda(partida.precio)),
          ],
        ),
      ),
    );
  }

  Widget _fila(String etiqueta, String valor, {bool enfatizado = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Text(
              etiqueta,
              style: TextStyle(
                color: enfatizado ? null : MotorixColores.textoSecundario,
              ),
            ),
          ),
          Text(
            valor,
            style: TextStyle(
              fontWeight: enfatizado ? FontWeight.w700 : FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

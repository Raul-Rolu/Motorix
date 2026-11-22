/// Detalle de la orden de servicio (T022/T054, US3/US4; FR-015; Sprint 3:
/// US7 amplía con las refacciones usadas, FR-011/FR-012).
///
/// Muestra cliente, vehículo, mecánico, kilometraje, el historial fechado de
/// entradas, las partidas de servicios y mano de obra, las refacciones
/// utilizadas con salida/devolución de inventario y los totales informativos.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/order_part.dart';
import '../models/service_order.dart';
import '../providers/auth_provider.dart';
import '../providers/orders_provider.dart';
import '../providers/payments_provider.dart';
import '../services/order_state.dart';
import 'payment_form_screen.dart';
import 'ticket_screen.dart';

class OrderDetailScreen extends StatefulWidget {
  final int ordenId;

  const OrderDetailScreen({super.key, required this.ordenId});

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  final _entradaContenido = TextEditingController();
  final _cantidadRefaccionController = TextEditingController();
  String _entradaTipo = 'DIAGNOSTIC';
  bool _enviandoEntrada = false;
  int? _parteIdSeleccionada;
  bool _enviandoRefaccion = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<OrdersProvider>().obtenerDetalle(widget.ordenId);
      context.read<OrdersProvider>().recargarPartesDisponibles();
      // Los cobros solo consultan recepción y administración (FR-005, RN-15).
      final rol = context.read<AuthProvider>().usuario?.role ?? '';
      if (rol == 'ADMIN' || rol == 'RECEPTIONIST') {
        context.read<PaymentsProvider>().cargar(widget.ordenId);
      }
    });
  }

  @override
  void dispose() {
    _entradaContenido.dispose();
    _cantidadRefaccionController.dispose();
    super.dispose();
  }

  /// Agrega una entrada fechada; el historial no permite borrar (FR-014).
  Future<void> _agregarEntrada(OrdenServicio orden) async {
    if (_entradaContenido.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Escriba el contenido de la entrada.'),
          backgroundColor: MotorixColores.error,
        ),
      );
      return;
    }
    final provider = context.read<OrdersProvider>();
    setState(() => _enviandoEntrada = true);
    final exito = await provider.agregarEntrada(
      orden.id!,
      _entradaTipo,
      _entradaContenido.text.trim(),
    );
    if (!mounted) return;
    setState(() => _enviandoEntrada = false);
    if (exito) {
      _entradaContenido.clear();
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(exito
            ? 'Entrada registrada en el historial.'
            : provider.error ?? 'No se pudo registrar la entrada.'),
        backgroundColor: exito ? MotorixColores.exito : MotorixColores.error,
      ),
    );
  }

  /// Usa una refacción en la orden (FR-011): la salida de inventario es
  /// atómica; si falta stock el servidor responde PART_SIN_STOCK (RN-7).
  Future<void> _agregarRefaccion(OrdenServicio orden) async {
    final cantidad = int.tryParse(_cantidadRefaccionController.text.trim());
    if (_parteIdSeleccionada == null || cantidad == null || cantidad <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Seleccione la refacción y una cantidad mayor que cero.'),
          backgroundColor: MotorixColores.error,
        ),
      );
      return;
    }
    final provider = context.read<OrdersProvider>();
    setState(() => _enviandoRefaccion = true);
    final exito = await provider.agregarRefaccion(
      orden.id!,
      _parteIdSeleccionada!,
      cantidad,
    );
    if (!mounted) return;
    setState(() => _enviandoRefaccion = false);
    if (exito) {
      _cantidadRefaccionController.clear();
      setState(() => _parteIdSeleccionada = null);
    }
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(exito
            ? 'Refacción registrada: la salida de inventario ya se aplicó.'
            : provider.error ?? 'No se pudo agregar la refacción.'),
        backgroundColor: exito ? MotorixColores.exito : MotorixColores.error,
      ),
    );
  }

  /// Retira la refacción con confirmación: se devuelve al stock (FR-012, RN-8).
  Future<void> _quitarRefaccion(OrdenServicio orden, RefaccionOrden refaccion) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Quitar refacción'),
        content: Text(
            '¿Devolver ${refaccion.quantity} x ${refaccion.nombre} al inventario? '
            'Se registrará una entrada (IN) de devolución.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Volver'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Devolver'),
          ),
        ],
      ),
    );
    if (confirmar != true || !mounted) return;

    final provider = context.read<OrdersProvider>();
    final exito = await provider.quitarRefaccion(orden.id!, refaccion.id);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(exito
            ? 'Refacción devuelta al inventario.'
            : provider.error ?? 'No se pudo quitar la refacción.'),
        backgroundColor: exito ? MotorixColores.exito : MotorixColores.error,
      ),
    );
  }

  /// Aplica una transición con la confirmación obligatoria (FR-013).
  /// La cancelación incluye campo de motivo (se envía si el usuario lo llena).
  Future<void> _aplicarEstado(OrdenServicio orden, String estado) async {
    String? motivo;
    String contenido = '¿Confirmar el cambio a "${nombreEstadoOrden(estado)}"?';
    if (estado == 'ESPERANDO_REFACCION') {
      contenido =
          'La orden quedará en espera de refacción y regresará al estado desde el que se pausa. ¿Continuar?';
    } else if (estado == 'ENTREGADO') {
      contenido =
          'Se marcará la orden como entregada al cliente; ya no admitirá cambios (RN-9). ¿Continuar?';
    } else if (estado == 'CANCELADA') {
      contenido = 'La orden quedará cancelada y no admitirá cambios (RN-9).';
    }

    final confirmar = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(estado == 'CANCELADA'
            ? 'Cancelar orden'
            : 'Cambio de estado'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(contenido),
            if (estado == 'CANCELADA') ...[
              const SizedBox(height: MotorixEspaciados.m),
              TextField(
                onSubmitted: (valor) => motivo = valor,
                decoration: const InputDecoration(
                  labelText: 'Motivo de cancelación (opcional)',
                ),
              ),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Volver'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(estado == 'CANCELADA'
                ? 'Cancelar orden'
                : 'Confirmar cambio'),
          ),
        ],
      ),
    );
    if (confirmar != true || !mounted) return;

    final provider = context.read<OrdersProvider>();
    final exito = await provider.transicionar(
      orden.id!,
      estado,
      cancellationReason: motivo?.trim().isEmpty == true ? null : motivo?.trim(),
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(exito
            ? 'Orden en estado ${nombreEstadoOrden(estado)}.'
            : provider.error ?? 'No se pudo cambiar el estado.'),
        backgroundColor: exito ? MotorixColores.exito : MotorixColores.error,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<OrdersProvider>();
    final auth = context.watch<AuthProvider>();
    final orden = provider.ordenActual;

    if (provider.cargando && orden == null) {
      return Scaffold(
        appBar: AppBar(title: Text('Orden #${widget.ordenId}')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (orden == null) {
      return Scaffold(
        appBar: AppBar(title: Text('Orden #${widget.ordenId}')),
        body: Center(
          child: Text(provider.error ?? 'No se pudo cargar la orden.'),
        ),
      );
    }

    final totales = orden.totals;

    return Scaffold(
      appBar: AppBar(title: Text('Orden #${orden.id}')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(MotorixEspaciados.m),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${orden.vehicle?.plates ?? '—'} · ${orden.vehicle?.brand ?? ''} '
                    '${orden.vehicle?.model ?? ''} (${orden.vehicle?.year ?? ''})',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: MotorixEspaciados.s,
                    vertical: MotorixEspaciados.xs,
                  ),
                  decoration: BoxDecoration(
                    color: colorEstadoOrden(orden.status).withValues(alpha: 0.12),
                    borderRadius:
                        BorderRadius.circular(MotorixEspaciados.radio),
                  ),
                  child: Text(
                    orden.nombreEstado,
                    style: TextStyle(
                      color: colorEstadoOrden(orden.status),
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: MotorixEspaciados.m),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(MotorixEspaciados.m),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Dato(etiqueta: 'Cliente', valor: orden.client?.fullName ?? '—'),
                    _Dato(etiqueta: 'Teléfono', valor: orden.client?.phone ?? '—'),
                    _Dato(
                      etiqueta: 'Mecánico',
                      valor: orden.mechanic?.fullName ?? 'Sin asignar',
                    ),
                    _Dato(etiqueta: 'Kilometraje de entrada', valor: '${orden.mileageEntry} km'),
                    if (orden.mileageCorrection)
                      const _Dato(
                        etiqueta: 'Kilometraje',
                        valor: 'Con corrección explícita (RN-4)',
                      ),
                    _Dato(etiqueta: 'Motivo', valor: orden.reason),
                    if (orden.notes != null && orden.notes!.isNotEmpty)
                      _Dato(etiqueta: 'Notas', valor: orden.notes!),
                    if (orden.cancellationReason != null &&
                        orden.cancellationReason!.isNotEmpty)
                      _Dato(
                        etiqueta: 'Motivo de cancelación',
                        valor: orden.cancellationReason!,
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: MotorixEspaciados.m),
            if (_accionesDeEstado(orden, auth.usuario?.role ?? '').isNotEmpty) ...[
              Text('Acciones de estado',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: MotorixEspaciados.s),
              Wrap(
                spacing: MotorixEspaciados.s,
                runSpacing: MotorixEspaciados.s,
                children: [
                  for (final estado
                      in _accionesDeEstado(orden, auth.usuario?.role ?? ''))
                    ElevatedButton.icon(
                      icon: Icon(
                        estado == 'CANCELADA'
                            ? Icons.cancel_outlined
                            : estado == 'ENTREGADO'
                                ? Icons.check_circle_outline
                                : Icons.swap_horiz,
                        size: 18,
                      ),
                      style: estado == 'CANCELADA'
                          ? ElevatedButton.styleFrom(
                              backgroundColor: MotorixColores.error,
                              foregroundColor: Colors.white,
                            )
                          : null,
                      label: Text(_etiquetaAccion(estado)),
                      onPressed: () => _aplicarEstado(orden, estado),
                    ),
                ],
              ),
              const SizedBox(height: MotorixEspaciados.m),
            ],
            Text('Historial de entradas',
                style: Theme.of(context).textTheme.titleMedium),
            if (orden.entries.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: MotorixEspaciados.s),
                child: Text('Sin entradas registradas.'),
              )
            else
              Card(
                child: Column(
                  children: [
                    for (final entrada in orden.entries)
                      ListTile(
                        dense: true,
                        leading: const Icon(Icons.notes_outlined,
                            color: MotorixColores.acento),
                        title: Text('${entrada.nombreTipo}: ${entrada.content}'),
                        subtitle: Text([
                          if (entrada.createdAt != null) entrada.createdAt!,
                          if (entrada.authorName != null)
                            'Autor: ${entrada.authorName}',
                        ].join(' · ')),
                      ),
                  ],
                ),
              ),
            if (!orden.esFinal) ...[
              Text('Agregar entrada',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: MotorixEspaciados.s),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(MotorixEspaciados.m),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      SegmentedButton<String>(
                        segments: const [
                          ButtonSegment(
                              value: 'DIAGNOSTIC', label: Text('Diagnóstico')),
                          ButtonSegment(
                              value: 'OBSERVATION', label: Text('Observación')),
                          ButtonSegment(
                              value: 'RECOMMENDATION',
                              label: Text('Recomendación')),
                        ],
                        selected: {_entradaTipo},
                        onSelectionChanged: (nuevo) =>
                            setState(() => _entradaTipo = nuevo.first),
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextField(
                        controller: _entradaContenido,
                        maxLines: 3,
                        decoration: const InputDecoration(
                          labelText: 'Contenido de la entrada *',
                          helperText:
                              'Se guarda con su fecha y autor; el historial es inmutable (FR-014).',
                        ),
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      ElevatedButton.icon(
                        icon: const Icon(Icons.save_alt),
                        label: Text(_enviandoEntrada
                            ? 'Guardando…'
                            : 'Agregar al historial'),
                        onPressed: _enviandoEntrada
                            ? null
                            : () => _agregarEntrada(orden),
                      ),
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: MotorixEspaciados.m),
            Text('Servicios y mano de obra',
                style: Theme.of(context).textTheme.titleMedium),
            if (orden.services.isEmpty && orden.labor.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: MotorixEspaciados.s),
                child: Text('Sin partidas registradas.'),
              )
            else
              Card(
                child: Column(
                  children: [
                    for (final partida in [...orden.services, ...orden.labor])
                      ListTile(
                        dense: true,
                        leading: Icon(
                          partida.kind == 'LABOR'
                              ? Icons.build_outlined
                              : Icons.handyman_outlined,
                          color: MotorixColores.acento,
                        ),
                        title: Text(partida.description),
                        subtitle: Text(partida.kind == 'LABOR'
                            ? 'Mano de obra'
                            : 'Servicio'),
                        trailing: Text(
                          '\$${partida.amount.toStringAsFixed(2)}',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                  ],
                ),
              ),
            if (totales != null)
              Padding(
                padding: const EdgeInsets.only(top: MotorixEspaciados.m),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(MotorixEspaciados.m),
                    child: Column(
                      children: [
                        _Total(
                            etiqueta: 'Servicios',
                            valor: totales.services),
                        _Total(etiqueta: 'Mano de obra', valor: totales.labor),
                        _Total(
                            etiqueta: 'Refacciones', valor: totales.parts),
                        const Divider(),
                        _Total(
                          etiqueta: 'Total',
                          valor: totales.grand,
                          enfatizado: true,
                        ),
                        // Total incompleto: faltan precios de venta (005, FR-008).
                        if (!totales.totalCompleto)
                          Padding(
                            padding:
                                const EdgeInsets.only(top: MotorixEspaciados.s),
                            child: Row(
                              children: [
                                const Icon(Icons.warning_amber_rounded,
                                    color: MotorixColores.advertencia,
                                    size: 18),
                                const SizedBox(width: MotorixEspaciados.xs),
                                Expanded(
                                  child: Text(
                                    'Total incompleto: falta el precio de venta '
                                    'de ${totales.refaccionesSinPrecio} '
                                    '${totales.refaccionesSinPrecio == 1 ? 'refacción usada' : 'refacciones usadas'}.',
                                    style: const TextStyle(
                                        color: MotorixColores.advertencia),
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            const SizedBox(height: MotorixEspaciados.m),
            // Cobros de la orden (Sprint 4, US1): solo recepción y administración.
            if (auth.usuario?.role == 'ADMIN' ||
                auth.usuario?.role == 'RECEPTIONIST') ...[
              Text('Cobros', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: MotorixEspaciados.s),
              _SeccionCobros(
                ordenId: widget.ordenId,
                ordenCancelada: orden.status == 'CANCELADA',
              ),
            ],
            const SizedBox(height: MotorixEspaciados.m),
            Text('Refacciones usadas',
                style: Theme.of(context).textTheme.titleMedium),
            if (orden.refacciones.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: MotorixEspaciados.s),
                child: Text('Sin refacciones registradas.'),
              )
            else
              Card(
                child: Column(
                  children: [
                    for (final refaccion in orden.refacciones)
                      ListTile(
                        dense: true,
                        leading: const Icon(Icons.inventory_2_outlined,
                            color: MotorixColores.acento),
                        title: Text(
                            '${refaccion.nombre} (${refaccion.code})'),
                        subtitle: Text(refaccion.sinPrecio
                            ? 'Cantidad: ${refaccion.quantity} · Sin precio de venta'
                            : 'Cantidad: ${refaccion.quantity} · '
                                '\$${refaccion.unitPrice!.toStringAsFixed(2)} c/u · '
                                'Importe: \$${refaccion.amount!.toStringAsFixed(2)}'),
                        // Retirar solo con la orden abierta (RN-9).
                        trailing: orden.esFinal
                            ? null
                            : IconButton(
                                tooltip: 'Quitar y devolver al inventario',
                                icon: const Icon(Icons.remove_shopping_cart_outlined,
                                    color: MotorixColores.error),
                                onPressed: () =>
                                    _quitarRefaccion(orden, refaccion),
                              ),
                      ),
                  ],
                ),
              ),
            if (!orden.esFinal &&
                (auth.usuario?.role == 'ADMIN' ||
                    auth.usuario?.role == 'MECHANIC')) ...[
              const SizedBox(height: MotorixEspaciados.s),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(MotorixEspaciados.m),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      DropdownButtonFormField<int>(
                        initialValue: _parteIdSeleccionada,
                        decoration: const InputDecoration(
                          labelText: 'Refacción a usar *',
                          helperText:
                              'La salida de inventario se registra de forma atómica (RN-6).',
                        ),
                        items: [
                          for (final parte in provider.partesDisponibles)
                            DropdownMenuItem(
                              value: parte.id,
                              child: Text(
                                  '${parte.name} (${parte.code}) — stock ${parte.stock}'),
                            ),
                        ],
                        onChanged: (valor) =>
                            setState(() => _parteIdSeleccionada = valor),
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextField(
                        controller: _cantidadRefaccionController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Cantidad *',
                          helperText:
                              'Si no hay stock suficiente no se modifica nada (RN-7).',
                        ),
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      ElevatedButton.icon(
                        icon: const Icon(Icons.add_shopping_cart_outlined),
                        label: Text(_enviandoRefaccion
                            ? 'Registrando…'
                            : 'Agregar refacción a la orden'),
                        onPressed: _enviandoRefaccion
                            ? null
                            : () => _agregarRefaccion(orden),
                      ),
                    ],
                  ),
                ),
              ),
            ],
            const SizedBox(height: MotorixEspaciados.l),
          ],
        ),
      ),
    );
  }
  /// Acciones válidas para el rol actual calculadas con la máquina de
  /// estados (espejo del servidor; la autorización real es del backend).
  List<String> _accionesDeEstado(OrdenServicio orden, String rol) =>
      estadosSiguientesOrden(
        estadoActual: orden.status,
        rol: rol,
        estadoOrigenPausa: orden.previousState,
      );

  String _etiquetaAccion(String estado) {
    switch (estado) {
      case 'CANCELADA':
        return 'Cancelar orden';
      case 'ENTREGADO':
        return 'Entregar';
      case 'ESPERANDO_REFACCION':
        return 'Esperar refacción';
      case 'RECIBIDO':
        return 'Volver a recibido';
      default:
        return 'Pasar a ${nombreEstadoOrden(estado)}';
    }
  }
}

/// Bloque de cobros de la orden (Sprint 4, US1; FR-001 a FR-004):
/// resumen de saldos, historial de pagos y acción de cobrar (FR-005).
class _SeccionCobros extends StatelessWidget {
  final int ordenId;
  final bool ordenCancelada;

  const _SeccionCobros({required this.ordenId, required this.ordenCancelada});

  Future<void> _abrirFormulario(BuildContext context) async {
    final pagos = context.read<PaymentsProvider>().pagos;
    final saldo = pagos?.saldoPendiente ?? 0;
    final registrado = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => PaymentFormScreen(
          orderId: ordenId,
          saldoPendiente: saldo,
          // 005: el total incompleto bloquea el cobro con aviso (FR-010).
          totalCompleto: pagos?.totalCompleto ?? true,
          refaccionesSinPrecio: pagos?.refaccionesSinPrecio ?? 0,
        ),
      ),
    );
    if (registrado == true && context.mounted) {
      context.read<PaymentsProvider>().cargar(ordenId);
    }
  }

  /// Abre el ticket imprimible de la orden (Sprint 4, US3; FR-011).
  void _abrirTicket(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => TicketScreen(orderId: ordenId),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<PaymentsProvider>();
    final pagos = provider.pagos;

    if (provider.cargando && pagos == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: MotorixEspaciados.s),
        child: LinearProgressIndicator(),
      );
    }
    if (pagos == null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: MotorixEspaciados.s),
        child: Text(
          provider.error ?? 'No se pudieron cargar los cobros.',
          style: const TextStyle(color: MotorixColores.error),
        ),
      );
    }

    final liquidada = pagos.estadoCobro == 'LIQUIDADA';
    final colorCobro = liquidada
        ? MotorixColores.exito
        : pagos.estadoCobro == 'PARCIAL'
            ? MotorixColores.acento
            : MotorixColores.textoSecundario;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(MotorixEspaciados.m),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Total(etiqueta: 'Total de la orden', valor: pagos.total),
            _Total(etiqueta: 'Cobrado', valor: pagos.cobrado),
            _Total(
              etiqueta: 'Saldo pendiente',
              valor: pagos.saldoPendiente,
              enfatizado: true,
            ),
            const Divider(),
            Row(
              children: [
                const Icon(Icons.account_balance_wallet_outlined,
                    size: 18, color: MotorixColores.textoSecundario),
                const SizedBox(width: MotorixEspaciados.xs),
                Text(
                  pagos.nombreEstadoCobro,
                  style: TextStyle(
                    color: colorCobro,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            if (pagos.pagos.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: MotorixEspaciados.s),
                child: Text('Sin pagos registrados.'),
              )
            else
              for (final pago in pagos.pagos)
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    pago.metodo == 'MERCADO_PAGO'
                        ? Icons.language
                        : Icons.receipt_long_outlined,
                    color: pago.estado == 'COMPLETED'
                        ? MotorixColores.acento
                        : MotorixColores.textoSecundario,
                  ),
                  title: Text(
                      '${pago.nombreMetodo} — \$${pago.monto.toStringAsFixed(2)}'),
                  subtitle: Text([
                    pago.nombreEstado,
                    if (pago.registradoPor != null) pago.registradoPor!,
                    if (pago.fecha != null) pago.fecha!,
                  ].join(' · ')),
                ),
            const SizedBox(height: MotorixEspaciados.s),
            // El cobro manual sigue disponible aunque haya un digital pendiente (FR-020).
            if (!ordenCancelada && !liquidada)
              ElevatedButton.icon(
                icon: const Icon(Icons.payments_outlined, size: 18),
                label: const Text('Registrar cobro'),
                onPressed: () => _abrirFormulario(context),
              ),
            // Las órdenes canceladas no muestran acciones de pago o ticket (FR-020).
            if (!ordenCancelada)
              OutlinedButton.icon(
                key: const Key('botonVerTicket'),
                icon: const Icon(Icons.receipt_long_outlined, size: 18),
                label: const Text('Ver ticket'),
                onPressed: () => _abrirTicket(context),
              ),
            if (liquidada)
              const Text(
                'Orden liquidada: no tiene saldo pendiente.',
                style: TextStyle(
                  color: MotorixColores.exito,
                  fontWeight: FontWeight.w600,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Dato extends StatelessWidget {
  final String etiqueta;
  final String valor;

  const _Dato({required this.etiqueta, required this.valor});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: MotorixEspaciados.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 170,
            child: Text(
              etiqueta,
              style: const TextStyle(color: MotorixColores.textoSecundario),
            ),
          ),
          Expanded(child: Text(valor)),
        ],
      ),
    );
  }
}

class _Total extends StatelessWidget {
  final String etiqueta;
  final double valor;
  final bool enfatizado;

  const _Total({
    required this.etiqueta,
    required this.valor,
    this.enfatizado = false,
  });

  @override
  Widget build(BuildContext context) {
    final estilo = enfatizado
        ? const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)
        : const TextStyle();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: MotorixEspaciados.xs),
      child: Row(
        children: [
          Expanded(child: Text(etiqueta, style: estilo)),
          Text('\$${valor.toStringAsFixed(2)}', style: estilo),
        ],
      ),
    );
  }
}

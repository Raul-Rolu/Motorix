/// Registro de un cobro manual sobre una orden (Sprint 4, US1; FR-001/FR-005).
///
/// Recepción o administración indican método (efectivo, tarjeta o
/// transferencia) y monto; el pago queda como historial inmutable (FR-006)
/// y no puede superar el saldo pendiente (FR-003).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/payment.dart';
import '../providers/payments_provider.dart';

class PaymentFormScreen extends StatefulWidget {
  final int orderId;

  /// Saldo pendiente de la orden, para acotar el monto y prellenarlo.
  final double saldoPendiente;

  const PaymentFormScreen({
    super.key,
    required this.orderId,
    required this.saldoPendiente,
  });

  @override
  State<PaymentFormScreen> createState() => _PaymentFormScreenState();
}

class _PaymentFormScreenState extends State<PaymentFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _montoController = TextEditingController();
  String _metodo = 'CASH';
  bool _guardando = false;
  bool _verificando = false;

  @override
  void initState() {
    super.initState();
    // Prellena el saldo para el cobro completo (escenario 1 de la US1).
    if (widget.saldoPendiente > 0) {
      _montoController.text = widget.saldoPendiente.toStringAsFixed(2);
    }
  }

  @override
  void dispose() {
    _montoController.dispose();
    super.dispose();
  }

  Future<void> _registrar() async {
    if (!_formKey.currentState!.validate()) return;
    final monto = double.parse(_montoController.text.trim());

    final confirmar = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Confirmar cobro'),
        content: Text(
          'Registrar un cobro de \$${monto.toStringAsFixed(2)} en '
          '${_nombreMetodo(_metodo)}? El pago quedará como historial y no podrá '
          'editarse (FR-006).',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Volver'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Registrar'),
          ),
        ],
      ),
    );
    if (confirmar != true || !mounted) return;

    setState(() => _guardando = true);
    final provider = context.read<PaymentsProvider>();
    final pago = await provider.registrar(widget.orderId, metodo: _metodo, monto: monto);
    if (!mounted) return;
    setState(() => _guardando = false);

    if (pago != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Cobro de \$${pago.monto.toStringAsFixed(2)} registrado.'),
          backgroundColor: MotorixColores.exito,
        ),
      );
      Navigator.of(context).pop(true);
    } else {
      _mostrarError(provider.error ?? 'No se pudo registrar el cobro.');
    }
  }

  void _mostrarError(String mensaje) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(mensaje), backgroundColor: MotorixColores.error),
    );
  }

  // --- US2: cobro digital con Mercado Pago (FR-008, FR-017) ---

  /// Genera el enlace de pago para el saldo pendiente (sin datos de tarjeta).
  Future<void> _crearCobroDigital() async {
    setState(() => _guardando = true);
    final provider = context.read<PaymentsProvider>();
    final cobro = await provider.crearCobroDigital(
      widget.orderId,
      monto: widget.saldoPendiente,
    );
    if (!mounted) return;
    setState(() => _guardando = false);
    if (cobro == null) {
      _mostrarError(provider.error ?? 'No se pudo generar el cobro digital.');
    }
  }

  /// Verifica el cobro con el proveedor bajo demanda (decisión Q1).
  Future<void> _verificarCobro() async {
    final provider = context.read<PaymentsProvider>();
    final cobro = provider.cobroDigital;
    if (cobro == null) return;

    setState(() => _verificando = true);
    final pago = await provider.verificarCobro(cobro.id, widget.orderId);
    if (!mounted) return;
    setState(() => _verificando = false);

    if (pago == null) {
      _mostrarError(provider.error ?? 'No se pudo verificar el cobro.');
      return;
    }
    switch (pago.estado) {
      case 'COMPLETED':
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                'Cobro de \$${pago.monto.toStringAsFixed(2)} confirmado.'),
            backgroundColor: MotorixColores.exito,
          ),
        );
        Navigator.of(context).pop(true);
        break;
      case 'EXPIRED':
        _mostrarError(
            'El cobro expiró (más de 24 h sin confirmar); genere uno nuevo.');
        break;
      default:
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
                'Aún no se confirma el pago; verifique de nuevo más tarde.'),
          ),
        );
    }
  }

  String _nombreMetodo(String metodo) {
    switch (metodo) {
      case 'CARD':
        return 'tarjeta';
      case 'TRANSFER':
        return 'transferencia';
      default:
        return 'efectivo';
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<PaymentsProvider>();
    return Scaffold(
      appBar: AppBar(title: Text('Cobro de la orden #${widget.orderId}')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(MotorixEspaciados.m),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Saldo pendiente: \$${widget.saldoPendiente.toStringAsFixed(2)}',
              style: const TextStyle(
                fontWeight: FontWeight.w600,
                color: MotorixColores.textoSecundario,
              ),
            ),
            const SizedBox(height: MotorixEspaciados.m),
            Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: _metodo,
                    decoration: const InputDecoration(labelText: 'Método de pago *'),
                    items: const [
                      DropdownMenuItem(value: 'CASH', child: Text('Efectivo')),
                      DropdownMenuItem(value: 'CARD', child: Text('Tarjeta')),
                      DropdownMenuItem(value: 'TRANSFER', child: Text('Transferencia')),
                    ],
                    onChanged: (valor) =>
                        setState(() => _metodo = valor ?? 'CASH'),
                  ),
                  const SizedBox(height: MotorixEspaciados.m),
                  TextFormField(
                    key: const Key('campoMontoCobro'),
                    controller: _montoController,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(
                      labelText: 'Monto *',
                      hintText: 'Importe cobrado al cliente',
                    ),
                    validator: (valor) {
                      final texto = valor?.trim() ?? '';
                      final numero = double.tryParse(texto);
                      if (texto.isEmpty || numero == null || numero <= 0) {
                        return 'Ingrese un monto mayor que cero.';
                      }
                      if (numero > widget.saldoPendiente) {
                        return 'El monto supera el saldo pendiente '
                            '(\$${widget.saldoPendiente.toStringAsFixed(2)}).';
                      }
                      return null;
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(height: MotorixEspaciados.l),
            ElevatedButton.icon(
              key: const Key('botonRegistrarCobro'),
              icon: _guardando
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.payments_outlined),
              label: Text(_guardando ? 'Registrando…' : 'Registrar cobro'),
              onPressed: _guardando ? null : _registrar,
            ),
            // --- US2: cobro digital con Mercado Pago (FR-008, FR-017) ---
            if (widget.saldoPendiente > 0) ...[
              const SizedBox(height: MotorixEspaciados.l),
              const Divider(),
              Text(
                'Cobro con Mercado Pago',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: MotorixEspaciados.xs),
              const Text(
                'Se genera un enlace de pago para el saldo pendiente; el '
                'cliente lo paga y usted verifica el cobro. La aplicación '
                'nunca maneja datos de tarjeta.',
                style: TextStyle(
                  fontSize: 12,
                  color: MotorixColores.textoSecundario,
                ),
              ),
              const SizedBox(height: MotorixEspaciados.s),
              if (provider.cobroDigital == null)
                OutlinedButton.icon(
                  key: const Key('botonCobroDigital'),
                  icon: const Icon(Icons.language, size: 18),
                  label: Text(
                    'Generar enlace por \$${widget.saldoPendiente.toStringAsFixed(2)}',
                  ),
                  onPressed: _guardando ? null : _crearCobroDigital,
                )
              else
                _TarjetaCobroDigital(
                  cobro: provider.cobroDigital!,
                  verificando: _verificando,
                  onVerificar: _verificarCobro,
                ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Enlace de pago generado y su estado (US2; FR-008/FR-017).
///
/// Solo muestra el enlace y permite verificarlo: la aplicación jamás maneja
/// datos de tarjeta ni credenciales del proveedor (RN-14).
class _TarjetaCobroDigital extends StatelessWidget {
  final CobroDigital cobro;
  final bool verificando;
  final VoidCallback onVerificar;

  const _TarjetaCobroDigital({
    required this.cobro,
    required this.verificando,
    required this.onVerificar,
  });

  @override
  Widget build(BuildContext context) {
    final colorEstado = cobro.estado == 'COMPLETED'
        ? MotorixColores.exito
        : cobro.estado == 'EXPIRED'
            ? MotorixColores.error
            : MotorixColores.textoSecundario;

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(MotorixEspaciados.m),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const Icon(Icons.language,
                    size: 18, color: MotorixColores.acento),
                const SizedBox(width: MotorixEspaciados.xs),
                Text(
                  'Cobro de \$${cobro.monto.toStringAsFixed(2)} — '
                  '${cobro.nombreEstado}',
                  style: TextStyle(
                    color: colorEstado,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: MotorixEspaciados.s),
            SelectableText(
              cobro.enlace,
              key: const Key('textoEnlaceDigital'),
              style: const TextStyle(fontSize: 12),
            ),
            const SizedBox(height: MotorixEspaciados.s),
            OutlinedButton.icon(
              key: const Key('botonVerificarPago'),
              icon: verificando
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.refresh, size: 18),
              label: Text(verificando ? 'Verificando…' : 'Verificar pago'),
              onPressed: verificando ? null : onVerificar,
            ),
          ],
        ),
      ),
    );
  }
}

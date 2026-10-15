/// Panel de control de administración (Sprint 4, US4; FR-014 a FR-016).
///
/// Resumen de solo lectura con refresco manual (decisión Q3): órdenes por
/// estado, citas, mantenimientos, alertas de stock bajo y dinero cobrado.
/// Solo el rol ADMIN ve esta pantalla (FR-016, RN-15); el servidor también
/// lo valida. Alertas destacadas: rojo para crítico/vencido y ámbar para
/// próximo (según docs/design-system.md).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/dashboard.dart';
import '../providers/dashboard_provider.dart';
import '../services/ticket_print.dart' show formatearMoneda;

const Map<String, String> _nombresEstado = {
  'RECIBIDO': 'Recibido',
  'DIAGNOSTICO': 'Diagnóstico',
  'EN_REPARACION': 'En reparación',
  'ESPERANDO_REFACCION': 'Esperando refacción',
  'TERMINADO': 'Terminado',
  'ENTREGADO': 'Entregado',
  'CANCELADA': 'Cancelada',
};

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  @override
  void initState() {
    super.initState();
    // El panel se recalcula al abrir; la recarga manual también está disponible.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DashboardProvider>().cargar();
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<DashboardProvider>();
    final resumen = provider.resumen;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Panel de control'),
        actions: [
          IconButton(
            key: const Key('botonRefrescarPanel'),
            icon: provider.cargando
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.refresh),
            tooltip: 'Actualizar indicadores',
            onPressed: provider.cargando ? null : () => provider.cargar(),
          ),
        ],
      ),
      body: _contenido(provider, resumen),
    );
  }

  Widget _contenido(DashboardProvider provider, ResumenPanel? resumen) {
    if (provider.cargando && resumen == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (resumen == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          child: Text(
            provider.error ?? 'No se pudo cargar el panel.',
            style: const TextStyle(color: MotorixColores.error),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => provider.cargar(),
      child: SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(MotorixEspaciados.m),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              spacing: MotorixEspaciados.m,
              runSpacing: MotorixEspaciados.m,
              children: [
                _Indicador(
                  titulo: 'Órdenes en curso',
                  valor: '${resumen.ordenesEnCurso}',
                  icono: Icons.build_outlined,
                ),
                _Indicador(
                  titulo: 'Citas de hoy',
                  valor: '${resumen.citasHoy}',
                  icono: Icons.event_available_outlined,
                ),
                _Indicador(
                  titulo: 'Cobrado hoy',
                  valor: formatearMoneda(resumen.cobrosHoy),
                  icono: Icons.payments_outlined,
                ),
                _Indicador(
                  titulo: 'Cobro acumulado',
                  valor: formatearMoneda(resumen.cobrosTotal),
                  icono: Icons.account_balance_wallet_outlined,
                ),
              ],
            ),
            const SizedBox(height: MotorixEspaciados.m),
            if (resumen.mantenimientosVencidos > 0 ||
                resumen.stockBajo > 0 ||
                resumen.pendientesDigitales > 0) ...[
              Card(
                key: const Key('alertasPanel'),
                color: MotorixColores.errorSuave,
                child: Padding(
                  padding: const EdgeInsets.all(MotorixEspaciados.m),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Alertas que requieren atención',
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: MotorixColores.error,
                        ),
                      ),
                      const SizedBox(height: MotorixEspaciados.s),
                      if (resumen.mantenimientosVencidos > 0)
                        _alerta(
                          '${resumen.mantenimientosVencidos} mantenimiento(s) vencido(s).',
                          Icons.warning_amber_outlined,
                          MotorixColores.error,
                        ),
                      if (resumen.stockBajo > 0)
                        _alerta(
                          '${resumen.stockBajo} refacción(es) con stock bajo.',
                          Icons.inventory_2_outlined,
                          MotorixColores.error,
                        ),
                      if (resumen.pendientesDigitales > 0)
                        _alerta(
                          '${resumen.pendientesDigitales} cobro(s) digital(es) pendiente(s) de confirmar.',
                          Icons.language,
                          MotorixColores.advertencia,
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: MotorixEspaciados.m),
            ],
            Card(
              child: Padding(
                padding: const EdgeInsets.all(MotorixEspaciados.m),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Órdenes por estado',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: MotorixEspaciados.xs),
                    for (final entrada in _nombresEstado.entries)
                      _fila(entrada.value, '${resumen.ordenes[entrada.key] ?? 0}'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: MotorixEspaciados.m),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(MotorixEspaciados.m),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Citas y mantenimientos',
                        style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: MotorixEspaciados.xs),
                    _fila('Citas de hoy', '${resumen.citasHoy}'),
                    _fila('Citas próximas', '${resumen.citasProximas}'),
                    _filaConColor(
                      'Mantenimientos vencidos',
                      '${resumen.mantenimientosVencidos}',
                      resumen.mantenimientosVencidos > 0
                          ? MotorixColores.error
                          : null,
                    ),
                    _filaConColor(
                      'Mantenimientos próximos',
                      '${resumen.mantenimientosProximos}',
                      resumen.mantenimientosProximos > 0
                          ? MotorixColores.advertencia
                          : null,
                    ),
                    _filaConColor(
                      'Refacciones con stock bajo',
                      '${resumen.stockBajo}',
                      resumen.stockBajo > 0 ? MotorixColores.error : null,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _alerta(String texto, IconData icono, Color color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          Icon(icono, size: 18, color: color),
          const SizedBox(width: MotorixEspaciados.xs),
          Expanded(child: Text(texto)),
        ],
      ),
    );
  }

  Widget _fila(String etiqueta, String valor) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(etiqueta, style: const TextStyle(color: MotorixColores.textoSecundario)),
          Text(valor, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Widget _filaConColor(String etiqueta, String valor, Color? color) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(etiqueta, style: const TextStyle(color: MotorixColores.textoSecundario)),
          Text(
            valor,
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: color ?? MotorixColores.textoPrincipal,
            ),
          ),
        ],
      ),
    );
  }
}

/// Tarjeta de indicador principal del panel.
class _Indicador extends StatelessWidget {
  final String titulo;
  final String valor;
  final IconData icono;

  const _Indicador({
    required this.titulo,
    required this.valor,
    required this.icono,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 200,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icono, color: MotorixColores.acento),
              const SizedBox(height: MotorixEspaciados.xs),
              Text(
                valor,
                key: Key('valor_$titulo'),
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              Text(
                titulo,
                style: const TextStyle(
                  fontSize: 12,
                  color: MotorixColores.textoSecundario,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

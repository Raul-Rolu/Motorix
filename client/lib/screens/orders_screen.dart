/// Listado de órdenes de servicio (T030, US4; FR-008/FR-009).
///
/// El servidor limita la visibilidad: el mecánico solo ve las suyas y aquí
/// no se ofrecen acciones que su rol no pueda realizar (además, la
/// autorización real se valida en el servidor, RN-15).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/service_order.dart';
import '../providers/auth_provider.dart';
import '../providers/orders_provider.dart';
import 'order_detail_screen.dart';
import 'order_form_screen.dart';

/// Estados de orden disponibles para el filtro.
const List<String> kEstadosOrden = [
  'RECIBIDO',
  'DIAGNOSTICO',
  'EN_REPARACION',
  'ESPERANDO_REFACCION',
  'TERMINADO',
  'ENTREGADO',
  'CANCELADA',
];

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  final _busqueda = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = context.read<OrdersProvider>();
      provider.estadoFiltro = null;
      provider.textoFiltro = '';
      provider.recargar();
    });
  }

  @override
  void dispose() {
    _busqueda.dispose();
    super.dispose();
  }

  Future<void> _abrirAsignacion(OrdenServicio orden) async {
    final provider = context.read<OrdersProvider>();
    await provider.recargarMecanicos();
    if (!mounted) return;

    int? seleccion = orden.mechanicId;
    final resultado = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, actualizar) => AlertDialog(
          title: Text('Asignar mecánico — orden #${orden.id}'),
          content: DropdownButtonFormField<int?>(
            initialValue: seleccion,
            decoration: const InputDecoration(
              labelText: 'Mecánico *',
              helperText: 'Asignación manual; puede reasignarse después (FR-009).',
            ),
            items: [
              const DropdownMenuItem<int?>(value: null, child: Text('Sin asignar')),
              for (final mecanico in provider.mecanicos)
                DropdownMenuItem<int?>(
                  value: mecanico.id,
                  child: Text(mecanico.fullName),
                ),
            ],
            onChanged: (valor) => actualizar(() => seleccion = valor),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancelar'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Guardar'),
            ),
          ],
        ),
      ),
    );

    if (resultado != true || !mounted) return;
    final exito = await provider.asignar(orden.id!, seleccion);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(exito
            ? 'Asignación actualizada.'
            : provider.error ?? 'No se pudo actualizar la asignación.'),
        backgroundColor: exito ? MotorixColores.exito : MotorixColores.error,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<OrdersProvider>();
    final auth = context.watch<AuthProvider>();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          child: Row(
            children: [
              Text('Órdenes de servicio',
                  style: Theme.of(context).textTheme.titleLarge),
              const Spacer(),
              if (auth.puedeGestionarOrdenes)
                ElevatedButton.icon(
                  icon: const Icon(Icons.add),
                  label: const Text('Nueva orden'),
                  onPressed: () async {
                    await Navigator.of(context).push(
                      MaterialPageRoute(
                          builder: (_) => const OrderFormScreen()),
                    );
                    if (context.mounted) {
                      context.read<OrdersProvider>().recargar();
                    }
                  },
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: MotorixEspaciados.m),
          child: Row(
            children: [
              Expanded(
                flex: 2,
                child: TextField(
                  controller: _busqueda,
                  decoration: const InputDecoration(
                    labelText: 'Buscar por placas o cliente',
                    prefixIcon: Icon(Icons.search),
                  ),
                  onSubmitted: (valor) {
                    provider.textoFiltro = valor.trim();
                    provider.recargar();
                  },
                ),
              ),
              const SizedBox(width: MotorixEspaciados.m),
              Expanded(
                child: DropdownButtonFormField<String?>(
                  initialValue: provider.estadoFiltro,
                  decoration: const InputDecoration(labelText: 'Estado'),
                  items: [
                    const DropdownMenuItem<String?>(
                        value: null, child: Text('Todos')),
                    for (final estado in kEstadosOrden)
                      DropdownMenuItem<String?>(
                        value: estado,
                        child: Text(_nombreCortoEstado(estado)),
                      ),
                  ],
                  onChanged: (valor) {
                    provider.estadoFiltro = valor;
                    provider.recargar();
                  },
                ),
              ),
            ],
          ),
        ),
        if (provider.error != null)
          Padding(
            padding: const EdgeInsets.all(MotorixEspaciados.s),
            child: Text(provider.error!,
                style: const TextStyle(color: MotorixColores.error)),
          ),
        Expanded(
          child: provider.cargando && provider.ordenes.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : provider.ordenes.isEmpty
                  ? const Center(child: Text('Sin órdenes para mostrar.'))
                  : ListView.separated(
                      itemCount: provider.ordenes.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, indice) {
                        final orden = provider.ordenes[indice];
                        return ListTile(
                          leading: Icon(
                            Icons.assignment_outlined,
                            color: colorEstadoOrden(orden.status),
                          ),
                          title: Text(
                              '#${orden.id} · ${orden.plates ?? '—'} · ${orden.reason}'),
                          subtitle: Text([
                            orden.clientName ?? '—',
                            if (orden.mechanicName != null)
                              'Mecánico: ${orden.mechanicName}',
                            'Km: ${orden.mileageEntry}',
                          ].join(' · ')),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: MotorixEspaciados.s,
                                  vertical: MotorixEspaciados.xs,
                                ),
                                decoration: BoxDecoration(
                                  color: colorEstadoOrden(orden.status)
                                      .withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(
                                      MotorixEspaciados.radio),
                                ),
                                child: Text(
                                  orden.nombreEstado,
                                  style: TextStyle(
                                    color: colorEstadoOrden(orden.status),
                                    fontWeight: FontWeight.w600,
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                              if (auth.puedeGestionarOrdenes)
                                PopupMenuButton<String>(
                                  tooltip: 'Acciones',
                                  onSelected: (accion) {
                                    if (accion == 'asignar') {
                                      _abrirAsignacion(orden);
                                    }
                                  },
                                  itemBuilder: (_) => const [
                                    PopupMenuItem(
                                      value: 'asignar',
                                      child: Text('Asignar mecánico'),
                                    ),
                                  ],
                                ),
                            ],
                          ),
                          onTap: () async {
                            await Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) =>
                                    OrderDetailScreen(ordenId: orden.id!),
                              ),
                            );
                            if (context.mounted) {
                              context.read<OrdersProvider>().recargar();
                            }
                          },
                        );
                      },
                    ),
        ),
      ],
    );
  }
}

String _nombreCortoEstado(String estado) {
  switch (estado) {
    case 'RECIBIDO':
      return 'Recibido';
    case 'DIAGNOSTICO':
      return 'Diagnóstico';
    case 'EN_REPARACION':
      return 'En reparación';
    case 'ESPERANDO_REFACCION':
      return 'Esperando refacción';
    case 'TERMINADO':
      return 'Terminado';
    case 'ENTREGADO':
      return 'Entregado';
    case 'CANCELADA':
      return 'Cancelada';
    default:
      return estado;
  }
}

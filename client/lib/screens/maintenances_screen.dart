/// Lista de mantenimientos próximos y vencidos (Sprint 3, US4; FR-007, Q5, SC-003).
///
/// Recepción identifica en un vistazo: vencidos en rojo y pendientes en
/// advertencia ordenados por el umbral más cercano (sin ventana de tiempo
/// fija, aclaración Q5). Cada tarjeta trae cliente y vehículo para el aviso
/// al cliente y las acciones de completar (Q1) y cancelar (Q4, solo ADMIN).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/maintenance.dart';
import '../providers/auth_provider.dart';
import '../providers/maintenances_provider.dart';
import 'maintenance_form_screen.dart';

class MaintenancesScreen extends StatefulWidget {
  const MaintenancesScreen({super.key});

  @override
  State<MaintenancesScreen> createState() => _MaintenancesScreenState();
}

class _MaintenancesScreenState extends State<MaintenancesScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<MaintenancesProvider>().recargar();
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<MaintenancesProvider>();
    final esAdmin = context.watch<AuthProvider>().esAdmin;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          child: Row(
            children: [
              Text('Mantenimientos',
                  style: Theme.of(context).textTheme.titleLarge),
              const Spacer(),
              ElevatedButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Nuevo'),
                onPressed: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(
                        builder: (_) => const MaintenanceFormScreen()),
                  );
                  if (context.mounted) {
                    context.read<MaintenancesProvider>().recargar();
                  }
                },
              ),
            ],
          ),
        ),
        if (provider.error != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: MotorixEspaciados.m),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                provider.error!,
                style: const TextStyle(color: MotorixColores.error),
              ),
            ),
          ),
        Expanded(
          child: provider.cargando && provider.mantenimientos.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : provider.mantenimientos.isEmpty
                  ? const Center(
                      child: Padding(
                        padding: EdgeInsets.all(MotorixEspaciados.l),
                        child: Text(
                          'No hay mantenimientos registrados.\n'
                          'Los vencidos y próximos aparecerán aquí.',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: provider.recargar,
                      child: ListView.builder(
                        padding:
                            const EdgeInsets.symmetric(horizontal: MotorixEspaciados.m),
                        itemCount: provider.mantenimientos.length,
                        itemBuilder: (context, indice) => _TarjetaMantenimiento(
                          mantenimiento: provider.mantenimientos[indice],
                          puedeCancelar: esAdmin,
                        ),
                      ),
                    ),
        ),
      ],
    );
  }
}

/// Tarjeta de un mantenimiento con sus umbrales y estado de urgencia.
class _TarjetaMantenimiento extends StatelessWidget {
  final Mantenimiento mantenimiento;
  final bool puedeCancelar;

  const _TarjetaMantenimiento({
    required this.mantenimiento,
    required this.puedeCancelar,
  });

  Color get _colorEstado {
    if (mantenimiento.completado) return MotorixColores.exito;
    if (mantenimiento.cancelado) return MotorixColores.textoSecundario;
    if (mantenimiento.isOverdue) return MotorixColores.error;
    return MotorixColores.advertencia;
  }

  String get _etiquetaEstado {
    if (mantenimiento.completado) return 'Completado';
    if (mantenimiento.cancelado) return 'Cancelado';
    if (mantenimiento.isOverdue) return 'Vencido';
    return 'Pendiente';
  }

  String? _fechaCorta(String? fecha) =>
      fecha != null && fecha.length >= 10 ? fecha.substring(0, 10) : fecha;

  @override
  Widget build(BuildContext context) {
    final umbrales = <String>[
      if (mantenimiento.targetDate != null)
        'Fecha objetivo: ${_fechaCorta(mantenimiento.targetDate)}',
      if (mantenimiento.targetMileage != null)
        'Kilometraje objetivo: ${mantenimiento.targetMileage} km',
      'Kilometraje actual: ${mantenimiento.kilometrajeActual} km',
    ];

    final pendiente = mantenimiento.pendiente;
    final detallePendiente = <String>[
      if (mantenimiento.isOverdue && mantenimiento.daysLeft != null && mantenimiento.daysLeft! < 0)
        'Vencido hace ${mantenimiento.daysLeft!.abs()} día(s)',
      if (mantenimiento.isOverdue && mantenimiento.kmLeft != null && mantenimiento.kmLeft! < 0)
        'Kilometraje superado en ${mantenimiento.kmLeft!.abs()} km',
      if (!mantenimiento.isOverdue && mantenimiento.daysLeft != null)
        'Faltan ${mantenimiento.daysLeft} día(s)',
      if (!mantenimiento.isOverdue && mantenimiento.kmLeft != null)
        'Faltan ${mantenimiento.kmLeft} km',
    ];

    return Card(
      margin: const EdgeInsets.only(bottom: MotorixEspaciados.s),
      child: InkWell(
        borderRadius: BorderRadius.circular(MotorixEspaciados.radio),
        onTap: () async {
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) =>
                  MaintenanceFormScreen(mantenimiento: mantenimiento),
            ),
          );
          if (context.mounted) {
            context.read<MaintenancesProvider>().recargar();
          }
        },
        child: Padding(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.build_circle_outlined, color: _colorEstado),
                  const SizedBox(width: MotorixEspaciados.s),
                  Expanded(
                    child: Text(
                      mantenimiento.description,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: MotorixEspaciados.s,
                        vertical: MotorixEspaciados.xs),
                    decoration: BoxDecoration(
                      color: _colorEstado.withValues(alpha: 0.12),
                      borderRadius:
                          BorderRadius.circular(MotorixEspaciados.radio),
                    ),
                    child: Text(
                      _etiquetaEstado,
                      style: TextStyle(
                        color: _colorEstado,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: MotorixEspaciados.xs),
              if (mantenimiento.vehiculo != null)
                Text(
                  '${mantenimiento.vehiculo!.marca} ${mantenimiento.vehiculo!.modelo} '
                  '— Placas ${mantenimiento.vehiculo!.placas}',
                  style:
                      const TextStyle(color: MotorixColores.textoSecundario),
                ),
              if (mantenimiento.cliente != null)
                Text(
                  'Cliente: ${mantenimiento.cliente!.nombreCompleto} '
                  '(${mantenimiento.cliente!.telefono})',
                  style:
                      const TextStyle(color: MotorixColores.textoSecundario),
                ),
              const SizedBox(height: MotorixEspaciados.xs),
              for (final umbral in umbrales)
                Text(umbral,
                    style: const TextStyle(color: MotorixColores.textoSecundario)),
              for (final detalle in detallePendiente)
                Text(
                  detalle,
                  style: TextStyle(
                    color: _colorEstado,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              if (pendiente)
                Padding(
                  padding: const EdgeInsets.only(top: MotorixEspaciados.s),
                  child: Wrap(
                    spacing: MotorixEspaciados.s,
                    children: [
                      OutlinedButton.icon(
                        icon: const Icon(Icons.check_circle_outline, size: 18),
                        label: const Text('Completar'),
                        onPressed: () => _completar(context),
                      ),
                      if (puedeCancelar)
                        OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                              foregroundColor: MotorixColores.error),
                          icon: const Icon(Icons.cancel_outlined, size: 18),
                          label: const Text('Cancelar'),
                          onPressed: () => _cancelar(context),
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _completar(BuildContext context) async {
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Marcar como completado'),
        content: Text(
            '¿El mantenimiento "${mantenimiento.description}" se realizó? '
            'Esta acción es manual (Q1).'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Completar'),
          ),
        ],
      ),
    );
    if (confirmado != true || !context.mounted) return;

    final provider = context.read<MaintenancesProvider>();
    final exito = await provider.completar(mantenimiento.id!);
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(exito
            ? 'Mantenimiento completado.'
            : provider.error ?? 'No se pudo completar.'),
        backgroundColor: exito ? MotorixColores.exito : MotorixColores.error,
      ),
    );
  }

  Future<void> _cancelar(BuildContext context) async {
    final motivoController = TextEditingController();
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancelar mantenimiento'),
        content: TextField(
          controller: motivoController,
          autofocus: true,
          maxLength: 255,
          decoration: const InputDecoration(
            labelText: 'Motivo de la cancelación (obligatorio, Q4)',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Volver'),
          ),
          ElevatedButton(
            style:
                ElevatedButton.styleFrom(backgroundColor: MotorixColores.error),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Cancelar mantenimiento'),
          ),
        ],
      ),
    );
    if (confirmado != true || !context.mounted) return;

    final motivo = motivoController.text.trim();
    if (motivo.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('El motivo de la cancelación es obligatorio.'),
          backgroundColor: MotorixColores.error,
        ),
      );
      return;
    }

    final provider = context.read<MaintenancesProvider>();
    final exito = await provider.cancelar(mantenimiento.id!, motivo);
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(exito
            ? 'Mantenimiento cancelado.'
            : provider.error ?? 'No se pudo cancelar.'),
        backgroundColor: exito ? MotorixColores.exito : MotorixColores.error,
      ),
    );
  }
}

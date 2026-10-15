/// Listado de citas del taller (T042, US1; FR-001 a FR-003).
///
/// Filtro por fecha y búsqueda por nombre de cliente o placas; acciones
/// según estado con confirmaciones obligatorias (FR-013).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/appointment.dart';
import '../providers/appointments_provider.dart';
import 'appointment_form_screen.dart';

class AppointmentsScreen extends StatefulWidget {
  const AppointmentsScreen({super.key});

  @override
  State<AppointmentsScreen> createState() => _AppointmentsScreenState();
}

class _AppointmentsScreenState extends State<AppointmentsScreen> {
  final _busqueda = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final provider = context.read<AppointmentsProvider>();
      provider.fechaFiltro = null;
      provider.textoFiltro = '';
      provider.recargar();
    });
  }

  @override
  void dispose() {
    _busqueda.dispose();
    super.dispose();
  }

  Future<void> _cancelar(Cita cita) async {
    final motivo = TextEditingController();
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Cancelar cita #${cita.id}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('La cancelación es obligatoria con motivo (FR-003).'),
            const SizedBox(height: MotorixEspaciados.m),
            TextField(
              controller: motivo,
              decoration:
                  const InputDecoration(labelText: 'Motivo de cancelación *'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Volver'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Cancelar cita'),
          ),
        ],
      ),
    );
    if (confirmar != true || !mounted) return;

    final provider = context.read<AppointmentsProvider>();
    if (motivo.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Debe indicar el motivo de la cancelación.'),
          backgroundColor: MotorixColores.error,
        ),
      );
      return;
    }
    final exito = await provider.cancelar(cita.id!, motivo.text.trim());
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(exito
            ? 'Cita cancelada.'
            : provider.error ?? 'No se pudo cancelar la cita.'),
        backgroundColor: exito ? MotorixColores.exito : MotorixColores.error,
      ),
    );
  }

  Future<void> _completar(Cita cita) async {
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Completar cita #${cita.id}'),
        content: const Text('¿Marcar la cita como atendida?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Volver'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Completar'),
          ),
        ],
      ),
    );
    if (confirmar != true || !mounted) return;

    final provider = context.read<AppointmentsProvider>();
    final exito = await provider.completar(cita.id!);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(exito
            ? 'Cita completada.'
            : provider.error ?? 'No se pudo completar la cita.'),
        backgroundColor: exito ? MotorixColores.exito : MotorixColores.error,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<AppointmentsProvider>();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          child: Row(
            children: [
              Text('Citas', style: Theme.of(context).textTheme.titleLarge),
              const Spacer(),
              ElevatedButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Nueva cita'),
                onPressed: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(
                        builder: (_) => const AppointmentFormScreen()),
                  );
                  if (context.mounted) {
                    context.read<AppointmentsProvider>().recargar();
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
                child: TextField(
                  controller: _busqueda,
                  decoration: const InputDecoration(
                    labelText: 'Buscar por cliente o placas',
                    prefixIcon: Icon(Icons.search),
                  ),
                  onSubmitted: (valor) {
                    provider.textoFiltro = valor.trim();
                    provider.recargar();
                  },
                ),
              ),
              const SizedBox(width: MotorixEspaciados.m),
              OutlinedButton.icon(
                icon: const Icon(Icons.today),
                label: Text(provider.fechaFiltro == null
                    ? 'Solo hoy'
                    : 'Quitar filtro de fecha'),
                onPressed: () {
                  if (provider.fechaFiltro == null) {
                    final hoy = DateTime.now();
                    provider.fechaFiltro =
                        '${hoy.year}-${hoy.month.toString().padLeft(2, '0')}-${hoy.day.toString().padLeft(2, '0')}';
                  } else {
                    provider.fechaFiltro = null;
                  }
                  provider.recargar();
                },
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
          child: provider.cargando && provider.citas.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : provider.citas.isEmpty
                  ? const Center(child: Text('Sin citas registradas.'))
                  : ListView.separated(
                      itemCount: provider.citas.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, indice) {
                        final cita = provider.citas[indice];
                        return ListTile(
                          leading: Icon(
                            Icons.event_available_outlined,
                            color: _colorEstado(cita.status),
                          ),
                          title: Text(
                              '${cita.appointmentDate} ${cita.appointmentTime} · ${cita.plates ?? '—'}'),
                          subtitle: Text([
                            cita.clientName ?? '—',
                            cita.reason,
                            cita.nombreEstado,
                            if (cita.cancellationReason != null &&
                                cita.cancellationReason!.isNotEmpty)
                              'Motivo: ${cita.cancellationReason}',
                          ].join(' · ')),
                          trailing: cita.esEditable
                              ? Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IconButton(
                                      tooltip: 'Completar',
                                      icon: const Icon(Icons.check_circle_outline,
                                          color: MotorixColores.exito),
                                      onPressed: () => _completar(cita),
                                    ),
                                    IconButton(
                                      tooltip: 'Cancelar',
                                      icon: const Icon(Icons.cancel_outlined,
                                          color: MotorixColores.error),
                                      onPressed: () => _cancelar(cita),
                                    ),
                                    IconButton(
                                      tooltip: 'Editar',
                                      icon: const Icon(Icons.edit_outlined),
                                      onPressed: () =>
                                          Navigator.of(context).push(
                                        MaterialPageRoute(
                                          builder: (_) => AppointmentFormScreen(
                                              cita: cita),
                                        ),
                                      ),
                                    ),
                                  ],
                                )
                              : null,
                        );
                      },
                    ),
        ),
      ],
    );
  }

  Color _colorEstado(String estado) {
    switch (estado) {
      case 'COMPLETADA':
        return MotorixColores.exito;
      case 'CANCELADA':
        return MotorixColores.error;
      default:
        return MotorixColores.acento;
    }
  }
}

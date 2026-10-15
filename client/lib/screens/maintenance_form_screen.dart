/// Alta y detalle de mantenimientos (Sprint 3, US3; FR-004 a FR-006).
///
/// Sin argumentos: formulario de alta con motivo y umbrales (fecha y/o
/// kilometraje, RN-11). Con un `mantenimiento`: vista de detalle con las
/// acciones de cumplimiento manual (aclaración Q1) y cancelación con motivo
/// obligatorio solo de administración (aclaración Q4, estilo FR-013).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/maintenance.dart';
import '../providers/auth_provider.dart';
import '../providers/maintenances_provider.dart';
import '../providers/vehicles_provider.dart';

class MaintenanceFormScreen extends StatefulWidget {
  /// Mantenimiento existente para ver detalle y acciones; null = alta nueva.
  final Mantenimiento? mantenimiento;

  const MaintenanceFormScreen({super.key, this.mantenimiento});

  @override
  State<MaintenanceFormScreen> createState() => _MaintenanceFormScreenState();
}

class _MaintenanceFormScreenState extends State<MaintenanceFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _descripcionController = TextEditingController();
  final _kilometrajeController = TextEditingController();

  int? _vehicleId;
  DateTime? _fechaObjetivo;
  bool _guardando = false;

  bool get _esAlta => widget.mantenimiento == null;

  @override
  void initState() {
    super.initState();
    final mantenimiento = widget.mantenimiento;
    if (mantenimiento != null) {
      _vehicleId = mantenimiento.vehicleId;
      _descripcionController.text = mantenimiento.description;
      if (mantenimiento.targetMileage != null) {
        _kilometrajeController.text = '${mantenimiento.targetMileage}';
      }
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final provider = context.read<VehiclesProvider>();
        if (provider.vehiculos.isEmpty) {
          provider.recargar();
        }
      });
    }
  }

  @override
  void dispose() {
    _descripcionController.dispose();
    _kilometrajeController.dispose();
    super.dispose();
  }

  String? _fechaCorta(String? fecha) =>
      fecha != null && fecha.length >= 10 ? fecha.substring(0, 10) : fecha;

  Future<void> _guardar() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }
    // RN-11: al menos uno de los dos umbrales.
    final tieneFecha = _fechaObjetivo != null;
    final tieneKilometraje = _kilometrajeController.text.trim().isNotEmpty;
    if (!tieneFecha && !tieneKilometraje) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Indique fecha objetivo, kilometraje o ambos.'),
          backgroundColor: MotorixColores.error,
        ),
      );
      return;
    }

    setState(() => _guardando = true);
    final provider = context.read<MaintenancesProvider>();
    final creado = await provider.registrar(
      vehicleId: _vehicleId!,
      descripcion: _descripcionController.text.trim(),
      targetDate: _fechaObjetivo?.toIso8601String().substring(0, 10),
      targetMileage: tieneKilometraje
          ? int.parse(_kilometrajeController.text.trim())
          : null,
    );
    if (!mounted) return;
    setState(() => _guardando = false);

    if (creado != null) {
      Navigator.of(context).pop();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(provider.error ?? 'No se pudo registrar el mantenimiento.'),
          backgroundColor: MotorixColores.error,
        ),
      );
    }
  }

  Future<void> _completar() async {
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Marcar como completado'),
        content: Text(
            '¿El mantenimiento "${widget.mantenimiento!.description}" se realizó? '
            'Esta acción es manual y no se puede deshacer.'),
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
    if (confirmado != true || !mounted) return;

    final ok = await context
        .read<MaintenancesProvider>()
        .completar(widget.mantenimiento!.id!);
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(context.read<MaintenancesProvider>().error ??
              'No se pudo completar el mantenimiento.'),
          backgroundColor: MotorixColores.error,
        ),
      );
    }
  }

  Future<void> _cancelar() async {
    final motivoController = TextEditingController();
    final cancelado = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Cancelar mantenimiento'),
        content: TextField(
          controller: motivoController,
          autofocus: true,
          maxLength: 255,
          decoration: const InputDecoration(
            labelText: 'Motivo de la cancelación (obligatorio)',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Volver'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
                backgroundColor: MotorixColores.error),
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Cancelar mantenimiento'),
          ),
        ],
      ),
    );
    if (cancelado != true || !mounted) return;

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

    final ok = await context
        .read<MaintenancesProvider>()
        .cancelar(widget.mantenimiento!.id!, motivo);
    if (!mounted) return;
    if (ok) {
      Navigator.of(context).pop();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(context.read<MaintenancesProvider>().error ??
              'No se pudo cancelar el mantenimiento.'),
          backgroundColor: MotorixColores.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_esAlta
            ? 'Nuevo mantenimiento'
            : 'Detalle del mantenimiento'),
      ),
      body: _esAlta ? _formAlta() : _detalle(),
    );
  }

  /// Formulario de alta con motivo y umbrales configurables (RN-11).
  Widget _formAlta() {
    final vehiclesProvider = context.watch<VehiclesProvider>();
    final maintenancesProvider = context.watch<MaintenancesProvider>();

    return SingleChildScrollView(
      padding: const EdgeInsets.all(MotorixEspaciados.m),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DropdownButtonFormField<int>(
              initialValue: _vehicleId,
              decoration: const InputDecoration(labelText: 'Vehículo *'),
              items: [
                for (final vehiculo in vehiclesProvider.vehiculos)
                  DropdownMenuItem(
                    value: vehiculo.id,
                    child: Text(
                        '${vehiculo.plates} — ${vehiculo.brand} ${vehiculo.model}'),
                  ),
              ],
              onChanged: (valor) => setState(() => _vehicleId = valor),
              validator: (valor) =>
                  valor == null ? 'Seleccione el vehículo.' : null,
            ),
            const SizedBox(height: MotorixEspaciados.m),
            TextFormField(
              controller: _descripcionController,
              maxLength: 255,
              decoration: const InputDecoration(
                labelText: 'Descripción del servicio *',
                hintText: 'P. ej. Cambio de aceite y filtros',
              ),
              validator: (valor) =>
                  (valor == null || valor.trim().isEmpty)
                      ? 'La descripción es obligatoria.'
                      : null,
            ),
            const SizedBox(height: MotorixEspaciados.m),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.event_outlined,
                  color: MotorixColores.acento),
              title: Text(_fechaObjetivo == null
                  ? 'Fecha objetivo (opcional)'
                  : 'Fecha objetivo: ${_fechaCorta(_fechaObjetivo!.toIso8601String())}'),
              trailing: const Icon(Icons.calendar_today_outlined),
              onTap: () async {
                final ahora = DateTime.now();
                final seleccionada = await showDatePicker(
                  context: context,
                  initialDate: _fechaObjetivo ?? ahora.add(const Duration(days: 30)),
                  firstDate: ahora,
                  lastDate: ahora.add(const Duration(days: 365 * 2)),
                );
                if (seleccionada != null) {
                  setState(() => _fechaObjetivo = seleccionada);
                }
              },
            ),
            const SizedBox(height: MotorixEspaciados.s),
            TextFormField(
              controller: _kilometrajeController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Kilometraje objetivo (opcional)',
                hintText: 'P. ej. 90000',
              ),
              validator: (valor) {
                final texto = valor?.trim() ?? '';
                if (texto.isEmpty) return null;
                final numero = int.tryParse(texto);
                if (numero == null || numero <= 0) {
                  return 'Ingrese un número entero positivo.';
                }
                return null;
              },
            ),
            const SizedBox(height: MotorixEspaciados.m),
            Text(
              'Indique al menos un umbral: fecha, kilometraje o ambos (RN-11).',
              style: const TextStyle(color: MotorixColores.textoSecundario),
            ),
            if (maintenancesProvider.error != null)
              Padding(
                padding: const EdgeInsets.only(top: MotorixEspaciados.s),
                child: Text(
                  maintenancesProvider.error!,
                  style: const TextStyle(color: MotorixColores.error),
                ),
              ),
            const SizedBox(height: MotorixEspaciados.l),
            ElevatedButton.icon(
              icon: _guardando
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: const Text('Guardar mantenimiento'),
              onPressed: _guardando ? null : _guardar,
            ),
          ],
        ),
      ),
    );
  }

  /// Detalle con acciones de cumplimiento y cancelación (US3/US4).
  Widget _detalle() {
    final mantenimiento = widget.mantenimiento!;
    final esAdmin = context.watch<AuthProvider>().esAdmin;

    final umbral = <String>[
      if (mantenimiento.targetDate != null)
        'Fecha objetivo: ${_fechaCorta(mantenimiento.targetDate)}'
            '${mantenimiento.isOverdue ? ' (vencida)' : ''}',
      if (mantenimiento.targetMileage != null)
        'Kilometraje objetivo: ${mantenimiento.targetMileage} km'
            '${mantenimiento.isOverdue ? ' (alcanzado)' : ''}',
      'Kilometraje actual del vehículo: ${mantenimiento.kilometrajeActual} km',
    ];

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
                    children: [
                      Expanded(
                        child: Text(
                          mantenimiento.description,
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                      ),
                      _EtiquetaEstado(mantenimiento: mantenimiento),
                    ],
                  ),
                  const SizedBox(height: MotorixEspaciados.s),
                  if (mantenimiento.vehiculo != null)
                    Text(
                      '${mantenimiento.vehiculo!.marca} ${mantenimiento.vehiculo!.modelo} '
                      '— Placas ${mantenimiento.vehiculo!.placas}',
                      style: const TextStyle(
                          color: MotorixColores.textoSecundario),
                    ),
                  if (mantenimiento.cliente != null)
                    Text(
                      'Cliente: ${mantenimiento.cliente!.nombreCompleto} '
                      '(${mantenimiento.cliente!.telefono})',
                      style: const TextStyle(
                          color: MotorixColores.textoSecundario),
                    ),
                  const SizedBox(height: MotorixEspaciados.s),
                  for (final linea in umbral)
                    Padding(
                      padding: const EdgeInsets.only(
                          bottom: MotorixEspaciados.xs),
                      child: Text(linea),
                    ),
                  if (mantenimiento.cancellationReason != null)
                    Padding(
                      padding:
                          const EdgeInsets.only(top: MotorixEspaciados.s),
                      child: Text(
                        'Motivo de cancelación: ${mantenimiento.cancellationReason}',
                        style:
                            const TextStyle(color: MotorixColores.error),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: MotorixEspaciados.m),
          if (mantenimiento.pendiente) ...[
            ElevatedButton.icon(
              icon: const Icon(Icons.check_circle_outline),
              label: const Text('Marcar como completado'),
              onPressed: _completar,
            ),
            const SizedBox(height: MotorixEspaciados.s),
            // Cancelar es solo de administración: ocultar es comodidad (RN-15).
            if (esAdmin)
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                    foregroundColor: MotorixColores.error),
                icon: const Icon(Icons.cancel_outlined),
                label: const Text('Cancelar mantenimiento'),
                onPressed: _cancelar,
              ),
          ] else
            Text(
              mantenimiento.completado
                  ? 'Completado el ${_fechaCorta(mantenimiento.completedAt) ?? ''}.'
                  : 'Cancelado el ${_fechaCorta(mantenimiento.cancelledAt) ?? ''}.',
              style: const TextStyle(color: MotorixColores.textoSecundario),
            ),
        ],
      ),
    );
  }
}

/// Etiqueta de estado con los colores del design system.
class _EtiquetaEstado extends StatelessWidget {
  final Mantenimiento mantenimiento;

  const _EtiquetaEstado({required this.mantenimiento});

  @override
  Widget build(BuildContext context) {
    Color color;
    String texto;
    if (mantenimiento.completado) {
      color = MotorixColores.exito;
      texto = 'Completado';
    } else if (mantenimiento.cancelado) {
      color = MotorixColores.textoSecundario;
      texto = 'Cancelado';
    } else if (mantenimiento.isOverdue) {
      color = MotorixColores.error;
      texto = 'Vencido';
    } else {
      color = MotorixColores.advertencia;
      texto = 'Pendiente';
    }
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: MotorixEspaciados.s, vertical: MotorixEspaciados.xs),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(MotorixEspaciados.radio),
      ),
      child: Text(texto, style: TextStyle(color: color)),
    );
  }
}

/// Formulario de creación y edición de citas (T043, US1; FR-001/FR-002).
///
/// Selector de cliente activo y de sus vehículos (RN-2), fecha igual o
/// posterior a hoy y hora en formato HH:MM.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/appointment.dart';
import '../providers/appointments_provider.dart';
import '../providers/clients_provider.dart';
import '../providers/vehicles_provider.dart';

class AppointmentFormScreen extends StatefulWidget {
  final Cita? cita;

  const AppointmentFormScreen({super.key, this.cita});

  @override
  State<AppointmentFormScreen> createState() => _AppointmentFormScreenState();
}

class _AppointmentFormScreenState extends State<AppointmentFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _fecha;
  late final TextEditingController _hora;
  late final TextEditingController _motivo;
  int? _clientId;
  int? _vehicleId;
  bool _enviando = false;

  bool get _esEdicion => widget.cita != null;

  @override
  void initState() {
    super.initState();
    _fecha = TextEditingController(text: widget.cita?.appointmentDate ?? '');
    _hora = TextEditingController(text: widget.cita?.appointmentTime ?? '');
    _motivo = TextEditingController(text: widget.cita?.reason ?? '');
    _clientId = widget.cita?.clientId;
    _vehicleId = widget.cita?.vehicleId;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ClientsProvider>().recargar();
      context.read<VehiclesProvider>().recargar();
    });
  }

  @override
  void dispose() {
    _fecha.dispose();
    _hora.dispose();
    _motivo.dispose();
    super.dispose();
  }

  String _isoDe(DateTime fecha) =>
      '${fecha.year}-${fecha.month.toString().padLeft(2, '0')}-${fecha.day.toString().padLeft(2, '0')}';

  Future<void> _elegirFecha() async {
    final hoy = DateTime.now();
    final elegida = await showDatePicker(
      context: context,
      initialDate: _fecha.text.isNotEmpty
          ? (DateTime.tryParse(_fecha.text) ?? hoy)
          : hoy,
      firstDate: hoy,
      lastDate: hoy.add(const Duration(days: 365)),
    );
    if (elegida != null) {
      setState(() => _fecha.text = _isoDe(elegida));
    }
  }

  Future<void> _guardar() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final citas = context.read<AppointmentsProvider>();
    setState(() => _enviando = true);

    String hora = _hora.text.trim();
    if (hora.length == 5) hora = '$hora:00'; // HH:MM → HH:MM:SS aceptado por la API

    final exito = _esEdicion
        ? await citas.editar(
            id: widget.cita!.id!,
            clientId: _clientId!,
            vehicleId: _vehicleId!,
            appointmentDate: _fecha.text.trim(),
            appointmentTime: hora,
            reason: _motivo.text.trim(),
          )
        : await citas.crear(
            clientId: _clientId!,
            vehicleId: _vehicleId!,
            appointmentDate: _fecha.text.trim(),
            appointmentTime: hora,
            reason: _motivo.text.trim(),
          );

    if (!mounted) return;
    setState(() => _enviando = false);
    if (exito) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_esEdicion ? 'Cita actualizada.' : 'Cita registrada.'),
          backgroundColor: MotorixColores.exito,
        ),
      );
      Navigator.of(context).pop();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(citas.error ?? 'No se pudo guardar la cita.'),
          backgroundColor: MotorixColores.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final clientes = context.watch<ClientsProvider>().activos;
    final vehiculos = context.watch<VehiclesProvider>().vehiculos;
    final vehiculosDelCliente = [
      for (final vehiculo in vehiculos)
        if (vehiculo.clientId == _clientId) vehiculo,
    ];

    return Scaffold(
      appBar: AppBar(title: Text(_esEdicion ? 'Editar cita' : 'Nueva cita')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(MotorixEspaciados.l),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(MotorixEspaciados.l),
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      DropdownButtonFormField<int>(
                        initialValue: _clientId,
                        decoration: const InputDecoration(
                          labelText: 'Cliente *',
                          helperText: 'Solo clientes activos.',
                        ),
                        items: [
                          for (final cliente in clientes)
                            DropdownMenuItem(
                              value: cliente.id,
                              child: Text(cliente.fullName),
                            ),
                        ],
                        onChanged: (valor) => setState(() {
                          _clientId = valor;
                          _vehicleId = null;
                        }),
                        validator: (valor) =>
                            valor == null ? 'Seleccione el cliente.' : null,
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      DropdownButtonFormField<int>(
                        initialValue: _vehicleId,
                        decoration: const InputDecoration(
                          labelText: 'Vehículo *',
                          helperText: 'Solo vehículos del cliente seleccionado (RN-2).',
                        ),
                        items: [
                          for (final vehiculo in vehiculosDelCliente)
                            DropdownMenuItem(
                              value: vehiculo.id,
                              child: Text(
                                  '${vehiculo.plates} · ${vehiculo.brand} ${vehiculo.model}'),
                            ),
                        ],
                        onChanged: (valor) => setState(() => _vehicleId = valor),
                        validator: (valor) =>
                            valor == null ? 'Seleccione el vehículo.' : null,
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        controller: _fecha,
                        readOnly: true,
                        decoration: InputDecoration(
                          labelText: 'Fecha *',
                          suffixIcon: IconButton(
                            tooltip: 'Elegir fecha',
                            icon: const Icon(Icons.calendar_today_outlined),
                            onPressed: _elegirFecha,
                          ),
                        ),
                        validator: (valor) {
                          final texto = valor?.trim() ?? '';
                          final fecha = DateTime.tryParse(texto);
                          final hoy = DateTime.now();
                          final soloFecha =
                              DateTime(hoy.year, hoy.month, hoy.day);
                          if (fecha == null) {
                            return 'Seleccione la fecha de la cita.';
                          }
                          if (fecha.isBefore(soloFecha)) {
                            return 'La fecha no puede ser anterior a hoy.';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        controller: _hora,
                        decoration: const InputDecoration(
                          labelText: 'Hora *',
                          helperText: 'Formato HH:MM (ej. 10:30).',
                        ),
                        validator: (valor) {
                          final texto = valor?.trim() ?? '';
                          if (!RegExp(r'^(?:[01]\d|2[0-3]):[0-5]\d$')
                              .hasMatch(texto)) {
                            return 'Ingrese una hora válida en formato HH:MM.';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        controller: _motivo,
                        decoration:
                            const InputDecoration(labelText: 'Motivo de la visita *'),
                        validator: (v) => (v == null || v.trim().isEmpty)
                            ? 'El motivo es obligatorio.'
                            : null,
                      ),
                      const SizedBox(height: MotorixEspaciados.l),
                      ElevatedButton(
                        onPressed: _enviando ? null : _guardar,
                        child: Text(_enviando
                            ? 'Guardando…'
                            : (_esEdicion ? 'Guardar cambios' : 'Agendar cita')),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

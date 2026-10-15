/// Formulario de creación de órdenes de servicio (T031, US4; RN-2/RN-3/RN-4).
///
/// El cliente se deriva del vehículo en el servidor (RN-2); aquí solo se
/// muestra el propietario seleccionado. Si el kilometraje es menor al previo,
/// el servidor responde KILOMETRAJE_INVALIDO y se ofrece la corrección
/// explícita con confirmación (FR-013).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../providers/auth_provider.dart';
import '../providers/orders_provider.dart';
import '../providers/vehicles_provider.dart';

class OrderFormScreen extends StatefulWidget {
  const OrderFormScreen({super.key});

  @override
  State<OrderFormScreen> createState() => _OrderFormScreenState();
}

class _OrderFormScreenState extends State<OrderFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _kilometraje = TextEditingController();
  final _motivo = TextEditingController();
  final _notas = TextEditingController();
  int? _vehicleId;
  int? _mechanicId;
  bool _enviando = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<VehiclesProvider>().recargar();
      if (context.read<AuthProvider>().puedeGestionarOrdenes) {
        context.read<OrdersProvider>().recargarMecanicos();
      }
    });
  }

  @override
  void dispose() {
    _kilometraje.dispose();
    _motivo.dispose();
    _notas.dispose();
    super.dispose();
  }

  Future<void> _guardar({bool correccion = false}) async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final ordenes = context.read<OrdersProvider>();
    setState(() => _enviando = true);

    final exito = await ordenes.crear(
      vehicleId: _vehicleId!,
      mileageEntry: int.parse(_kilometraje.text.trim()),
      reason: _motivo.text.trim(),
      notes: _notas.text.trim(),
      mileageCorrection: correccion,
      mechanicId: _mechanicId,
    );

    if (!mounted) return;
    setState(() => _enviando = false);

    if (exito) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Orden registrada en estado Recibido.'),
          backgroundColor: MotorixColores.exito,
        ),
      );
      Navigator.of(context).pop();
      return;
    }

    // RN-4: kilometraje menor al previo → ofrecer corrección explícita.
    if (ordenes.codigoError == 'KILOMETRAJE_INVALIDO' && !correccion) {
      final confirmar = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Corregir kilometraje'),
          content: Text(
            '${ordenes.error}\n\nSi el odómetro fue reparado o reemplazado, '
            'confirme para registrar la orden con la corrección explícita (RN-4).',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancelar'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Confirmar corrección'),
            ),
          ],
        ),
      );
      if (confirmar == true && mounted) {
        await _guardar(correccion: true);
      }
      return;
    }

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ordenes.error ?? 'No se pudo registrar la orden.'),
          backgroundColor: MotorixColores.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final vehiculos = context.watch<VehiclesProvider>().vehiculos;
    final ordenes = context.watch<OrdersProvider>();
    final auth = context.watch<AuthProvider>();

    VehiculoSeleccionado? vehiculoElegido;
    for (final vehiculo in vehiculos) {
      if (vehiculo.id == _vehicleId) {
        vehiculoElegido = VehiculoSeleccionado(
          plates: vehiculo.plates,
          descripcion:
              '${vehiculo.brand} ${vehiculo.model} (${vehiculo.year})',
          duenio: vehiculo.duenio?.fullName ?? '—',
        );
      }
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Nueva orden de servicio')),
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
                        initialValue: _vehicleId,
                        decoration: const InputDecoration(
                          labelText: 'Vehículo *',
                          helperText:
                              'El cliente propietario se deriva del vehículo (RN-2).',
                        ),
                        items: [
                          for (final vehiculo in vehiculos)
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
                      if (vehiculoElegido != null)
                        Padding(
                          padding:
                              const EdgeInsets.only(top: MotorixEspaciados.s),
                          child: Text(
                            'Propietario: ${vehiculoElegido.duenio}',
                            style: const TextStyle(
                                color: MotorixColores.textoSecundario),
                          ),
                        ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        controller: _kilometraje,
                        decoration: const InputDecoration(
                          labelText: 'Kilometraje de entrada *',
                          helperText:
                              'Debe ser mayor o igual al de la última orden (RN-3/RN-4).',
                        ),
                        keyboardType: TextInputType.number,
                        validator: (valor) {
                          final km = int.tryParse(valor?.trim() ?? '');
                          if (km == null || km < 0) {
                            return 'Ingrese un kilometraje entero mayor o igual a cero.';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        controller: _motivo,
                        decoration: const InputDecoration(labelText: 'Motivo de ingreso *'),
                        validator: (v) => (v == null || v.trim().isEmpty)
                            ? 'El motivo es obligatorio.'
                            : null,
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        controller: _notas,
                        decoration: const InputDecoration(
                            labelText: 'Notas (opcional)'),
                      ),
                      if (auth.puedeGestionarOrdenes) ...[
                        const SizedBox(height: MotorixEspaciados.m),
                        DropdownButtonFormField<int?>(
                          initialValue: _mechanicId,
                          decoration: const InputDecoration(
                            labelText: 'Mecánico (opcional)',
                            helperText:
                                'Asignación manual; puede reasignarse después (FR-008).',
                          ),
                          items: [
                            const DropdownMenuItem<int?>(
                                value: null, child: Text('Sin asignar')),
                            for (final mecanico in ordenes.mecanicos)
                              DropdownMenuItem<int?>(
                                value: mecanico.id,
                                child: Text(mecanico.fullName),
                              ),
                          ],
                          onChanged: (valor) =>
                              setState(() => _mechanicId = valor),
                        ),
                      ],
                      const SizedBox(height: MotorixEspaciados.l),
                      ElevatedButton(
                        onPressed: _enviando ? null : _guardar,
                        child: Text(_enviando
                            ? 'Guardando…'
                            : 'Registrar orden'),
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

/// Datos mínimos del vehículo elegido para mostrar el propietario.
class VehiculoSeleccionado {
  final String plates;
  final String descripcion;
  final String duenio;

  const VehiculoSeleccionado({
    required this.plates,
    required this.descripcion,
    required this.duenio,
  });
}

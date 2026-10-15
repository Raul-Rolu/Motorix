/// Formulario de registro y edición de vehículos (T062 US5, US6).
///
/// RN-1: no existe vehículo sin propietario; el selector solo ofrece clientes
/// activos (FR-015). Clarificación 2: placas, marca, modelo y año obligatorios.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/vehicle.dart';
import '../providers/clients_provider.dart';
import '../providers/vehicles_provider.dart';

class VehicleFormScreen extends StatefulWidget {
  final Vehiculo? vehiculo;
  const VehicleFormScreen({super.key, this.vehiculo});

  @override
  State<VehicleFormScreen> createState() => _VehicleFormScreenState();
}

class _VehicleFormScreenState extends State<VehicleFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _placas;
  late final TextEditingController _marca;
  late final TextEditingController _modelo;
  late final TextEditingController _anio;
  late final TextEditingController _color;
  int? _clientId;
  bool _enviando = false;

  bool get _esEdicion => widget.vehiculo != null;

  @override
  void initState() {
    super.initState();
    _placas = TextEditingController(text: widget.vehiculo?.plates ?? '');
    _marca = TextEditingController(text: widget.vehiculo?.brand ?? '');
    _modelo = TextEditingController(text: widget.vehiculo?.model ?? '');
    _anio = TextEditingController(
        text: widget.vehiculo == null ? '' : '${widget.vehiculo!.year}');
    _color = TextEditingController(text: widget.vehiculo?.color ?? '');
    _clientId = widget.vehiculo?.clientId;
  }

  @override
  void dispose() {
    _placas.dispose();
    _marca.dispose();
    _modelo.dispose();
    _anio.dispose();
    _color.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final vehiculos = context.read<VehiclesProvider>();
    setState(() => _enviando = true);

    final exito = _esEdicion
        ? await vehiculos.editar(
            id: widget.vehiculo!.id!,
            clientId: _clientId!,
            plates: _placas.text.trim(),
            brand: _marca.text.trim(),
            model: _modelo.text.trim(),
            year: int.parse(_anio.text.trim()),
            color: _color.text.trim(),
          )
        : await vehiculos.crear(
            clientId: _clientId!,
            plates: _placas.text.trim(),
            brand: _marca.text.trim(),
            model: _modelo.text.trim(),
            year: int.parse(_anio.text.trim()),
            color: _color.text.trim(),
          );

    if (!mounted) return;
    setState(() => _enviando = false);
    if (exito) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content:
              Text(_esEdicion ? 'Vehículo actualizado.' : 'Vehículo registrado.'),
          backgroundColor: MotorixColores.exito,
        ),
      );
      Navigator.of(context).pop();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(vehiculos.error ?? 'No se pudo guardar el vehículo.'),
          backgroundColor: MotorixColores.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final clientes = context.watch<ClientsProvider>().activos;

    return Scaffold(
      appBar: AppBar(
          title: Text(_esEdicion ? 'Editar vehículo' : 'Nuevo vehículo')),
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
                          labelText: 'Propietario *',
                          helperText: 'Debe seleccionar un cliente activo (RN-1).',
                        ),
                        items: [
                          for (final cliente in clientes)
                            DropdownMenuItem(
                              value: cliente.id,
                              child: Text(cliente.fullName),
                            ),
                        ],
                        onChanged: (valor) => setState(() => _clientId = valor),
                        validator: (valor) =>
                            valor == null ? 'Seleccione el propietario.' : null,
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        controller: _placas,
                        decoration: const InputDecoration(labelText: 'Placas *'),
                        textCapitalization: TextCapitalization.characters,
                        validator: (v) => (v == null || v.trim().isEmpty || v.trim().length > 20)
                            ? 'Las placas son obligatorias (máx. 20).'
                            : null,
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        controller: _marca,
                        decoration: const InputDecoration(labelText: 'Marca *'),
                        validator: (v) => (v == null || v.trim().isEmpty)
                            ? 'La marca es obligatoria.'
                            : null,
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        controller: _modelo,
                        decoration: const InputDecoration(labelText: 'Modelo *'),
                        validator: (v) => (v == null || v.trim().isEmpty)
                            ? 'El modelo es obligatorio.'
                            : null,
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        controller: _anio,
                        decoration: const InputDecoration(labelText: 'Año *'),
                        keyboardType: TextInputType.number,
                        validator: (v) {
                          final anio = int.tryParse(v?.trim() ?? '');
                          final maximo = DateTime.now().year + 1;
                          if (anio == null || anio < 1900 || anio > maximo) {
                            return 'Ingrese un año entre 1900 y $maximo.';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        controller: _color,
                        decoration: const InputDecoration(
                            labelText: 'Color (opcional)'),
                      ),
                      const SizedBox(height: MotorixEspaciados.l),
                      ElevatedButton(
                        onPressed: _enviando ? null : _guardar,
                        child: Text(_esEdicion ? 'Guardar cambios' : 'Registrar vehículo'),
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

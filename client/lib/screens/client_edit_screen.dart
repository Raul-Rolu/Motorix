/// Edición de clientes (T052, US4).
///
/// Prellena los datos existentes; la edición conserva los vehículos asociados
/// (FR-006) y pide confirmación antes de guardar cambios (FR-013).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/client.dart';
import '../providers/clients_provider.dart';

class ClientEditScreen extends StatefulWidget {
  final Cliente cliente;
  const ClientEditScreen({super.key, required this.cliente});

  @override
  State<ClientEditScreen> createState() => _ClientEditScreenState();
}

class _ClientEditScreenState extends State<ClientEditScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nombre;
  late final TextEditingController _telefono;
  late final TextEditingController _correo;
  late final TextEditingController _notas;
  bool _enviando = false;

  @override
  void initState() {
    super.initState();
    _nombre = TextEditingController(text: widget.cliente.fullName);
    _telefono = TextEditingController(text: widget.cliente.phone);
    _correo = TextEditingController(text: widget.cliente.email ?? '');
    _notas = TextEditingController(text: widget.cliente.notes ?? '');
  }

  @override
  void dispose() {
    _nombre.dispose();
    _telefono.dispose();
    _correo.dispose();
    _notas.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    // Confirmación obligatoria antes de modificar el registro (FR-013).
    final confirmar = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Guardar cambios'),
        content: const Text('¿Desea actualizar la información de este cliente?'),
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
    );
    if (confirmar != true || !mounted) return;

    final provider = context.read<ClientsProvider>();
    setState(() => _enviando = true);
    final exito = await provider.editar(
      id: widget.cliente.id!,
      fullName: _nombre.text.trim(),
      phone: _telefono.text.trim(),
      email: _correo.text.trim(),
      notes: _notas.text.trim(),
    );

    if (!mounted) return;
    setState(() => _enviando = false);
    if (exito) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Cliente actualizado.'),
          backgroundColor: MotorixColores.exito,
        ),
      );
      Navigator.of(context).pop();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(provider.error ?? 'No se pudo actualizar el cliente.'),
          backgroundColor: MotorixColores.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Editar: ${widget.cliente.fullName}')),
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
                      TextFormField(
                        controller: _nombre,
                        decoration: const InputDecoration(labelText: 'Nombre completo *'),
                        validator: (v) => (v == null || v.trim().isEmpty)
                            ? 'El nombre completo es obligatorio.'
                            : null,
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        controller: _telefono,
                        decoration: const InputDecoration(labelText: 'Teléfono *'),
                        validator: (v) {
                          final valor = v?.trim() ?? '';
                          return RegExp(r'^[0-9+\-\s()]{7,20}$').hasMatch(valor)
                              ? null
                              : 'El teléfono es obligatorio (7 a 20 dígitos).';
                        },
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        controller: _correo,
                        decoration: const InputDecoration(
                            labelText: 'Correo electrónico (opcional)'),
                        validator: (v) {
                          final valor = v?.trim() ?? '';
                          if (valor.isEmpty) return null;
                          return RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$')
                                  .hasMatch(valor)
                              ? null
                              : 'Ingrese un correo válido.';
                        },
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        controller: _notas,
                        maxLength: 255,
                        decoration: const InputDecoration(
                          labelText: 'Notas (opcional)',
                          counterText: '',
                        ),
                      ),
                      const SizedBox(height: MotorixEspaciados.l),
                      ElevatedButton(
                        onPressed: _enviando ? null : _guardar,
                        child: const Text('Guardar cambios'),
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

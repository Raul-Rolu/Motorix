/// Formulario de registro de clientes (T049, US3).
///
/// Regla de negocio: nombre completo y teléfono obligatorios; correo opcional
/// pero con formato válido si se informa (clarificación 1).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../providers/clients_provider.dart';

class ClientFormScreen extends StatefulWidget {
  const ClientFormScreen({super.key});

  @override
  State<ClientFormScreen> createState() => _ClientFormScreenState();
}

class _ClientFormScreenState extends State<ClientFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nombre = TextEditingController();
  final _telefono = TextEditingController();
  final _correo = TextEditingController();
  final _notas = TextEditingController();
  bool _enviando = false;

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
    final provider = context.read<ClientsProvider>();
    setState(() => _enviando = true);

    final exito = await provider.crear(
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
          content: Text('Cliente registrado.'),
          backgroundColor: MotorixColores.exito,
        ),
      );
      Navigator.of(context).pop();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(provider.error ?? 'No se pudo registrar el cliente.'),
          backgroundColor: MotorixColores.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nuevo cliente')),
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
                        key: const Key('campoNombreCliente'),
                        controller: _nombre,
                        decoration: const InputDecoration(
                          labelText: 'Nombre completo *',
                        ),
                        validator: (v) => (v == null || v.trim().isEmpty || v.trim().length > 100)
                            ? 'El nombre completo es obligatorio (máx. 100).'
                            : null,
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        key: const Key('campoTelefonoCliente'),
                        controller: _telefono,
                        decoration: const InputDecoration(
                          labelText: 'Teléfono *',
                          hintText: 'Ej. 5512345678',
                        ),
                        validator: (v) {
                          final valor = v?.trim() ?? '';
                          final valido =
                              RegExp(r'^[0-9+\-\s()]{7,20}$').hasMatch(valor);
                          return valido
                              ? null
                              : 'El teléfono es obligatorio (7 a 20 dígitos).';
                        },
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        controller: _correo,
                        decoration: const InputDecoration(
                          labelText: 'Correo electrónico (opcional)',
                        ),
                        validator: (v) {
                          final valor = v?.trim() ?? '';
                          if (valor.isEmpty) return null;
                          final valido = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$')
                              .hasMatch(valor);
                          return valido ? null : 'Ingrese un correo válido.';
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
                        key: const Key('botonGuardarCliente'),
                        onPressed: _enviando ? null : _guardar,
                        child: const Text('Registrar cliente'),
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

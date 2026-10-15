/// Formulario de creación y edición de usuarios (T039, US2).
///
/// La edición no incluye la contraseña (cambio propio vía /auth/change-password);
/// toda operación sensible muestra confirmación (FR-013).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/user.dart';
import '../providers/users_provider.dart';

class UserFormScreen extends StatefulWidget {
  final Usuario? usuario;
  const UserFormScreen({super.key, this.usuario});

  @override
  State<UserFormScreen> createState() => _UserFormScreenState();
}

class _UserFormScreenState extends State<UserFormScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _username;
  late final TextEditingController _email;
  late final TextEditingController _nombre;
  late final TextEditingController _contrasena;
  late String _rol;
  bool _enviando = false;

  bool get _esEdicion => widget.usuario != null;

  @override
  void initState() {
    super.initState();
    _username = TextEditingController(text: widget.usuario?.username ?? '');
    _email = TextEditingController(text: widget.usuario?.email ?? '');
    _nombre = TextEditingController(text: widget.usuario?.fullName ?? '');
    _contrasena = TextEditingController();
    _rol = widget.usuario?.role ?? 'RECEPTIONIST';
  }

  @override
  void dispose() {
    _username.dispose();
    _email.dispose();
    _nombre.dispose();
    _contrasena.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final provider = context.read<UsersProvider>();
    setState(() => _enviando = true);

    final exito = _esEdicion
        ? await provider.editar(
            id: widget.usuario!.id!,
            username: _username.text.trim(),
            email: _email.text.trim(),
            fullName: _nombre.text.trim(),
            role: _rol,
          )
        : await provider.crear(
            username: _username.text.trim(),
            email: _email.text.trim(),
            password: _contrasena.text,
            fullName: _nombre.text.trim(),
            role: _rol,
          );

    if (!mounted) return;
    setState(() => _enviando = false);
    if (exito) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_esEdicion ? 'Usuario actualizado.' : 'Usuario creado.'),
          backgroundColor: MotorixColores.exito,
        ),
      );
      Navigator.of(context).pop();
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(provider.error ?? 'No se pudo guardar el usuario.'),
          backgroundColor: MotorixColores.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_esEdicion ? 'Editar usuario' : 'Nuevo usuario')),
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
                        controller: _username,
                        decoration: const InputDecoration(labelText: 'Nombre de usuario'),
                        enabled: !_esEdicion,
                        validator: (v) => (v == null || v.trim().isEmpty || v.trim().length > 50)
                            ? 'El nombre de usuario es obligatorio (máx. 50).'
                            : null,
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        controller: _nombre,
                        decoration: const InputDecoration(labelText: 'Nombre completo'),
                        validator: (v) => (v == null || v.trim().isEmpty || v.trim().length > 100)
                            ? 'El nombre completo es obligatorio (máx. 100).'
                            : null,
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        controller: _email,
                        decoration: const InputDecoration(labelText: 'Correo electrónico'),
                        validator: (v) {
                          final valor = v?.trim() ?? '';
                          final valido = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$').hasMatch(valor);
                          return valido ? null : 'Ingrese un correo válido.';
                        },
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      if (!_esEdicion) ...[
                        TextFormField(
                          controller: _contrasena,
                          decoration: const InputDecoration(
                            labelText: 'Contraseña',
                            helperText: 'Mínimo 8 caracteres, con mayúscula, minúscula y número.',
                          ),
                          obscureText: true,
                          validator: (v) {
                            final valor = v ?? '';
                            final valido = valor.length >= 8 &&
                                valor.contains(RegExp(r'[A-Z]')) &&
                                valor.contains(RegExp(r'[a-z]')) &&
                                valor.contains(RegExp(r'[0-9]'));
                            return valido
                                ? null
                                : 'La contraseña no cumple la política mínima.';
                          },
                        ),
                        const SizedBox(height: MotorixEspaciados.m),
                      ],
                      DropdownButtonFormField<String>(
                        initialValue: _rol,
                        decoration: const InputDecoration(labelText: 'Rol'),
                        items: const [
                          DropdownMenuItem(value: 'ADMIN', child: Text('Administrador')),
                          DropdownMenuItem(
                              value: 'RECEPTIONIST', child: Text('Recepcionista')),
                          DropdownMenuItem(value: 'MECHANIC', child: Text('Mecánico')),
                        ],
                        onChanged: (valor) => setState(() => _rol = valor ?? _rol),
                      ),
                      const SizedBox(height: MotorixEspaciados.l),
                      ElevatedButton(
                        onPressed: _enviando ? null : _guardar,
                        child: Text(_esEdicion ? 'Guardar cambios' : 'Crear usuario'),
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

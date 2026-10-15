/// Pantalla de inicio de sesión (T029, US1).
///
/// Campo único de identificación: acepta usuario O correo electrónico (RN-16).
/// Valida los campos en la interfaz y muestra los errores del servidor sin
/// revelar si la cuenta existe.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../providers/auth_provider.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _identificacionController = TextEditingController();
  final _contrasenaController = TextEditingController();

  @override
  void dispose() {
    _identificacionController.dispose();
    _contrasenaController.dispose();
    super.dispose();
  }

  Future<void> _iniciarSesion() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    final auth = context.read<AuthProvider>();
    final exito = await auth.login(
      _identificacionController.text,
      _contrasenaController.text,
    );
    if (exito && mounted) {
      Navigator.of(context).pushNamedAndRemoveUntil('/inicio', (ruta) => false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(MotorixEspaciados.xl),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 380),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(MotorixEspaciados.l),
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Motorix',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: MotorixEspaciados.xs),
                      Text(
                        'Sistema de Gestión para Taller Mecánico',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: MotorixColores.textoSecundario,
                            ),
                      ),
                      const SizedBox(height: MotorixEspaciados.l),
                      TextFormField(
                        key: const Key('campoIdentificacion'),
                        controller: _identificacionController,
                        decoration: const InputDecoration(
                          labelText: 'Usuario o correo electrónico',
                          prefixIcon: Icon(Icons.person_outline),
                        ),
                        textInputAction: TextInputAction.next,
                        validator: (valor) =>
                            (valor == null || valor.trim().isEmpty)
                                ? 'Ingrese su usuario o correo electrónico.'
                                : null,
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      TextFormField(
                        key: const Key('campoContrasena'),
                        controller: _contrasenaController,
                        decoration: const InputDecoration(
                          labelText: 'Contraseña',
                          prefixIcon: Icon(Icons.lock_outline),
                        ),
                        obscureText: true,
                        onFieldSubmitted: (_) => _iniciarSesion(),
                        validator: (valor) => (valor == null || valor.isEmpty)
                            ? 'Ingrese su contraseña.'
                            : null,
                      ),
                      if (auth.error != null) ...[
                        const SizedBox(height: MotorixEspaciados.m),
                        Container(
                          padding: const EdgeInsets.all(MotorixEspaciados.s),
                          decoration: BoxDecoration(
                            color: MotorixColores.errorSuave,
                            borderRadius:
                                BorderRadius.circular(MotorixEspaciados.radio),
                          ),
                          child: Text(
                            auth.error!,
                            key: const Key('mensajeError'),
                            style: const TextStyle(color: MotorixColores.error),
                          ),
                        ),
                      ],
                      if (auth.sesionExpirada) ...[
                        const SizedBox(height: MotorixEspaciados.m),
                        const Text(
                          'Su sesión expiró; inicie sesión de nuevo.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: MotorixColores.advertencia),
                        ),
                      ],
                      const SizedBox(height: MotorixEspaciados.l),
                      ElevatedButton(
                        key: const Key('botonIniciarSesion'),
                        onPressed: auth.cargando ? null : _iniciarSesion,
                        child: auth.cargando
                            ? const SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : const Text('Iniciar sesión'),
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

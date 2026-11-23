/// Configuración (008-configuracion-seguridad-reportes, T022; FR-002, CA-1).
///
/// Pantalla solo para ADMIN (la autorización real es del servidor, RN-15). Por
/// ahora tiene la sección «Datos del taller» (nombre, dirección y teléfono que
/// muestra el ticket); las secciones de operación y seguridad se agregan en las
/// historias siguientes. Sin tarjetas (docs/design-system.md 8.6): secciones con
/// título y divisores. Estados de carga, error y sin permiso según 8.4 y
/// confirmación de éxito en snackbar.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../providers/settings_provider.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<SettingsProvider>().cargar();
    });
  }

  @override
  Widget build(BuildContext context) {
    final proveedor = context.watch<SettingsProvider>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
              MotorixEspaciados.m, MotorixEspaciados.m, MotorixEspaciados.s, MotorixEspaciados.s),
          child: Row(
            children: [
              Expanded(
                child: Text('Configuración', style: Theme.of(context).textTheme.titleLarge),
              ),
              IconButton(
                key: const Key('botonRefrescarAjustes'),
                tooltip: 'Actualizar',
                icon: const Icon(Icons.refresh),
                onPressed: proveedor.cargando ? null : () => proveedor.cargar(),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(child: _cuerpo(proveedor)),
      ],
    );
  }

  Widget _cuerpo(SettingsProvider proveedor) {
    if (proveedor.ajustes == null && proveedor.error == null) {
      return const Center(
        child: SizedBox(
          key: Key('ajustesCargando'),
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    if (proveedor.ajustes == null) {
      return Center(
        key: const Key('ajustesError'),
        child: Padding(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                proveedor.error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: MotorixColores.error),
              ),
              if (!proveedor.sinPermiso) ...[
                const SizedBox(height: MotorixEspaciados.s),
                OutlinedButton(
                  key: const Key('botonReintentarAjustes'),
                  onPressed: () => proveedor.cargar(),
                  child: const Text('Reintentar'),
                ),
              ],
            ],
          ),
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.all(MotorixEspaciados.m),
      children: [
        Align(
          alignment: Alignment.topLeft,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 640),
            child: _SeccionTaller(proveedor: proveedor),
          ),
        ),
      ],
    );
  }
}

/// Sección «Datos del taller»: lo que encabeza cada ticket nuevo.
class _SeccionTaller extends StatefulWidget {
  final SettingsProvider proveedor;

  const _SeccionTaller({required this.proveedor});

  @override
  State<_SeccionTaller> createState() => _SeccionTallerState();
}

class _SeccionTallerState extends State<_SeccionTaller> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nombre;
  late final TextEditingController _direccion;
  late final TextEditingController _telefono;
  bool _guardando = false;

  @override
  void initState() {
    super.initState();
    final taller = widget.proveedor.ajustes!.taller;
    _nombre = TextEditingController(text: taller.nombre);
    _direccion = TextEditingController(text: taller.direccion);
    _telefono = TextEditingController(text: taller.telefono);
  }

  @override
  void dispose() {
    _nombre.dispose();
    _direccion.dispose();
    _telefono.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _guardando = true);
    final resultado = await widget.proveedor.guardarTaller(
      nombre: _nombre.text,
      direccion: _direccion.text,
      telefono: _telefono.text,
    );
    if (!mounted) return;
    setState(() => _guardando = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(resultado.mensaje),
        backgroundColor: resultado.exito ? MotorixColores.exito : MotorixColores.error,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Datos del taller', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: MotorixEspaciados.xs),
          const Text(
            'Aparecen en el encabezado de los tickets nuevos. Los tickets ya emitidos no cambian.',
            style: TextStyle(color: MotorixColores.textoSecundario),
          ),
          const SizedBox(height: MotorixEspaciados.m),
          TextFormField(
            key: const Key('campoNombreTaller'),
            controller: _nombre,
            maxLength: 100,
            decoration: const InputDecoration(labelText: 'Nombre del taller'),
            validator: (valor) =>
                (valor ?? '').trim().isEmpty ? 'El nombre del taller es obligatorio.' : null,
          ),
          TextFormField(
            key: const Key('campoDireccionTaller'),
            controller: _direccion,
            maxLength: 150,
            decoration: const InputDecoration(labelText: 'Dirección'),
          ),
          TextFormField(
            key: const Key('campoTelefonoTaller'),
            controller: _telefono,
            maxLength: 30,
            decoration: const InputDecoration(labelText: 'Teléfono'),
          ),
          const SizedBox(height: MotorixEspaciados.m),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(
              key: const Key('botonGuardarTaller'),
              onPressed: _guardando ? null : _guardar,
              child: _guardando
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Guardar'),
            ),
          ),
          const SizedBox(height: MotorixEspaciados.l),
          const Divider(height: 1),
        ],
      ),
    );
  }
}

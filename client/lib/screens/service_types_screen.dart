/// Catálogo de servicios (008-configuracion-seguridad-reportes, T040; FR-006,
/// CA-4, RN-12).
///
/// Solo para ADMIN (la autorización real es del servidor, RN-15). Lista los tipos
/// de servicio con su intervalo en días y/o kilómetros, y permite crear, editar y
/// desactivar. No se borra ningún tipo: un tipo usado solo se desactiva. Lista
/// densa con divisores (sin tarjetas, docs/design-system.md 8.6), estados de
/// carga, vacío y error según 8.4 y confirmación «Confirmar» / «Cancelar» antes
/// de desactivar (8.5).
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/service_type.dart';
import '../providers/service_types_provider.dart';

class ServiceTypesScreen extends StatefulWidget {
  const ServiceTypesScreen({super.key});

  @override
  State<ServiceTypesScreen> createState() => _ServiceTypesScreenState();
}

class _ServiceTypesScreenState extends State<ServiceTypesScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<ServiceTypesProvider>().cargar();
    });
  }

  void _avisar(String mensaje, {required bool exito}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(mensaje),
        backgroundColor: exito ? MotorixColores.exito : MotorixColores.error,
      ),
    );
  }

  Future<void> _abrirFormulario([TipoServicio? tipo]) async {
    final mensaje = await showDialog<String>(
      context: context,
      builder: (_) => _DialogoTipoServicio(tipo: tipo),
    );
    if (mensaje != null && mounted) _avisar(mensaje, exito: true);
  }

  Future<void> _cambiarEstado(TipoServicio tipo) async {
    final proveedor = context.read<ServiceTypesProvider>();
    if (tipo.activo) {
      // Desactivar exige confirmación (docs/design-system.md 8.5).
      final confirmado = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Desactivar tipo de servicio'),
          content: Text(
            '¿Seguro que quieres desactivar "${tipo.nombre}"? Ya no se podrá elegir en líneas nuevas; '
            'las líneas existentes lo conservan.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Cancelar'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Confirmar'),
            ),
          ],
        ),
      );
      if (confirmado != true || !mounted) return;
    }
    final resultado = await proveedor.cambiarEstado(tipo.id, activo: !tipo.activo);
    if (mounted) _avisar(resultado.mensaje, exito: resultado.exito);
  }

  @override
  Widget build(BuildContext context) {
    final proveedor = context.watch<ServiceTypesProvider>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
              MotorixEspaciados.m, MotorixEspaciados.m, MotorixEspaciados.m, MotorixEspaciados.s),
          child: Row(
            children: [
              Expanded(
                child: Text('Catálogo de servicios', style: Theme.of(context).textTheme.titleLarge),
              ),
              IconButton(
                key: const Key('botonRefrescarTipos'),
                tooltip: 'Actualizar',
                icon: const Icon(Icons.refresh),
                onPressed: proveedor.cargando ? null : () => proveedor.cargar(),
              ),
              const SizedBox(width: MotorixEspaciados.s),
              FilledButton.icon(
                key: const Key('botonNuevoTipo'),
                onPressed: () => _abrirFormulario(),
                icon: const Icon(Icons.add),
                label: const Text('Nuevo tipo'),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(child: _cuerpo(proveedor)),
      ],
    );
  }

  Widget _cuerpo(ServiceTypesProvider proveedor) {
    if (!proveedor.cargado && proveedor.error == null) {
      return const Center(
        child: SizedBox(
          key: Key('tiposCargando'),
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    if (!proveedor.cargado) {
      return Center(
        key: const Key('tiposError'),
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
              const SizedBox(height: MotorixEspaciados.s),
              OutlinedButton(
                key: const Key('botonReintentarTipos'),
                onPressed: () => proveedor.cargar(),
                child: const Text('Reintentar'),
              ),
            ],
          ),
        ),
      );
    }
    if (proveedor.tipos.isEmpty) {
      return const Center(
        key: Key('tiposVacio'),
        child: Padding(
          padding: EdgeInsets.all(MotorixEspaciados.m),
          child: Text(
            'No hay tipos de servicio registrados.',
            textAlign: TextAlign.center,
            style: TextStyle(color: MotorixColores.textoSecundario),
          ),
        ),
      );
    }
    return ListView.separated(
      itemCount: proveedor.tipos.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (_, indice) {
        final tipo = proveedor.tipos[indice];
        return ListTile(
          key: Key('tipoFila-${tipo.id}'),
          dense: true,
          title: Text(
            tipo.nombre,
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: tipo.activo ? MotorixColores.textoPrincipal : MotorixColores.textoSecundario,
            ),
          ),
          subtitle: Text(tipo.resumenIntervalo),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                tipo.activo ? 'Activo' : 'Inactivo',
                style: TextStyle(
                  color: tipo.activo ? MotorixColores.exito : MotorixColores.textoSecundario,
                ),
              ),
              IconButton(
                key: Key('botonEditarTipo-${tipo.id}'),
                tooltip: 'Editar',
                icon: const Icon(Icons.edit_outlined),
                onPressed: () => _abrirFormulario(tipo),
              ),
              IconButton(
                key: Key('botonEstadoTipo-${tipo.id}'),
                tooltip: tipo.activo ? 'Desactivar' : 'Reactivar',
                icon: Icon(tipo.activo ? Icons.block_outlined : Icons.check_circle_outline),
                onPressed: () => _cambiarEstado(tipo),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Alta y edición de un tipo: nombre y al menos un intervalo (días, km o ambos).
/// Cierra con el mensaje de éxito; si el servidor rechaza, lo muestra y se queda.
class _DialogoTipoServicio extends StatefulWidget {
  final TipoServicio? tipo;

  const _DialogoTipoServicio({this.tipo});

  @override
  State<_DialogoTipoServicio> createState() => _DialogoTipoServicioState();
}

class _DialogoTipoServicioState extends State<_DialogoTipoServicio> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nombre;
  late final TextEditingController _dias;
  late final TextEditingController _km;
  bool _guardando = false;
  String? _errorDelServidor;

  @override
  void initState() {
    super.initState();
    final tipo = widget.tipo;
    _nombre = TextEditingController(text: tipo?.nombre ?? '');
    _dias = TextEditingController(text: tipo?.intervaloDias?.toString() ?? '');
    _km = TextEditingController(text: tipo?.intervaloKm?.toString() ?? '');
  }

  @override
  void dispose() {
    _nombre.dispose();
    _dias.dispose();
    _km.dispose();
    super.dispose();
  }

  String? _validarIntervalo(String? valor, int maximo, {required bool esDias}) {
    final texto = (valor ?? '').trim();
    if (texto.isEmpty) {
      // Sin ningún intervalo se pide al menos uno (RN-12); el aviso va en el campo de días.
      if (esDias && _km.text.trim().isEmpty) {
        return 'Indique al menos un intervalo: días, kilómetros o ambos.';
      }
      return null;
    }
    final numero = int.tryParse(texto);
    if (numero == null || numero < 1 || numero > maximo) {
      return 'Debe ser un número entero entre 1 y $maximo.';
    }
    return null;
  }

  Future<void> _guardar() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _guardando = true;
      _errorDelServidor = null;
    });
    final proveedor = context.read<ServiceTypesProvider>();
    final dias = _dias.text.trim().isEmpty ? null : int.parse(_dias.text.trim());
    final km = _km.text.trim().isEmpty ? null : int.parse(_km.text.trim());
    final resultado = widget.tipo == null
        ? await proveedor.crear(nombre: _nombre.text, intervaloDias: dias, intervaloKm: km)
        : await proveedor.editar(widget.tipo!.id, nombre: _nombre.text, intervaloDias: dias, intervaloKm: km);
    if (!mounted) return;
    if (resultado.exito) {
      Navigator.of(context).pop(resultado.mensaje);
    } else {
      setState(() {
        _guardando = false;
        _errorDelServidor = resultado.mensaje;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.tipo == null ? 'Nuevo tipo de servicio' : 'Editar tipo de servicio'),
      content: SizedBox(
        width: 420,
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  key: const Key('campoNombreTipo'),
                  controller: _nombre,
                  maxLength: 80,
                  decoration: const InputDecoration(labelText: 'Nombre'),
                  validator: (valor) => (valor ?? '').trim().isEmpty
                      ? 'El nombre del tipo de servicio es obligatorio.'
                      : null,
                ),
                TextFormField(
                  key: const Key('campoDiasTipo'),
                  controller: _dias,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: const InputDecoration(
                    labelText: 'Intervalo en días',
                    helperText: 'Opcional si indica kilómetros (1 a 3650).',
                  ),
                  validator: (valor) => _validarIntervalo(valor, 3650, esDias: true),
                ),
                TextFormField(
                  key: const Key('campoKmTipo'),
                  controller: _km,
                  keyboardType: TextInputType.number,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: const InputDecoration(
                    labelText: 'Intervalo en kilómetros',
                    helperText: 'Opcional si indica días (1 a 500000).',
                  ),
                  validator: (valor) => _validarIntervalo(valor, 500000, esDias: false),
                ),
                if (_errorDelServidor != null)
                  Padding(
                    padding: const EdgeInsets.only(top: MotorixEspaciados.s),
                    child: Text(
                      _errorDelServidor!,
                      style: const TextStyle(color: MotorixColores.error),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _guardando ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('botonGuardarTipo'),
          onPressed: _guardando ? null : _guardar,
          child: const Text('Guardar'),
        ),
      ],
    );
  }
}

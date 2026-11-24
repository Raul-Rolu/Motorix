/// Configuración (008-configuracion-seguridad-reportes, T022; FR-002, CA-1).
///
/// Pantalla solo para ADMIN (la autorización real es del servidor, RN-15). Tiene
/// las secciones «Datos del taller» (lo que muestra el ticket), «Operación»
/// (márgenes y órdenes detenidas) y «Seguridad» (inactividad de la sesión). Sin
/// tarjetas (docs/design-system.md 8.6): secciones con título y divisores. Estados
/// de carga, error y sin permiso según 8.4 y confirmación de éxito en snackbar.
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
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _SeccionTaller(proveedor: proveedor),
                const SizedBox(height: MotorixEspaciados.l),
                _SeccionOperacion(proveedor: proveedor),
                const SizedBox(height: MotorixEspaciados.l),
                _SeccionSeguridad(proveedor: proveedor),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// Sección «Operación» (008, US2): márgenes de «Próximo» del mantenimiento y días
/// para considerar una orden detenida. Los usa el centro de notificaciones y la
/// lista de clientes por avisar; la lista de Mantenimientos y el panel no cambian.
class _SeccionOperacion extends StatefulWidget {
  final SettingsProvider proveedor;

  const _SeccionOperacion({required this.proveedor});

  @override
  State<_SeccionOperacion> createState() => _SeccionOperacionState();
}

class _SeccionOperacionState extends State<_SeccionOperacion> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _dias;
  late final TextEditingController _km;
  late final TextEditingController _detenida;
  bool _guardando = false;

  List<int> _limite(String clave, List<int> respaldo) =>
      widget.proveedor.ajustes!.limites[clave] ?? respaldo;

  @override
  void initState() {
    super.initState();
    final operacion = widget.proveedor.ajustes!.operacion;
    _dias = TextEditingController(text: '${operacion.margenProximoDias}');
    _km = TextEditingController(text: '${operacion.margenProximoKm}');
    _detenida = TextEditingController(text: '${operacion.diasOrdenDetenida}');
  }

  @override
  void dispose() {
    _dias.dispose();
    _km.dispose();
    _detenida.dispose();
    super.dispose();
  }

  /// Valida que sea un entero dentro del límite que informa el servidor.
  String? _validar(String? valor, List<int> limite) {
    final numero = int.tryParse((valor ?? '').trim());
    if (numero == null || numero < limite[0] || numero > limite[1]) {
      return 'Debe ser un número entero entre ${limite[0]} y ${limite[1]}.';
    }
    return null;
  }

  Future<void> _guardar() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _guardando = true);
    final resultado = await widget.proveedor.guardarOperacion(
      margenProximoDias: int.parse(_dias.text.trim()),
      margenProximoKm: int.parse(_km.text.trim()),
      diasOrdenDetenida: int.parse(_detenida.text.trim()),
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
    final limiteDias = _limite('margenProximoDias', [1, 365]);
    final limiteKm = _limite('margenProximoKm', [100, 50000]);
    final limiteDetenida = _limite('diasOrdenDetenida', [1, 90]);
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Operación', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: MotorixEspaciados.xs),
          const Text(
            'Definen cuándo un mantenimiento se considera próximo y cuándo una orden se considera detenida en los avisos.',
            style: TextStyle(color: MotorixColores.textoSecundario),
          ),
          const SizedBox(height: MotorixEspaciados.m),
          TextFormField(
            key: const Key('campoMargenDias'),
            controller: _dias,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              labelText: 'Mantenimiento próximo: días de margen',
              helperText: 'Entre ${limiteDias[0]} y ${limiteDias[1]} días.',
            ),
            validator: (valor) => _validar(valor, limiteDias),
          ),
          TextFormField(
            key: const Key('campoMargenKm'),
            controller: _km,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              labelText: 'Mantenimiento próximo: kilómetros de margen',
              helperText: 'Entre ${limiteKm[0]} y ${limiteKm[1]} km.',
            ),
            validator: (valor) => _validar(valor, limiteKm),
          ),
          TextFormField(
            key: const Key('campoDiasDetenida'),
            controller: _detenida,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              labelText: 'Orden detenida: días sin cambio de estado',
              helperText: 'Entre ${limiteDetenida[0]} y ${limiteDetenida[1]} días.',
            ),
            validator: (valor) => _validar(valor, limiteDetenida),
          ),
          const SizedBox(height: MotorixEspaciados.m),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(
              key: const Key('botonGuardarOperacion'),
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

/// Sección «Seguridad» (008, US6): minutos de inactividad tras los cuales se
/// cierra la sesión. También es la vigencia del token, que se renueva mientras el
/// usuario trabaja. El cambio aplica a los inicios de sesión y renovaciones nuevos.
class _SeccionSeguridad extends StatefulWidget {
  final SettingsProvider proveedor;

  const _SeccionSeguridad({required this.proveedor});

  @override
  State<_SeccionSeguridad> createState() => _SeccionSeguridadState();
}

class _SeccionSeguridadState extends State<_SeccionSeguridad> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _minutos;
  bool _guardando = false;

  List<int> get _limite =>
      widget.proveedor.ajustes!.limites['minutosInactividad'] ?? const [5, 120];

  @override
  void initState() {
    super.initState();
    _minutos = TextEditingController(
      text: '${widget.proveedor.ajustes!.seguridad.minutosInactividad}',
    );
  }

  @override
  void dispose() {
    _minutos.dispose();
    super.dispose();
  }

  String? _validar(String? valor) {
    final numero = int.tryParse((valor ?? '').trim());
    if (numero == null || numero < _limite[0] || numero > _limite[1]) {
      return 'Debe ser un número entero entre ${_limite[0]} y ${_limite[1]}.';
    }
    return null;
  }

  Future<void> _guardar() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _guardando = true);
    final resultado = await widget.proveedor.guardarSeguridad(
      minutosInactividad: int.parse(_minutos.text.trim()),
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
          Text('Seguridad', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: MotorixEspaciados.xs),
          const Text(
            'La sesión se cierra sola si no hay actividad durante este tiempo. '
            'Se aplica a los inicios de sesión nuevos y a las renovaciones.',
            style: TextStyle(color: MotorixColores.textoSecundario),
          ),
          const SizedBox(height: MotorixEspaciados.m),
          TextFormField(
            key: const Key('campoMinutosInactividad'),
            controller: _minutos,
            keyboardType: TextInputType.number,
            decoration: InputDecoration(
              labelText: 'Inactividad para cerrar la sesión (minutos)',
              helperText: 'Entre ${_limite[0]} y ${_limite[1]} minutos.',
            ),
            validator: _validar,
          ),
          const SizedBox(height: MotorixEspaciados.m),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(
              key: const Key('botonGuardarSeguridad'),
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

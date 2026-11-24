/// Bitácora (008-configuracion-seguridad-reportes, T074; FR-014, CA-20).
///
/// Solo para ADMIN (la autorización real es del servidor, RN-15). Lista quién
/// hizo qué y cuándo (inicios de sesión fallidos, altas, bajas y cambios de rol
/// de usuarios, cambios de configuración y de precios, publicación de términos),
/// 50 entradas por página, con filtros por fecha, usuario y acción. Es de solo
/// lectura: no ofrece editar, borrar ni exportar. Lista densa con divisores (sin
/// tarjetas, docs/design-system.md 8.6) y estados de carga, vacío, error y sin
/// permiso según 8.4.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/audit_entry.dart';
import '../providers/audit_provider.dart';

class AuditLogScreen extends StatefulWidget {
  const AuditLogScreen({super.key});

  @override
  State<AuditLogScreen> createState() => _AuditLogScreenState();
}

class _AuditLogScreenState extends State<AuditLogScreen> {
  final _formKey = GlobalKey<FormState>();
  final _desde = TextEditingController();
  final _hasta = TextEditingController();
  int? _usuarioId;
  String? _accion;

  static final RegExp _formatoFecha = RegExp(r'^\d{4}-\d{2}-\d{2}$');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final proveedor = context.read<AuditProvider>();
      proveedor.cargar();
      proveedor.cargarUsuarios();
    });
  }

  @override
  void dispose() {
    _desde.dispose();
    _hasta.dispose();
    super.dispose();
  }

  /// ¿Es una fecha real AAAA-MM-DD?
  bool _esFechaReal(String texto) {
    if (!_formatoFecha.hasMatch(texto)) return false;
    final partes = texto.split('-').map(int.parse).toList();
    final fecha = DateTime.utc(partes[0], partes[1], partes[2]);
    return fecha.year == partes[0] && fecha.month == partes[1] && fecha.day == partes[2];
  }

  String? _validarFecha(String? valor) {
    final texto = (valor ?? '').trim();
    if (texto.isEmpty) return null;
    return _esFechaReal(texto) ? null : 'Use el formato AAAA-MM-DD.';
  }

  String? _validarHasta(String? valor) {
    final basico = _validarFecha(valor);
    if (basico != null) return basico;
    final hasta = (valor ?? '').trim();
    final desde = _desde.text.trim();
    if (hasta.isNotEmpty && desde.isNotEmpty && _esFechaReal(desde) && hasta.compareTo(desde) < 0) {
      return 'La fecha final no puede ser anterior a la inicial.';
    }
    return null;
  }

  void _aplicar() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    context.read<AuditProvider>().aplicarFiltros(
          desde: _desde.text.trim().isEmpty ? null : _desde.text.trim(),
          hasta: _hasta.text.trim().isEmpty ? null : _hasta.text.trim(),
          usuarioId: _usuarioId,
          accion: _accion,
        );
  }

  void _limpiar() {
    setState(() {
      _desde.clear();
      _hasta.clear();
      _usuarioId = null;
      _accion = null;
    });
    context.read<AuditProvider>().limpiarFiltros();
  }

  @override
  Widget build(BuildContext context) {
    final proveedor = context.watch<AuditProvider>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
              MotorixEspaciados.m, MotorixEspaciados.m, MotorixEspaciados.s, MotorixEspaciados.s),
          child: Row(
            children: [
              Expanded(
                child: Text('Bitácora', style: Theme.of(context).textTheme.titleLarge),
              ),
              IconButton(
                key: const Key('botonRefrescarBitacora'),
                tooltip: 'Actualizar',
                icon: const Icon(Icons.refresh),
                onPressed: proveedor.cargando ? null : () => proveedor.cargar(),
              ),
            ],
          ),
        ),
        if (!proveedor.sinPermiso) _filtros(proveedor),
        const Divider(height: 1),
        Expanded(child: _cuerpo(proveedor)),
        if (proveedor.cargado && proveedor.error == null) _paginacion(proveedor),
      ],
    );
  }

  Widget _filtros(AuditProvider proveedor) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          MotorixEspaciados.m, 0, MotorixEspaciados.m, MotorixEspaciados.s),
      child: Form(
        key: _formKey,
        child: Wrap(
          spacing: MotorixEspaciados.m,
          runSpacing: MotorixEspaciados.s,
          crossAxisAlignment: WrapCrossAlignment.start,
          children: [
            SizedBox(
              width: 150,
              child: TextFormField(
                key: const Key('campoDesde'),
                controller: _desde,
                decoration: const InputDecoration(labelText: 'Desde', hintText: 'AAAA-MM-DD'),
                validator: _validarFecha,
              ),
            ),
            SizedBox(
              width: 150,
              child: TextFormField(
                key: const Key('campoHasta'),
                controller: _hasta,
                decoration: const InputDecoration(labelText: 'Hasta', hintText: 'AAAA-MM-DD'),
                validator: _validarHasta,
              ),
            ),
            SizedBox(
              width: 220,
              child: DropdownButtonFormField<int?>(
                key: const Key('filtroUsuario'),
                initialValue: _usuarioId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Usuario'),
                items: [
                  const DropdownMenuItem<int?>(value: null, child: Text('Todos')),
                  for (final usuario in proveedor.usuarios)
                    DropdownMenuItem<int?>(value: usuario.id, child: Text(usuario.nombre)),
                ],
                onChanged: (valor) => setState(() => _usuarioId = valor),
              ),
            ),
            SizedBox(
              width: 250,
              child: DropdownButtonFormField<String?>(
                key: const Key('filtroAccion'),
                initialValue: _accion,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Acción'),
                items: [
                  const DropdownMenuItem<String?>(value: null, child: Text('Todas')),
                  for (final entrada in kEtiquetasAccionBitacora.entries)
                    DropdownMenuItem<String?>(value: entrada.key, child: Text(entrada.value)),
                ],
                onChanged: (valor) => setState(() => _accion = valor),
              ),
            ),
            Padding(
              padding: const EdgeInsets.only(top: MotorixEspaciados.s),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  OutlinedButton(
                    key: const Key('botonLimpiarFiltros'),
                    onPressed: _limpiar,
                    child: const Text('Limpiar'),
                  ),
                  const SizedBox(width: MotorixEspaciados.s),
                  FilledButton(
                    key: const Key('botonAplicarFiltros'),
                    onPressed: _aplicar,
                    child: const Text('Aplicar filtros'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _cuerpo(AuditProvider proveedor) {
    if (proveedor.error != null) {
      return Center(
        key: const Key('bitacoraError'),
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
                  key: const Key('botonReintentarBitacora'),
                  onPressed: () => proveedor.cargar(),
                  child: const Text('Reintentar'),
                ),
              ],
            ],
          ),
        ),
      );
    }
    if (!proveedor.cargado) {
      return const Center(
        child: SizedBox(
          key: Key('bitacoraCargando'),
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    if (proveedor.entradas.isEmpty) {
      return Center(
        key: const Key('bitacoraVacia'),
        child: Padding(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          child: Text(
            proveedor.hayFiltros ? 'No hay entradas con esos filtros.' : 'No hay entradas en la bitácora.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: MotorixColores.textoSecundario),
          ),
        ),
      );
    }
    return ListView.separated(
      itemCount: proveedor.entradas.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (_, indice) => _FilaBitacora(entrada: proveedor.entradas[indice]),
    );
  }

  Widget _paginacion(AuditProvider proveedor) {
    final entradas = proveedor.total == 1 ? 'entrada' : 'entradas';
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: MotorixEspaciados.m, vertical: MotorixEspaciados.s),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  'Página ${proveedor.pagina} de ${proveedor.totalPaginas} · ${proveedor.total} $entradas',
                  style: const TextStyle(color: MotorixColores.textoSecundario),
                ),
              ),
              OutlinedButton(
                key: const Key('botonPaginaAnterior'),
                onPressed: proveedor.hayAnterior && !proveedor.cargando
                    ? () => proveedor.irAPagina(proveedor.pagina - 1)
                    : null,
                child: const Text('Anterior'),
              ),
              const SizedBox(width: MotorixEspaciados.s),
              OutlinedButton(
                key: const Key('botonPaginaSiguiente'),
                onPressed: proveedor.haySiguiente && !proveedor.cargando
                    ? () => proveedor.irAPagina(proveedor.pagina + 1)
                    : null,
                child: const Text('Siguiente'),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Una entrada: fecha, usuario («Sin cuenta» cuando el inicio de sesión fallido no
/// corresponde a una cuenta), acción en español y detalle.
class _FilaBitacora extends StatelessWidget {
  final EntradaBitacora entrada;

  const _FilaBitacora({required this.entrada});

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: Key('entradaBitacora-${entrada.id}'),
      padding: const EdgeInsets.symmetric(horizontal: MotorixEspaciados.m, vertical: MotorixEspaciados.s),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 140,
            child: Text(entrada.fechaTexto, style: const TextStyle(color: MotorixColores.textoSecundario)),
          ),
          SizedBox(
            width: 210,
            child: Text(entrada.usuarioNombre ?? 'Sin cuenta'),
          ),
          SizedBox(
            width: 230,
            child: Text(entrada.etiquetaAccion, style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
          Expanded(
            child: Text(
              entrada.detalle ?? '',
              style: const TextStyle(color: MotorixColores.textoSecundario),
            ),
          ),
        ],
      ),
    );
  }
}

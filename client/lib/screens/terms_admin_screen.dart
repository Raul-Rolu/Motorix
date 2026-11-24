/// Administración de los términos y condiciones
/// (008-configuracion-seguridad-reportes, T094; FR-022, CA-18).
///
/// Sección «Términos» (solo ADMIN; la autorización real es del servidor, RN-15):
/// muestra la versión vigente, quién la aceptó (paginado de 50 en 50) y permite
/// publicar una versión nueva con confirmación. Las versiones y las aceptaciones
/// no se editan ni se borran. Estados de carga, vacío, error y sin permiso según
/// docs/design-system.md 8.4.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../providers/terms_provider.dart';

class TermsAdminScreen extends StatefulWidget {
  const TermsAdminScreen({super.key});

  @override
  State<TermsAdminScreen> createState() => _TermsAdminScreenState();
}

class _TermsAdminScreenState extends State<TermsAdminScreen> {
  static const int _minimo = 20;
  static const int _maximo = 20000;
  static const String _mensajeLongitud = 'Debe tener entre 20 y 20,000 caracteres.';

  final _formKey = GlobalKey<FormState>();
  final _terminos = TextEditingController();
  final _aviso = TextEditingController();
  ResultadoTerminos? _resultado;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<TermsProvider>().cargarAdmin();
    });
  }

  @override
  void dispose() {
    _terminos.dispose();
    _aviso.dispose();
    super.dispose();
  }

  String? _validarTexto(String? valor) {
    final largo = (valor ?? '').trim().length;
    return (largo < _minimo || largo > _maximo) ? _mensajeLongitud : null;
  }

  Future<void> _publicar() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final proveedor = context.read<TermsProvider>();
    final siguiente = (proveedor.vigente?.version ?? 0) + 1;

    final confirmado = await showDialog<bool>(
      context: context,
      builder: (contexto) => AlertDialog(
        key: const Key('dialogoPublicar'),
        title: Text('¿Publicar la versión $siguiente?'),
        content: Text(
          'Todos los usuarios, incluido usted, deberán aceptar la versión $siguiente '
          'antes de seguir usando el sistema. Una versión publicada no se puede editar ni borrar.',
        ),
        actions: [
          TextButton(
            key: const Key('botonCancelarPublicar'),
            onPressed: () => Navigator.of(contexto).pop(false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            key: const Key('botonConfirmarPublicar'),
            onPressed: () => Navigator.of(contexto).pop(true),
            child: const Text('Confirmar'),
          ),
        ],
      ),
    );
    if (confirmado != true || !mounted) return;

    final resultado = await proveedor.publicar(_terminos.text, _aviso.text);
    if (!mounted) return;
    setState(() {
      _resultado = resultado;
      if (resultado.exito) {
        _terminos.clear();
        _aviso.clear();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final proveedor = context.watch<TermsProvider>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
              MotorixEspaciados.m, MotorixEspaciados.m, MotorixEspaciados.s, MotorixEspaciados.s),
          child: Row(
            children: [
              Expanded(child: Text('Términos y condiciones', style: Theme.of(context).textTheme.titleLarge)),
              IconButton(
                key: const Key('botonRefrescarTerminos'),
                tooltip: 'Actualizar',
                icon: const Icon(Icons.refresh),
                onPressed: proveedor.cargandoAdmin ? null : () => proveedor.cargarAdmin(),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(child: _cuerpo(proveedor)),
      ],
    );
  }

  Widget _cuerpo(TermsProvider proveedor) {
    if (proveedor.errorAdmin != null) {
      return Center(
        key: const Key('terminosError'),
        child: Padding(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                proveedor.errorAdmin!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: MotorixColores.error),
              ),
              if (!proveedor.sinPermiso) ...[
                const SizedBox(height: MotorixEspaciados.s),
                OutlinedButton(
                  key: const Key('botonReintentarTerminos'),
                  onPressed: () => proveedor.cargarAdmin(),
                  child: const Text('Reintentar'),
                ),
              ],
            ],
          ),
        ),
      );
    }
    if (!proveedor.cargadoAdmin) {
      return const Center(
        child: SizedBox(
          key: Key('terminosCargando'),
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    return SingleChildScrollView(
      padding: const EdgeInsets.all(MotorixEspaciados.m),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _vigente(proveedor),
          const SizedBox(height: MotorixEspaciados.l),
          _aceptaciones(proveedor),
          const SizedBox(height: MotorixEspaciados.l),
          _formulario(proveedor),
        ],
      ),
    );
  }

  Widget _vigente(TermsProvider proveedor) {
    final version = proveedor.vigente;
    if (version == null) {
      return const Text(
        'Aún no se ha publicado ninguna versión.',
        key: Key('sinVersion'),
        style: TextStyle(color: MotorixColores.textoSecundario),
      );
    }
    return Column(
      key: const Key('versionVigente'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Versión vigente: ${version.version}', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: MotorixEspaciados.xs),
        Text(
          'Publicada el ${version.publicadaTexto}.',
          style: const TextStyle(color: MotorixColores.textoSecundario),
        ),
        const SizedBox(height: MotorixEspaciados.s),
        _TextoLegal(titulo: 'Términos y condiciones', texto: version.terminos),
        const SizedBox(height: MotorixEspaciados.s),
        _TextoLegal(titulo: 'Aviso de privacidad', texto: version.avisoPrivacidad),
      ],
    );
  }

  Widget _aceptaciones(TermsProvider proveedor) {
    final aceptaciones = proveedor.aceptaciones;
    final etiqueta = proveedor.total == 1 ? 'aceptación' : 'aceptaciones';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Aceptaciones', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: MotorixEspaciados.s),
        if (aceptaciones.isEmpty)
          const Text(
            'Nadie ha aceptado todavía la versión vigente.',
            key: Key('aceptacionesVacias'),
            style: TextStyle(color: MotorixColores.textoSecundario),
          )
        else ...[
          const Divider(height: 1),
          for (var i = 0; i < aceptaciones.length; i++) ...[
            Padding(
              key: Key('aceptacion-$i'),
              padding: const EdgeInsets.symmetric(vertical: MotorixEspaciados.s),
              child: Row(
                children: [
                  Expanded(child: Text(aceptaciones[i].usuarioNombre)),
                  SizedBox(
                    width: 120,
                    child: Text('Versión ${aceptaciones[i].version}',
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                  ),
                  SizedBox(
                    width: 150,
                    child: Text(aceptaciones[i].aceptadaTexto,
                        style: const TextStyle(color: MotorixColores.textoSecundario)),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
          ],
          const SizedBox(height: MotorixEspaciados.s),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Página ${proveedor.pagina} de ${proveedor.totalPaginas} · ${proveedor.total} $etiqueta',
                  style: const TextStyle(color: MotorixColores.textoSecundario),
                ),
              ),
              OutlinedButton(
                key: const Key('botonPaginaAnteriorAceptaciones'),
                onPressed: proveedor.hayAnterior && !proveedor.cargandoAdmin
                    ? () => proveedor.irAPagina(proveedor.pagina - 1)
                    : null,
                child: const Text('Anterior'),
              ),
              const SizedBox(width: MotorixEspaciados.s),
              OutlinedButton(
                key: const Key('botonPaginaSiguienteAceptaciones'),
                onPressed: proveedor.haySiguiente && !proveedor.cargandoAdmin
                    ? () => proveedor.irAPagina(proveedor.pagina + 1)
                    : null,
                child: const Text('Siguiente'),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _formulario(TermsProvider proveedor) {
    final resultado = _resultado;
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Publicar una versión nueva', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: MotorixEspaciados.s),
          TextFormField(
            key: const Key('campoTerminosNuevos'),
            controller: _terminos,
            minLines: 4,
            maxLines: 10,
            decoration: const InputDecoration(
              labelText: 'Términos y condiciones',
              helperText: 'Entre 20 y 20,000 caracteres.',
              alignLabelWithHint: true,
            ),
            validator: _validarTexto,
          ),
          const SizedBox(height: MotorixEspaciados.m),
          TextFormField(
            key: const Key('campoAvisoNuevo'),
            controller: _aviso,
            minLines: 4,
            maxLines: 10,
            decoration: const InputDecoration(
              labelText: 'Aviso de privacidad',
              helperText: 'Entre 20 y 20,000 caracteres.',
              alignLabelWithHint: true,
            ),
            validator: _validarTexto,
          ),
          const SizedBox(height: MotorixEspaciados.m),
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton(
              key: const Key('botonPublicarVersion'),
              onPressed: proveedor.publicando ? null : _publicar,
              child: proveedor.publicando
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Publicar versión nueva'),
            ),
          ),
          if (resultado != null) ...[
            const SizedBox(height: MotorixEspaciados.s),
            Text(
              resultado.mensaje,
              key: const Key('mensajePublicacion'),
              style: TextStyle(color: resultado.exito ? MotorixColores.exito : MotorixColores.error),
            ),
          ],
        ],
      ),
    );
  }
}

/// Texto legal en un recuadro con desplazamiento propio (los textos pueden ser largos).
class _TextoLegal extends StatelessWidget {
  final String titulo;
  final String texto;

  const _TextoLegal({required this.titulo, required this.texto});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(titulo, style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: MotorixEspaciados.xs),
        Container(
          constraints: const BoxConstraints(maxHeight: 160),
          padding: const EdgeInsets.all(MotorixEspaciados.s),
          decoration: BoxDecoration(
            border: Border.all(color: Theme.of(context).dividerColor),
            borderRadius: BorderRadius.circular(MotorixEspaciados.radio),
          ),
          child: SingleChildScrollView(child: Text(texto)),
        ),
      ],
    );
  }
}

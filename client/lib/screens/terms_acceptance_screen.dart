/// Pantalla de aceptación de los términos y condiciones y del aviso de
/// privacidad (008-configuracion-seguridad-reportes, T094; FR-020, CA-16, CA-17).
///
/// Se muestra tras iniciar sesión cuando falta aceptar la versión vigente, o en
/// cuanto cualquier petición recibe `403 TERMS_NOT_ACCEPTED`. No se puede cerrar
/// sin decidir: «Aceptar» entra al sistema y «Rechazar» (con confirmación) cierra
/// la sesión y vuelve al login.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../providers/auth_provider.dart';
import '../providers/terms_provider.dart';

class TermsAcceptanceScreen extends StatelessWidget {
  const TermsAcceptanceScreen({super.key});

  Future<void> _aceptar(BuildContext context) async {
    final navegador = Navigator.of(context);
    final aceptada = await context.read<TermsProvider>().aceptar();
    if (aceptada && context.mounted) {
      navegador.pushNamedAndRemoveUntil('/inicio', (ruta) => false);
    }
  }

  Future<void> _rechazar(BuildContext context) async {
    final navegador = Navigator.of(context);
    final auth = context.read<AuthProvider>();
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (contexto) => AlertDialog(
        key: const Key('dialogoRechazo'),
        title: const Text('¿Rechazar los términos?'),
        content: const Text(
          'Si rechaza, se cerrará su sesión y no podrá usar Motorix hasta aceptar la versión vigente.',
        ),
        actions: [
          TextButton(
            key: const Key('botonCancelarRechazo'),
            onPressed: () => Navigator.of(contexto).pop(false),
            child: const Text('Volver'),
          ),
          FilledButton(
            key: const Key('botonConfirmarRechazo'),
            onPressed: () => Navigator.of(contexto).pop(true),
            child: const Text('Rechazar y salir'),
          ),
        ],
      ),
    );
    if (confirmado == true) {
      auth.cerrarSesion();
      navegador.pushNamedAndRemoveUntil('/login', (ruta) => false);
    }
  }

  /// Reintenta la descarga; si ya no hay nada pendiente, entra al sistema.
  Future<void> _reintentar(BuildContext context) async {
    final navegador = Navigator.of(context);
    final proveedor = context.read<TermsProvider>();
    await proveedor.verificar(silencioso: false);
    if (!proveedor.pendiente && context.mounted) {
      navegador.pushNamedAndRemoveUntil('/inicio', (ruta) => false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final proveedor = context.watch<TermsProvider>();
    final version = proveedor.vigente;

    return PopScope(
      canPop: false,
      child: Scaffold(
        key: const Key('pantallaTerminos'),
        appBar: AppBar(
          automaticallyImplyLeading: false,
          title: const Text('Términos y condiciones'),
        ),
        body: version == null
            ? _SinVersion(proveedor: proveedor, alReintentar: () => _reintentar(context))
            : Column(
                children: [
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(MotorixEspaciados.l),
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 820),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Text('Versión ${version.version}', style: Theme.of(context).textTheme.titleLarge),
                              const SizedBox(height: MotorixEspaciados.xs),
                              Text(
                                'Publicada el ${version.publicadaTexto}. Para usar Motorix debe aceptar esta versión.',
                                style: const TextStyle(color: MotorixColores.textoSecundario),
                              ),
                              const SizedBox(height: MotorixEspaciados.l),
                              _Seccion(
                                titulo: 'Términos y condiciones',
                                textoKey: const Key('textoTerminos'),
                                texto: version.terminos,
                              ),
                              const SizedBox(height: MotorixEspaciados.l),
                              _Seccion(
                                titulo: 'Aviso de privacidad',
                                textoKey: const Key('textoAvisoPrivacidad'),
                                texto: version.avisoPrivacidad,
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                  const Divider(height: 1),
                  Padding(
                    padding: const EdgeInsets.all(MotorixEspaciados.m),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (proveedor.error != null) ...[
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(MotorixEspaciados.s),
                            decoration: BoxDecoration(
                              color: MotorixColores.errorSuave,
                              borderRadius: BorderRadius.circular(MotorixEspaciados.radio),
                            ),
                            child: Text(
                              proveedor.error!,
                              key: const Key('mensajeErrorTerminos'),
                              style: const TextStyle(color: MotorixColores.error),
                            ),
                          ),
                          const SizedBox(height: MotorixEspaciados.s),
                        ],
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            OutlinedButton(
                              key: const Key('botonRechazarTerminos'),
                              onPressed: proveedor.aceptando ? null : () => _rechazar(context),
                              child: const Text('Rechazar'),
                            ),
                            const SizedBox(width: MotorixEspaciados.m),
                            FilledButton(
                              key: const Key('botonAceptarTerminos'),
                              onPressed: proveedor.aceptando ? null : () => _aceptar(context),
                              child: proveedor.aceptando
                                  ? const SizedBox(
                                      width: 20,
                                      height: 20,
                                      child: CircularProgressIndicator(strokeWidth: 2),
                                    )
                                  : const Text('Aceptar'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}

/// Un bloque de texto legal con su título.
class _Seccion extends StatelessWidget {
  final String titulo;
  final Key textoKey;
  final String texto;

  const _Seccion({required this.titulo, required this.textoKey, required this.texto});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(titulo, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: MotorixEspaciados.s),
        Container(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          decoration: BoxDecoration(
            border: Border.all(color: Theme.of(context).dividerColor),
            borderRadius: BorderRadius.circular(MotorixEspaciados.radio),
          ),
          child: SelectableText(texto, key: textoKey),
        ),
      ],
    );
  }
}

/// Estado sin textos: descargando o con error (con «Reintentar»).
class _SinVersion extends StatelessWidget {
  final TermsProvider proveedor;
  final VoidCallback alReintentar;

  const _SinVersion({required this.proveedor, required this.alReintentar});

  @override
  Widget build(BuildContext context) {
    if (proveedor.cargando) {
      return const Center(
        child: SizedBox(
          key: Key('terminosCargandoAceptacion'),
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(MotorixEspaciados.l),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              proveedor.error ?? 'No se pudo cargar la versión vigente de los términos.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: MotorixColores.error),
            ),
            const SizedBox(height: MotorixEspaciados.m),
            OutlinedButton(
              key: const Key('botonReintentarTerminos'),
              onPressed: alReintentar,
              child: const Text('Reintentar'),
            ),
          ],
        ),
      ),
    );
  }
}

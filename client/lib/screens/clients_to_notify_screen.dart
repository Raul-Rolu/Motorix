/// Clientes por avisar (007-notificaciones-internas, T066; FR-014, FR-015,
/// CA-10, CA-11).
///
/// Lista, para ADMIN y RECEPTIONIST, los hechos pendientes de avisar a un
/// cliente (vehículo listo, cita de mañana, mantenimiento próximo o vencido)
/// con su teléfono, y permite marcar a cada uno como avisado con una nota
/// opcional (máx. 255). El sistema no envía el aviso: la persona llama o avisa
/// en persona y aquí solo se registra quién y cuándo. Estados de carga, vacío y
/// error según `docs/design-system.md` (8.4) y confirmación con «Cancelar» y
/// «Confirmar» (8.5).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/notification.dart';
import '../providers/clients_to_notify_provider.dart';

class ClientsToNotifyScreen extends StatefulWidget {
  const ClientsToNotifyScreen({super.key});

  @override
  State<ClientsToNotifyScreen> createState() => _ClientsToNotifyScreenState();
}

class _ClientsToNotifyScreenState extends State<ClientsToNotifyScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<ClientsToNotifyProvider>().cargar();
    });
  }

  /// Pide confirmación con nota opcional y registra el aviso.
  Future<void> _avisar(ClientePorAvisar hecho) async {
    final nota = await showDialog<String>(
      context: context,
      builder: (_) => _DialogoDeAviso(hecho: hecho),
    );
    if (nota == null || !mounted) return; // «Cancelar»

    final resultado = await context
        .read<ClientsToNotifyProvider>()
        .marcarAvisado(hecho, nota: nota);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(resultado.mensaje),
        backgroundColor: resultado.exito ? MotorixColores.exito : MotorixColores.error,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final proveedor = context.watch<ClientsToNotifyProvider>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
              MotorixEspaciados.m, MotorixEspaciados.m, MotorixEspaciados.s, MotorixEspaciados.s),
          child: Row(
            children: [
              Expanded(
                child: Text('Clientes por avisar', style: Theme.of(context).textTheme.titleLarge),
              ),
              IconButton(
                key: const Key('botonRefrescarPorAvisar'),
                tooltip: 'Actualizar',
                icon: const Icon(Icons.refresh),
                onPressed: () => proveedor.cargar(),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        Expanded(child: _cuerpo(proveedor)),
      ],
    );
  }

  Widget _cuerpo(ClientsToNotifyProvider proveedor) {
    if (proveedor.cargando && proveedor.hechos.isEmpty) {
      return const Center(
        child: SizedBox(
          key: Key('porAvisarCargando'),
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    if (proveedor.error != null && proveedor.hechos.isEmpty) {
      return Center(
        key: const Key('porAvisarError'),
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
                  key: const Key('botonReintentarPorAvisar'),
                  onPressed: () => proveedor.cargar(),
                  child: const Text('Reintentar'),
                ),
              ],
            ],
          ),
        ),
      );
    }
    if (proveedor.hechos.isEmpty) {
      return const Center(
        key: Key('porAvisarVacio'),
        child: Padding(
          padding: EdgeInsets.all(MotorixEspaciados.m),
          child: Text(
            'No hay clientes por avisar.',
            textAlign: TextAlign.center,
            style: TextStyle(color: MotorixColores.textoSecundario),
          ),
        ),
      );
    }
    return ListView.separated(
      itemCount: proveedor.hechos.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (_, indice) => _FilaPorAvisar(
        hecho: proveedor.hechos[indice],
        alAvisar: _avisar,
      ),
    );
  }
}

class _FilaPorAvisar extends StatelessWidget {
  final ClientePorAvisar hecho;
  final void Function(ClientePorAvisar) alAvisar;

  const _FilaPorAvisar({required this.hecho, required this.alAvisar});

  @override
  Widget build(BuildContext context) {
    return Padding(
      key: Key('porAvisar-${hecho.clave}'),
      padding: const EdgeInsets.symmetric(
          horizontal: MotorixEspaciados.m, vertical: MotorixEspaciados.s),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  hecho.nombreCompleto,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: MotorixEspaciados.xs),
                Row(
                  children: [
                    const Icon(Icons.phone_outlined,
                        size: 16, color: MotorixColores.textoSecundario),
                    const SizedBox(width: MotorixEspaciados.xs),
                    Text(hecho.telefono),
                  ],
                ),
                Text(
                  hecho.vehiculoTexto,
                  style: const TextStyle(color: MotorixColores.textoSecundario),
                ),
                Text(hecho.motivo),
              ],
            ),
          ),
          const SizedBox(width: MotorixEspaciados.s),
          OutlinedButton(
            key: Key('botonAvisar-${hecho.clave}'),
            onPressed: () => alAvisar(hecho),
            child: const Text('Marcar como avisado'),
          ),
        ],
      ),
    );
  }
}

/// Diálogo de confirmación con nota opcional (máx. 255). Devuelve la nota
/// (posiblemente vacía) al confirmar o null al cancelar.
class _DialogoDeAviso extends StatefulWidget {
  final ClientePorAvisar hecho;

  const _DialogoDeAviso({required this.hecho});

  @override
  State<_DialogoDeAviso> createState() => _DialogoDeAvisoState();
}

class _DialogoDeAvisoState extends State<_DialogoDeAviso> {
  final _nota = TextEditingController();

  @override
  void dispose() {
    _nota.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Marcar como avisado'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${widget.hecho.nombreCompleto} · ${widget.hecho.telefono}'),
          const SizedBox(height: MotorixEspaciados.xs),
          Text(
            widget.hecho.motivo,
            style: const TextStyle(color: MotorixColores.textoSecundario),
          ),
          const SizedBox(height: MotorixEspaciados.m),
          SizedBox(
            key: const Key('campoNotaAviso'),
            width: 360,
            child: TextField(
              controller: _nota,
              maxLength: 255,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Nota (opcional)',
                hintText: 'Por ejemplo: no contestó',
              ),
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        ElevatedButton(
          onPressed: () => Navigator.of(context).pop(_nota.text),
          child: const Text('Confirmar'),
        ),
      ],
    );
  }
}

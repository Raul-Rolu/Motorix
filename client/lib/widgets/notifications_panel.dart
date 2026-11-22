/// Panel lateral de avisos (007-notificaciones-internas, T020; CA-1, CA-9).
///
/// Lista los avisos agrupados por tipo en el orden de presentación, con los
/// tokens de `docs/design-system.md`: filas con divisores (sin tarjetas),
/// estados de carga, vacío y error, y un solo set de íconos (Material).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/notification.dart';
import '../providers/notifications_provider.dart';

class PanelAvisos extends StatelessWidget {
  const PanelAvisos({super.key});

  @override
  Widget build(BuildContext context) {
    final proveedor = context.watch<NotificationsProvider>();
    return Drawer(
      key: const Key('panelAvisos'),
      child: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                  MotorixEspaciados.m, MotorixEspaciados.s, MotorixEspaciados.s, MotorixEspaciados.s),
              child: Row(
                children: [
                  Expanded(
                    child: Text('Avisos', style: Theme.of(context).textTheme.titleLarge),
                  ),
                  IconButton(
                    tooltip: 'Cerrar',
                    icon: const Icon(Icons.close),
                    onPressed: () => Scaffold.of(context).closeEndDrawer(),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(child: _cuerpo(context, proveedor)),
          ],
        ),
      ),
    );
  }

  Widget _cuerpo(BuildContext context, NotificationsProvider proveedor) {
    if (proveedor.cargando && proveedor.avisos.isEmpty) {
      return const Center(
        child: SizedBox(
          key: Key('avisosCargando'),
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    if (proveedor.error != null && proveedor.avisos.isEmpty) {
      return Center(
        key: const Key('avisosError'),
        child: Padding(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'No se pudieron cargar los avisos.',
                textAlign: TextAlign.center,
                style: TextStyle(color: MotorixColores.error),
              ),
              const SizedBox(height: MotorixEspaciados.s),
              OutlinedButton(
                key: const Key('botonReintentarAvisos'),
                onPressed: proveedor.reintentar,
                child: const Text('Reintentar'),
              ),
            ],
          ),
        ),
      );
    }
    if (proveedor.avisos.isEmpty) {
      return const Center(
        key: Key('avisosVacio'),
        child: Padding(
          padding: EdgeInsets.all(MotorixEspaciados.m),
          child: Text(
            'No tienes avisos pendientes.',
            textAlign: TextAlign.center,
            style: TextStyle(color: MotorixColores.textoSecundario),
          ),
        ),
      );
    }
    return ListView(
      children: [
        for (final grupo in GrupoAviso.values)
          ..._seccion(grupo, proveedor.avisos.where((aviso) => aviso.grupo == grupo).toList()),
      ],
    );
  }

  /// Encabezado del grupo y sus filas; un grupo sin avisos no se muestra.
  List<Widget> _seccion(GrupoAviso grupo, List<Aviso> avisos) {
    if (avisos.isEmpty) return const [];
    return [
      Padding(
        padding: const EdgeInsets.fromLTRB(
            MotorixEspaciados.m, MotorixEspaciados.m, MotorixEspaciados.m, MotorixEspaciados.xs),
        child: Row(
          children: [
            Expanded(
              child: Text(
                grupo.titulo,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: MotorixColores.textoSecundario,
                ),
              ),
            ),
            Text(
              '${avisos.length}',
              key: Key('contadorGrupo-${grupo.codigo}'),
              style: const TextStyle(fontSize: 12, color: MotorixColores.textoSecundario),
            ),
          ],
        ),
      ),
      for (final aviso in avisos) ...[
        const Divider(height: 1),
        _FilaAviso(aviso: aviso),
      ],
    ];
  }
}

/// Íconos y colores por tipo de aviso (solo `warning`, `danger` y texto
/// secundario, según la sección 5 del sistema de diseño).
(IconData, Color) _estiloDe(Aviso aviso) => switch (aviso.grupo) {
      GrupoAviso.mantenimientoVencido => (Icons.build_circle_outlined, MotorixColores.error),
      _ => (Icons.notifications_outlined, MotorixColores.textoSecundario),
    };

class _FilaAviso extends StatelessWidget {
  final Aviso aviso;

  const _FilaAviso({required this.aviso});

  @override
  Widget build(BuildContext context) {
    final (icono, color) = _estiloDe(aviso);
    return ListTile(
      key: Key('aviso-${aviso.clave}'),
      leading: Icon(icono, color: aviso.leido ? MotorixColores.textoSecundario : color),
      title: Text(
        aviso.titulo,
        style: TextStyle(
          fontWeight: aviso.leido ? FontWeight.w400 : FontWeight.w600,
          color: aviso.leido ? MotorixColores.textoSecundario : MotorixColores.textoPrincipal,
        ),
      ),
      subtitle: Text(aviso.detalle),
      trailing: aviso.leido
          ? null
          : Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
    );
  }
}

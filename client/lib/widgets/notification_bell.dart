/// Campana de avisos del encabezado (007-notificaciones-internas, T020; CA-1).
///
/// Muestra el número de avisos no leídos con el `Badge` de Material (oculto
/// en 0 y «99+» como máximo) y abre el panel lateral de avisos.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/notifications_provider.dart';

class CampanaAvisos extends StatelessWidget {
  const CampanaAvisos({super.key});

  @override
  Widget build(BuildContext context) {
    final noLeidos = context.watch<NotificationsProvider>().noLeidos;
    return IconButton(
      key: const Key('campanaAvisos'),
      tooltip: noLeidos > 0 ? 'Avisos ($noLeidos sin leer)' : 'Avisos',
      icon: Badge(
        isLabelVisible: noLeidos > 0,
        label: Text(noLeidos > 99 ? '99+' : '$noLeidos'),
        child: const Icon(Icons.notifications_outlined),
      ),
      onPressed: () => Scaffold.of(context).openEndDrawer(),
    );
  }
}

/// Port local de la máquina de estados de órdenes (T054, US6; FR-012).
///
/// Espejo de `server/services/order-state.js` (research D2) y se usa SOLO
/// para ofrecer en la interfaz las acciones válidas del rol. La autorización
/// real siempre se valida en el servidor (RN-15).
library;

const List<String> kRolesOperacion = ['ADMIN', 'RECEPTIONIST', 'MECHANIC'];
const List<String> kRolesAdministracion = ['ADMIN', 'RECEPTIONIST'];
const List<String> kEstadosFinales = ['ENTREGADO', 'CANCELADA'];

class _Transicion {
  final String desde;
  final String hacia;
  final List<String> roles;

  const _Transicion(this.desde, this.hacia, this.roles);
}

const List<_Transicion> _transiciones = [
  _Transicion('RECIBIDO', 'DIAGNOSTICO', kRolesOperacion),
  _Transicion('DIAGNOSTICO', 'EN_REPARACION', kRolesOperacion),
  _Transicion('DIAGNOSTICO', 'ESPERANDO_REFACCION', kRolesOperacion),
  _Transicion('DIAGNOSTICO', 'RECIBIDO', ['ADMIN']),
  _Transicion('EN_REPARACION', 'TERMINADO', kRolesOperacion),
  _Transicion('EN_REPARACION', 'ESPERANDO_REFACCION', kRolesOperacion),
  _Transicion('EN_REPARACION', 'DIAGNOSTICO', kRolesOperacion),
  _Transicion('ESPERANDO_REFACCION', '__ORIGEN__', kRolesOperacion),
  _Transicion('TERMINADO', 'ENTREGADO', kRolesAdministracion),
  _Transicion('TERMINADO', 'EN_REPARACION', kRolesOperacion),
];

/// Estados a los que el rol puede avanzar desde el estado actual.
List<String> estadosSiguientesOrden({
  required String estadoActual,
  required String rol,
  String? estadoOrigenPausa,
}) {
  if (estadoActual.isEmpty || kEstadosFinales.contains(estadoActual)) {
    return [];
  }

  final salidas = <String>{};
  for (final transicion in _transiciones) {
    if (transicion.desde != estadoActual) continue;
    if (!transicion.roles.contains(rol)) continue;
    if (transicion.hacia == '__ORIGEN__') {
      if (estadoOrigenPausa != null) salidas.add(estadoOrigenPausa);
    } else {
      salidas.add(transicion.hacia);
    }
  }
  if (kRolesAdministracion.contains(rol)) {
    salidas.add('CANCELADA');
  }
  return salidas.toList();
}

/// Nombre en español de un estado de orden.
String nombreEstadoOrden(String estado) {
  switch (estado) {
    case 'RECIBIDO':
      return 'Recibido';
    case 'DIAGNOSTICO':
      return 'Diagnóstico';
    case 'EN_REPARACION':
      return 'En reparación';
    case 'ESPERANDO_REFACCION':
      return 'Esperando refacción';
    case 'TERMINADO':
      return 'Terminado';
    case 'ENTREGADO':
      return 'Entregado';
    case 'CANCELADA':
      return 'Cancelada';
    default:
      return estado;
  }
}

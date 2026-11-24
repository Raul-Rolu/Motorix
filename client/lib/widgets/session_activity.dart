/// Detector de actividad del usuario (008-configuracion-seguridad-reportes, T084;
/// FR-016, CA-23).
///
/// Envuelve la app y avisa al `SessionProvider` cuando el usuario toca, mueve el
/// puntero, usa la rueda o pulsa una tecla. SOLO registra la hora: no lee ni
/// guarda lo que se escribe. Las consultas automáticas (avisos) no pasan por aquí.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../providers/session_provider.dart';

class ActividadSesion extends StatefulWidget {
  final Widget child;

  const ActividadSesion({super.key, required this.child});

  @override
  State<ActividadSesion> createState() => _ActividadSesionState();
}

class _ActividadSesionState extends State<ActividadSesion> {
  late final SessionProvider _sesion;

  @override
  void initState() {
    super.initState();
    // `read` crea el proveedor de sesión (los proveedores son perezosos) para que
    // vigile desde el primer inicio de sesión.
    _sesion = context.read<SessionProvider>();
    HardwareKeyboard.instance.addHandler(_alTecla);
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_alTecla);
    super.dispose();
  }

  /// Registra la pulsación sin consumirla (devuelve false para no interferir).
  bool _alTecla(KeyEvent evento) {
    _sesion.registrarActividad();
    return false;
  }

  void _alPuntero(PointerEvent evento) => _sesion.registrarActividad();

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: _alPuntero,
      onPointerMove: _alPuntero,
      onPointerHover: _alPuntero,
      onPointerSignal: _alPuntero,
      child: widget.child,
    );
  }
}

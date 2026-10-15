/// Sistema de diseño de Motorix (T015, Principio VIII).
///
/// Todos los colores, espaciados y radios provienen de estos tokens, tomados de
/// `docs/design-system.md`: verde para correcto/completado, ámbar para
/// advertencia/próximo y rojo para error/vencido/stock crítico. Paleta sobria,
/// sin degradados y con tema claro (MVP).
library;

import 'package:flutter/material.dart';

/// Paleta de marca (tokens de color).
class MotorixColores {
  MotorixColores._();

  /// Verde: acciones correctas, confirmaciones y estados completados.
  static const Color exito = Color(0xFF2E7D32);
  static const Color exitoSuave = Color(0xFFE8F5E9);

  /// Ámbar: advertencias y elementos próximos.
  static const Color advertencia = Color(0xFFF9A825);
  static const Color advertenciaSuave = Color(0xFFFFF8E1);

  /// Rojo: errores, vencidos y stock crítico.
  static const Color error = Color(0xFFC62828);
  static const Color errorSuave = Color(0xFFFFEBEE);

  /// Neutros sobrios de la interfaz.
  static const Color fondo = Color(0xFFF7F8F7);
  static const Color superficie = Color(0xFFFFFFFF);
  static const Color textoPrincipal = Color(0xFF1B1B1B);
  static const Color textoSecundario = Color(0xFF5F6368);
  static const Color borde = Color(0xFFDADCE0);
  static const Color acento = Color(0xFF2E7D32);
}

/// Medidas de espaciado (tokens de espaciado).
class MotorixEspaciados {
  MotorixEspaciados._();

  static const double xs = 4;
  static const double s = 8;
  static const double m = 16;
  static const double l = 24;
  static const double xl = 32;

  /// Radios de esquina uniformes.
  static const double radio = 8;
}

/// Color de la etiqueta de estado de una orden (tokens del sistema de
/// diseño: verde completado, ámbar en proceso/próximo, rojo error).
Color colorEstadoOrden(String estado) {
  switch (estado) {
    case 'ENTREGADO':
    case 'TERMINADO':
      return MotorixColores.exito;
    case 'CANCELADA':
      return MotorixColores.error;
    case 'ESPERANDO_REFACCION':
      return MotorixColores.advertencia;
    default:
      return MotorixColores.acento;
  }
}

/// Tema propio de la aplicación: Material Design 3 sin usar el tema por
/// defecto de Material (Principio VIII).
ThemeData temaMotorix() {
  const esquema = ColorScheme(
    brightness: Brightness.light,
    primary: MotorixColores.acento,
    onPrimary: Colors.white,
    secondary: MotorixColores.advertencia,
    onSecondary: Colors.black,
    error: MotorixColores.error,
    onError: Colors.white,
    surface: MotorixColores.superficie,
    onSurface: MotorixColores.textoPrincipal,
    surfaceContainerHighest: MotorixColores.fondo,
    outline: MotorixColores.borde,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: esquema,
    scaffoldBackgroundColor: MotorixColores.fondo,
    appBarTheme: const AppBarTheme(
      backgroundColor: MotorixColores.superficie,
      foregroundColor: MotorixColores.textoPrincipal,
      elevation: 0,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      color: MotorixColores.superficie,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(MotorixEspaciados.radio),
        side: const BorderSide(color: MotorixColores.borde),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: MotorixColores.superficie,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(MotorixEspaciados.radio),
        borderSide: const BorderSide(color: MotorixColores.borde),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(MotorixEspaciados.radio),
        borderSide: const BorderSide(color: MotorixColores.borde),
      ),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: MotorixEspaciados.m,
        vertical: MotorixEspaciados.s,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: MotorixColores.acento,
        foregroundColor: Colors.white,
        minimumSize: const Size(120, 44),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(MotorixEspaciados.radio),
        ),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(MotorixEspaciados.radio),
      ),
    ),
  );
}

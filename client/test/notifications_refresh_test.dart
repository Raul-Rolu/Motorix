// 007-notificaciones-internas, T015 (US1; FR-013, CA-1): el proveedor de avisos
// consulta al iniciar sesión, cada 60 segundos y al cambiar de sección, sin
// duplicar consultas en curso; cancela su temporizador al cerrar sesión o al
// liberarse; y ante un 401 (sesión vencida) deja de consultar sin mostrar el
// error de carga ni dejar avisos visibles. Usa un reloj falso (`tester.pump`).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/avisos_falsos.dart';

const _minuto = Duration(seconds: 60);

void main() {
  group('cuándo consulta', () {
    probarAvisos('consulta al iniciar sesión (con el proveedor ya creado antes del login)', (tester) async {
      final cliente = ClienteAvisosFalso();
      final entorno = await montarAvisos(
        tester,
        cliente,
        iniciarSesionComo: 'admin',
        crearProveedorAntesDelLogin: true,
      );

      expect(cliente.consultasAvisos, 1);
      expect(entorno.proveedor.cargado, isTrue);
    });

    probarAvisos('sin sesión no consulta nada', (tester) async {
      final cliente = ClienteAvisosFalso();
      await montarAvisos(tester, cliente, iniciarSesionComo: null);

      await tester.pump(_minuto * 3);

      expect(cliente.consultasAvisos, 0);
    });

    probarAvisos('consulta cada 60 segundos (no antes)', (tester) async {
      final cliente = ClienteAvisosFalso();
      await montarAvisos(tester, cliente);
      expect(cliente.consultasAvisos, 1);

      await tester.pump(const Duration(seconds: 59));
      expect(cliente.consultasAvisos, 1);

      await tester.pump(const Duration(seconds: 1));
      await asentar(tester);
      expect(cliente.consultasAvisos, 2);

      await tester.pump(_minuto);
      await asentar(tester);
      expect(cliente.consultasAvisos, 3);
    });

    probarAvisos('consulta al cambiar de sección del shell', (tester) async {
      final cliente = ClienteAvisosFalso();
      final entorno = await montarAvisos(tester, cliente);
      expect(cliente.consultasAvisos, 1);

      entorno.proveedor.alCambiarSeccion();
      await asentar(tester);

      expect(cliente.consultasAvisos, 2);
    });

    probarAvisos('la consulta periódica es silenciosa: no vuelve a mostrar el indicador de carga', (tester) async {
      final cliente = ClienteAvisosFalso()
        ..resumenPorToken['t-1'] = resumenJson([avisoJson(clave: 'MANTENIMIENTO:1:VENCIDO')]);
      final entorno = await montarAvisos(tester, cliente);
      expect(entorno.proveedor.avisos, hasLength(1));

      cliente.puerta = Completer<void>();
      await tester.pump(_minuto);

      // Hay una consulta en vuelo, pero los avisos ya cargados siguen a la vista.
      expect(entorno.proveedor.cargando, isFalse);
      expect(entorno.proveedor.avisos, hasLength(1));

      cliente.puerta!.complete();
      await asentar(tester);
    });
  });

  group('no duplica consultas en curso', () {
    probarAvisos('mientras hay una consulta en vuelo ni el temporizador ni el cambio de sección piden otra', (tester) async {
      final cliente = ClienteAvisosFalso()..puerta = Completer<void>();
      final entorno = await montarAvisos(tester, cliente);
      expect(cliente.consultasAvisos, 1);

      entorno.proveedor.alCambiarSeccion();
      entorno.proveedor.alCambiarSeccion();
      await tester.pump(_minuto);
      await tester.pump(_minuto);
      expect(cliente.consultasAvisos, 1);

      // Al resolverse la consulta en vuelo, la siguiente sí se hace.
      cliente.puerta!.complete();
      await asentar(tester);
      cliente.puerta = null;
      entorno.proveedor.alCambiarSeccion();
      await asentar(tester);
      expect(cliente.consultasAvisos, 2);
    });
  });

  group('cuándo deja de consultar', () {
    probarAvisos('al cerrar sesión se cancela el temporizador', (tester) async {
      final cliente = ClienteAvisosFalso();
      final entorno = await montarAvisos(tester, cliente);
      expect(cliente.consultasAvisos, 1);

      entorno.auth.cerrarSesion();
      await tester.pump();
      await tester.pump(_minuto * 5);
      await asentar(tester);

      expect(cliente.consultasAvisos, 1);
    });

    probarAvisos('al cambiar de sección tras cerrar sesión no consulta', (tester) async {
      final cliente = ClienteAvisosFalso();
      final entorno = await montarAvisos(tester, cliente);
      entorno.auth.cerrarSesion();
      await tester.pump();

      entorno.proveedor.alCambiarSeccion();
      await asentar(tester);

      expect(cliente.consultasAvisos, 1);
    });

    testWidgets('al liberar el proveedor se cancela el temporizador', (tester) async {
      final cliente = ClienteAvisosFalso();
      await montarAvisos(tester, cliente);
      expect(cliente.consultasAvisos, 1);

      // Se desmonta el árbol: el proveedor se libera y su temporizador se cancela.
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(_minuto * 5);

      expect(cliente.consultasAvisos, 1);
    });
  });

  group('sesión vencida (401) durante la consulta periódica', () {
    probarAvisos('detiene la consulta, no muestra el error de carga y no deja avisos visibles', (tester) async {
      final cliente = ClienteAvisosFalso()
        ..resumenPorToken['t-1'] = resumenJson([avisoJson(clave: 'MANTENIMIENTO:1:VENCIDO')]);
      final entorno = await montarAvisos(tester, cliente);
      expect(entorno.proveedor.avisos, hasLength(1));
      expect(entorno.auth.autenticado, isTrue);

      // La sesión vence: la siguiente consulta periódica responde 401.
      cliente.statusAvisos = 401;
      await tester.pump(_minuto);
      await asentar(tester);

      expect(entorno.auth.autenticado, isFalse);
      expect(entorno.auth.sesionExpirada, isTrue);
      expect(entorno.proveedor.error, isNull);
      expect(entorno.proveedor.avisos, isEmpty);
      expect(entorno.proveedor.noLeidos, 0);

      // Ya no vuelve a consultar.
      final consultas = cliente.consultasAvisos;
      await tester.pump(_minuto * 5);
      await asentar(tester);
      expect(cliente.consultasAvisos, consultas);
    });

    probarAvisos('si el 401 llega en la primera carga tampoco muestra el error de carga', (tester) async {
      final cliente = ClienteAvisosFalso()..statusAvisos = 401;
      final entorno = await montarAvisos(tester, cliente);

      expect(entorno.auth.sesionExpirada, isTrue);
      expect(entorno.proveedor.error, isNull);
      expect(entorno.proveedor.avisos, isEmpty);
    });
  });
}

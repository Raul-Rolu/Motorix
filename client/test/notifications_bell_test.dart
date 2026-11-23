// 007-notificaciones-internas, T014 (US1; FR-001, FR-009, FR-013, CA-1, CA-9, A1):
// la campana muestra el número de avisos no leídos, abre el panel agrupado por
// tipo, maneja los estados cargando/vacío/error y descarta los avisos del
// usuario anterior al cerrar sesión o al entrar otro usuario.
//
// Sin red: un cliente HTTP falso responde con el formato del contrato.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'helpers/avisos_falsos.dart';

/// Abre el panel lateral tocando la campana. Se avanza un tiempo fijo en lugar
/// de `pumpAndSettle` porque el indicador de carga nunca «se asienta».
Future<void> abrirPanel(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('campanaAvisos')));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

Badge insignia(WidgetTester tester) => tester.widget<Badge>(find.byType(Badge));

void main() {
  group('campana y contador', () {
    probarAvisos('muestra el número de avisos no leídos con Badge (los leídos no cuentan)', (tester) async {
      final cliente = ClienteAvisosFalso()
        ..resumenPorToken['t-1'] = resumenJson([
          avisoJson(clave: 'MANTENIMIENTO:1:VENCIDO'),
          avisoJson(clave: 'MANTENIMIENTO:2:VENCIDO'),
          avisoJson(clave: 'MANTENIMIENTO:3:VENCIDO'),
          avisoJson(clave: 'MANTENIMIENTO:4:VENCIDO', leido: true),
        ]);

      await montarAvisos(tester, cliente);

      expect(insignia(tester).isLabelVisible, isTrue);
      expect(find.descendant(of: find.byType(Badge), matching: find.text('3')), findsOneWidget);
    });

    probarAvisos('el Badge se oculta cuando no hay avisos no leídos', (tester) async {
      final cliente = ClienteAvisosFalso();

      await montarAvisos(tester, cliente);

      expect(insignia(tester).isLabelVisible, isFalse);
    });

    probarAvisos('muestra «99+» como máximo', (tester) async {
      final cliente = ClienteAvisosFalso()
        ..resumenPorToken['t-1'] = {
          'total': 120,
          'noLeidos': 120,
          'datos': [avisoJson(clave: 'MANTENIMIENTO:1:VENCIDO')],
        };

      await montarAvisos(tester, cliente);

      expect(find.descendant(of: find.byType(Badge), matching: find.text('99+')), findsOneWidget);
    });
  });

  group('panel de avisos', () {
    probarAvisos('abre un panel con los avisos agrupados por tipo en el orden de presentación', (tester) async {
      final cliente = ClienteAvisosFalso()
        ..resumenPorToken['t-1'] = resumenJson([
          avisoJson(clave: 'MANTENIMIENTO:1:VENCIDO', detalle: 'Cambio de aceite · GHI-789-C · vencido hace 10 día(s)'),
          avisoJson(clave: 'MANTENIMIENTO:2:VENCIDO', detalle: 'Balatas · DEF-456-B · kilometraje superado en 200 km'),
          avisoJson(
            clave: 'STOCK:7:BAJO',
            grupo: 'STOCK',
            estado: 'BAJO',
            titulo: 'Stock bajo',
            detalle: 'Pastillas (FRN-PAS-220) · quedan 2, mínimo 5',
            pantalla: 'INVENTARIO',
            id: 7,
          ),
        ]);

      await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      expect(find.byKey(const Key('panelAvisos')), findsOneWidget);
      expect(find.text('Mantenimientos vencidos'), findsOneWidget);
      expect(find.text('Stock bajo o agotado'), findsOneWidget);
      expect(find.text('Mantenimiento vencido'), findsNWidgets(2));
      expect(find.text('Cambio de aceite · GHI-789-C · vencido hace 10 día(s)'), findsOneWidget);
      expect(find.text('Pastillas (FRN-PAS-220) · quedan 2, mínimo 5'), findsOneWidget);
      // Cada grupo lleva su contador.
      expect(find.byKey(const Key('contadorGrupo-MANTENIMIENTO_VENCIDO')), findsOneWidget);
      expect(
        tester.widget<Text>(find.byKey(const Key('contadorGrupo-MANTENIMIENTO_VENCIDO'))).data,
        '2',
      );
      // Los vencidos van antes que el stock.
      final vencidos = tester.getTopLeft(find.text('Mantenimientos vencidos')).dy;
      final stock = tester.getTopLeft(find.text('Stock bajo o agotado')).dy;
      expect(vencidos, lessThan(stock));
    });

    probarAvisos('estado vacío: «No tienes avisos pendientes.»', (tester) async {
      final cliente = ClienteAvisosFalso();

      await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      expect(find.byKey(const Key('avisosVacio')), findsOneWidget);
      expect(find.text('No tienes avisos pendientes.'), findsOneWidget);
      expect(find.byKey(const Key('avisosError')), findsNothing);
    });

    probarAvisos('estado cargando: indicador discreto mientras llega la respuesta', (tester) async {
      final cliente = ClienteAvisosFalso()..puerta = Completer<void>();

      await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      expect(find.byKey(const Key('avisosCargando')), findsOneWidget);
      expect(find.byKey(const Key('avisosVacio')), findsNothing);

      cliente.puerta!.complete();
      await asentar(tester);
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('avisosCargando')), findsNothing);
      expect(find.byKey(const Key('avisosVacio')), findsOneWidget);
    });

    probarAvisos('estado de error: mensaje en español con «Reintentar» y sin trazas', (tester) async {
      final cliente = ClienteAvisosFalso()..statusAvisos = 500;

      await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      expect(find.byKey(const Key('avisosError')), findsOneWidget);
      expect(find.text('No se pudieron cargar los avisos.'), findsOneWidget);
      expect(find.text('Reintentar'), findsOneWidget);
      // No se exponen detalles internos del servidor.
      expect(find.textContaining('Error del servidor'), findsNothing);
      expect(find.textContaining('ERROR_INTERNO'), findsNothing);

      // Reintentar vuelve a consultar y muestra los avisos cuando el servidor responde.
      cliente
        ..statusAvisos = 200
        ..resumenPorToken['t-1'] = resumenJson([avisoJson(clave: 'MANTENIMIENTO:1:VENCIDO')]);
      final antes = cliente.consultasAvisos;
      await tester.tap(find.byKey(const Key('botonReintentarAvisos')));
      await tester.pumpAndSettle();

      expect(cliente.consultasAvisos, antes + 1);
      expect(find.byKey(const Key('avisosError')), findsNothing);
      expect(find.text('Mantenimiento vencido'), findsOneWidget);
    });
  });

  group('A1: los avisos de un usuario nunca se muestran a otro', () {
    probarAvisos('al cerrar sesión la lista, los contadores y las marcas de leído desaparecen de inmediato', (tester) async {
      final cliente = ClienteAvisosFalso()
        ..resumenPorToken['t-1'] = resumenJson([
          avisoJson(clave: 'MANTENIMIENTO:1:VENCIDO'),
          avisoJson(clave: 'MANTENIMIENTO:2:VENCIDO', leido: true),
        ]);
      final entorno = await montarAvisos(tester, cliente);
      expect(entorno.proveedor.avisos, hasLength(2));
      expect(entorno.proveedor.noLeidos, 1);

      entorno.auth.cerrarSesion();
      await tester.pump();

      expect(entorno.proveedor.avisos, isEmpty);
      expect(entorno.proveedor.total, 0);
      expect(entorno.proveedor.noLeidos, 0);
      expect(entorno.proveedor.error, isNull);
      expect(insignia(tester).isLabelVisible, isFalse);

      await abrirPanel(tester);
      expect(find.text('Mantenimiento vencido'), findsNothing);
    });

    probarAvisos('al entrar otro usuario no se ven los avisos del anterior mientras carga la consulta del nuevo', (tester) async {
      final cliente = ClienteAvisosFalso()
        ..resumenPorToken['t-1'] = resumenJson([
          avisoJson(clave: 'MANTENIMIENTO:1:VENCIDO', detalle: 'Aviso exclusivo del administrador'),
          avisoJson(clave: 'MANTENIMIENTO:2:VENCIDO', leido: true),
        ])
        ..resumenPorToken['t-3'] = resumenJson([
          avisoJson(
            clave: 'ORDEN:9:DETENIDA',
            grupo: 'ORDEN_DETENIDA',
            estado: 'DETENIDA',
            titulo: 'Orden detenida',
            detalle: 'Orden #9 del mecánico',
            pantalla: 'ORDEN',
            id: 9,
          ),
        ]);
      final entorno = await montarAvisos(tester, cliente);
      expect(entorno.proveedor.noLeidos, 1);

      // El mecánico entra en el mismo equipo y su respuesta aún no llega.
      entorno.auth.cerrarSesion();
      await tester.pump();
      cliente.puerta = Completer<void>();
      final login = entorno.auth.login('mecanico', 'Usuario123');
      await asentar(tester);
      await login;

      await abrirPanel(tester);
      expect(entorno.proveedor.avisos, isEmpty);
      expect(entorno.proveedor.noLeidos, 0);
      expect(find.text('Aviso exclusivo del administrador'), findsNothing);
      expect(find.text('Mantenimiento vencido'), findsNothing);
      expect(find.byKey(const Key('avisosCargando')), findsOneWidget);

      // Llega la respuesta del mecánico: solo se ven sus avisos y sus marcas.
      cliente.puerta!.complete();
      await asentar(tester);
      await tester.pumpAndSettle();

      expect(entorno.proveedor.avisos.map((a) => a.clave), ['ORDEN:9:DETENIDA']);
      expect(find.text('Orden #9 del mecánico'), findsOneWidget);
      expect(find.text('Aviso exclusivo del administrador'), findsNothing);
    });

    probarAvisos('se descarta la respuesta de una consulta en vuelo del usuario anterior', (tester) async {
      final cliente = ClienteAvisosFalso()
        ..puerta = Completer<void>()
        ..resumenPorToken['t-1'] = resumenJson([
          avisoJson(clave: 'MANTENIMIENTO:1:VENCIDO', detalle: 'Aviso exclusivo del administrador'),
        ]);
      // La consulta del administrador queda en vuelo.
      final entorno = await montarAvisos(tester, cliente);
      expect(cliente.consultasAvisos, 1);
      expect(entorno.proveedor.avisos, isEmpty);

      // Cierra sesión y, después, llega la respuesta tardía del administrador.
      entorno.auth.cerrarSesion();
      await tester.pump();
      cliente.puerta!.complete();
      await asentar(tester);
      await tester.pumpAndSettle();

      expect(entorno.proveedor.avisos, isEmpty);
      expect(entorno.proveedor.total, 0);
      expect(entorno.proveedor.noLeidos, 0);
      expect(insignia(tester).isLabelVisible, isFalse);
    });

    probarAvisos('al volver a iniciar sesión se recargan los avisos del usuario', (tester) async {
      final cliente = ClienteAvisosFalso()
        ..resumenPorToken['t-1'] = resumenJson([avisoJson(clave: 'MANTENIMIENTO:1:VENCIDO')]);
      final entorno = await montarAvisos(tester, cliente);
      entorno.auth.cerrarSesion();
      await tester.pump();
      expect(entorno.proveedor.avisos, isEmpty);

      final login = entorno.auth.login('admin', 'Usuario123');
      await asentar(tester);
      await login;
      await asentar(tester);

      expect(entorno.proveedor.avisos, hasLength(1));
      expect(entorno.proveedor.noLeidos, 1);
    });
  });
}

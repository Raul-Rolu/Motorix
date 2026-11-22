// 007-notificaciones-internas, T025 (US2; FR-001, FR-009, CA-1, CA-9): el panel
// de avisos muestra los grupos de mantenimientos próximos (`warning`) y de
// citas de hoy (texto secundario) con su título, ícono y color, respeta el
// orden de presentación y maneja los estados cargando, vacío y error.
// Las historias siguientes amplían este archivo (stock, órdenes detenidas,
// mecánico, marcar como leído y navegación).
//
// Sin red: un cliente HTTP falso responde con el formato del contrato.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:motorix_client/config/theme.dart';
import 'package:motorix_client/models/vehicle.dart';
import 'package:motorix_client/providers/shell_navigation_provider.dart';

import 'helpers/avisos_falsos.dart';

Future<void> abrirPanel(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('campanaAvisos')));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

/// Ícono de la fila de un aviso (el de `leading`).
Icon iconoDe(WidgetTester tester, String clave, IconData icono) => tester.widget<Icon>(
      find.descendant(of: find.byKey(Key('aviso-$clave')), matching: find.byIcon(icono)),
    );

final _vencido = avisoJson(clave: 'MANTENIMIENTO:1:VENCIDO');
final _proximo = avisoJson(
  clave: 'MANTENIMIENTO:2:PROXIMO',
  grupo: 'MANTENIMIENTO_PROXIMO',
  estado: 'PROXIMO',
  titulo: 'Mantenimiento próximo',
  detalle: 'Cambio de filtros · PRX-001-A · faltan 10 día(s)',
);
final _cita = avisoJson(
  clave: 'CITA:5:HOY',
  grupo: 'CITA_DEL_DIA',
  estado: 'HOY',
  titulo: 'Cita de hoy',
  detalle: '10:00 · María López Hernández · ABC-123-A · Revisión de frenos',
  pantalla: 'CITAS',
  id: 5,
);
final _stock = avisoJson(
  clave: 'STOCK:7:BAJO',
  grupo: 'STOCK',
  estado: 'BAJO',
  titulo: 'Stock bajo',
  detalle: 'Pastillas (FRN-PAS-220) · quedan 2, mínimo 5',
  pantalla: 'INVENTARIO',
  id: 7,
);

void main() {
  group('grupos de próximos y de citas de hoy', () {
    probarAvisos('muestra los títulos, el ícono y el color de cada grupo', (tester) async {
      final cliente = ClienteAvisosFalso()..resumenPorToken['t-1'] = resumenJson([_proximo, _cita]);

      await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      expect(find.text('Mantenimientos próximos'), findsOneWidget);
      expect(find.text('Mantenimiento próximo'), findsOneWidget);
      expect(find.text('Cambio de filtros · PRX-001-A · faltan 10 día(s)'), findsOneWidget);
      expect(find.text('Citas de hoy'), findsOneWidget);
      expect(find.text('Cita de hoy'), findsOneWidget);
      expect(find.text('10:00 · María López Hernández · ABC-123-A · Revisión de frenos'), findsOneWidget);

      // Próximo: ámbar (`warning`); cita del día: texto secundario.
      final iconoProximo = iconoDe(tester, 'MANTENIMIENTO:2:PROXIMO', Icons.build_circle_outlined);
      expect(iconoProximo.color, MotorixColores.advertencia);
      final iconoCita = iconoDe(tester, 'CITA:5:HOY', Icons.event_available_outlined);
      expect(iconoCita.color, MotorixColores.textoSecundario);
    });

    probarAvisos('los avisos leídos pierden el color y quedan en texto secundario', (tester) async {
      final proximoLeido = avisoJson(
        clave: 'MANTENIMIENTO:2:PROXIMO',
        grupo: 'MANTENIMIENTO_PROXIMO',
        estado: 'PROXIMO',
        titulo: 'Mantenimiento próximo',
        leido: true,
      );
      final cliente = ClienteAvisosFalso()..resumenPorToken['t-1'] = resumenJson([proximoLeido]);

      await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      final icono = iconoDe(tester, 'MANTENIMIENTO:2:PROXIMO', Icons.build_circle_outlined);
      expect(icono.color, MotorixColores.textoSecundario);
    });
  });

  group('marcar como leído y abrir el aviso (US6)', () {
    final dos = [
      avisoJson(clave: 'MANTENIMIENTO:1:VENCIDO'),
      avisoJson(clave: 'MANTENIMIENTO:2:VENCIDO'),
    ];

    String contador(WidgetTester tester) => tester
        .widget<Text>(find.descendant(of: find.byType(Badge), matching: find.byType(Text)))
        .data!;

    probarAvisos('«Marcar como leído» baja el contador, atenúa la fila y registra la lectura', (tester) async {
      final cliente = ClienteAvisosFalso()..resumenPorToken['t-1'] = resumenJson(dos);
      final entorno = await montarAvisos(tester, cliente);
      await abrirPanel(tester);
      expect(contador(tester), '2');
      expect(iconoDe(tester, 'MANTENIMIENTO:1:VENCIDO', Icons.build_circle_outlined).color, MotorixColores.error);

      await tester.tap(find.byKey(const Key('marcarLeido-MANTENIMIENTO:1:VENCIDO')));
      await tester.pump();

      // Efecto inmediato (optimista) y luego la lectura queda guardada en el servidor.
      await asentar(tester);
      expect(cliente.lecturas, ['MANTENIMIENTO:1:VENCIDO']);
      expect(contador(tester), '1');
      expect(entorno.proveedor.noLeidos, 1);
      expect(iconoDe(tester, 'MANTENIMIENTO:1:VENCIDO', Icons.build_circle_outlined).color,
          MotorixColores.textoSecundario);
      // El aviso leído ya no ofrece el botón; el otro sí.
      expect(find.byKey(const Key('marcarLeido-MANTENIMIENTO:1:VENCIDO')), findsNothing);
      expect(find.byKey(const Key('marcarLeido-MANTENIMIENTO:2:VENCIDO')), findsOneWidget);
    });

    probarAvisos('si el servidor falla la marca se revierte y el contador vuelve a su valor', (tester) async {
      final cliente = ClienteAvisosFalso()
        ..resumenPorToken['t-1'] = resumenJson(dos)
        ..statusLectura = 500;
      final entorno = await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      await tester.tap(find.byKey(const Key('marcarLeido-MANTENIMIENTO:1:VENCIDO')));
      await asentar(tester);

      expect(cliente.lecturas, isEmpty);
      expect(entorno.proveedor.noLeidos, 2);
      expect(entorno.proveedor.avisos.every((a) => !a.leido), isTrue);
      expect(find.byKey(const Key('marcarLeido-MANTENIMIENTO:1:VENCIDO')), findsOneWidget);
    });

    probarAvisos('si el aviso ya no existe (404) se recarga la lista', (tester) async {
      final cliente = ClienteAvisosFalso()
        ..resumenPorToken['t-1'] = resumenJson(dos)
        ..statusLectura = 404;
      final entorno = await montarAvisos(tester, cliente);
      await abrirPanel(tester);
      final antes = cliente.consultasAvisos;
      // Mientras tanto el mantenimiento 1 se completó: el servidor ya no lo devuelve.
      cliente.resumenPorToken['t-1'] = resumenJson([dos[1]]);

      await tester.tap(find.byKey(const Key('marcarLeido-MANTENIMIENTO:1:VENCIDO')));
      await asentar(tester);
      await asentar(tester);

      expect(cliente.consultasAvisos, greaterThan(antes));
      expect(entorno.proveedor.avisos.map((a) => a.clave), ['MANTENIMIENTO:2:VENCIDO']);
      expect(entorno.proveedor.noLeidos, 1);
    });

    probarAvisos('abrir un aviso de orden lo marca como leído, cierra el panel y va a la orden', (tester) async {
      final orden = avisoJson(
        clave: 'ORDEN:9:DETENIDA',
        grupo: 'ORDEN_DETENIDA',
        estado: 'DETENIDA',
        titulo: 'Orden detenida',
        detalle: 'Orden #9 · GHI-789-C · Diagnóstico, sin cambios hace 5 día(s)',
        pantalla: 'ORDEN',
        id: 9,
      );
      final cliente = ClienteAvisosFalso()..resumenPorToken['t-1'] = resumenJson([orden]);
      final entorno = await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      await tester.tap(find.byKey(const Key('aviso-ORDEN:9:DETENIDA')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));

      expect(cliente.lecturas, ['ORDEN:9:DETENIDA']);
      expect(entorno.rutas.map((r) => r.name), ['/avisos/orden']);
      expect(entorno.rutas.single.arguments, 9);
      expect(find.byKey(const Key('panelAvisos')), findsNothing);
    });

    probarAvisos('abrir un aviso de mantenimiento carga el vehículo y abre su historial', (tester) async {
      final cliente = ClienteAvisosFalso()..resumenPorToken['t-1'] = resumenJson([_vencido]);
      final entorno = await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      await tester.tap(find.byKey(const Key('aviso-MANTENIMIENTO:1:VENCIDO')));
      await tester.pump();
      await asentar(tester);
      await tester.pump(const Duration(milliseconds: 500));

      expect(cliente.consultasDeVehiculo, 1);
      expect(cliente.lecturas, ['MANTENIMIENTO:1:VENCIDO']);
      expect(entorno.rutas.map((r) => r.name), ['/avisos/vehiculo']);
      final vehiculo = entorno.rutas.single.arguments as Vehiculo;
      expect(vehiculo.id, 3);
      expect(vehiculo.plates, 'GHI-789-C');
    });

    probarAvisos('abrir un aviso de stock pide la sección Inventario', (tester) async {
      final cliente = ClienteAvisosFalso()..resumenPorToken['t-1'] = resumenJson([_stock]);
      final entorno = await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      await tester.tap(find.byKey(const Key('aviso-STOCK:7:BAJO')));
      await tester.pump();
      await asentar(tester);

      expect(entorno.shell.solicitada, SeccionShell.inventario);
      expect(cliente.lecturas, ['STOCK:7:BAJO']);
      expect(entorno.rutas, isEmpty);
    });

    probarAvisos('abrir un aviso de cita pide la sección Citas', (tester) async {
      final cliente = ClienteAvisosFalso()..resumenPorToken['t-1'] = resumenJson([_cita]);
      final entorno = await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      await tester.tap(find.byKey(const Key('aviso-CITA:5:HOY')));
      await tester.pump();
      await asentar(tester);

      expect(entorno.shell.solicitada, SeccionShell.citas);
      expect(cliente.lecturas, ['CITA:5:HOY']);
    });

    probarAvisos('abrir un aviso ya leído navega pero no vuelve a marcarlo', (tester) async {
      final leido = avisoJson(clave: 'MANTENIMIENTO:1:VENCIDO', leido: true);
      final cliente = ClienteAvisosFalso()..resumenPorToken['t-1'] = resumenJson([leido]);
      final entorno = await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      await tester.tap(find.byKey(const Key('aviso-MANTENIMIENTO:1:VENCIDO')));
      await tester.pump();
      await asentar(tester);
      await tester.pump(const Duration(milliseconds: 500));

      expect(cliente.lecturas, isEmpty);
      expect(entorno.rutas.map((r) => r.name), ['/avisos/vehiculo']);
    });
  });

  group('mecánico: solo los grupos que recibe (US5)', () {
    probarAvisos('muestra únicamente «Órdenes detenidas», sin encabezados vacíos, y la campana cuenta solo sus avisos', (tester) async {
      Map<String, dynamic> orden(int id, {bool leido = false}) => avisoJson(
            clave: 'ORDEN:$id:DETENIDA',
            grupo: 'ORDEN_DETENIDA',
            estado: 'DETENIDA',
            titulo: 'Orden detenida',
            detalle: 'Orden #$id · GHI-789-C · Diagnóstico, sin cambios hace 5 día(s)',
            pantalla: 'ORDEN',
            id: id,
            leido: leido,
          );
      final cliente = ClienteAvisosFalso()
        ..resumenPorToken['t-3'] = resumenJson([orden(8), orden(9, leido: true)]);

      final entorno = await montarAvisos(tester, cliente, iniciarSesionComo: 'mecanico');
      await abrirPanel(tester);

      expect(entorno.auth.esMecanico, isTrue);
      // La campana cuenta solo sus avisos sin leer (1 de 2).
      expect(tester.widget<Badge>(find.byType(Badge)).isLabelVisible, isTrue);
      expect(find.descendant(of: find.byType(Badge), matching: find.text('1')), findsOneWidget);
      // Solo el grupo que recibe; ningún encabezado vacío de los demás.
      expect(find.text('Órdenes detenidas'), findsOneWidget);
      expect(find.text('Orden detenida'), findsNWidgets(2));
      for (final titulo in [
        'Mantenimientos vencidos',
        'Mantenimientos próximos',
        'Stock bajo o agotado',
        'Citas de hoy',
      ]) {
        expect(find.text(titulo), findsNothing);
      }
      expect(find.byKey(const Key('contadorGrupo-ORDEN_DETENIDA')), findsOneWidget);
      expect(tester.widget<Text>(find.byKey(const Key('contadorGrupo-ORDEN_DETENIDA'))).data, '2');
    });

    probarAvisos('si el mecánico no tiene avisos la campana queda sin número y el panel vacío', (tester) async {
      final cliente = ClienteAvisosFalso();

      await montarAvisos(tester, cliente, iniciarSesionComo: 'mecanico');
      await abrirPanel(tester);

      expect(tester.widget<Badge>(find.byType(Badge)).isLabelVisible, isFalse);
      expect(find.text('No tienes avisos pendientes.'), findsOneWidget);
    });
  });

  group('grupo de órdenes detenidas (US4)', () {
    probarAvisos('muestra el grupo en ámbar con el ícono de orden detenida, entre vencidos y stock', (tester) async {
      tester.view.physicalSize = const Size(800, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      final detenida = avisoJson(
        clave: 'ORDEN:3:DETENIDA',
        grupo: 'ORDEN_DETENIDA',
        estado: 'DETENIDA',
        titulo: 'Orden detenida',
        detalle: 'Orden #3 · DEF-456-B · Esperando refacción, sin cambios hace 5 día(s)',
        pantalla: 'ORDEN',
        id: 3,
      );
      final cliente = ClienteAvisosFalso()
        ..resumenPorToken['t-1'] = resumenJson([_stock, detenida, _vencido]);

      await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      expect(find.text('Órdenes detenidas'), findsOneWidget);
      expect(find.text('Orden detenida'), findsOneWidget);
      expect(
        find.text('Orden #3 · DEF-456-B · Esperando refacción, sin cambios hace 5 día(s)'),
        findsOneWidget,
      );
      expect(iconoDe(tester, 'ORDEN:3:DETENIDA', Icons.assignment_late_outlined).color,
          MotorixColores.advertencia);
      final vencidos = tester.getTopLeft(find.text('Mantenimientos vencidos')).dy;
      final ordenes = tester.getTopLeft(find.text('Órdenes detenidas')).dy;
      final stock = tester.getTopLeft(find.text('Stock bajo o agotado')).dy;
      expect(vencidos, lessThan(ordenes));
      expect(ordenes, lessThan(stock));
    });
  });

  group('grupo de stock bajo o agotado (US3)', () {
    probarAvisos('el stock bajo va en ámbar y el agotado en rojo, con el ícono de inventario', (tester) async {
      final agotado = avisoJson(
        clave: 'STOCK:9:AGOTADO',
        grupo: 'STOCK',
        estado: 'AGOTADO',
        titulo: 'Stock agotado',
        detalle: 'Batería 12V (BAT-12V-60) · sin existencias',
        pantalla: 'INVENTARIO',
        id: 9,
      );
      final cliente = ClienteAvisosFalso()..resumenPorToken['t-1'] = resumenJson([agotado, _stock]);

      await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      expect(find.text('Stock bajo o agotado'), findsOneWidget);
      expect(find.text('Stock bajo'), findsOneWidget);
      expect(find.text('Stock agotado'), findsOneWidget);
      expect(find.text('Pastillas (FRN-PAS-220) · quedan 2, mínimo 5'), findsOneWidget);
      expect(find.text('Batería 12V (BAT-12V-60) · sin existencias'), findsOneWidget);
      expect(iconoDe(tester, 'STOCK:7:BAJO', Icons.inventory_2_outlined).color, MotorixColores.advertencia);
      expect(iconoDe(tester, 'STOCK:9:AGOTADO', Icons.inventory_2_outlined).color, MotorixColores.error);
    });
  });

  group('orden de presentación de los grupos', () {
    probarAvisos('vencidos, stock, próximos y citas aparecen en ese orden (y sin grupos vacíos)', (tester) async {
      // Ventana alta: la lista del panel es perezosa y solo construye lo visible.
      tester.view.physicalSize = const Size(800, 1600);
      tester.view.devicePixelRatio = 1.0;
      addTearDown(tester.view.reset);
      final cliente = ClienteAvisosFalso()
        ..resumenPorToken['t-1'] = resumenJson([_cita, _proximo, _stock, _vencido]);

      await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      final titulos = [
        'Mantenimientos vencidos',
        'Stock bajo o agotado',
        'Mantenimientos próximos',
        'Citas de hoy',
      ];
      final posiciones = [for (final t in titulos) tester.getTopLeft(find.text(t)).dy];
      expect(posiciones, orderedEquals([...posiciones]..sort()));
      // No hay órdenes detenidas: su encabezado no aparece.
      expect(find.text('Órdenes detenidas'), findsNothing);
    });
  });

  group('estados del panel', () {
    probarAvisos('cargando: indicador discreto mientras llega la respuesta', (tester) async {
      final cliente = ClienteAvisosFalso()..puerta = Completer<void>();

      await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      expect(find.byKey(const Key('avisosCargando')), findsOneWidget);
    });

    probarAvisos('vacío: mensaje útil', (tester) async {
      final cliente = ClienteAvisosFalso();

      await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      expect(find.text('No tienes avisos pendientes.'), findsOneWidget);
    });

    probarAvisos('error: mensaje en español con «Reintentar»', (tester) async {
      final cliente = ClienteAvisosFalso()..statusAvisos = 500;

      await montarAvisos(tester, cliente);
      await abrirPanel(tester);

      expect(find.text('No se pudieron cargar los avisos.'), findsOneWidget);
      expect(find.byKey(const Key('botonReintentarAvisos')), findsOneWidget);
    });
  });
}

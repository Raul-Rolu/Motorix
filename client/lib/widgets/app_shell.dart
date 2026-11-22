/// Estructura de navegación con menú lateral (T030, US1; FR-016).
///
/// Secciones: Inicio, Clientes, Vehículos, Órdenes y Usuarios. Usuarios solo
/// es visible para el rol ADMIN; Órdenes es visible para los tres roles (el
/// mecánico ve las suyas). Ocultar opciones es solo comodidad: la
/// autorización real se valida en el servidor (RN-15).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../providers/auth_provider.dart';
import '../providers/clients_to_notify_provider.dart';
import '../providers/notifications_provider.dart';
import '../providers/shell_navigation_provider.dart';
import '../screens/appointments_screen.dart';
import '../screens/clients_screen.dart';
import '../screens/clients_to_notify_screen.dart';
import '../screens/home_content.dart';
import '../screens/maintenances_screen.dart';
import '../screens/orders_screen.dart';
import '../screens/parts_screen.dart';
import '../screens/users_screen.dart';
import '../screens/vehicles_screen.dart';
import 'notification_bell.dart';
import 'notifications_panel.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _indice = 0;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final esAdmin = auth.esAdmin;
    final puedeClientes = auth.puedeGestionarClientes;

    // Cada sección lleva su pantalla: los índices siempre quedan alineados.
    final secciones = <_Seccion>[
      const _Seccion('Inicio', Icons.home_outlined, HomeContent()),
      if (puedeClientes)
        const _Seccion(
            'Citas', Icons.event_available_outlined, AppointmentsScreen(),
            seccion: SeccionShell.citas),
      if (puedeClientes)
        const _Seccion('Clientes', Icons.people_outline, ClientsScreen()),
      if (puedeClientes)
        const _Seccion(
            'Vehículos', Icons.directions_car_outlined, VehiclesScreen()),
      // Sprint 3, US4: recepción y administración revisan vencidos y próximos.
      if (puedeClientes)
        const _Seccion(
            'Mantenimientos', Icons.build_circle_outlined, MaintenancesScreen()),
      // Sprint 3, US6: consulta del inventario de refacciones.
      if (puedeClientes)
        const _Seccion(
            'Inventario', Icons.inventory_2_outlined, PartsScreen(),
            seccion: SeccionShell.inventario),
      const _Seccion(
          'Órdenes', Icons.assignment_outlined, OrdersScreen()),
      // 007-notificaciones-internas, US7: hechos pendientes de avisar a un
      // cliente; solo ADMIN y RECEPTIONIST (el servidor responde 403 al mecánico).
      if (puedeClientes)
        const _Seccion(
            'Clientes por avisar', Icons.phone_in_talk_outlined, ClientsToNotifyScreen(),
            seccion: SeccionShell.clientesPorAvisar),
      if (esAdmin)
        const _Seccion(
            'Usuarios', Icons.manage_accounts_outlined, UsersScreen()),
    ];

    // Un aviso puede pedir abrir una sección (Inventario, Citas…): se atiende al
    // construir y se consume al terminar el cuadro. Si el rol no tiene esa
    // sección la solicitud se descarta (los permisos reales viven en el servidor).
    final solicitada = context.watch<ShellNavigationProvider>().solicitada;
    if (solicitada != null) {
      final destino = secciones.indexWhere((s) => s.seccion == solicitada);
      if (destino >= 0) {
        _indice = destino;
      }
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        context.read<ShellNavigationProvider>().consumir();
        if (destino >= 0) {
          context.read<NotificationsProvider>().alCambiarSeccion();
        }
      });
    }

    if (_indice >= secciones.length) {
      _indice = 0;
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(secciones[_indice].titulo),
        actions: [
          // 007-notificaciones-internas: campana de avisos del encabezado.
          const CampanaAvisos(),
          Padding(
            padding: const EdgeInsets.only(right: MotorixEspaciados.s),
            child: Center(
              child: Text(
                '${auth.usuario?.fullName ?? ''} (${auth.usuario?.nombreRole ?? ''})',
                style: const TextStyle(color: MotorixColores.textoSecundario),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Cerrar sesión',
            icon: const Icon(Icons.logout),
            onPressed: () {
              auth.cerrarSesion();
              Navigator.of(context)
                  .pushNamedAndRemoveUntil('/login', (ruta) => false);
            },
          ),
        ],
      ),
      // Panel lateral de avisos, agrupados por tipo (se abre desde la campana).
      endDrawer: const PanelAvisos(),
      drawer: Drawer(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            const DrawerHeader(
              decoration: BoxDecoration(color: MotorixColores.acento),
              child: Text(
                'Motorix',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            for (var i = 0; i < secciones.length; i++)
              ListTile(
                leading: Icon(secciones[i].icono),
                title: Text(secciones[i].titulo),
                selected: i == _indice,
                onTap: () {
                  setState(() => _indice = i);
                  Navigator.of(context).pop(); // cierra el drawer
                  // Actualiza el contador de avisos al cambiar de sección.
                  context.read<NotificationsProvider>().alCambiarSeccion();
                  // Al abrir «Clientes por avisar» la lista se actualiza.
                  if (secciones[i].seccion == SeccionShell.clientesPorAvisar) {
                    context.read<ClientsToNotifyProvider>().cargar(silencioso: true);
                  }
                },
              ),
          ],
        ),
      ),
      body: IndexedStack(
        index: _indice,
        children: [for (final seccion in secciones) seccion.pantalla],
      ),
    );
  }
}

class _Seccion {
  final String titulo;
  final IconData icono;
  final Widget pantalla;

  /// Identificador con el que un aviso puede pedir abrir esta sección.
  final SeccionShell? seccion;

  const _Seccion(this.titulo, this.icono, this.pantalla, {this.seccion});
}

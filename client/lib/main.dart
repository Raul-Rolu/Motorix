/// Punto de entrada de la aplicación de escritorio de Motorix.
///
/// Registra los providers, el tema propio del sistema de diseño y las rutas
/// del Sprint 1. La URL de la API puede definirse en compilación con
/// `flutter run --dart-define=API_BASE_URL=http://localhost:3000/api`.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'config/theme.dart';
import 'models/vehicle.dart';
import 'providers/appointments_provider.dart';
import 'providers/audit_provider.dart';
import 'providers/auth_provider.dart';
import 'providers/clients_provider.dart';
import 'providers/clients_to_notify_provider.dart';
import 'providers/dashboard_provider.dart';
import 'providers/history_provider.dart';
import 'providers/maintenances_provider.dart';
import 'providers/notifications_provider.dart';
import 'providers/orders_provider.dart';
import 'providers/parts_provider.dart';
import 'providers/payments_provider.dart';
import 'providers/reports_provider.dart';
import 'providers/service_types_provider.dart';
import 'providers/session_provider.dart';
import 'providers/settings_provider.dart';
import 'providers/shell_navigation_provider.dart';
import 'providers/terms_provider.dart';
import 'providers/ticket_provider.dart';
import 'providers/users_provider.dart';
import 'providers/vehicles_provider.dart';
import 'screens/client_form_screen.dart';
import 'screens/appointment_form_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/login_screen.dart';
import 'screens/maintenance_form_screen.dart';
import 'screens/order_form_screen.dart';
import 'screens/order_detail_screen.dart';
import 'screens/part_form_screen.dart';
import 'screens/terms_acceptance_screen.dart';
import 'screens/users_screen.dart';
import 'screens/vehicle_form_screen.dart';
import 'screens/vehicle_history_screen.dart';
import 'services/api_client.dart';
import 'widgets/app_shell.dart';
import 'widgets/session_activity.dart';

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

void main() {
  final api = ApiClient();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider(api)),
        ChangeNotifierProvider(create: (_) => UsersProvider(api)),
        ChangeNotifierProvider(create: (_) => ClientsProvider(api)),
        ChangeNotifierProvider(create: (_) => VehiclesProvider(api)),
        ChangeNotifierProvider(create: (_) => OrdersProvider(api)),
        ChangeNotifierProvider(create: (_) => AppointmentsProvider(api)),
        ChangeNotifierProvider(create: (_) => HistoryProvider(api)),
        ChangeNotifierProvider(create: (_) => MaintenancesProvider(api)),
        ChangeNotifierProvider(create: (_) => PartsProvider(api)),
        ChangeNotifierProvider(create: (_) => PaymentsProvider(api)),
        ChangeNotifierProvider(create: (_) => TicketsProvider(api)),
        ChangeNotifierProvider(create: (_) => DashboardProvider(api)),
        // 007-notificaciones-internas: avisos del usuario; escucha la sesión para
        // limpiarse al cerrar sesión o al entrar otro usuario.
        ChangeNotifierProvider(
          create: (context) => NotificationsProvider(api, context.read<AuthProvider>()),
        ),
        // Clientes por avisar (US7): también se limpia al cerrar sesión.
        ChangeNotifierProvider(
          create: (context) => ClientsToNotifyProvider(api, context.read<AuthProvider>()),
        ),
        // Sección del shell pedida desde un aviso (Inventario, Citas…).
        ChangeNotifierProvider(create: (_) => ShellNavigationProvider()),
        // 008-configuracion-seguridad-reportes (bloque P1): configuración del
        // taller (solo ADMIN); se limpia al cerrar sesión o cambiar de usuario.
        ChangeNotifierProvider(
          create: (context) => SettingsProvider(api, context.read<AuthProvider>()),
        ),
        // Catálogo de tipos de servicio: ADMIN lo administra; los tres roles
        // eligen un tipo activo en las líneas de servicio.
        ChangeNotifierProvider(
          create: (context) => ServiceTypesProvider(api, context.read<AuthProvider>()),
        ),
        // 008, bloque P2: vigilancia de la inactividad y renovación del token con la
        // actividad del usuario (la consulta de avisos no cuenta como actividad).
        ChangeNotifierProvider(
          create: (context) => SessionProvider(context.read<AuthProvider>()),
        ),
        // 008, bloque P2: bitácora de acciones sensibles (solo ADMIN, solo lectura).
        ChangeNotifierProvider(
          create: (context) => AuditProvider(api, context.read<AuthProvider>()),
        ),
        // 008, bloque P2: términos y condiciones con aviso de privacidad. Escucha la
        // sesión (consulta al iniciar) y el 403 TERMS_NOT_ACCEPTED de cualquier petición.
        ChangeNotifierProvider(
          create: (context) => TermsProvider(api, context.read<AuthProvider>()),
        ),
        // 008, bloque P3: reportes (solo ADMIN, solo lectura); se limpia al cerrar sesión.
        ChangeNotifierProvider(
          create: (context) => ReportsProvider(api, context.read<AuthProvider>()),
        ),
      ],
      child: const MotorixApp(),
    ),
  );
}

class MotorixApp extends StatefulWidget {
  const MotorixApp({super.key});

  @override
  State<MotorixApp> createState() => _MotorixAppState();
}

class _MotorixAppState extends State<MotorixApp> {
  @override
  void initState() {
    super.initState();
    // Al expirar la sesión se vuelve al login desde cualquier pantalla.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AuthProvider>().alExpirar = () {
        navigatorKey.currentState?.pushNamedAndRemoveUntil('/login', (r) => false);
      };
      // `read` crea el proveedor de términos (son perezosos) para que escuche desde
      // antes del primer inicio de sesión. Si falta aceptar, se lleva al usuario a
      // la pantalla de aceptación desde cualquier pantalla.
      context.read<TermsProvider>().alPendiente = () {
        navigatorKey.currentState?.pushNamedAndRemoveUntil('/terminos', (r) => false);
      };
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Motorix',
      debugShowCheckedModeBanner: false,
      // Tema propio del sistema de diseño; nunca el tema por defecto (Principio VIII).
      theme: temaMotorix(),
      navigatorKey: navigatorKey,
      // Detecta la actividad (puntero y teclado) en toda la app para la sesión.
      builder: (context, hijo) => ActividadSesion(child: hijo ?? const SizedBox.shrink()),
      home: const LoginScreen(),
      routes: {
        // La ruta /login se usa al cerrar sesión o expirar el token.
        '/login': (_) => const LoginScreen(),
        '/inicio': (_) => const AppShell(),
        // Aceptación de los términos y del aviso de privacidad (008, FR-020).
        '/terminos': (_) => const TermsAcceptanceScreen(),
        '/clientes/nuevo': (_) => const ClientFormScreen(),
        '/vehiculos/nuevo': (_) => const VehicleFormScreen(),
        '/mantenimientos/nueva': (_) => const MaintenanceFormScreen(),
        '/mantenimientos': (_) => const AppShell(),
        '/inventario/nueva': (_) => const PartFormScreen(),
        '/inventario': (_) => const AppShell(),
        '/ordenes': (_) => const AppShell(),
        '/ordenes/nueva': (_) => const OrderFormScreen(),
        '/citas': (_) => const AppShell(),
        '/citas/nueva': (_) => const AppointmentFormScreen(),
        '/usuarios': (_) => const _PaginaUsuarios(),
        // Panel de control: exclusivo de administración (FR-016, RN-15).
        '/panel': (_) => const DashboardScreen(),
      },
      // Destinos que abre el panel de avisos con argumentos (007, US6): la orden
      // (id) y el historial de un vehículo.
      onGenerateRoute: (ajustes) {
        final argumentos = ajustes.arguments;
        if (ajustes.name == '/avisos/orden' && argumentos is int) {
          return MaterialPageRoute<void>(
            settings: ajustes,
            builder: (_) => OrderDetailScreen(ordenId: argumentos),
          );
        }
        if (ajustes.name == '/avisos/vehiculo' && argumentos is Vehiculo) {
          return MaterialPageRoute<void>(
            settings: ajustes,
            builder: (_) => VehicleHistoryScreen(vehiculo: argumentos),
          );
        }
        return null;
      },
    );
  }
}

/// Página contenedora de la gestión de usuarios (acceso rápido desde Inicio).
class _PaginaUsuarios extends StatelessWidget {
  const _PaginaUsuarios();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Usuarios')),
      body: const UsersScreen(),
    );
  }
}

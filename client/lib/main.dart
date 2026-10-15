/// Punto de entrada de la aplicación de escritorio de Motorix.
///
/// Registra los providers, el tema propio del sistema de diseño y las rutas
/// del Sprint 1. La URL de la API puede definirse en compilación con
/// `flutter run --dart-define=API_BASE_URL=http://localhost:3000/api`.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'config/theme.dart';
import 'providers/appointments_provider.dart';
import 'providers/auth_provider.dart';
import 'providers/clients_provider.dart';
import 'providers/dashboard_provider.dart';
import 'providers/history_provider.dart';
import 'providers/maintenances_provider.dart';
import 'providers/orders_provider.dart';
import 'providers/parts_provider.dart';
import 'providers/payments_provider.dart';
import 'providers/ticket_provider.dart';
import 'providers/users_provider.dart';
import 'providers/vehicles_provider.dart';
import 'screens/client_form_screen.dart';
import 'screens/appointment_form_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/login_screen.dart';
import 'screens/maintenance_form_screen.dart';
import 'screens/order_form_screen.dart';
import 'screens/part_form_screen.dart';
import 'screens/users_screen.dart';
import 'screens/vehicle_form_screen.dart';
import 'services/api_client.dart';
import 'widgets/app_shell.dart';

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
      home: const LoginScreen(),
      routes: {
        // La ruta /login se usa al cerrar sesión o expirar el token.
        '/login': (_) => const LoginScreen(),
        '/inicio': (_) => const AppShell(),
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

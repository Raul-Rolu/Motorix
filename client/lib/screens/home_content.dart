/// Pantalla de inicio con acceso rápido (T030, US1; FR-016).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../providers/auth_provider.dart';

class HomeContent extends StatelessWidget {
  const HomeContent({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final puedeClientes = auth.puedeGestionarClientes;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(MotorixEspaciados.l),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Hola, ${auth.usuario?.fullName ?? ''}',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: MotorixEspaciados.xs),
          Text(
            'Bienvenido a Motorix. Use el menú lateral o los accesos rápidos '
            'para trabajar con los registros del taller.',
            style: TextStyle(color: MotorixColores.textoSecundario),
          ),
          const SizedBox(height: MotorixEspaciados.l),
          Wrap(
            spacing: MotorixEspaciados.m,
            runSpacing: MotorixEspaciados.m,
            children: [
              if (puedeClientes)
                _AccesoRapido(
                  titulo: 'Registrar cliente',
                  icono: Icons.person_add_alt,
                  onTap: () => Navigator.of(context).pushNamed('/clientes/nuevo'),
                ),
              if (puedeClientes)
                _AccesoRapido(
                  titulo: 'Registrar vehículo',
                  icono: Icons.directions_car_outlined,
                  onTap: () => Navigator.of(context).pushNamed('/vehiculos/nuevo'),
                ),
              if (auth.esAdmin)
                _AccesoRapido(
                  titulo: 'Gestionar usuarios',
                  icono: Icons.manage_accounts_outlined,
                  onTap: () => Navigator.of(context).pushNamed('/usuarios'),
                ),
              // Panel de control: visible únicamente para ADMIN (FR-016, US4).
              if (auth.esAdmin)
                _AccesoRapido(
                  titulo: 'Panel de control',
                  icono: Icons.dashboard_outlined,
                  onTap: () => Navigator.of(context).pushNamed('/panel'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AccesoRapido extends StatelessWidget {
  final String titulo;
  final IconData icono;
  final VoidCallback onTap;

  const _AccesoRapido({
    required this.titulo,
    required this.icono,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 220,
      child: Card(
        child: ListTile(
          leading: Icon(icono, color: MotorixColores.acento),
          title: Text(titulo),
          onTap: onTap,
        ),
      ),
    );
  }
}

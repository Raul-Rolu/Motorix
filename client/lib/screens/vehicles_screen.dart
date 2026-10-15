/// Lista de vehículos del taller (T061, US5).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../providers/vehicles_provider.dart';
import 'vehicle_form_screen.dart';
import 'vehicle_history_screen.dart';

class VehiclesScreen extends StatefulWidget {
  const VehiclesScreen({super.key});

  @override
  State<VehiclesScreen> createState() => _VehiclesScreenState();
}

class _VehiclesScreenState extends State<VehiclesScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<VehiclesProvider>().recargar();
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<VehiclesProvider>();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          child: Row(
            children: [
              Text('Vehículos', style: Theme.of(context).textTheme.titleLarge),
              const Spacer(),
              ElevatedButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Nuevo vehículo'),
                onPressed: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const VehicleFormScreen()),
                  );
                  if (context.mounted) {
                    context.read<VehiclesProvider>().recargar();
                  }
                },
              ),
            ],
          ),
        ),
        if (provider.error != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: MotorixEspaciados.m),
            child: Text(provider.error!,
                style: const TextStyle(color: MotorixColores.error)),
          ),
        Expanded(
          child: provider.cargando && provider.vehiculos.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : provider.vehiculos.isEmpty
                  ? const Center(child: Text('Sin vehículos registrados.'))
                  : ListView.separated(
                      itemCount: provider.vehiculos.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, indice) {
                        final vehiculo = provider.vehiculos[indice];
                        return ListTile(
                          leading: const Icon(Icons.directions_car_outlined,
                              color: MotorixColores.acento),
                          title: Text(
                              '${vehiculo.brand} ${vehiculo.model} (${vehiculo.year})'),
                          subtitle: Text(
                              'Placas: ${vehiculo.plates} · Propietario: ${vehiculo.duenio?.fullName ?? '—'}'),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                tooltip: 'Historial de servicios',
                                icon: const Icon(Icons.history_outlined,
                                    color: MotorixColores.acento),
                                onPressed: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        VehicleHistoryScreen(vehiculo: vehiculo),
                                  ),
                                ),
                              ),
                              IconButton(
                                tooltip: 'Editar y reasociar',
                                icon: const Icon(Icons.edit_outlined),
                                onPressed: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        VehicleFormScreen(vehiculo: vehiculo),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
        ),
      ],
    );
  }
}


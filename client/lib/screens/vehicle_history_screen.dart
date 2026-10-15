/// Historial de servicios de un vehículo (Sprint 3, US1/US2, FR-001 a FR-003).
///
/// Muestra las órdenes terminadas/entregadas en orden cronológico con fecha,
/// kilometraje registrado (RN-3), motivo y resumen del trabajo; la marca de
/// corrección de kilometraje deja constancia visible (RN-4).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/vehicle.dart';
import '../models/vehicle_history.dart';
import '../providers/history_provider.dart';

class VehicleHistoryScreen extends StatefulWidget {
  final Vehiculo vehiculo;

  const VehicleHistoryScreen({super.key, required this.vehiculo});

  @override
  State<VehicleHistoryScreen> createState() => _VehicleHistoryScreenState();
}

class _VehicleHistoryScreenState extends State<VehicleHistoryScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<HistoryProvider>().cargar(widget.vehiculo.id!);
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<HistoryProvider>();
    final historial = provider.historial;

    return Scaffold(
      appBar: AppBar(title: const Text('Historial de servicios')),
      body: provider.cargando && historial == null
          ? const Center(child: CircularProgressIndicator())
          : provider.error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(MotorixEspaciados.m),
                    child: Text(
                      provider.error!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: MotorixColores.error),
                    ),
                  ),
                )
              : historial == null || historial.historial.isEmpty
                  ? const Center(
                      child: Padding(
                        padding: EdgeInsets.all(MotorixEspaciados.l),
                        child: Text(
                          'Este vehículo aún no tiene servicios registrados.',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    )
                  : ListView(
                      padding: const EdgeInsets.all(MotorixEspaciados.m),
                      children: [
                        _TarjetaVehiculo(vehiculo: historial.vehiculo),
                        const SizedBox(height: MotorixEspaciados.m),
                        for (final servicio in historial.historial) ...[
                          _TarjetaServicio(servicio: servicio),
                          const SizedBox(height: MotorixEspaciados.s),
                        ],
                      ],
                    ),
    );
  }
}

/// Encabezado con los datos del vehículo y su kilometraje actual (RN-11).
class _TarjetaVehiculo extends StatelessWidget {
  final VehiculoHistorial vehiculo;

  const _TarjetaVehiculo({required this.vehiculo});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(MotorixEspaciados.m),
        child: Row(
          children: [
            const Icon(Icons.directions_car_outlined,
                color: MotorixColores.acento),
            const SizedBox(width: MotorixEspaciados.s),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.anio})',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  Text(
                    'Placas: ${vehiculo.placas}',
                    style: const TextStyle(color: MotorixColores.textoSecundario),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                const Text('Kilometraje actual',
                    style: TextStyle(color: MotorixColores.textoSecundario)),
                Text(
                  '${vehiculo.kilometrajeActual} km',
                  style: Theme.of(context)
                      .textTheme
                      .titleMedium
                      ?.copyWith(color: MotorixColores.acento),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Un servicio del historial: fecha, kilometraje, motivo y resumen.
class _TarjetaServicio extends StatelessWidget {
  final ServicioHistorial servicio;

  const _TarjetaServicio({required this.servicio});

  String get _fechaCorta =>
      servicio.fecha.length >= 10 ? servicio.fecha.substring(0, 10) : servicio.fecha;

  @override
  Widget build(BuildContext context) {
    final detalles = <String>[
      if (servicio.mecanico != null) 'Mecánico: ${servicio.mecanico!.nombreCompleto}',
      if (servicio.notas != null && servicio.notas!.isNotEmpty)
        servicio.notas!,
      if (servicio.ultimaEntrada != null &&
          servicio.ultimaEntrada!.isNotEmpty &&
          servicio.ultimaEntrada != servicio.notas)
        'Última entrada: ${servicio.ultimaEntrada}',
      'Servicios: ${servicio.resumen.servicios} · Mano de obra: ${servicio.resumen.manoObra} · Refacciones: ${servicio.resumen.refacciones}',
      'Total: \$${servicio.resumen.total.toStringAsFixed(2)}',
      if (servicio.refacciones.isNotEmpty)
        'Refacciones: ${servicio.refacciones.map((r) => '${r.nombre} x${r.cantidad}').join(', ')}',
    ];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(MotorixEspaciados.m),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(_fechaCorta, style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(width: MotorixEspaciados.s),
                const Icon(Icons.speed_outlined,
                    size: 16, color: MotorixColores.textoSecundario),
                Text('${servicio.kilometraje} km',
                    style: const TextStyle(color: MotorixColores.textoSecundario)),
                const Spacer(),
                if (servicio.correccionKilometraje)
                  const Tooltip(
                    message: 'Kilometraje registrado con corrección explícita',
                    child: Icon(Icons.edit_note,
                        size: 18, color: MotorixColores.advertencia),
                  ),
              ],
            ),
            const SizedBox(height: MotorixEspaciados.xs),
            Text(servicio.motivo,
                style: Theme.of(context)
                    .textTheme
                    .titleMedium
                    ?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: MotorixEspaciados.xs),
            for (final detalle in detalles)
              Padding(
                padding: const EdgeInsets.only(bottom: MotorixEspaciados.xs),
                child: Text(
                  detalle,
                  style: const TextStyle(color: MotorixColores.textoSecundario),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

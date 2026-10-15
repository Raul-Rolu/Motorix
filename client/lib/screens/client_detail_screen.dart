/// Ficha del cliente con sus vehículos (T066, US6; FR-007).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../providers/clients_provider.dart';
import '../models/client.dart';

class ClientDetailScreen extends StatefulWidget {
  final int clienteId;
  const ClientDetailScreen({super.key, required this.clienteId});

  @override
  State<ClientDetailScreen> createState() => _ClientDetailScreenState();
}

class _ClientDetailScreenState extends State<ClientDetailScreen> {
  Cliente? _cliente;
  bool _cargando = true;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    final cliente =
        await context.read<ClientsProvider>().obtenerDetalle(widget.clienteId);
    if (!mounted) return;
    setState(() {
      _cliente = cliente;
      _cargando = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_cliente?.fullName ?? 'Ficha del cliente')),
      body: _cargando
          ? const Center(child: CircularProgressIndicator())
          : _cliente == null
              ? const Center(child: Text('No se pudo cargar el cliente.'))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(MotorixEspaciados.l),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(MotorixEspaciados.m),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Datos del cliente',
                                  style:
                                      Theme.of(context).textTheme.titleMedium),
                              const SizedBox(height: MotorixEspaciados.s),
                              Text('Nombre: ${_cliente!.fullName}'),
                              Text('Teléfono: ${_cliente!.phone}'),
                              Text(
                                  'Correo: ${(_cliente!.email == null || _cliente!.email!.isEmpty) ? '(sin correo)' : _cliente!.email}'),
                              Text(
                                  'Estado: ${_cliente!.active ? 'Activo' : 'Inactivo'}'),
                              if ((_cliente!.notes ?? '').isNotEmpty)
                                  Text('Notas: ${_cliente!.notes}'),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: MotorixEspaciados.m),
                      Text('Vehículos asociados',
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: MotorixEspaciados.s),
                      if (_cliente!.vehiculos.isEmpty)
                        const Text('Este cliente aún no tiene vehículos registrados.')
                      else
                        Card(
                          child: Column(
                            children: [
                              for (final vehiculo in _cliente!.vehiculos)
                                ListTile(
                                  leading: const Icon(
                                      Icons.directions_car_outlined,
                                      color: MotorixColores.acento),
                                  title: Text(
                                      '${vehiculo.brand} ${vehiculo.model} (${vehiculo.year})'),
                                  subtitle: Text('Placas: ${vehiculo.plates}'),
                                ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
    );
  }
}

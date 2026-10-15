/// Lista y búsqueda de clientes (T048, US3).
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../providers/clients_provider.dart';
import 'client_detail_screen.dart';
import 'client_edit_screen.dart';
import 'client_form_screen.dart';

class ClientsScreen extends StatefulWidget {
  const ClientsScreen({super.key});

  @override
  State<ClientsScreen> createState() => _ClientsScreenState();
}

class _ClientsScreenState extends State<ClientsScreen> {
  String _busqueda = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ClientsProvider>().recargar();
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ClientsProvider>();
    // Búsqueda por nombre o dato de contacto (escenario 3 de la US3).
    final clientes = provider.clientes.where((cliente) {
      if (_busqueda.isEmpty) return true;
      final texto = _busqueda.toLowerCase();
      return cliente.fullName.toLowerCase().contains(texto) ||
          cliente.phone.contains(texto) ||
          (cliente.email ?? '').toLowerCase().contains(texto);
    }).toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          child: Row(
            children: [
              Text('Clientes', style: Theme.of(context).textTheme.titleLarge),
              const Spacer(),
              SizedBox(
                width: 280,
                child: TextField(
                  key: const Key('buscarClientes'),
                  decoration: const InputDecoration(
                    hintText: 'Buscar por nombre, teléfono o correo',
                    prefixIcon: Icon(Icons.search),
                  ),
                  onChanged: (valor) => setState(() => _busqueda = valor),
                ),
              ),
              const SizedBox(width: MotorixEspaciados.m),
              ElevatedButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Nuevo cliente'),
                onPressed: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const ClientFormScreen()),
                  );
                  if (context.mounted) {
                    context.read<ClientsProvider>().recargar();
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
          child: provider.cargando && provider.clientes.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : clientes.isEmpty
                  ? const Center(
                      key: Key('sinCoincidencias'),
                      child: Text('Sin coincidencias.'),
                    )
                  : ListView.separated(
                      itemCount: clientes.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, indice) {
                        final cliente = clientes[indice];
                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor: MotorixColores.exitoSuave,
                            child: const Icon(Icons.person,
                                color: MotorixColores.exito),
                          ),
                          title: Text(cliente.fullName),
                          subtitle: Text(cliente.email == null || cliente.email!.isEmpty
                              ? cliente.phone
                              : '${cliente.phone} · ${cliente.email}'),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                tooltip: 'Ver ficha',
                                icon: const Icon(Icons.visibility_outlined),
                                onPressed: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => ClientDetailScreen(
                                        clienteId: cliente.id!),
                                  ),
                                ),
                              ),
                              IconButton(
                                tooltip: 'Editar',
                                icon: const Icon(Icons.edit_outlined),
                                onPressed: () => Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) =>
                                        ClientEditScreen(cliente: cliente),
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


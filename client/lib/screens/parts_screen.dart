/// Inventario de refacciones (Sprint 3, US6/US8; FR-009, FR-015).
///
/// Listado con nombre, código, stock, mínimo y estado activo; búsqueda por
/// nombre o código. Las refacciones con stock por debajo del mínimo aparecen
/// destacadas en rojo (US8, CA-7) para evitar cálculos manuales.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/part.dart';
import '../providers/parts_provider.dart';
import 'part_form_screen.dart';

class PartsScreen extends StatefulWidget {
  const PartsScreen({super.key});

  @override
  State<PartsScreen> createState() => _PartsScreenState();
}

class _PartsScreenState extends State<PartsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<PartsProvider>().recargar();
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<PartsProvider>();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          child: Row(
            children: [
              Text('Inventario', style: Theme.of(context).textTheme.titleLarge),
              const Spacer(),
              ElevatedButton.icon(
                icon: const Icon(Icons.add),
                label: const Text('Nueva refacción'),
                onPressed: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const PartFormScreen()),
                  );
                  if (context.mounted) {
                    context.read<PartsProvider>().recargar();
                  }
                },
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: MotorixEspaciados.m),
          child: TextField(
            decoration: const InputDecoration(
              labelText: 'Buscar por nombre o código',
              prefixIcon: Icon(Icons.search),
            ),
            onSubmitted: (valor) {
              provider.textoFiltro = valor.trim();
              provider.recargar();
            },
            onChanged: (valor) {
              if (valor.isEmpty) {
                provider.textoFiltro = '';
                provider.recargar();
              }
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: MotorixEspaciados.m),
          child: Align(
            alignment: Alignment.centerLeft,
            child: FilterChip(
              label: const Text('Solo sin precio de venta'),
              avatar: Icon(
                Icons.sell_outlined,
                size: 18,
                color: provider.soloPendientesPrecio
                    ? MotorixColores.superficie
                    : MotorixColores.advertencia,
              ),
              selected: provider.soloPendientesPrecio,
              selectedColor: MotorixColores.advertencia,
              onSelected: (valor) {
                provider.soloPendientesPrecio = valor;
                provider.recargar();
              },
            ),
          ),
        ),
        const SizedBox(height: MotorixEspaciados.s),
        if (provider.error != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: MotorixEspaciados.m),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                provider.error!,
                style: const TextStyle(color: MotorixColores.error),
              ),
            ),
          ),
        Expanded(
          child: provider.cargando && provider.partes.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : provider.partes.isEmpty
                  ? const Center(
                      child: Padding(
                        padding: EdgeInsets.all(MotorixEspaciados.l),
                        child: Text(
                          'No hay refacciones en el inventario.\n'
                          'Registre la primera para comenzar.',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: provider.recargar,
                      child: ListView.builder(
                        padding: const EdgeInsets.symmetric(
                            horizontal: MotorixEspaciados.m),
                        itemCount: provider.partes.length,
                        itemBuilder: (context, indice) =>
                            _TarjetaParte(parte: provider.partes[indice]),
                      ),
                    ),
        ),
      ],
    );
  }
}

/// Tarjeta de una refacción; el stock bajo se destaca en rojo (US8, FR-015).
class _TarjetaParte extends StatelessWidget {
  final Part parte;

  const _TarjetaParte({required this.parte});

  @override
  Widget build(BuildContext context) {
    final colorStock =
        parte.lowStock ? MotorixColores.error : MotorixColores.exito;

    return Card(
      margin: const EdgeInsets.only(bottom: MotorixEspaciados.s),
      child: ListTile(
        leading: Icon(
          parte.lowStock ? Icons.warning_amber_rounded : Icons.inventory_2_outlined,
          color: colorStock,
        ),
        title: Text(parte.name),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Código: ${parte.code}'
              '${parte.isActive ? '' : ' · Inactiva'}',
              style: TextStyle(
                color: parte.isActive
                    ? MotorixColores.textoSecundario
                    : MotorixColores.error,
              ),
            ),
            // Precio de venta (005, FR-001): sin precio se marca en ámbar.
            Text(
              parte.salePrice == null
                  ? 'Sin precio de venta'
                  : 'Precio: \$${parte.salePrice!.toStringAsFixed(2)}',
              style: TextStyle(
                color: parte.salePrice == null
                    ? MotorixColores.advertencia
                    : MotorixColores.textoSecundario,
                fontWeight: parte.salePrice == null
                    ? FontWeight.w700
                    : FontWeight.w400,
              ),
            ),
          ],
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '${parte.stock} pz',
              style: TextStyle(
                color: colorStock,
                fontWeight: FontWeight.w700,
                fontSize: 16,
              ),
            ),
            Text(
              parte.lowStock ? 'Stock bajo (mín ${parte.minStock})' : 'Mín ${parte.minStock}',
              style: TextStyle(
                color: colorStock,
                fontSize: 12,
              ),
            ),
          ],
        ),
        onTap: () async {
          await Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => PartFormScreen(parte: parte)),
          );
          if (context.mounted) {
            context.read<PartsProvider>().recargar();
          }
        },
      ),
    );
  }
}

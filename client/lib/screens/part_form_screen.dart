/// Alta, edición y entrada de stock de refacciones (Sprint 3, US5; FR-008/FR-013/FR-014).
///
/// Sin argumentos: alta con nombre, código, stock inicial y mínimo.
/// Con una `parte`: edición de metadatos (el stock NO es editable, solo
/// cambia con movimientos, FR-013) más el registro de entradas IN con
/// motivo obligatorio.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/part.dart';
import '../providers/parts_provider.dart';

class PartFormScreen extends StatefulWidget {
  /// Refacción existente para edición; null = alta nueva.
  final Part? parte;

  const PartFormScreen({super.key, this.parte});

  @override
  State<PartFormScreen> createState() => _PartFormScreenState();
}

class _PartFormScreenState extends State<PartFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nombreController = TextEditingController();
  final _codigoController = TextEditingController();
  final _stockController = TextEditingController();
  final _minimoController = TextEditingController();
  final _precioController = TextEditingController();
  final _entradaCantidadController = TextEditingController();
  final _entradaMotivoController = TextEditingController();

  bool _activo = true;
  bool _guardando = false;

  bool get _esAlta => widget.parte == null;

  @override
  void initState() {
    super.initState();
    final parte = widget.parte;
    if (parte != null) {
      _nombreController.text = parte.name;
      _codigoController.text = parte.code;
      _minimoController.text = '${parte.minStock}';
      if (parte.salePrice != null) {
        _precioController.text = parte.salePrice!.toStringAsFixed(2);
      }
      _activo = parte.isActive;
    }
  }

  @override
  void dispose() {
    _nombreController.dispose();
    _codigoController.dispose();
    _stockController.dispose();
    _minimoController.dispose();
    _precioController.dispose();
    _entradaCantidadController.dispose();
    _entradaMotivoController.dispose();
    super.dispose();
  }

  Future<void> _guardar() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _guardando = true);

    final provider = context.read<PartsProvider>();
    // Vacío = sin precio (pendiente, 005 FR-001).
    final precioVenta = double.tryParse(_precioController.text.trim());
    final Part? guardada;
    if (_esAlta) {
      guardada = await provider.crear(
        name: _nombreController.text.trim(),
        code: _codigoController.text.trim(),
        stock: int.tryParse(_stockController.text.trim()) ?? 0,
        minStock: int.tryParse(_minimoController.text.trim()) ?? 0,
        salePrice: precioVenta,
      );
    } else {
      guardada = await provider.editar(
        id: widget.parte!.id!,
        name: _nombreController.text.trim(),
        code: _codigoController.text.trim(),
        minStock: int.tryParse(_minimoController.text.trim()) ?? 0,
        salePrice: precioVenta,
        isActive: _activo,
      );
    }

    if (!mounted) return;
    setState(() => _guardando = false);
    if (guardada != null) {
      Navigator.of(context).pop();
    } else {
      _mostrarError(provider.error ?? 'No se pudo guardar la refacción.');
    }
  }

  Future<void> _registrarEntrada() async {
    final cantidad = int.tryParse(_entradaCantidadController.text.trim());
    final motivo = _entradaMotivoController.text.trim();
    if (cantidad == null || cantidad <= 0 || motivo.isEmpty) {
      _mostrarError(
          'Indique una cantidad positiva y el motivo de la entrada (obligatorio).');
      return;
    }

    setState(() => _guardando = true);
    final provider = context.read<PartsProvider>();
    final stockResult =
        await provider.registrarEntrada(widget.parte!.id!, cantidad, motivo);
    if (!mounted) return;
    setState(() => _guardando = false);

    if (stockResult != null) {
      _entradaCantidadController.clear();
      _entradaMotivoController.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Entrada registrada. Stock resultante: $stockResult.'),
          backgroundColor: MotorixColores.exito,
        ),
      );
    } else {
      _mostrarError(provider.error ?? 'No se pudo registrar la entrada.');
    }
  }

  void _mostrarError(String mensaje) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(mensaje), backgroundColor: MotorixColores.error),
    );
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<PartsProvider>();

    return Scaffold(
      appBar: AppBar(
        title: Text(_esAlta ? 'Nueva refacción' : 'Editar refacción'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(MotorixEspaciados.m),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextFormField(
                    controller: _nombreController,
                    maxLength: 100,
                    decoration: const InputDecoration(labelText: 'Nombre *'),
                    validator: (valor) => (valor == null || valor.trim().isEmpty)
                        ? 'El nombre es obligatorio.'
                        : null,
                  ),
                  const SizedBox(height: MotorixEspaciados.m),
                  TextFormField(
                    controller: _codigoController,
                    maxLength: 50,
                    decoration: const InputDecoration(
                      labelText: 'Código *',
                      hintText: 'Código único de inventario',
                    ),
                    validator: (valor) => (valor == null || valor.trim().isEmpty)
                        ? 'El código es obligatorio.'
                        : null,
                  ),
                  const SizedBox(height: MotorixEspaciados.m),
                  TextFormField(
                    controller: _precioController,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(
                      labelText: 'Precio de venta',
                      hintText: 'Vacío = sin precio (pendiente)',
                      prefixText: '\$ ',
                    ),
                    validator: (valor) {
                      final texto = valor?.trim() ?? '';
                      if (texto.isEmpty) return null;
                      final numero = double.tryParse(texto);
                      if (numero == null || numero < 0) {
                        return 'Ingrese un precio mayor o igual a cero.';
                      }
                      final dosDecimales = (numero * 100)
                              .roundToDouble()
                              .compareTo(numero * 100) ==
                          0;
                      if (!dosDecimales) {
                        return 'Máximo 2 decimales.';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: MotorixEspaciados.m),
                  if (_esAlta)
                    TextFormField(
                      controller: _stockController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Stock inicial',
                        hintText: '0 (también puede agregarlo después)',
                      ),
                      validator: (valor) {
                        final texto = valor?.trim() ?? '';
                        if (texto.isEmpty) return null;
                        final numero = int.tryParse(texto);
                        if (numero == null || numero < 0) {
                          return 'Ingrese un número entero mayor o igual a cero.';
                        }
                        return null;
                      },
                    ),
                  if (_esAlta) const SizedBox(height: MotorixEspaciados.m),
                  TextFormField(
                    controller: _minimoController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Stock mínimo',
                      hintText: 'Alerta cuando el stock sea menor o igual',
                    ),
                    validator: (valor) {
                      final texto = valor?.trim() ?? '';
                      if (texto.isEmpty) return null;
                      final numero = int.tryParse(texto);
                      if (numero == null || numero < 0) {
                        return 'Ingrese un número entero mayor o igual a cero.';
                      }
                      return null;
                    },
                  ),
                  if (!_esAlta) ...[
                    const SizedBox(height: MotorixEspaciados.s),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Refacción activa'),
                      subtitle: const Text(
                          'Las inactivas no pueden agregarse a órdenes (FR-010).'),
                      value: _activo,
                      onChanged: (valor) => setState(() => _activo = valor),
                    ),
                  ],
                ],
              ),
            ),
            if (provider.error != null)
              Padding(
                padding: const EdgeInsets.only(top: MotorixEspaciados.s),
                child: Text(
                  provider.error!,
                  style: const TextStyle(color: MotorixColores.error),
                ),
              ),
            const SizedBox(height: MotorixEspaciados.l),
            ElevatedButton.icon(
              icon: _guardando
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(_esAlta ? 'Guardar refacción' : 'Guardar cambios'),
              onPressed: _guardando ? null : _guardar,
            ),
            if (!_esAlta) ...[
              const SizedBox(height: MotorixEspaciados.xl),
              Text('Registrar entrada de stock',
                  style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: MotorixEspaciados.s),
              Text(
                'Stock actual: ${widget.parte!.stock} · Mínimo: ${widget.parte!.minStock}'
                '${widget.parte!.lowStock ? ' (stock bajo)' : ''}',
                style: TextStyle(
                  color: widget.parte!.lowStock
                      ? MotorixColores.error
                      : MotorixColores.textoSecundario,
                ),
              ),
              const SizedBox(height: MotorixEspaciados.s),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _entradaCantidadController,
                      keyboardType: TextInputType.number,
                      decoration:
                          const InputDecoration(labelText: 'Cantidad a ingresar'),
                    ),
                  ),
                  const SizedBox(width: MotorixEspaciados.s),
                  Expanded(
                    flex: 2,
                    child: TextFormField(
                      controller: _entradaMotivoController,
                      maxLength: 255,
                      decoration: const InputDecoration(
                        labelText: 'Motivo *',
                        hintText: 'P. ej. Compra al proveedor',
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: MotorixEspaciados.s),
              OutlinedButton.icon(
                icon: const Icon(Icons.add_box_outlined),
                label: const Text('Registrar entrada (IN)'),
                onPressed: _guardando ? null : _registrarEntrada,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

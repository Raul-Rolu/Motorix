/// Diálogo «Agregar servicio» de una orden (008-configuracion-seguridad-reportes,
/// T040; FR-007, CA-4).
///
/// Captura la descripción y el importe de una línea de servicio y, de forma
/// opcional, su tipo del catálogo (solo tipos activos; «Sin tipo» por omisión).
/// El tipo permite proponer después el próximo mantenimiento (RN-12). Devuelve un
/// [ServicioNuevo] o null si se cancela; el alta la hace quien lo abre.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../providers/service_types_provider.dart';

/// Datos capturados de una línea de servicio nueva.
class ServicioNuevo {
  final String descripcion;
  final double importe;

  /// Tipo del catálogo elegido; null si la línea no lleva tipo.
  final int? serviceTypeId;

  const ServicioNuevo({
    required this.descripcion,
    required this.importe,
    this.serviceTypeId,
  });
}

class DialogoAgregarServicio extends StatefulWidget {
  const DialogoAgregarServicio({super.key});

  @override
  State<DialogoAgregarServicio> createState() => _DialogoAgregarServicioState();
}

class _DialogoAgregarServicioState extends State<DialogoAgregarServicio> {
  final _formKey = GlobalKey<FormState>();
  final _descripcion = TextEditingController();
  final _importe = TextEditingController();
  int? _tipoId;

  static final RegExp _formatoImporte = RegExp(r'^[0-9]+(\.[0-9]{1,2})?$');

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final tipos = context.read<ServiceTypesProvider>();
      if (!tipos.cargado) tipos.cargar();
    });
  }

  @override
  void dispose() {
    _descripcion.dispose();
    _importe.dispose();
    super.dispose();
  }

  void _agregar() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    Navigator.of(context).pop(
      ServicioNuevo(
        descripcion: _descripcion.text.trim(),
        importe: double.parse(_importe.text.trim()),
        serviceTypeId: _tipoId,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final activos = context.watch<ServiceTypesProvider>().activos;
    return AlertDialog(
      title: const Text('Agregar servicio'),
      content: SizedBox(
        width: 420,
        child: Form(
          key: _formKey,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  key: const Key('campoDescripcionServicio'),
                  controller: _descripcion,
                  maxLength: 255,
                  decoration: const InputDecoration(labelText: 'Descripción del servicio'),
                  validator: (valor) => (valor ?? '').trim().isEmpty
                      ? 'La descripción del servicio es obligatoria.'
                      : null,
                ),
                TextFormField(
                  key: const Key('campoImporteServicio'),
                  controller: _importe,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: 'Importe (\$)'),
                  validator: (valor) {
                    final texto = (valor ?? '').trim();
                    if (!_formatoImporte.hasMatch(texto) || double.parse(texto) > 999999.99) {
                      return 'Ingrese un importe de 0 o más, con hasta 2 decimales.';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: MotorixEspaciados.s),
                DropdownButtonFormField<int?>(
                  key: const Key('selectorTipoServicio'),
                  initialValue: _tipoId,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Tipo de servicio (opcional)',
                    helperText: 'Con tipo se puede proponer el próximo mantenimiento.',
                  ),
                  items: [
                    const DropdownMenuItem<int?>(value: null, child: Text('Sin tipo')),
                    for (final tipo in activos)
                      DropdownMenuItem<int?>(value: tipo.id, child: Text(tipo.nombre)),
                  ],
                  onChanged: (valor) => setState(() => _tipoId = valor),
                ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          key: const Key('botonAgregarServicio'),
          onPressed: _agregar,
          child: const Text('Agregar'),
        ),
      ],
    );
  }
}

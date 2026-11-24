/// Reportes (008-configuracion-seguridad-reportes, T118; FR-023, CA-6).
///
/// Solo para ADMIN (la autorización real es del servidor, RN-15). Es de solo
/// lectura. Pestañas con UN filtro de rango compartido («Mes actual» por
/// omisión, «Mes anterior» o «Rango libre» validado en la interfaz) y los estados
/// de carga, vacío, error y sin permiso de docs/design-system.md 8.4 y 8.10.
/// Lista densa con divisores (sin tarjetas, 8.6). Los importes salen de centavos
/// enteros.
library;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/theme.dart';
import '../models/report.dart';
import '../providers/reports_provider.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  final _formKey = GlobalKey<FormState>();
  final _desde = TextEditingController();
  final _hasta = TextEditingController();

  /// true mientras «Rango libre» es el filtro elegido (aunque aún no se consulte).
  bool _libre = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<ReportsProvider>().cargarIngresos();
    });
  }

  @override
  void dispose() {
    _desde.dispose();
    _hasta.dispose();
    super.dispose();
  }

  void _elegirMesActual() {
    setState(() => _libre = false);
    context.read<ReportsProvider>().seleccionarMesActual();
  }

  void _elegirMesAnterior() {
    setState(() => _libre = false);
    context.read<ReportsProvider>().seleccionarMesAnterior();
  }

  void _consultarRango() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    context.read<ReportsProvider>().aplicarRango(_desde.text, _hasta.text);
  }

  @override
  Widget build(BuildContext context) {
    final proveedor = context.watch<ReportsProvider>();
    return DefaultTabController(
      length: 1,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(
                MotorixEspaciados.m, MotorixEspaciados.m, MotorixEspaciados.s, 0),
            child: Row(
              children: [
                Expanded(child: Text('Reportes', style: Theme.of(context).textTheme.titleLarge)),
                IconButton(
                  key: const Key('botonRefrescarReportes'),
                  tooltip: 'Actualizar',
                  icon: const Icon(Icons.refresh),
                  onPressed: proveedor.cargandoIngresos || proveedor.sinPermiso
                      ? null
                      : () => proveedor.cargarIngresos(),
                ),
              ],
            ),
          ),
          if (!proveedor.sinPermiso) ...[
            const Align(
              alignment: Alignment.centerLeft,
              child: TabBar(
                isScrollable: true,
                tabAlignment: TabAlignment.start,
                tabs: [Tab(key: Key('pestanaIngresos'), text: 'Ingresos')],
              ),
            ),
            _filtro(proveedor),
          ],
          const Divider(height: 1),
          Expanded(
            child: TabBarView(
              children: [_Ingresos(proveedor: proveedor)],
            ),
          ),
        ],
      ),
    );
  }

  Widget _filtro(ReportsProvider proveedor) {
    final mesActual = !_libre && proveedor.filtro == FiltroRango.mesActual;
    final mesAnterior = !_libre && proveedor.filtro == FiltroRango.mesAnterior;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
          MotorixEspaciados.m, MotorixEspaciados.m, MotorixEspaciados.m, MotorixEspaciados.s),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: MotorixEspaciados.s,
            children: [
              ChoiceChip(
                key: const Key('filtroMesActual'),
                label: const Text('Mes actual'),
                selected: mesActual,
                onSelected: (_) => _elegirMesActual(),
              ),
              ChoiceChip(
                key: const Key('filtroMesAnterior'),
                label: const Text('Mes anterior'),
                selected: mesAnterior,
                onSelected: (_) => _elegirMesAnterior(),
              ),
              ChoiceChip(
                key: const Key('filtroRangoLibre'),
                label: const Text('Rango libre'),
                selected: _libre,
                onSelected: (_) => setState(() => _libre = true),
              ),
            ],
          ),
          if (_libre) ...[
            const SizedBox(height: MotorixEspaciados.s),
            Form(
              key: _formKey,
              child: Wrap(
                spacing: MotorixEspaciados.m,
                runSpacing: MotorixEspaciados.s,
                crossAxisAlignment: WrapCrossAlignment.start,
                children: [
                  SizedBox(
                    width: 150,
                    child: TextFormField(
                      key: const Key('campoReporteDesde'),
                      controller: _desde,
                      decoration: const InputDecoration(labelText: 'Desde', hintText: 'AAAA-MM-DD'),
                      validator: ReportsProvider.validarFecha,
                    ),
                  ),
                  SizedBox(
                    width: 150,
                    child: TextFormField(
                      key: const Key('campoReporteHasta'),
                      controller: _hasta,
                      decoration: const InputDecoration(labelText: 'Hasta', hintText: 'AAAA-MM-DD'),
                      validator: (valor) => ReportsProvider.validarHasta(valor, _desde.text),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: MotorixEspaciados.s),
                    child: FilledButton(
                      key: const Key('botonConsultarRango'),
                      onPressed: _consultarRango,
                      child: const Text('Consultar'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Pestaña «Ingresos»: total cobrado, ingresos por día o mes y por método.
class _Ingresos extends StatelessWidget {
  final ReportsProvider proveedor;

  const _Ingresos({required this.proveedor});

  @override
  Widget build(BuildContext context) {
    if (proveedor.errorIngresos != null) {
      final sinPermiso = proveedor.sinPermiso;
      return Center(
        key: Key(sinPermiso ? 'reporteSinPermiso' : 'reporteError'),
        child: Padding(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                proveedor.errorIngresos!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: MotorixColores.error),
              ),
              if (!sinPermiso) ...[
                const SizedBox(height: MotorixEspaciados.s),
                OutlinedButton(
                  key: const Key('botonReintentarReporte'),
                  onPressed: () => proveedor.cargarIngresos(),
                  child: const Text('Reintentar'),
                ),
              ],
            ],
          ),
        ),
      );
    }
    final reporte = proveedor.ingresos;
    if (reporte == null) {
      return const Center(
        child: SizedBox(
          key: Key('reporteCargando'),
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }
    return SingleChildScrollView(
      padding: const EdgeInsets.all(MotorixEspaciados.m),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(reporte.rangoTexto, style: const TextStyle(color: MotorixColores.textoSecundario)),
          const SizedBox(height: MotorixEspaciados.m),
          if (reporte.vacio)
            const Text(
              'No hay cobros en este rango.',
              key: Key('ingresosVacio'),
              style: TextStyle(color: MotorixColores.textoSecundario),
            )
          else ...[
            Text('Total cobrado', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: MotorixEspaciados.xs),
            Text(
              formatearCentavos(reporte.totalCentavos),
              key: const Key('totalIngresos'),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: MotorixEspaciados.l),
            Text(
              reporte.agrupacion == 'MES' ? 'Ingresos por mes' : 'Ingresos por día',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: MotorixEspaciados.s),
            const Divider(height: 1),
            for (var i = 0; i < reporte.porPeriodo.length; i++)
              _Fila(
                filaKey: Key('filaPeriodo-$i'),
                etiqueta: reporte.porPeriodo[i].etiqueta,
                centavos: reporte.porPeriodo[i].totalCentavos,
              ),
            const SizedBox(height: MotorixEspaciados.l),
            Text('Por método de pago', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: MotorixEspaciados.s),
            const Divider(height: 1),
            for (var i = 0; i < reporte.porMetodo.length; i++)
              _Fila(
                filaKey: Key('filaMetodo-$i'),
                etiqueta: reporte.porMetodo[i].etiqueta,
                centavos: reporte.porMetodo[i].totalCentavos,
              ),
          ],
        ],
      ),
    );
  }
}

/// Una fila densa: etiqueta a la izquierda e importe en peso 600 a la derecha.
class _Fila extends StatelessWidget {
  final Key filaKey;
  final String etiqueta;
  final int centavos;

  const _Fila({required this.filaKey, required this.etiqueta, required this.centavos});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          key: filaKey,
          padding: const EdgeInsets.symmetric(vertical: MotorixEspaciados.s),
          child: Row(
            children: [
              Expanded(child: Text(etiqueta)),
              Text(
                formatearCentavos(centavos),
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
      ],
    );
  }
}

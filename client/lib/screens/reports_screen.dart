/// Reportes (008-configuracion-seguridad-reportes, T118 y T125; FR-023, FR-026,
/// CA-6).
///
/// Solo para ADMIN (la autorización real es del servidor, RN-15). Es de solo
/// lectura. Pestañas «Ingresos», «Servicios» y «Productividad» con UN filtro de
/// rango compartido («Mes actual» por omisión, «Mes anterior» o «Rango libre»
/// validado en la interfaz) y los estados de carga, vacío, error y sin permiso de
/// docs/design-system.md 8.4 y 8.10. Listas densas con divisores (sin tarjetas,
/// 8.6). Los importes salen de centavos enteros.
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

class _ReportsScreenState extends State<ReportsScreen> with SingleTickerProviderStateMixin {
  final _formKey = GlobalKey<FormState>();
  final _desde = TextEditingController();
  final _hasta = TextEditingController();
  late final TabController _pestanas;

  /// true mientras «Rango libre» es el filtro elegido (aunque aún no se consulte).
  bool _libre = false;

  @override
  void initState() {
    super.initState();
    _pestanas = TabController(length: PestanaReporte.values.length, vsync: this)..addListener(_alCambiarPestana);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<ReportsProvider>().cargar();
    });
  }

  @override
  void dispose() {
    _pestanas
      ..removeListener(_alCambiarPestana)
      ..dispose();
    _desde.dispose();
    _hasta.dispose();
    super.dispose();
  }

  /// Al terminar el cambio de pestaña, la pestaña nueva consulta si hace falta.
  void _alCambiarPestana() {
    if (_pestanas.indexIsChanging) return;
    context.read<ReportsProvider>().seleccionarPestana(PestanaReporte.values[_pestanas.index]);
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
    final activa = proveedor.pestana;
    return Column(
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
                onPressed: proveedor.cargando(activa) || proveedor.sinPermiso
                    ? null
                    : () => proveedor.cargar(),
              ),
            ],
          ),
        ),
        if (!proveedor.sinPermiso) ...[
          Align(
            alignment: Alignment.centerLeft,
            child: TabBar(
              controller: _pestanas,
              isScrollable: true,
              tabAlignment: TabAlignment.start,
              tabs: const [
                Tab(key: Key('pestanaIngresos'), text: 'Ingresos'),
                Tab(key: Key('pestanaServicios'), text: 'Servicios'),
                Tab(key: Key('pestanaProductividad'), text: 'Productividad'),
              ],
            ),
          ),
          _filtro(proveedor),
        ],
        const Divider(height: 1),
        Expanded(
          child: proveedor.sinPermiso
              ? _Estado(proveedor: proveedor, pestana: activa, hijo: const SizedBox.shrink())
              : TabBarView(
                  controller: _pestanas,
                  children: [
                    _Estado(proveedor: proveedor, pestana: PestanaReporte.ingresos, hijo: _Ingresos(reporte: proveedor.ingresos)),
                    _Estado(proveedor: proveedor, pestana: PestanaReporte.servicios, hijo: _Servicios(reporte: proveedor.servicios)),
                    _Estado(proveedor: proveedor, pestana: PestanaReporte.productividad, hijo: _Productividad(reporte: proveedor.productividad)),
                  ],
                ),
        ),
      ],
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

/// Estados comunes de una pestaña: error o sin permiso, cargando y, si hay datos, el contenido.
class _Estado extends StatelessWidget {
  final ReportsProvider proveedor;
  final PestanaReporte pestana;
  final Widget hijo;

  const _Estado({required this.proveedor, required this.pestana, required this.hijo});

  @override
  Widget build(BuildContext context) {
    final error = proveedor.error(pestana);
    if (error != null) {
      final sinPermiso = proveedor.sinPermiso;
      return Center(
        key: Key(sinPermiso ? 'reporteSinPermiso' : 'reporteError'),
        child: Padding(
          padding: const EdgeInsets.all(MotorixEspaciados.m),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                error,
                textAlign: TextAlign.center,
                style: const TextStyle(color: MotorixColores.error),
              ),
              if (!sinPermiso) ...[
                const SizedBox(height: MotorixEspaciados.s),
                OutlinedButton(
                  key: const Key('botonReintentarReporte'),
                  onPressed: () => proveedor.cargar(pestana),
                  child: const Text('Reintentar'),
                ),
              ],
            ],
          ),
        ),
      );
    }
    if (proveedor.sinPermiso) {
      return Center(
        key: const Key('reporteSinPermiso'),
        child: Text(
          'No tiene permisos para ver los reportes.',
          style: const TextStyle(color: MotorixColores.error),
        ),
      );
    }
    final sinDatos = switch (pestana) {
      PestanaReporte.ingresos => proveedor.ingresos == null,
      PestanaReporte.servicios => proveedor.servicios == null,
      PestanaReporte.productividad => proveedor.productividad == null,
    };
    if (sinDatos) {
      // Solo la pestaña que se está consultando muestra el indicador (las demás, al abrirlas).
      return proveedor.cargando(pestana)
          ? const Center(
              child: SizedBox(
                key: Key('reporteCargando'),
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            )
          : const SizedBox.shrink();
    }
    return hijo;
  }
}

/// Pestaña «Ingresos»: total cobrado, ingresos por día o mes y por método.
class _Ingresos extends StatelessWidget {
  final ReporteIngresos? reporte;

  const _Ingresos({required this.reporte});

  @override
  Widget build(BuildContext context) {
    final datos = reporte;
    if (datos == null) return const SizedBox.shrink();
    return SingleChildScrollView(
      padding: const EdgeInsets.all(MotorixEspaciados.m),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(datos.rangoTexto, style: const TextStyle(color: MotorixColores.textoSecundario)),
          const SizedBox(height: MotorixEspaciados.m),
          if (datos.vacio)
            const Text(
              'No hay cobros en este rango.',
              key: Key('ingresosVacio'),
              style: TextStyle(color: MotorixColores.textoSecundario),
            )
          else ...[
            Text('Total cobrado', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: MotorixEspaciados.xs),
            Text(
              formatearCentavos(datos.totalCentavos),
              key: const Key('totalIngresos'),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: MotorixEspaciados.l),
            Text(
              datos.agrupacion == 'MES' ? 'Ingresos por mes' : 'Ingresos por día',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: MotorixEspaciados.s),
            const Divider(height: 1),
            for (var i = 0; i < datos.porPeriodo.length; i++)
              _Fila(
                filaKey: Key('filaPeriodo-$i'),
                etiqueta: datos.porPeriodo[i].etiqueta,
                centavos: datos.porPeriodo[i].totalCentavos,
              ),
            const SizedBox(height: MotorixEspaciados.l),
            Text('Por método de pago', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: MotorixEspaciados.s),
            const Divider(height: 1),
            for (var i = 0; i < datos.porMetodo.length; i++)
              _Fila(
                filaKey: Key('filaMetodo-$i'),
                etiqueta: datos.porMetodo[i].etiqueta,
                centavos: datos.porMetodo[i].totalCentavos,
              ),
          ],
        ],
      ),
    );
  }
}

/// Pestaña «Servicios»: tipo, cantidad e importe, con «Sin tipo» y un total.
class _Servicios extends StatelessWidget {
  final ReporteServicios? reporte;

  const _Servicios({required this.reporte});

  @override
  Widget build(BuildContext context) {
    final datos = reporte;
    if (datos == null) return const SizedBox.shrink();
    return SingleChildScrollView(
      padding: const EdgeInsets.all(MotorixEspaciados.m),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(datos.rangoTexto, style: const TextStyle(color: MotorixColores.textoSecundario)),
          const SizedBox(height: MotorixEspaciados.m),
          if (datos.vacio)
            const Text(
              'No hay servicios en órdenes cerradas en este rango.',
              key: Key('serviciosVacio'),
              style: TextStyle(color: MotorixColores.textoSecundario),
            )
          else ...[
            const _Encabezado(columnas: ['Tipo de servicio', 'Cantidad', 'Importe']),
            for (var i = 0; i < datos.datos.length; i++)
              _FilaTres(
                filaKey: Key('filaServicio-$i'),
                etiqueta: datos.datos[i].tipo,
                medio: datos.datos[i].etiquetaCantidad,
                centavos: datos.datos[i].importeCentavos,
              ),
            _FilaTres(
              filaKey: const Key('filaTotalServicios'),
              etiqueta: 'Total',
              medio: datos.etiquetaTotalCantidad,
              centavos: datos.totalCentavos,
              enfatizada: true,
            ),
          ],
        ],
      ),
    );
  }
}

/// Pestaña «Productividad»: mecánico, órdenes y mano de obra, con «Sin asignar» y un total.
class _Productividad extends StatelessWidget {
  final ReporteProductividad? reporte;

  const _Productividad({required this.reporte});

  @override
  Widget build(BuildContext context) {
    final datos = reporte;
    if (datos == null) return const SizedBox.shrink();
    return SingleChildScrollView(
      padding: const EdgeInsets.all(MotorixEspaciados.m),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(datos.rangoTexto, style: const TextStyle(color: MotorixColores.textoSecundario)),
          const SizedBox(height: MotorixEspaciados.m),
          if (datos.vacio)
            const Text(
              'No hay órdenes cerradas en este rango.',
              key: Key('productividadVacia'),
              style: TextStyle(color: MotorixColores.textoSecundario),
            )
          else ...[
            const _Encabezado(columnas: ['Mecánico', 'Órdenes', 'Mano de obra']),
            for (var i = 0; i < datos.datos.length; i++)
              _FilaTres(
                filaKey: Key('filaMecanico-$i'),
                etiqueta: datos.datos[i].etiqueta,
                medio: datos.datos[i].etiquetaOrdenes,
                centavos: datos.datos[i].manoObraCentavos,
              ),
            _FilaTres(
              filaKey: const Key('filaTotalProductividad'),
              etiqueta: 'Total',
              medio: datos.etiquetaTotalOrdenes,
              centavos: datos.totalManoObraCentavos,
              enfatizada: true,
            ),
          ],
        ],
      ),
    );
  }
}

const double _anchoColumna = 130;

/// Fila de encabezado de columnas, en `textSecondary`.
class _Encabezado extends StatelessWidget {
  final List<String> columnas;

  const _Encabezado({required this.columnas});

  @override
  Widget build(BuildContext context) {
    const estilo = TextStyle(color: MotorixColores.textoSecundario);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: MotorixEspaciados.s),
          child: Row(
            children: [
              Expanded(child: Text(columnas[0], style: estilo)),
              SizedBox(width: _anchoColumna, child: Text(columnas[1], textAlign: TextAlign.right, style: estilo)),
              SizedBox(width: _anchoColumna, child: Text(columnas[2], textAlign: TextAlign.right, style: estilo)),
            ],
          ),
        ),
        const Divider(height: 1),
      ],
    );
  }
}

/// Fila de tres columnas: etiqueta, cantidad (texto) e importe en peso 600.
class _FilaTres extends StatelessWidget {
  final Key filaKey;
  final String etiqueta;
  final String medio;
  final int centavos;
  final bool enfatizada;

  const _FilaTres({
    required this.filaKey,
    required this.etiqueta,
    required this.medio,
    required this.centavos,
    this.enfatizada = false,
  });

  @override
  Widget build(BuildContext context) {
    final peso = enfatizada ? FontWeight.w600 : FontWeight.normal;
    return Column(
      children: [
        Padding(
          key: filaKey,
          padding: const EdgeInsets.symmetric(vertical: MotorixEspaciados.s),
          child: Row(
            children: [
              Expanded(child: Text(etiqueta, style: TextStyle(fontWeight: peso))),
              SizedBox(width: _anchoColumna, child: Text(medio, textAlign: TextAlign.right, style: TextStyle(fontWeight: peso))),
              SizedBox(
                width: _anchoColumna,
                child: Text(
                  formatearCentavos(centavos),
                  textAlign: TextAlign.right,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
      ],
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

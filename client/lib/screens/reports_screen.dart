/// Reportes (008-configuracion-seguridad-reportes, T118, T125 y T132; FR-023,
/// FR-025, FR-026, CA-6, CA-8).
///
/// Solo para ADMIN (la autorización real es del servidor, RN-15). Es de solo
/// lectura. Pestañas «Ingresos», «Servicios», «Productividad», «Refacciones» y
/// «Rotación» (estas dos paginadas de 50 en 50) con UN filtro de
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
                Tab(key: Key('pestanaRefacciones'), text: 'Refacciones'),
                Tab(key: Key('pestanaRotacion'), text: 'Rotación'),
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
                    _Estado(proveedor: proveedor, pestana: PestanaReporte.refacciones, hijo: _Refacciones(proveedor: proveedor)),
                    _Estado(proveedor: proveedor, pestana: PestanaReporte.rotacion, hijo: _Rotacion(proveedor: proveedor)),
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
      PestanaReporte.refacciones => proveedor.refacciones == null,
      PestanaReporte.rotacion => proveedor.rotacion == null,
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


/// Pestaña «Refacciones»: totales de las líneas completas, una fila por uso con
/// costo, precio de venta y margen («sin costo» y «sin precio» en advertencia) y
/// paginación de 50 en 50.
class _Refacciones extends StatelessWidget {
  final ReportsProvider proveedor;

  const _Refacciones({required this.proveedor});

  @override
  Widget build(BuildContext context) {
    final datos = proveedor.refacciones;
    if (datos == null) return const SizedBox.shrink();
    if (datos.vacio) {
      return Padding(
        padding: const EdgeInsets.all(MotorixEspaciados.m),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(datos.rangoTexto, style: const TextStyle(color: MotorixColores.textoSecundario)),
            const SizedBox(height: MotorixEspaciados.m),
            const Text(
              'No hay refacciones usadas en órdenes cerradas en este rango.',
              key: Key('refaccionesVacias'),
              style: TextStyle(color: MotorixColores.textoSecundario),
            ),
          ],
        ),
      );
    }
    final totales = datos.totales;
    final aviso = totales.aviso;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(MotorixEspaciados.m),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(datos.rangoTexto, style: const TextStyle(color: MotorixColores.textoSecundario)),
                const SizedBox(height: MotorixEspaciados.m),
                Wrap(
                  spacing: MotorixEspaciados.xl,
                  runSpacing: MotorixEspaciados.s,
                  children: [
                    _Cifra(etiqueta: 'Ventas', claveValor: const Key('totalVentas'), centavos: totales.ventasCentavos),
                    _Cifra(etiqueta: 'Costo', claveValor: const Key('totalCosto'), centavos: totales.costoCentavos),
                    _Cifra(
                      etiqueta: 'Margen',
                      claveValor: const Key('totalMargen'),
                      centavos: totales.margenCentavos,
                      resaltarNegativo: true,
                    ),
                  ],
                ),
                if (aviso != null) ...[
                  const SizedBox(height: MotorixEspaciados.s),
                  Text(
                    aviso,
                    key: const Key('avisoLineasExcluidas'),
                    style: const TextStyle(color: MotorixColores.textoSecundario),
                  ),
                ],
                const SizedBox(height: MotorixEspaciados.l),
                const _EncabezadoRefacciones(),
                for (var i = 0; i < datos.datos.length; i++) _FilaRefaccion(indice: i, linea: datos.datos[i]),
              ],
            ),
          ),
        ),
        _Paginacion(
          texto: 'Página ${datos.pagina} de ${datos.totalPaginas} · ${datos.etiquetaTotal}',
          hayAnterior: datos.hayAnterior,
          haySiguiente: datos.haySiguiente,
          ocupado: proveedor.cargando(PestanaReporte.refacciones),
          alAnterior: () => proveedor.irAPagina(PestanaReporte.refacciones, datos.pagina - 1),
          alSiguiente: () => proveedor.irAPagina(PestanaReporte.refacciones, datos.pagina + 1),
        ),
      ],
    );
  }
}

/// Una cifra de resumen: etiqueta y valor (el margen negativo se resalta en rojo).
class _Cifra extends StatelessWidget {
  final String etiqueta;
  final Key claveValor;
  final int centavos;
  final bool resaltarNegativo;

  const _Cifra({
    required this.etiqueta,
    required this.claveValor,
    required this.centavos,
    this.resaltarNegativo = false,
  });

  @override
  Widget build(BuildContext context) {
    final estilo = Theme.of(context).textTheme.titleLarge;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(etiqueta, style: const TextStyle(color: MotorixColores.textoSecundario)),
        const SizedBox(height: MotorixEspaciados.xs),
        Text(
          formatearCentavos(centavos),
          key: claveValor,
          style: resaltarNegativo && centavos < 0 ? estilo?.copyWith(color: MotorixColores.error) : estilo,
        ),
      ],
    );
  }
}

const double _anchoCantidad = 70;
const double _anchoImporte = 130;

class _EncabezadoRefacciones extends StatelessWidget {
  const _EncabezadoRefacciones();

  @override
  Widget build(BuildContext context) {
    const estilo = TextStyle(color: MotorixColores.textoSecundario);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: MotorixEspaciados.s),
          child: Row(
            children: const [
              Expanded(child: Text('Refacción', style: estilo)),
              SizedBox(width: _anchoCantidad, child: Text('Cant.', textAlign: TextAlign.right, style: estilo)),
              SizedBox(width: _anchoImporte, child: Text('Precio de venta', textAlign: TextAlign.right, style: estilo)),
              SizedBox(width: _anchoImporte, child: Text('Costo', textAlign: TextAlign.right, style: estilo)),
              SizedBox(width: _anchoImporte, child: Text('Margen', textAlign: TextAlign.right, style: estilo)),
            ],
          ),
        ),
        const Divider(height: 1),
      ],
    );
  }
}

/// Un importe a la derecha, o la marca en advertencia / «—» cuando falta.
class _Importe extends StatelessWidget {
  final int? centavos;
  final String? marca;
  final bool negativoEnRojo;

  const _Importe({required this.centavos, this.marca, this.negativoEnRojo = false});

  @override
  Widget build(BuildContext context) {
    final Widget texto;
    if (centavos != null) {
      texto = Text(
        formatearCentavos(centavos!),
        textAlign: TextAlign.right,
        style: TextStyle(
          fontWeight: FontWeight.w600,
          color: negativoEnRojo && centavos! < 0 ? MotorixColores.error : null,
        ),
      );
    } else if (marca != null) {
      texto = Text(marca!, textAlign: TextAlign.right, style: const TextStyle(color: MotorixColores.advertencia));
    } else {
      texto = const Text('—', textAlign: TextAlign.right, style: TextStyle(color: MotorixColores.textoSecundario));
    }
    return SizedBox(width: _anchoImporte, child: texto);
  }
}

class _FilaRefaccion extends StatelessWidget {
  final int indice;
  final LineaRefaccion linea;

  const _FilaRefaccion({required this.indice, required this.linea});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          key: Key('filaRefaccion-$indice'),
          padding: const EdgeInsets.symmetric(vertical: MotorixEspaciados.s),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(linea.nombre, style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text(linea.detalle, style: const TextStyle(color: MotorixColores.textoSecundario)),
                  ],
                ),
              ),
              SizedBox(width: _anchoCantidad, child: Text('${linea.cantidad}', textAlign: TextAlign.right)),
              _Importe(centavos: linea.precioVentaCentavos, marca: linea.sinPrecio ? 'sin precio' : null),
              _Importe(centavos: linea.costoCentavos, marca: linea.sinCosto ? 'sin costo' : null),
              _Importe(centavos: linea.margenCentavos, negativoEnRojo: true),
            ],
          ),
        ),
        const Divider(height: 1),
      ],
    );
  }
}

/// Pestaña «Rotación»: una fila por refacción activa y paginación de 50 en 50.
class _Rotacion extends StatelessWidget {
  final ReportsProvider proveedor;

  const _Rotacion({required this.proveedor});

  @override
  Widget build(BuildContext context) {
    final datos = proveedor.rotacion;
    if (datos == null) return const SizedBox.shrink();
    if (datos.vacio) {
      return Padding(
        padding: const EdgeInsets.all(MotorixEspaciados.m),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(datos.rangoTexto, style: const TextStyle(color: MotorixColores.textoSecundario)),
            const SizedBox(height: MotorixEspaciados.m),
            const Text(
              'No hay refacciones activas.',
              key: Key('rotacionVacia'),
              style: TextStyle(color: MotorixColores.textoSecundario),
            ),
          ],
        ),
      );
    }
    const estilo = TextStyle(color: MotorixColores.textoSecundario);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(MotorixEspaciados.m),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(datos.rangoTexto, style: estilo),
                const SizedBox(height: MotorixEspaciados.m),
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: MotorixEspaciados.s),
                  child: Row(
                    children: [
                      Expanded(child: Text('Refacción', style: estilo)),
                      SizedBox(width: _anchoImporte, child: Text('Salidas', textAlign: TextAlign.right, style: estilo)),
                      SizedBox(width: _anchoImporte, child: Text('Existencia', textAlign: TextAlign.right, style: estilo)),
                      SizedBox(width: _anchoImporte, child: Text('Rotación', textAlign: TextAlign.right, style: estilo)),
                    ],
                  ),
                ),
                const Divider(height: 1),
                for (var i = 0; i < datos.datos.length; i++) _FilaRotacion(indice: i, fila: datos.datos[i]),
              ],
            ),
          ),
        ),
        _Paginacion(
          texto: 'Página ${datos.pagina} de ${datos.totalPaginas} · ${datos.etiquetaTotal}',
          hayAnterior: datos.hayAnterior,
          haySiguiente: datos.haySiguiente,
          ocupado: proveedor.cargando(PestanaReporte.rotacion),
          alAnterior: () => proveedor.irAPagina(PestanaReporte.rotacion, datos.pagina - 1),
          alSiguiente: () => proveedor.irAPagina(PestanaReporte.rotacion, datos.pagina + 1),
        ),
      ],
    );
  }
}

class _FilaRotacion extends StatelessWidget {
  final int indice;
  final RotacionRefaccion fila;

  const _FilaRotacion({required this.indice, required this.fila});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          key: Key('filaRotacion-$indice'),
          padding: const EdgeInsets.symmetric(vertical: MotorixEspaciados.s),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(fila.nombre, style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text(fila.codigo, style: const TextStyle(color: MotorixColores.textoSecundario)),
                  ],
                ),
              ),
              SizedBox(width: _anchoImporte, child: Text('${fila.unidadesSalidas}', textAlign: TextAlign.right)),
              SizedBox(width: _anchoImporte, child: Text('${fila.existencia}', textAlign: TextAlign.right)),
              SizedBox(
                width: _anchoImporte,
                child: Text(
                  fila.etiquetaRotacion,
                  textAlign: TextAlign.right,
                  style: fila.sinExistencia
                      ? const TextStyle(color: MotorixColores.advertencia)
                      : const TextStyle(fontWeight: FontWeight.w600),
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

/// Pie de paginación como el de la bitácora: «Página N de M · T …», «Anterior» y «Siguiente».
class _Paginacion extends StatelessWidget {
  final String texto;
  final bool hayAnterior;
  final bool haySiguiente;
  final bool ocupado;
  final VoidCallback alAnterior;
  final VoidCallback alSiguiente;

  const _Paginacion({
    required this.texto,
    required this.hayAnterior,
    required this.haySiguiente,
    required this.ocupado,
    required this.alAnterior,
    required this.alSiguiente,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      key: const Key('paginacionReporte'),
      mainAxisSize: MainAxisSize.min,
      children: [
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: MotorixEspaciados.m, vertical: MotorixEspaciados.s),
          child: Row(
            children: [
              Expanded(child: Text(texto, style: const TextStyle(color: MotorixColores.textoSecundario))),
              OutlinedButton(
                key: const Key('botonPaginaAnteriorReporte'),
                onPressed: hayAnterior && !ocupado ? alAnterior : null,
                child: const Text('Anterior'),
              ),
              const SizedBox(width: MotorixEspaciados.s),
              OutlinedButton(
                key: const Key('botonPaginaSiguienteReporte'),
                onPressed: haySiguiente && !ocupado ? alSiguiente : null,
                child: const Text('Siguiente'),
              ),
            ],
          ),
        ),
      ],
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

/**
 * Servicio de reportes (008-configuracion-seguridad-reportes, T116; FR-023,
 * FR-024, CA-7). Solo ADMIN los consulta (validado en el ruteador, RN-15). Cada
 * función devuelve UNA estructura que usan tanto la respuesta JSON como, más
 * adelante, la exportación a CSV, de modo que pantalla y archivo coincidan.
 *
 * Los importes se calculan y se suman en centavos enteros (`aCentavos` /
 * `deCentavos` de `utils/money.js`); los pesos solo son la presentación.
 */
import * as reportModel from '../models/report.js';
import { agrupacionDe } from '../utils/report-range.js';
import { deCentavos } from '../utils/money.js';
import { aCsv, importeCsv } from '../utils/csv.js';
import { errores } from '../utils/errors.js';

const aImporte = (centavos) => ({ totalCentavos: centavos, total: deCentavos(centavos) });

/**
 * Ingresos del rango: solo pagos COMPLETED (el mismo criterio del panel de
 * control), por periodo (día hasta 62 días; mes con más) y por método.
 * @param {{ desde: string, hasta: string, desdeSql: string, hastaExclusivoSql: string, dias: number }} rango
 */
export async function ingresos(rango) {
  const agrupacion = agrupacionDe(rango);
  const [metodos, periodos] = await Promise.all([
    reportModel.findIncomeByMethod(rango),
    reportModel.findIncomeByPeriod(rango, agrupacion),
  ]);

  const porMetodo = metodos
    .map(({ metodo, centavos }) => ({ metodo, ...aImporte(centavos) }))
    .sort((a, b) => b.totalCentavos - a.totalCentavos || a.metodo.localeCompare(b.metodo));
  const porPeriodo = periodos.map(({ periodo, centavos }) => ({ periodo, ...aImporte(centavos) }));
  const totalCentavos = porMetodo.reduce((suma, fila) => suma + fila.totalCentavos, 0);

  return {
    rango: { desde: rango.desde, hasta: rango.hasta },
    agrupacion,
    ...aImporte(totalCentavos),
    porPeriodo,
    porMetodo,
  };
}

const ETIQUETA_SIN_TIPO = 'Sin tipo';
const comparar = (a, b) => a.localeCompare(b, 'es');

/**
 * Servicios más frecuentes de las órdenes cerradas del periodo, por tipo
 * («Sin tipo» para las líneas sin tipo), de la mayor a la menor cantidad y, a
 * igualdad, por nombre.
 */
export async function servicios(rango) {
  const filas = await reportModel.findServicesByType(rango);
  const datos = filas
    .map(({ tipo, cantidad, centavos }) => ({
      tipo: tipo ?? ETIQUETA_SIN_TIPO,
      cantidad,
      importeCentavos: centavos,
      importe: deCentavos(centavos),
    }))
    .sort((a, b) => b.cantidad - a.cantidad || comparar(a.tipo, b.tipo));
  return { rango: { desde: rango.desde, hasta: rango.hasta }, datos };
}

/**
 * Productividad por mecánico de las órdenes cerradas del periodo: órdenes e
 * importe de mano de obra. De más a menos órdenes y, a igualdad, por nombre;
 * «Sin asignar» (`mecanico: null`) siempre al final. Del mecánico solo se
 * expone el id y el nombre.
 */
export async function productividad(rango) {
  const filas = await reportModel.findProductivityByMechanic(rango);
  const datos = filas
    .map(({ id, nombre, ordenes, centavos }) => ({
      mecanico: id === null ? null : { id, nombre },
      ordenes,
      manoObraCentavos: centavos,
      manoObra: deCentavos(centavos),
    }))
    .sort((a, b) => {
      if (a.mecanico === null || b.mecanico === null) return (a.mecanico === null) - (b.mecanico === null);
      return b.ordenes - a.ordenes || comparar(a.mecanico.nombre, b.mecanico.nombre);
    });
  return { rango: { desde: rango.desde, hasta: rango.hasta }, datos };
}

const totalPaginas = (total, limite) => Math.max(1, Math.ceil(total / limite));

/**
 * Refacciones usadas en órdenes cerradas del periodo (una fila por uso): ventas =
 * precio congelado × cantidad, costo = precio de compra vigente × cantidad y
 * margen = ventas − costo, todo en centavos enteros. Un uso sin precio de compra
 * es «sin costo» y uno sin precio de venta es «sin precio»: sus importes
 * faltantes son `null` (nunca 0) y la línea queda FUERA de los totales.
 */
export async function refacciones(rango, { pagina, limite }) {
  const [filas, resumen] = await Promise.all([
    reportModel.findPartUsages(rango, { limite, desplazamiento: (pagina - 1) * limite }),
    reportModel.summarizePartUsages(rango),
  ]);

  const datos = filas.map((fila) => {
    const { cantidad, ventaCentavos, compraCentavos } = fila;
    const ventas = ventaCentavos === null ? null : ventaCentavos * cantidad;
    const costo = compraCentavos === null ? null : compraCentavos * cantidad;
    return {
      ordenId: fila.ordenId,
      parteId: fila.parteId,
      codigo: fila.codigo,
      nombre: fila.nombre,
      cantidad,
      precioVentaCentavos: ventaCentavos,
      precioCompraCentavos: compraCentavos,
      ventasCentavos: ventas,
      costoCentavos: costo,
      margenCentavos: ventas !== null && costo !== null ? ventas - costo : null,
      sinCosto: compraCentavos === null,
      sinPrecio: ventaCentavos === null,
    };
  });

  return {
    rango: { desde: rango.desde, hasta: rango.hasta },
    pagina,
    totalPaginas: totalPaginas(resumen.lineas, limite),
    total: resumen.lineas,
    totales: {
      ventasCentavos: resumen.ventasCentavos,
      costoCentavos: resumen.costoCentavos,
      margenCentavos: resumen.ventasCentavos - resumen.costoCentavos,
      lineasSinCosto: resumen.sinCosto,
      lineasSinPrecio: resumen.sinPrecio,
    },
    datos,
  };
}

/**
 * Rotación del inventario: por refacción activa, unidades de salida del rango entre
 * la existencia actual (dos decimales). Con existencia 0 no hay rotación
 * (`rotacion: null`, `sinExistencia: true`) y la fila va al final.
 */
export async function rotacion(rango, { pagina, limite }) {
  const [filas, total] = await Promise.all([
    reportModel.findRotation(rango, { limite, desplazamiento: (pagina - 1) * limite }),
    reportModel.countActiveParts(),
  ]);
  const datos = filas.map((fila) => ({
    parteId: fila.parteId,
    codigo: fila.codigo,
    nombre: fila.nombre,
    unidadesSalidas: fila.unidades,
    existencia: fila.existencia,
    rotacion: fila.existencia === 0 ? null : Math.round((fila.unidades / fila.existencia) * 100) / 100,
    sinExistencia: fila.existencia === 0,
  }));
  return {
    rango: { desde: rango.desde, hasta: rango.hasta },
    pagina,
    totalPaginas: totalPaginas(total, limite),
    total,
    datos,
  };
}

// ------------------------------------------------------------------ Exportación

/** Máximo de filas de datos de un archivo exportado. */
export const LIMITE_FILAS_EXPORTACION = 10000;

const ETIQUETA_METODO = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  MERCADO_PAGO: 'Mercado Pago',
};

const pluralLineas = (n) => `${n} ${n === 1 ? 'línea' : 'líneas'}`;

/** Aviso de las líneas incompletas de «Refacciones» (el mismo texto de la pantalla). */
function avisoLineasExcluidas({ lineasSinCosto: c, lineasSinPrecio: p }) {
  if (c === 0 && p === 0) return '';
  const partes = [];
  if (c > 0) partes.push(`${pluralLineas(c)} sin costo`);
  if (p > 0) partes.push(c > 0 ? `${p} sin precio` : `${pluralLineas(p)} sin precio`);
  return `${partes.join(' y ')} ${c + p === 1 ? 'no se incluye' : 'no se incluyen'} en estos totales.`;
}

function excedeElLimite() {
  return errores.rangoInvalido(
    `La exportación supera las ${LIMITE_FILAS_EXPORTACION.toLocaleString('en-US')} filas; reduzca el rango.`
  );
}

/**
 * Cada constructor devuelve `{ encabezados, filas, filasDeDatos }` con la MISMA
 * información que la consulta JSON del reporte (y, donde la pantalla tiene una fila
 * «Total», esa fila al final). Un rango sin datos exporta solo los encabezados.
 */
const CONSTRUCTORES = new Map([
  [
    'income',
    async (rango) => {
      const r = await ingresos(rango);
      const filasDeDatos = r.porPeriodo.length + r.porMetodo.length;
      const filas =
        filasDeDatos === 0 && r.totalCentavos === 0
          ? []
          : [
              ['Total', 'Total cobrado', importeCsv(r.totalCentavos)],
              ...r.porPeriodo.map((p) => ['Por periodo', p.periodo, importeCsv(p.totalCentavos)]),
              ...r.porMetodo.map((m) => ['Por método', ETIQUETA_METODO[m.metodo] ?? m.metodo, importeCsv(m.totalCentavos)]),
            ];
      return { encabezados: ['Sección', 'Concepto', 'Importe'], filas, filasDeDatos };
    },
  ],
  [
    'services',
    async (rango) => {
      const { datos } = await servicios(rango);
      const filas = datos.map((d) => [d.tipo, d.cantidad, importeCsv(d.importeCentavos)]);
      if (datos.length > 0) {
        filas.push([
          'Total',
          datos.reduce((suma, d) => suma + d.cantidad, 0),
          importeCsv(datos.reduce((suma, d) => suma + d.importeCentavos, 0)),
        ]);
      }
      return { encabezados: ['Tipo de servicio', 'Cantidad', 'Importe'], filas, filasDeDatos: datos.length };
    },
  ],
  [
    'productivity',
    async (rango) => {
      const { datos } = await productividad(rango);
      const filas = datos.map((d) => [d.mecanico?.nombre ?? 'Sin asignar', d.ordenes, importeCsv(d.manoObraCentavos)]);
      if (datos.length > 0) {
        filas.push([
          'Total',
          datos.reduce((suma, d) => suma + d.ordenes, 0),
          importeCsv(datos.reduce((suma, d) => suma + d.manoObraCentavos, 0)),
        ]);
      }
      return { encabezados: ['Mecánico', 'Órdenes', 'Mano de obra'], filas, filasDeDatos: datos.length };
    },
  ],
  [
    'parts',
    async (rango) => {
      // Se pide un registro de más para detectar el exceso sin cargar todo el rango.
      const r = await refacciones(rango, { pagina: 1, limite: LIMITE_FILAS_EXPORTACION + 1 });
      if (r.total > LIMITE_FILAS_EXPORTACION) throw excedeElLimite();
      const observacion = (d) => (d.sinCosto && d.sinPrecio ? 'sin costo y sin precio' : d.sinCosto ? 'sin costo' : d.sinPrecio ? 'sin precio' : '');
      const filas = r.datos.map((d) => [
        d.ordenId,
        d.codigo,
        d.nombre,
        d.cantidad,
        importeCsv(d.precioVentaCentavos),
        importeCsv(d.precioCompraCentavos),
        importeCsv(d.ventasCentavos),
        importeCsv(d.costoCentavos),
        importeCsv(d.margenCentavos),
        observacion(d),
      ]);
      if (r.datos.length > 0) {
        filas.push([
          'Total (líneas completas)',
          '',
          '',
          '',
          '',
          '',
          importeCsv(r.totales.ventasCentavos),
          importeCsv(r.totales.costoCentavos),
          importeCsv(r.totales.margenCentavos),
          avisoLineasExcluidas(r.totales),
        ]);
      }
      return {
        encabezados: [
          'Orden',
          'Código',
          'Refacción',
          'Cantidad',
          'Precio de venta unitario',
          'Precio de compra unitario',
          'Ventas',
          'Costo',
          'Margen',
          'Observación',
        ],
        filas,
        filasDeDatos: r.datos.length,
      };
    },
  ],
  [
    'rotation',
    async (rango) => {
      const r = await rotacion(rango, { pagina: 1, limite: LIMITE_FILAS_EXPORTACION + 1 });
      if (r.total > LIMITE_FILAS_EXPORTACION) throw excedeElLimite();
      const filas = r.datos.map((d) => [
        d.codigo,
        d.nombre,
        d.unidadesSalidas,
        d.existencia,
        d.rotacion === null ? 'sin existencia' : d.rotacion.toFixed(2),
      ]);
      return { encabezados: ['Código', 'Refacción', 'Salidas', 'Existencia', 'Rotación'], filas, filasDeDatos: r.datos.length };
    },
  ],
]);

/**
 * Exporta un reporte del rango como CSV (UTF-8 con BOM; ver `utils/csv.js`).
 * @param {string} reporte Uno de `REPORTES` (el controlador ya lo validó).
 * @returns {Promise<{ nombreArchivo: string, contenido: string }>}
 */
export async function exportar(reporte, rango) {
  const construir = CONSTRUCTORES.get(reporte);
  if (!construir) throw errores.reporteNoEncontrado();
  const { encabezados, filas, filasDeDatos } = await construir(rango);
  if (filasDeDatos > LIMITE_FILAS_EXPORTACION) throw excedeElLimite();
  return {
    nombreArchivo: `motorix-${reporte}-${rango.desde}-${rango.hasta}.csv`,
    contenido: aCsv(encabezados, filas),
  };
}

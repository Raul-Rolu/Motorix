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

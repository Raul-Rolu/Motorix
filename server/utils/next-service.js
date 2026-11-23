/**
 * Cálculo del próximo servicio (008-configuracion-seguridad-reportes, T036;
 * FR-008, FR-009, RN-11, RN-12).
 *
 * A partir de los tipos de servicio con intervalo de las líneas de una orden,
 * la fecha del próximo servicio es la fecha base más el MENOR intervalo en días
 * y el kilometraje es el kilometraje base más el MENOR intervalo en km; cada
 * dimensión es independiente. Los intervalos los define el taller en el
 * catálogo: no se asume ningún valor universal. Funciones puras, sin base de
 * datos, compartidas por la propuesta de mantenimiento y por el ticket.
 */
import { diasDespues, fechaCorta } from './fechas.js';

/** Un intervalo cuenta solo si es un entero positivo. */
const esIntervaloValido = (valor) => Number.isInteger(valor) && valor > 0;

/** Menor valor válido de una lista de intervalos; null si no hay ninguno. */
function menorIntervalo(valores) {
  const validos = valores.filter(esIntervaloValido);
  return validos.length > 0 ? Math.min(...validos) : null;
}

/**
 * Próximo servicio de una orden.
 * @param {object} datos
 * @param {{ intervaloDias?: number|null, intervaloKm?: number|null }[]} datos.tipos
 *   Tipos de las líneas de servicio de la orden (con o sin intervalos).
 * @param {number|null} datos.kilometrajeBase Kilometraje de entrada de la orden.
 * @param {Date} datos.fechaBase Fecha local de la que se cuentan los días.
 * @returns {{ fecha: string|null, kilometraje: number|null }|null}
 *   `fecha` como `AAAA-MM-DD`; `null` si ningún tipo tiene intervalo calculable.
 */
export function calcularProximoServicio({ tipos, kilometrajeBase, fechaBase }) {
  const lista = Array.isArray(tipos) ? tipos : [];
  const dias = menorIntervalo(lista.map((tipo) => tipo?.intervaloDias));
  const km = menorIntervalo(lista.map((tipo) => tipo?.intervaloKm));

  const fecha = dias != null ? fechaCorta(diasDespues(dias, fechaBase)) : null;
  const kilometraje =
    km != null && Number.isFinite(Number(kilometrajeBase)) && kilometrajeBase !== null
      ? Number(kilometrajeBase) + km
      : null;

  if (fecha === null && kilometraje === null) {
    return null;
  }
  return { fecha, kilometraje };
}

/**
 * Nombre del servicio que determina el próximo: el tipo de menor intervalo en
 * días o, si ningún tipo tiene días, el de menor intervalo en km. `null` si no
 * hay tipos con intervalo.
 */
export function nombreDelServicioMasProximo(tipos) {
  const lista = Array.isArray(tipos) ? tipos : [];
  const porDias = lista
    .filter((tipo) => esIntervaloValido(tipo?.intervaloDias))
    .sort((a, b) => a.intervaloDias - b.intervaloDias)[0];
  if (porDias) {
    return porDias.nombre ?? null;
  }
  const porKm = lista
    .filter((tipo) => esIntervaloValido(tipo?.intervaloKm))
    .sort((a, b) => a.intervaloKm - b.intervaloKm)[0];
  return porKm?.nombre ?? null;
}

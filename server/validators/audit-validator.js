/**
 * Validación de los filtros de `GET /api/audit-log`
 * (008-configuracion-seguridad-reportes, T069; FR-014, CA-20). Funciones puras
 * con mensajes en español.
 */
import { ACCIONES } from '../utils/audit-detail.js';

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ENTERO_POSITIVO = /^[1-9][0-9]{0,9}$/;

/** ¿Es una fecha real `AAAA-MM-DD`? (rechaza 2026-13-45 y 2026-02-30). */
function esFechaReal(texto) {
  if (typeof texto !== 'string' || !FORMATO_FECHA.test(texto)) {
    return false;
  }
  const [anio, mes, dia] = texto.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia;
}

const presente = (valor) => valor !== undefined && valor !== '';

/**
 * Valida y normaliza los filtros de la consulta.
 * @returns {{ errores: string[], filtros: { desde: string|null, hasta: string|null, usuarioId: number|null, accion: string|null, pagina: number } }}
 */
export function validarFiltros(consulta = {}) {
  const errores = [];
  const filtros = { desde: null, hasta: null, usuarioId: null, accion: null, pagina: 1 };

  for (const campo of ['desde', 'hasta']) {
    if (presente(consulta[campo])) {
      if (esFechaReal(consulta[campo])) {
        filtros[campo] = consulta[campo];
      } else {
        errores.push(`El filtro «${campo}» debe ser una fecha válida con el formato AAAA-MM-DD.`);
      }
    }
  }
  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
    errores.push('La fecha final (hasta) no puede ser anterior a la inicial (desde).');
  }

  if (presente(consulta.usuarioId)) {
    if (typeof consulta.usuarioId === 'string' && ENTERO_POSITIVO.test(consulta.usuarioId)) {
      filtros.usuarioId = Number(consulta.usuarioId);
    } else {
      errores.push('El filtro «usuarioId» debe ser un identificador válido.');
    }
  }

  if (presente(consulta.accion)) {
    if (typeof consulta.accion === 'string' && ACCIONES.includes(consulta.accion)) {
      filtros.accion = consulta.accion;
    } else {
      errores.push('El filtro «accion» no es una acción válida de la bitácora.');
    }
  }

  if (presente(consulta.pagina)) {
    if (typeof consulta.pagina === 'string' && ENTERO_POSITIVO.test(consulta.pagina)) {
      filtros.pagina = Number(consulta.pagina);
    } else {
      errores.push('La página (pagina) debe ser un número entero mayor que cero.');
    }
  }

  return { errores, filtros };
}

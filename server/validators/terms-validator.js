/**
 * Validación de las entradas de los términos y condiciones
 * (008-configuracion-seguridad-reportes, T092; FR-020, FR-022, CA-17, CA-18).
 * Funciones puras con mensajes en español.
 */

export const LONGITUD_MINIMA = 20;
export const LONGITUD_MAXIMA = 20000;

const ENTERO_POSITIVO = /^[1-9][0-9]{0,9}$/;
const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);

function validarTexto(valor, etiqueta, errores) {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  if (texto.length < LONGITUD_MINIMA || texto.length > LONGITUD_MAXIMA) {
    errores.push(`${etiqueta} debe tener entre ${LONGITUD_MINIMA} y ${LONGITUD_MAXIMA} caracteres.`);
    return null;
  }
  return texto;
}

/**
 * Cuerpo de `POST /api/terms`.
 * @returns {{ errores: string[], datos: { terminos: string, avisoPrivacidad: string }|null }}
 */
export function validarPublicacion(payload) {
  if (!esObjeto(payload)) {
    return { errores: ['El cuerpo debe indicar los términos y el aviso de privacidad.'], datos: null };
  }
  const errores = [];
  const terminos = validarTexto(payload.terminos, 'El texto de los términos y condiciones', errores);
  const avisoPrivacidad = validarTexto(payload.avisoPrivacidad, 'El texto del aviso de privacidad', errores);
  return { errores, datos: errores.length === 0 ? { terminos, avisoPrivacidad } : null };
}

/**
 * Cuerpo de `POST /api/terms/accept`: un identificador entero positivo.
 * @returns {{ errores: string[], termsVersionId: number|null }}
 */
export function validarAceptacion(payload) {
  const id = esObjeto(payload) ? payload.termsVersionId : undefined;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || !ENTERO_POSITIVO.test(String(id))) {
    return { errores: ['Debe indicar la versión de los términos que acepta (termsVersionId).'], termsVersionId: null };
  }
  return { errores: [], termsVersionId: id };
}

/** Parámetro `pagina` de `GET /api/terms/acceptances`. */
export function validarPagina(consulta = {}) {
  const { pagina } = consulta;
  if (pagina === undefined || pagina === '') {
    return { errores: [], pagina: 1 };
  }
  if (typeof pagina === 'string' && ENTERO_POSITIVO.test(pagina)) {
    return { errores: [], pagina: Number(pagina) };
  }
  return { errores: ['La página (pagina) debe ser un número entero mayor que cero.'], pagina: 1 };
}

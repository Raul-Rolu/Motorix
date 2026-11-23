/**
 * Validación de `PUT /api/settings` (008-configuracion-seguridad-reportes, T011;
 * FR-002, FR-004, CA-1, CA-2). Funciones puras, sin dependencias, con mensajes
 * en español.
 *
 * El cuerpo agrupa los ajustes: `taller` (nombre, dirección, teléfono),
 * `operacion` (márgenes y días de orden detenida) y `seguridad` (minutos de
 * inactividad, que solo se habilita desde el bloque P2). Solo se validan y
 * devuelven los campos enviados; un solo error invalida todo el guardado
 * (`cambios` queda vacío).
 */
import {
  CLAVES,
  LIMITES,
  LONGITUD_MAXIMA,
  TELEFONO_PERMITIDO,
  enteroEnLimites,
} from '../utils/settings-defaults.js';

const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);

/** Campos de cada grupo con su clave y su validación. */
const GRUPOS = {
  taller: {
    nombre: { clave: CLAVES.NOMBRE, etiqueta: 'El nombre del taller', tipo: 'texto', obligatorio: true },
    direccion: { clave: CLAVES.DIRECCION, etiqueta: 'La dirección del taller', tipo: 'texto' },
    telefono: { clave: CLAVES.TELEFONO, etiqueta: 'El teléfono del taller', tipo: 'telefono' },
  },
  operacion: {
    margenProximoDias: { clave: CLAVES.MARGEN_DIAS, etiqueta: 'El margen de mantenimiento próximo en días', tipo: 'entero' },
    margenProximoKm: { clave: CLAVES.MARGEN_KM, etiqueta: 'El margen de mantenimiento próximo en kilómetros', tipo: 'entero' },
    diasOrdenDetenida: { clave: CLAVES.DIAS_ORDEN_DETENIDA, etiqueta: 'Los días para considerar una orden detenida', tipo: 'entero' },
  },
  seguridad: {
    minutosInactividad: { clave: CLAVES.MINUTOS_INACTIVIDAD, etiqueta: 'Los minutos de inactividad', tipo: 'entero' },
  },
};

/** Valida un campo y devuelve `{ error }` o `{ valor }` ya normalizado. */
function validarCampo(definicion, valor) {
  const { clave, etiqueta, tipo, obligatorio } = definicion;

  if (tipo === 'entero') {
    const [minimo, maximo] = LIMITES[clave];
    if (!enteroEnLimites(clave, valor)) {
      return { error: `${etiqueta} debe ser un número entero entre ${minimo} y ${maximo}.` };
    }
    return { valor };
  }

  if (typeof valor !== 'string') {
    return { error: `${etiqueta} debe ser un texto.` };
  }
  const texto = valor.trim();
  const maximo = LONGITUD_MAXIMA[clave];

  if (obligatorio && texto.length === 0) {
    return { error: `${etiqueta} es obligatorio.` };
  }
  if (texto.length > maximo) {
    return { error: `${etiqueta} no puede exceder ${maximo} caracteres.` };
  }
  if (tipo === 'telefono' && !TELEFONO_PERMITIDO.test(texto)) {
    return { error: `${etiqueta} solo puede tener dígitos, espacios y los símbolos + - ( ).` };
  }
  return { valor: texto };
}

/**
 * Valida el cuerpo de `PUT /api/settings`.
 * @param {object} payload Cuerpo de la petición.
 * @param {{ incluirSeguridad?: boolean }} [opciones] `incluirSeguridad` habilita
 *   el grupo `seguridad` (bloque P2); por omisión se rechaza.
 * @returns {{ errores: string[], cambios: Record<string, string|number> }}
 *   `cambios` usa las claves de la tabla `settings` y queda vacío si hay errores.
 */
export function validarAjustes(payload, { incluirSeguridad = false } = {}) {
  if (!esObjeto(payload)) {
    return { errores: ['El cuerpo debe indicar los ajustes a guardar.'], cambios: {} };
  }

  const errores = [];
  const cambios = {};
  const grupos = Object.keys(payload);
  if (grupos.length === 0) {
    return { errores: ['No se envió ningún ajuste para guardar.'], cambios: {} };
  }

  for (const grupo of grupos) {
    const campos = GRUPOS[grupo];
    if (!campos || (grupo === 'seguridad' && !incluirSeguridad)) {
      errores.push(`El grupo de ajustes «${grupo}» no es válido.`);
      continue;
    }
    if (!esObjeto(payload[grupo]) || Object.keys(payload[grupo]).length === 0) {
      errores.push(`El grupo «${grupo}» debe indicar al menos un ajuste.`);
      continue;
    }
    for (const [campo, valor] of Object.entries(payload[grupo])) {
      const definicion = campos[campo];
      if (!definicion) {
        errores.push(`El ajuste «${campo}» no es válido en el grupo «${grupo}».`);
        continue;
      }
      const resultado = validarCampo(definicion, valor);
      if (resultado.error) {
        errores.push(resultado.error);
      } else {
        cambios[definicion.clave] = resultado.valor;
      }
    }
  }

  return errores.length > 0 ? { errores, cambios: {} } : { errores: [], cambios };
}

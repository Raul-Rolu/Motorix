/**
 * Validación de los parámetros de ruta que son identificadores
 * (008-configuracion-seguridad-reportes, T083; FR-018, CA-25).
 *
 * Los identificadores de ruta (`:id`, `:orderId`, `:serviceId`, `:partId`) deben
 * ser enteros positivos. Antes, un valor como `abc` o `' OR 1=1 --` se convertía
 * en `NaN` y llegaba a la consulta como un error 500; ahora se responde 400
 * DATOS_INVALIDOS sin tocar la base. Las consultas ya usaban parámetros, así que
 * esto no cierra una inyección: cierra el error interno y deja la entrada validada
 * en el backend.
 */
import { error } from '../utils/responses.js';

const NOMBRES_DE_IDENTIFICADOR = ['id', 'orderId', 'serviceId', 'partId'];
const ENTERO_POSITIVO = /^[1-9][0-9]{0,14}$/;

/** `true` si el texto es un entero positivo representable sin pérdida. */
export function esIdentificadorValido(texto) {
  return ENTERO_POSITIVO.test(String(texto ?? ''));
}

/**
 * Registra en el router la validación de los identificadores de ruta.
 * @param {import('express').Router} router
 */
export function validarIdentificadoresDeRuta(router) {
  for (const nombre of NOMBRES_DE_IDENTIFICADOR) {
    router.param(nombre, (req, res, next, valor) => {
      if (!esIdentificadorValido(valor)) {
        return error(res, 400, 'DATOS_INVALIDOS', 'El identificador indicado en la ruta no es válido.');
      }
      return next();
    });
  }
}

/**
 * Utilidades de respuesta JSON consistentes (T010, Principio VI).
 * Todas las respuestas de la API siguen estos formatos (contracts/api-rest.md).
 */

/** Respuesta de éxito con recurso o colección. */
export function ok(res, datos, status = 200) {
  return res.status(status).json(datos);
}

/** Respuesta de éxito sin cuerpo (204). */
export function noContent(res) {
  return res.status(204).end();
}

/** Respuesta de creación con el recurso creado (201). */
export function created(res, datos) {
  return res.status(201).json(datos);
}

/** Respuesta de error en el formato centralizado del contrato. */
export function error(res, status, codigo, mensaje) {
  return res.status(status).json({ error: { codigo, mensaje } });
}

// 008-configuracion-seguridad-reportes, T117 (bloque P3; FR-023, FR-028, CA-10):
// controlador de los reportes. HTTP fino: valida el rango, delega en el servicio y
// traduce la respuesta. La autorización (solo ADMIN) la hace el ruteador (RN-15),
// así que un rol sin permiso recibe 403 antes de que se valide nada.
import { ok } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import { errores } from '../utils/errors.js';
import { validarRangoDeReporte, validarPaginacion, esReporteValido } from '../validators/report-validator.js';
import * as reportService from '../services/report-service.js';

/** Rango de la consulta o `400 RANGO_INVALIDO`. */
function rangoDe(req) {
  const { errores: lista, rango } = validarRangoDeReporte(req.query);
  if (lista.length > 0) {
    throw errores.rangoInvalido(lista.join(' '));
  }
  return rango;
}

export const ingresos = asyncHandler(async (req, res) => {
  return ok(res, await reportService.ingresos(rangoDe(req)));
});

export const servicios = asyncHandler(async (req, res) => {
  return ok(res, await reportService.servicios(rangoDe(req)));
});

export const productividad = asyncHandler(async (req, res) => {
  return ok(res, await reportService.productividad(rangoDe(req)));
});

/** Paginación de la consulta o `400 DATOS_INVALIDOS` (el rango se valida antes). */
function paginacionDe(req) {
  const { errores: lista, pagina, limite } = validarPaginacion(req.query);
  if (lista.length > 0) {
    throw errores.datosInvalidos(lista.join(' '));
  }
  return { pagina, limite };
}

export const refacciones = asyncHandler(async (req, res) => {
  const rango = rangoDe(req);
  return ok(res, await reportService.refacciones(rango, paginacionDe(req)));
});

export const rotacion = asyncHandler(async (req, res) => {
  const rango = rangoDe(req);
  return ok(res, await reportService.rotacion(rango, paginacionDe(req)));
});

/**
 * Exportación a CSV: el nombre del reporte se valida antes que el rango; `pagina` y
 * `limite` se ignoran (se exporta todo el rango, hasta 10,000 filas). No se guarda en
 * la bitácora (decisión de la spec) y la respuesta no se almacena en cachés.
 */
export const exportar = asyncHandler(async (req, res) => {
  const { reporte } = req.params;
  if (!esReporteValido(reporte)) {
    throw errores.reporteNoEncontrado();
  }
  const { nombreArchivo, contenido } = await reportService.exportar(reporte, rangoDe(req));
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    'Cache-Control': 'no-store',
  });
  return res.status(200).send(contenido);
});

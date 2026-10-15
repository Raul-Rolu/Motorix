// T046 (Sprint 4): controlador del panel de control (US4).
// Delega en el servicio; el rol es exclusivo de ADMIN en la ruta (FR-016).
import { ok } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import * as dashboardService from '../services/dashboard-service.js';

/** Resumen del negocio para administración (solo lectura, research D7). */
export const panel = asyncHandler(async (req, res) => {
  const resumen = await dashboardService.obtenerPanel();
  return ok(res, resumen);
});

// T034 (Sprint 4): controlador de tickets de servicio (US3).
// Delega en el servicio; la autorización real es del ruteador (RN-15).
import { ok } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';
import * as ticketService from '../services/ticket-service.js';

/** Emite (si falta) y devuelve el contenido vivo del ticket de la orden. */
export const obtener = asyncHandler(async (req, res) => {
  const ticket = await ticketService.obtenerContenido(
    Number(req.params.orderId),
    req.user
  );
  return ok(res, ticket);
});

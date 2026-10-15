/**
 * Rutas de tickets de servicio (Sprint 4, T034, US3; contracts/api-rest.md).
 * Emisión y consulta: ADMIN y RECEPTIONIST (FR-013, RN-15); el rol mecánico
 * queda fuera desde el servidor.
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as ticketController from '../controllers/ticket-controller.js';

export const ticketRoutes = Router();

ticketRoutes.use(auth);

ticketRoutes.get(
  '/:orderId',
  requireRole('ADMIN', 'RECEPTIONIST'),
  ticketController.obtener
);

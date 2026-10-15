/**
 * Rutas de pagos (Sprint 4, T015, US1/US2; contracts/api-rest.md).
 * Consulta y registro: ADMIN y RECEPTIONIST (FR-005, RN-15); el rol mecánico
 * queda fuera desde el servidor.
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as paymentController from '../controllers/payment-controller.js';

export const paymentRoutes = Router();

paymentRoutes.use(auth);

paymentRoutes.get(
  '/orders/:id/payments',
  requireRole('ADMIN', 'RECEPTIONIST'),
  paymentController.listar
);
paymentRoutes.post(
  '/orders/:id/payments',
  requireRole('ADMIN', 'RECEPTIONIST'),
  paymentController.registrar
);
paymentRoutes.get(
  '/payments/:id',
  requireRole('ADMIN', 'RECEPTIONIST'),
  paymentController.obtener
);

// --- US2: cobro digital con Mercado Pago (T027, FR-008/FR-017) ---
paymentRoutes.post(
  '/orders/:id/payments/digital',
  requireRole('ADMIN', 'RECEPTIONIST'),
  paymentController.crearDigital
);
paymentRoutes.post(
  '/payments/:id/verify',
  requireRole('ADMIN', 'RECEPTIONIST'),
  paymentController.verificar
);

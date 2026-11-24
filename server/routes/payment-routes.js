/**
 * Rutas de pagos (Sprint 4, T015, US1/US2; contracts/api-rest.md).
 * Consulta y registro: ADMIN y RECEPTIONIST (FR-005, RN-15); el rol mecánico
 * queda fuera desde el servidor.
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as paymentController from '../controllers/payment-controller.js';
import { validarIdentificadoresDeRuta } from '../middlewares/route-params.js';

export const paymentRoutes = Router();
validarIdentificadoresDeRuta(paymentRoutes);

// `auth` va en cada ruta y NO con `paymentRoutes.use(auth)`: este router se monta en
// `/api` y un `use` a nivel de router autenticaba (y consultaba la base) también
// en todas las rutas montadas después (/me, /notifications, /settings, /terms…),
// duplicando la autenticación y, con la compuerta de términos, bloqueando rutas
// exentas (008, T093).

paymentRoutes.get(
  '/orders/:id/payments',
  auth,
  requireRole('ADMIN', 'RECEPTIONIST'),
  paymentController.listar
);
paymentRoutes.post(
  '/orders/:id/payments',
  auth,
  requireRole('ADMIN', 'RECEPTIONIST'),
  paymentController.registrar
);
paymentRoutes.get(
  '/payments/:id',
  auth,
  requireRole('ADMIN', 'RECEPTIONIST'),
  paymentController.obtener
);

// --- US2: cobro digital con Mercado Pago (T027, FR-008/FR-017) ---
paymentRoutes.post(
  '/orders/:id/payments/digital',
  auth,
  requireRole('ADMIN', 'RECEPTIONIST'),
  paymentController.crearDigital
);
paymentRoutes.post(
  '/payments/:id/verify',
  auth,
  requireRole('ADMIN', 'RECEPTIONIST'),
  paymentController.verificar
);

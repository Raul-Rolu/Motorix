/**
 * Ruta del panel de control (Sprint 4, T046, US4; contracts/api-rest.md).
 * EXCLUSIVA de administración (FR-016, RN-15); recepción y mecánico quedan
 * fuera desde el servidor.
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as dashboardController from '../controllers/dashboard-controller.js';

export const dashboardRoutes = Router();

dashboardRoutes.use(auth);

dashboardRoutes.get('/', requireRole('ADMIN'), dashboardController.panel);

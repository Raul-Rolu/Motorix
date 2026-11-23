/**
 * Rutas de mantenimientos (Sprint 3, T024; contracts/api-rest.md).
 * Consulta: recepción y administración (US4); registro: administración o
 * mecánico (US3); cumplimiento manual: los tres roles (aclaración Q1);
 * cancelación: solo administración con motivo (aclaración Q4, RN-15).
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as maintenanceController from '../controllers/maintenance-controller.js';

export const maintenanceRoutes = Router();

maintenanceRoutes.use(auth);

// 008 (FR-008): propuesta de próximo mantenimiento desde una orden. Se declara
// ANTES de las rutas con `/:id`; solo los roles que registran mantenimientos
// (ADMIN y MECHANIC; el mecánico solo sobre sus órdenes, validado en el servicio).
maintenanceRoutes.get(
  '/proposal',
  requireRole('ADMIN', 'MECHANIC'),
  maintenanceController.proponer
);
maintenanceRoutes.get(
  '/',
  requireRole('ADMIN', 'RECEPTIONIST'),
  maintenanceController.listar
);
maintenanceRoutes.post(
  '/',
  requireRole('ADMIN', 'MECHANIC'),
  maintenanceController.registrar
);
maintenanceRoutes.patch(
  '/:id/complete',
  requireRole('ADMIN', 'RECEPTIONIST', 'MECHANIC'),
  maintenanceController.completar
);
maintenanceRoutes.patch(
  '/:id/cancel',
  requireRole('ADMIN'),
  maintenanceController.cancelar
);

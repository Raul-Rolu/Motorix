/**
 * Rutas de vehículos (T058, US5/US6; contracts/api-rest.md).
 * Vehículos: ADMIN y RECEPTIONIST (FR-003).
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as vehicleController from '../controllers/vehicle-controller.js';
import * as orderController from '../controllers/order-controller.js';

export const vehicleRoutes = Router();

// Historial de servicios (Sprint 3, US1): consulta del personal del taller,
// incluye al mecánico; se registra antes de la restricción ADMIN/RECEPTIONIST.
vehicleRoutes.get(
  '/:id/history',
  auth,
  requireRole('ADMIN', 'RECEPTIONIST', 'MECHANIC'),
  orderController.historialVehiculo
);

vehicleRoutes.use(auth, requireRole('ADMIN', 'RECEPTIONIST'));

vehicleRoutes.get('/', vehicleController.listar);
vehicleRoutes.get('/:id', vehicleController.obtenerPorId);
vehicleRoutes.post('/', vehicleController.crear);
vehicleRoutes.put('/:id', vehicleController.editar);

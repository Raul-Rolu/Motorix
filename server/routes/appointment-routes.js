/**
 * Rutas de citas (T039, US1; contracts/api-rest.md).
 * ADMIN y RECEPTIONIST (RN-5, FR-001 a FR-003); el mecánico no accede.
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as appointmentController from '../controllers/appointment-controller.js';

export const appointmentRoutes = Router();

appointmentRoutes.use(auth, requireRole('ADMIN', 'RECEPTIONIST'));

appointmentRoutes.get('/', appointmentController.listar);
appointmentRoutes.get('/:id', appointmentController.obtenerPorId);
appointmentRoutes.post('/', appointmentController.crear);
appointmentRoutes.put('/:id', appointmentController.editar);
appointmentRoutes.patch('/:id/status', appointmentController.cambiarEstado);

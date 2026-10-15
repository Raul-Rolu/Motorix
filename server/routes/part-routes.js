/**
 * Rutas de refacciones e inventario (Sprint 3, T038; contracts/api-rest.md).
 * Consulta: los tres roles (el mecánico necesita el catálogo para sus órdenes
 * y ve solo activas); alta, edición, movimientos y auditoría: solo ADMIN (RN-15).
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as partController from '../controllers/part-controller.js';

export const partRoutes = Router();

partRoutes.use(auth);

partRoutes.get('/', requireRole('ADMIN', 'RECEPTIONIST', 'MECHANIC'), partController.listar);
// Auditoría de movimientos: solo administración (US6, FR-009).
partRoutes.get('/:id/movements', requireRole('ADMIN'), partController.historialMovimientos);
partRoutes.post('/', requireRole('ADMIN'), partController.crear);
partRoutes.put('/:id', requireRole('ADMIN'), partController.editar);
partRoutes.post('/:id/movements', requireRole('ADMIN'), partController.registrarMovimiento);

/**
 * Rutas del catálogo de tipos de servicio (008-configuracion-seguridad-reportes,
 * T037; FR-006, FR-010, CA-4, CA-10). La consulta de tipos activos es de los
 * tres roles (se eligen en las líneas de servicio); la administración es solo
 * de ADMIN y se valida en el servidor (RN-5, RN-15). No existe ruta de borrado:
 * un tipo usado nunca se elimina, solo se desactiva.
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as serviceTypeController from '../controllers/service-type-controller.js';

export const serviceTypeRoutes = Router();

serviceTypeRoutes.use(auth);

serviceTypeRoutes.get(
  '/',
  requireRole('ADMIN', 'RECEPTIONIST', 'MECHANIC'),
  serviceTypeController.listar
);
serviceTypeRoutes.post('/', requireRole('ADMIN'), serviceTypeController.crear);
serviceTypeRoutes.put('/:id', requireRole('ADMIN'), serviceTypeController.editar);
serviceTypeRoutes.patch('/:id/status', requireRole('ADMIN'), serviceTypeController.cambiarEstado);

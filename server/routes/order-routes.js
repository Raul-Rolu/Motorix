/**
 * Rutas de órdenes de servicio (T018, Sprint 2; contracts/api-rest.md).
 * Los tres roles pueden consultar; crear y administrar es de recepción
 * y administración (RN-15, research D6). La pertenencia del mecánico se
 * valida además en el servicio.
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as orderController from '../controllers/order-controller.js';

export const orderRoutes = Router();

orderRoutes.use(auth, requireRole('ADMIN', 'RECEPTIONIST', 'MECHANIC'));

orderRoutes.get('/', orderController.listar);
// Antes de '/:id': lista de mecánicos activos para la asignación (US4).
orderRoutes.get(
  '/mechanics',
  requireRole('ADMIN', 'RECEPTIONIST'),
  orderController.listarMecanicos
);
orderRoutes.get('/:id', orderController.obtenerPorId);
orderRoutes.post('/', requireRole('ADMIN', 'RECEPTIONIST'), orderController.crear);
orderRoutes.put(
  '/:id',
  requireRole('ADMIN', 'RECEPTIONIST'),
  orderController.editar
);
orderRoutes.patch(
  '/:id/assignment',
  requireRole('ADMIN', 'RECEPTIONIST'),
  orderController.asignar
);
orderRoutes.post('/:id/entries', orderController.agregarEntrada);
orderRoutes.post('/:id/services', orderController.agregarPartida);
orderRoutes.delete('/:id/services/:serviceId', orderController.borrarPartida);
// Refacciones de la orden (Sprint 3, US7): el rol permitido (ADMIN o el
// mecánico dueño) se valida además en el servicio (FORBIDDEN_ORDER, RN-15).
orderRoutes.post('/:id/parts', orderController.agregarRefaccion);
orderRoutes.delete('/:id/parts/:partId', orderController.retirarRefaccion);
// El rol permitido para cada transición lo decide la máquina de estados
// en el servicio (FR-012); aquí solo se exige estar autenticado.
orderRoutes.patch('/:id/status', orderController.cambiarEstado);

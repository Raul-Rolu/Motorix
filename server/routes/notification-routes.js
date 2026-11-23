/**
 * Rutas de avisos internos (007-notificaciones-internas, T017; contracts/api-rest.md).
 * Las consultan los tres roles; cada rol recibe solo los avisos que le
 * corresponden y eso se resuelve en el servicio con el usuario del token
 * (RN-5, RN-15). Las rutas de lectura y de clientes por avisar se agregan en
 * las historias US6 y US7.
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as notificationController from '../controllers/notification-controller.js';

export const notificationRoutes = Router();

notificationRoutes.use(auth);

notificationRoutes.get(
  '/',
  requireRole('ADMIN', 'RECEPTIONIST', 'MECHANIC'),
  notificationController.listar
);
// US6: los tres roles marcan SUS avisos como leídos; el servicio valida que la
// clave sea un aviso vigente del propio usuario.
notificationRoutes.post(
  '/reads',
  requireRole('ADMIN', 'RECEPTIONIST', 'MECHANIC'),
  notificationController.marcarLeido
);

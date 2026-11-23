/**
 * Rutas de clientes por avisar (007-notificaciones-internas, T064; contracts/api-rest.md).
 * Solo ADMIN y RECEPTIONIST (RN-5, RN-15): el mecánico recibe 403 desde el
 * servidor sin importar lo que muestre la interfaz. Router independiente,
 * montado en `/api/client-notices` (un router por recurso).
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as clientNoticeController from '../controllers/client-notice-controller.js';

export const clientNoticeRoutes = Router();

clientNoticeRoutes.use(auth, requireRole('ADMIN', 'RECEPTIONIST'));

clientNoticeRoutes.get('/pending', clientNoticeController.pendientes);
clientNoticeRoutes.post('/', clientNoticeController.marcar);

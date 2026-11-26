/**
 * Rutas de los reportes (008-configuracion-seguridad-reportes, T117; FR-028,
 * CA-10). EXCLUSIVAS de ADMIN y de solo lectura: la autorización se valida en el
 * servidor (RN-15) y pasan por `auth`, así que respetan la compuerta de términos.
 * Consultas JSON de los cinco reportes y su exportación CSV (`/:reporte/export`,
 * T139). No existen rutas de escritura.
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as reportController from '../controllers/report-controller.js';

export const reportRoutes = Router();

reportRoutes.use(auth, requireRole('ADMIN'));

reportRoutes.get('/income', reportController.ingresos);
reportRoutes.get('/services', reportController.servicios);
reportRoutes.get('/productivity', reportController.productividad);
reportRoutes.get('/parts', reportController.refacciones);
reportRoutes.get('/rotation', reportController.rotacion);
reportRoutes.get('/:reporte/export', reportController.exportar);

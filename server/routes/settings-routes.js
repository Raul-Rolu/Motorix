/**
 * Rutas de configuración (008-configuracion-seguridad-reportes, T020; FR-002,
 * FR-010, CA-10). Toda la sección es exclusiva del rol ADMIN y la autorización se
 * valida en el servidor, nunca solo en la interfaz (RN-5, RN-15).
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as settingsController from '../controllers/settings-controller.js';

export const settingsRoutes = Router();

settingsRoutes.use(auth, requireRole('ADMIN'));

settingsRoutes.get('/', settingsController.consultar);
settingsRoutes.put('/', settingsController.actualizar);

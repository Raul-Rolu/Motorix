/**
 * Rutas de la bitácora (008-configuracion-seguridad-reportes, T069; FR-014,
 * CA-20). Solo ADMIN consulta, validado en el servidor (RN-5, RN-15). Es de
 * solo lectura: no existen rutas para crear, editar, borrar ni exportar entradas.
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as auditController from '../controllers/audit-controller.js';

export const auditRoutes = Router();

auditRoutes.use(auth, requireRole('ADMIN'));

auditRoutes.get('/', auditController.listar);

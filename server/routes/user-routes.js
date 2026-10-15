/**
 * Rutas de usuarios (T036, US2; contracts/api-rest.md).
 * Toda la sección está reservada al rol ADMIN; la autorización se valida en el
 * servidor, nunca solo en la interfaz (RN-5, RN-15).
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as userController from '../controllers/user-controller.js';

export const userRoutes = Router();

userRoutes.use(auth, requireRole('ADMIN'));

userRoutes.get('/', userController.listar);
userRoutes.get('/:id', userController.obtenerPorId);
userRoutes.post('/', userController.crear);
userRoutes.put('/:id', userController.editar);
userRoutes.patch('/:id/status', userController.cambiarEstado);

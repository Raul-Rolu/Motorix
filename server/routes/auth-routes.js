/**
 * Rutas de autenticación (T026, US1; contracts/api-rest.md).
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import * as authController from '../controllers/auth-controller.js';

export const authRoutes = Router();

authRoutes.post('/login', authController.login);
authRoutes.post('/change-password', auth, authController.changePassword);
authRoutes.post('/logout', auth, authController.logout);

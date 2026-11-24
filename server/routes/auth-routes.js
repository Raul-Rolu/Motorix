/**
 * Rutas de autenticación (T026, US1; contracts/api-rest.md).
 */
import { Router } from 'express';
import { auth, authBase } from '../middlewares/auth.js';
import * as authController from '../controllers/auth-controller.js';

export const authRoutes = Router();

authRoutes.post('/login', authController.login);
authRoutes.post('/change-password', auth, authController.changePassword);
authRoutes.post('/logout', authBase, authController.logout);
// 008 (FR-016): única ruta que renueva el token. Con `authBase` (sin compuerta de
// términos) para que la sesión siga viva mientras el usuario lee y acepta (T093).
authRoutes.post('/renew', authBase, authController.renew);

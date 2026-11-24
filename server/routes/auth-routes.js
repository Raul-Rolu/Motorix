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
// 008 (FR-016): única ruta que renueva el token. Por ahora con `auth`; el tramo de
// términos la pasa a `authBase` para que siga abierta sin aceptación (T093).
authRoutes.post('/renew', auth, authController.renew);

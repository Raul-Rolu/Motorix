/**
 * Ruta GET /api/me: devuelve el usuario de la sesión actual
 * (pantalla de inicio; contracts/api-rest.md).
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { ok } from '../utils/responses.js';
import { asyncHandler } from '../middlewares/error-handler.js';

export const meRoutes = Router();

meRoutes.get('/', auth, asyncHandler(async (req, res) => ok(res, req.user)));

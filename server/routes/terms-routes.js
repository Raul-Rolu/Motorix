/**
 * Rutas de los términos y condiciones (008-configuracion-seguridad-reportes,
 * T092; FR-019 a FR-022, CA-16 a CA-18).
 *
 * Consultar la vigente y aceptarla usan `authBase` (sin compuerta): son justo lo
 * que el usuario necesita para salir del bloqueo. Publicar y consultar las
 * aceptaciones usan `auth` (con compuerta) y son solo de ADMIN. No hay rutas de
 * edición ni de borrado.
 */
import { Router } from 'express';
import { auth, authBase } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as termsController from '../controllers/terms-controller.js';

export const termsRoutes = Router();

termsRoutes.get('/current', authBase, termsController.consultarVigente);
termsRoutes.post('/accept', authBase, termsController.aceptar);

termsRoutes.post('/', auth, requireRole('ADMIN'), termsController.publicar);
termsRoutes.get('/acceptances', auth, requireRole('ADMIN'), termsController.listarAceptaciones);

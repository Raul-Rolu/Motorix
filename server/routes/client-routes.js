/**
 * Rutas de clientes (T045, US3/US4; contracts/api-rest.md).
 * Clientes: ADMIN y RECEPTIONIST; el rol MECHANIC queda fuera (FR-003).
 */
import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { requireRole } from '../middlewares/require-role.js';
import * as clientController from '../controllers/client-controller.js';
import { validarIdentificadoresDeRuta } from '../middlewares/route-params.js';

export const clientRoutes = Router();
validarIdentificadoresDeRuta(clientRoutes);

clientRoutes.use(auth, requireRole('ADMIN', 'RECEPTIONIST'));

clientRoutes.get('/', clientController.listar);
clientRoutes.get('/:id', clientController.obtenerPorId);
clientRoutes.post('/', clientController.crear);
clientRoutes.put('/:id', clientController.editar);
clientRoutes.patch('/:id/status', clientController.cambiarEstado);

/**
 * Aplicación Express (T017, Principio II y VI).
 *
 * Monta la salud del servicio, los ruteadores de cada módulo y el manejo
 * centralizado de errores (que debe ir SIEMPRE al final).
 */
import express from 'express';
import { getPool } from './config/db.js';
import { errorHandler } from './middlewares/error-handler.js';
import { authRoutes } from './routes/auth-routes.js';
import { userRoutes } from './routes/user-routes.js';
import { clientRoutes } from './routes/client-routes.js';
import { vehicleRoutes } from './routes/vehicle-routes.js';
import { orderRoutes } from './routes/order-routes.js';
import { appointmentRoutes } from './routes/appointment-routes.js';
import { maintenanceRoutes } from './routes/maintenance-routes.js';
import { partRoutes } from './routes/part-routes.js';
import { paymentRoutes } from './routes/payment-routes.js';
import { ticketRoutes } from './routes/ticket-routes.js';
import { dashboardRoutes } from './routes/dashboard-routes.js';
import { meRoutes } from './routes/me-routes.js';

export function crearApp() {
  const app = express();

  app.use(express.json());

  // Salud del servicio y de la conexión a la base de datos.
  app.get('/api/health', async (req, res) => {
    let baseDatos = 'ok';
    try {
      await getPool().query('SELECT 1');
    } catch {
      baseDatos = 'error';
    }
    res.json({
      servicio: 'motorix-api',
      estado: baseDatos === 'ok' ? 'ok' : 'degradado',
      baseDatos,
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/clients', clientRoutes);
  app.use('/api/vehicles', vehicleRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/appointments', appointmentRoutes);
  app.use('/api/maintenances', maintenanceRoutes);
  app.use('/api/parts', partRoutes);
  // Pagos: los rutas propias incluyen /orders/:id/payments (Sprint 4, T016).
  app.use('/api', paymentRoutes);
  app.use('/api/tickets', ticketRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/me', meRoutes);

  // Manejo centralizado de errores (al final de la cadena).
  app.use(errorHandler);

  return app;
}

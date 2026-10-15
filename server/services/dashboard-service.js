/**
 * Servicio del panel de control (Sprint 4, T045, US4; FR-014 a FR-016).
 *
 * Solo ADMIN consulta el panel (RN-15, validado en la ruta). Todas las
 * cifras se derivan al vuelo (research D7) y el dinero cobrado solo suma
 * pagos COMPLETED (FR-007 del spec, SC-007); los cobros digitales viejos
 * caducan de forma perezosa antes de contarse (FR-009).
 */
import * as dashboardModel from '../models/dashboard.js';
import * as maintenanceModel from '../models/maintenance.js';
import * as paymentModel from '../models/payment.js';
import { esVencido } from './maintenance-state.js';

/** Panel completo con los agregados del negocio. */
export async function obtenerPanel() {
  // Expiración perezosa global: el panel es un evento de consulta (FR-009).
  await paymentModel.expireStaleDigitalGlobal();

  const [
    ordenes,
    citas,
    mantenimientosPendientes,
    kmPorVehiculo,
    stockBajo,
    cobrosHoy,
    cobrosTotal,
    digitalesPendientes,
  ] = await Promise.all([
    dashboardModel.contarOrdenesPorEstado(),
    dashboardModel.contarCitas(),
    dashboardModel.findPendientes(),
    maintenanceModel.findCurrentMileageByVehicles(),
    dashboardModel.contarStockBajo(),
    paymentModel.sumCompletedToday(),
    paymentModel.sumCompletedTotal(),
    paymentModel.countPendingDigital(),
  ]);

  // RN-11: vencido se deriva del PENDING al evaluar sus umbrales (D2 Sprint 3).
  const vencidos = mantenimientosPendientes.filter((mantenimiento) =>
    esVencido(mantenimiento, kmPorVehiculo.get(mantenimiento.vehicleId) ?? 0)
  ).length;

  return {
    ordenes,
    citas,
    mantenimientos: {
      vencidos,
      proximos: mantenimientosPendientes.length - vencidos,
    },
    inventario: {
      stockBajo,
    },
    cobros: {
      hoy: cobrosHoy,
      total: cobrosTotal,
      pendientesDigitales: digitalesPendientes,
    },
  };
}

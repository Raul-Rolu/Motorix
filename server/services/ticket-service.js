/**
 * Servicio de tickets de servicio (Sprint 4, T033, US3; FR-011 a FR-013).
 *
 * El ticket se emite bajo demanda con folio único `TCK-AAAA-NNNN` (research
 * D4) y su contenido se deriva al vuelo: nunca se persisten importes ni
 * datos del comprobante, de modo que el ticket siempre refleja el estado de
 * cobro más reciente (CA-4). Una orden cancelada no admite ticket (FR-020).
 */
import * as ticketModel from '../models/ticket.js';
import * as orderModel from '../models/order.js';
import * as vehicleModel from '../models/vehicle.js';
import * as paymentService from './payment-service.js';
import { generarFolio } from './ticket-folio.js';
import { errores } from '../utils/errors.js';

/** Datos del taller que encabezado cada ticket (constante del negocio). */
export const TALLER = {
  nombre: 'Motorix',
  direccion: 'Av. Taller 123, Col. Centro',
  telefono: '555-000-0000',
};

/**
 * Emite el ticket si aún no existe; en caso contrario reutiliza el mismo
 * folio (nunca se duplican comprobantes por orden).
 */
async function emitirSiFalta(orderId, issuedBy) {
  const existente = await ticketModel.findByOrder(orderId);
  if (existente) {
    return existente;
  }
  const anio = new Date().getFullYear();
  // Reintento amable ante una carrera entre dos emisiones simultáneas: la
  // UNIQUE de folio rechaza la segunda y se asigna la secuencia siguiente.
  for (let intento = 0; intento < 3; intento += 1) {
    const secuencia = (await ticketModel.countByYear(anio)) + 1 + intento;
    try {
      return await ticketModel.create({
        orderId,
        folio: generarFolio(anio, secuencia),
        issuedBy,
      });
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') {
        throw error;
      }
    }
  }
  throw errores.datosInvalidos('No se pudo asignar un folio de ticket; intente de nuevo.');
}

/**
 * Contenido completo del ticket de una orden (CA-4): lo emite si falta y lo
 * deriva siempre de los datos vivos de la orden y sus pagos (research D2/D4).
 */
export async function obtenerContenido(orderId, usuario) {
  // Valida la orden (404) y rechaza canceladas (409, FR-020).
  await paymentService.obtenerOrdenParaCobro(orderId);
  const ticket = await emitirSiFalta(orderId, usuario?.id ?? null);

  const orden = await orderModel.findById(orderId);
  const vehiculo = await vehicleModel.findById(orden.vehicleId);
  const [servicios, manoDeObra, refacciones, totales, resumen] =
    await Promise.all([
      orderModel.findServices(orderId),
      orderModel.findLabor(orderId),
      orderModel.findOrderParts(orderId),
      orderModel.findTotals(orderId),
      // Reutiliza los saldos y el estado de cobro del módulo de pagos (D2);
      // además aplica la expiración perezosa de los cobros digitales (D3).
      paymentService.listar(orderId),
    ]);

  return {
    folio: ticket.folio,
    fecha: ticket.issuedAt,
    taller: TALLER,
    cliente: {
      id: vehiculo.duenio.id,
      nombreCompleto: vehiculo.duenio.fullName,
    },
    vehiculo: {
      id: orden.vehicleId,
      marca: vehiculo.brand,
      modelo: vehiculo.model,
      anio: vehiculo.year,
      placas: vehiculo.plates,
      kilometraje: orden.mileageEntry,
    },
    servicios: servicios.map((partida) => ({
      nombre: partida.description,
      precio: partida.amount,
    })),
    // Sin precio unitario en el inventario actual: solo cantidad (CA-4).
    refacciones: refacciones.map((refaccion) => ({
      nombre: refaccion.nombre,
      codigo: refaccion.code,
      cantidad: refaccion.quantity,
    })),
    manoObra: totales.labor,
    subtotal: totales.grand,
    total: totales.grand,
    metodosDePago: resumen.datos.map((pago) => ({
      metodo: pago.metodo,
      monto: pago.monto,
      estado: pago.estado,
    })),
    estadoPago: resumen.estadoCobro,
    saldoPendiente: resumen.saldoPendiente,
  };
}

/**
 * Servicio de pagos (Sprint 4, T013, US1).
 * RN-13: todo pago pertenece a una orden existente; una orden cancelada no
 * admite pagos (FR-020). Los pagos son inmutables (FR-006): no se editan ni
 * se eliminan. El saldo se deriva del total de la orden menos los pagos
 * COMPLETED (FR-003/FR-004, research D2); los pendientes y expirados jamás
 * cuentan (FR-009, SC-007).
 */
import * as paymentModel from '../models/payment.js';
import * as orderModel from '../models/order.js';
import * as orderService from './order-service.js';
import * as paymentGateway from './payment-gateway.js';
import { errores } from '../utils/errors.js';
import { randomUUID } from 'node:crypto';

/** Redondeo a centavos para comparar importes sin error de coma flotante. */
function redondear(valor) {
  return Math.round(valor * 100) / 100;
}

/**
 * ¿Un cobro digital ya superó el plazo de caducidad? (FR-009, research D3).
 * Función pura con reloj inyectable para pruebas deterministas (T022).
 */
export function debeCaducar(createdAt, ahora = new Date()) {
  const creado = new Date(createdAt).getTime();
  return ahora.getTime() - creado > paymentModel.HORAS_CADUCIDAD_DIGITAL * 3600 * 1000;
}

/** Presentación de un pago según el contrato (contracts/api-rest.md). */
export function aPresentacion(pago) {
  return {
    id: pago.id,
    metodo: pago.method,
    monto: pago.amount,
    estado: pago.status,
    externalReference: pago.externalReference,
    registradoPor: pago.createdBy
      ? { id: pago.createdBy, nombreCompleto: pago.createdByName }
      : null,
    fecha: pago.createdAt,
  };
}

/** Estado de cobro derivado: una orden sin importes se muestra liquidada (caso límite del spec). */
export function estadoCobroDe(total, cobrado) {
  if (total <= 0) {
    return 'LIQUIDADA';
  }
  if (cobrado <= 0) {
    return 'PENDIENTE';
  }
  return cobrado >= total ? 'LIQUIDADA' : 'PARCIAL';
}

/** Orden existente y no cancelada para operaciones de cobro (FR-020). */
export async function obtenerOrdenParaCobro(orderId) {
  const orden = await orderModel.findById(orderId);
  if (!orden) {
    throw errores.ordenNoEncontrada();
  }
  if (orden.status === 'CANCELADA') {
    throw errores.ordenCancelada();
  }
  return orden;
}

/** Pagos de la orden con total, cobrado, saldo y estado derivados (FR-003/FR-004). */
export async function listar(orderId) {
  await obtenerOrdenParaCobro(orderId);
  // Expiración perezosa: los cobros digitales viejos pasan a EXPIRED (FR-009).
  await paymentModel.expireStaleDigital(orderId);
  const [pagos, total, cobrado] = await Promise.all([
    paymentModel.findByOrder(orderId),
    orderService.obtenerTotalOrden(orderId),
    paymentModel.sumCompletedByOrder(orderId),
  ]);
  const saldoPendiente = redondear(Math.max(total - cobrado, 0));
  return {
    total: redondear(total),
    cobrado: redondear(cobrado),
    saldoPendiente,
    estadoCobro: estadoCobroDe(total, cobrado),
    datos: pagos.map(aPresentacion),
  };
}

/** Registra un pago manual: nace COMPLETED y no excede el saldo (FR-001, D1). */
export async function registrar(orderId, datos, usuario) {
  await obtenerOrdenParaCobro(orderId);
  const total = await orderService.obtenerTotalOrden(orderId);
  const cobrado = await paymentModel.sumCompletedByOrder(orderId);
  const saldoPendiente = redondear(total - cobrado);
  const monto = redondear(Number(datos.monto));
  if (monto > saldoPendiente) {
    throw errores.pagoExcedeSaldo(Math.max(saldoPendiente, 0));
  }
  const pago = await paymentModel.create({
    orderId,
    method: datos.metodo,
    amount: monto,
    status: 'COMPLETED',
    createdBy: usuario.id,
  });
  return aPresentacion(pago);
}

/** Un pago concreto por su identificador (contrato GET /api/payments/:id). */
export async function obtenerPorId(paymentId) {
  const pago = await paymentModel.findById(paymentId);
  if (!pago) {
    throw errores.pagoNoEncontrado();
  }
  return aPresentacion(pago);
}

/**
 * Crea un cobro digital con Mercado Pago en modo sandbox (FR-008, FR-017).
 * La preferencia se crea ANTES de registrar el pago: un fallo del proveedor
 * no deja pagos incompletos (escenario 5 de la US2, research D6). Solo puede
 * haber un cobro digital vigente por orden (PAYMENT_DUPLICATE_PENDING).
 */
export async function crearCobroDigital(orderId, datos, usuario) {
  await obtenerOrdenParaCobro(orderId);

  const existente = await paymentModel.findPendingDigitalByOrder(orderId);
  if (existente) {
    throw errores.cobroDigitalDuplicado();
  }

  const total = await orderService.obtenerTotalOrden(orderId);
  const cobrado = await paymentModel.sumCompletedByOrder(orderId);
  const saldoPendiente = redondear(total - cobrado);
  const monto = redondear(Number(datos.monto));
  if (monto > saldoPendiente) {
    throw errores.pagoExcedeSaldo(Math.max(saldoPendiente, 0));
  }

  const referencia = `MP-${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  let preferencia;
  try {
    preferencia = await paymentGateway.crearPreferencia({ monto, ordenId: orderId, referencia });
  } catch {
    throw errores.errorProveedorPago();
  }

  const pago = await paymentModel.create({
    orderId,
    method: 'MERCADO_PAGO',
    amount: monto,
    status: 'PENDING',
    externalReference: preferencia.referencia,
    createdBy: usuario.id,
  });

  return {
    id: pago.id,
    estado: pago.status,
    monto: pago.amount,
    enlace: preferencia.enlace,
  };
}

/**
 * Verifica un cobro digital con el proveedor bajo demanda (decisión Q1; no
 * hay notificaciones entrantes). La caducidad (>24 h) tiene prioridad: el
 * cobro deja de verificarse y pasa a EXPIRED (FR-009). La confirmación usa
 * la transición única PENDING → COMPLETED, de modo que los reintentos del
 * proveedor jamás duplican el importe (FR-010).
 */
export async function verificarCobro(paymentId) {
  const pago = await paymentModel.findById(paymentId);
  if (!pago) {
    throw errores.pagoNoEncontrado();
  }
  if (pago.method !== 'MERCADO_PAGO' || pago.status !== 'PENDING') {
    throw errores.pagoNoModificable(pago.status);
  }

  if (debeCaducar(pago.createdAt)) {
    await paymentModel.transitionFromPending(pago.id, 'EXPIRED');
    return aPresentacion(await paymentModel.findById(pago.id));
  }

  let resultado;
  try {
    resultado = await paymentGateway.consultarEstado(pago.externalReference);
  } catch {
    throw errores.errorProveedorPago();
  }

  if (resultado.confirmado) {
    await paymentModel.transitionFromPending(pago.id, 'COMPLETED');
  }
  return aPresentacion(await paymentModel.findById(pago.id));
}

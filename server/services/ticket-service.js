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
import { obtenerAjustes, tallerDe } from './settings-service.js';
import { calcularProximoServicio } from '../utils/next-service.js';
import { errores } from '../utils/errors.js';

/**
 * «Próximo servicio» del ticket (008, FR-009, CA-14): solo para tickets CON
 * instantánea (emitidos desde este sprint; los anteriores no cambian). Se deriva
 * de los tipos de servicio con intervalo de las líneas de la orden: fecha =
 * fecha local de emisión del ticket + el menor intervalo en días; kilometraje =
 * kilometraje de entrada de la orden + el menor intervalo en km. Devuelve null
 * (y el campo no aparece) si no hay tipos con intervalo.
 */
async function proximoServicioDelTicket(ticket, orden) {
  if (ticket.shopName === null) {
    return null;
  }
  const tipos = await orderModel.findServicesWithTypes(orden.id);
  return calcularProximoServicio({
    tipos,
    kilometrajeBase: orden.mileageEntry,
    fechaBase: new Date(ticket.issuedAt),
  });
}

/**
 * Datos del taller del encabezado del ticket (008, FR-003, CA-1, CA-3): los de la
 * instantánea guardada al emitirlo si existe (los tickets con instantánea no
 * cambian al editar la configuración) o, en los tickets anteriores al sprint,
 * los ajustes vigentes (con valores de respaldo).
 */
async function tallerDelTicket(ticket) {
  if (ticket.shopName !== null) {
    return {
      nombre: ticket.shopName,
      direccion: ticket.shopAddress ?? '',
      telefono: ticket.shopPhone ?? '',
    };
  }
  return tallerDe(await obtenerAjustes());
}

/**
 * Emite el ticket si aún no existe; en caso contrario reutiliza el mismo
 * folio (nunca se duplican comprobantes por orden). Al emitir guarda una
 * instantánea del taller con los ajustes vigentes (008, FR-003).
 */
async function emitirSiFalta(orderId, issuedBy) {
  const existente = await ticketModel.findByOrder(orderId);
  if (existente) {
    return existente;
  }
  const taller = tallerDe(await obtenerAjustes());
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
        taller,
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
 *
 * 005-precio-venta-refacciones: en una orden NO liquidada con total incompleto
 * NO se emite ni se consulta el ticket (`TOTAL_INCOMPLETO` 409 con la lista de
 * refacciones en `details`, FR-010/CA-10); en una orden ya liquidadas se emite
 * sin bloqueo con su total histórico y las líneas sin precio marcadas
 * `sinPrecio` (FR-016, CA-21). El bloque `refacciones` lleva `unitPrice` y
 * `amount` por línea (CA-13) y el total es idéntico al de la orden (CA-14).
 */
export async function obtenerContenido(orderId, usuario) {
  // Valida la orden (404) y rechaza canceladas (409, FR-020).
  await paymentService.obtenerOrdenParaCobro(orderId);
  // Resumen de cobro primero: aplica la expiración perezosa (D3) y da el
  // estado con el que se decide el bloqueo.
  const [resumen, totales] = await Promise.all([
    paymentService.listar(orderId),
    orderModel.findTotals(orderId),
  ]);

  // Bloqueo SOLO en órdenes no liquidadas (FR-010 vs FR-016) y antes de
  // emitir: la emisión automática se omite en ese caso (CA-10).
  if (!totales.totalCompleto && resumen.estadoCobro !== 'LIQUIDADA') {
    const faltantes = await orderModel.findOrderPartsSinPrecio(orderId);
    throw errores.totalIncompleto(faltantes);
  }

  const ticket = await emitirSiFalta(orderId, usuario?.id ?? null);
  const orden = await orderModel.findById(orderId);
  const vehiculo = await vehicleModel.findById(orden.vehicleId);
  const [servicios, refacciones] = await Promise.all([
    orderModel.findServices(orderId),
    orderModel.findOrderParts(orderId),
  ]);

  const proximoServicio = await proximoServicioDelTicket(ticket, orden);

  return {
    folio: ticket.folio,
    fecha: ticket.issuedAt,
    taller: await tallerDelTicket(ticket),
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
    // Desglose con precio congelado e importe por línea (005, CA-13); en una
    // orden liquidada los usos heredados llegan como unitPrice/amount nulos
    // con `sinPrecio: true` (FR-016, CA-21).
    refacciones: refacciones.map((refaccion) => ({
      nombre: refaccion.nombre,
      codigo: refaccion.code,
      cantidad: refaccion.quantity,
      unitPrice: refaccion.unitPrice,
      amount: refaccion.amount,
      sinPrecio: refaccion.unitPrice === null,
    })),
    manoObra: totales.labor,
    subtotal: totales.grand,
    total: totales.grand,
    totalCompleto: totales.totalCompleto,
    metodosDePago: resumen.datos.map((pago) => ({
      metodo: pago.metodo,
      monto: pago.monto,
      estado: pago.estado,
    })),
    estadoPago: resumen.estadoCobro,
    saldoPendiente: resumen.saldoPendiente,
    // El campo se omite cuando no hay próximo servicio: los tickets anteriores
    // y los sin tipos conservan exactamente el cuerpo de siempre.
    ...(proximoServicio ? { proximoServicio } : {}),
  };
}

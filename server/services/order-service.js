/**
 * Servicio de órdenes de servicio (T016, Sprint 2).
 * RN-2: el cliente se deriva del vehículo (nunca se envía en el payload).
 * RN-4: el kilometraje se valida contra el último registrado del vehículo;
 * una corrección explícita se persiste como constancia (research D4).
 */
import * as orderModel from '../models/order.js';
import * as vehicleModel from '../models/vehicle.js';
import * as clientModel from '../models/client.js';
import * as userModel from '../models/user.js';
import * as inventoryModel from '../models/inventory.js';
import { errores } from '../utils/errors.js';
import {
  transicionValida,
  estadosSiguientes,
} from './order-state.js';

/**
 * Listado con visibilidad por rol (RN-15): el mecánico solo ve sus órdenes;
 * recepción y administración ven todas con filtros de estado y texto.
 */
export async function listar(filtros = {}, usuario) {
  const mechanicId = usuario.role === 'MECHANIC' ? usuario.id : null;
  return orderModel.findAll({
    estado: filtros.estado || null,
    texto: filtros.texto || null,
    mechanicId,
  });
}

/** Valida que el vehículo exista y su propietario esté activo (RN-2). */
async function obtenerVehiculoValido(vehicleId) {
  const vehiculo = await vehicleModel.findById(vehicleId);
  if (!vehiculo || vehiculo.duenio?.active === false) {
    throw errores.vehiculoNoDisponible();
  }
  return vehiculo;
}

/** Valida el mecánico: usuario activo con rol MECHANIC (o liberar con null). */
async function validarMecanico(mechanicId) {
  if (mechanicId == null) {
    return null;
  }
  const mecanico = await userModel.findById(mechanicId);
  if (!mecanico || !mecanico.active || mecanico.role !== 'MECHANIC') {
    throw errores.mecanicoInvalido();
  }
  return mecanico.id;
}

/** Orden bloqueada en estados finales (RN-9, research D7). */
function verificarOrdenNoBloqueada(orden) {
  if (orden.status === 'ENTREGADO' || orden.status === 'CANCELADA') {
    throw errores.ordenBloqueada(
      `La orden está ${orden.status} y no admite cambios (RN-9).`
    );
  }
}

export async function crear(datos, usuario) {
  const vehicleId = Number(datos.vehicleId);
  const vehiculo = await obtenerVehiculoValido(vehicleId);

  const mileageEntry = Number(datos.mileageEntry);
  const mileageCorrection = datos.mileageCorrection === true;
  const previo = await orderModel.findLastMileageByVehicle(vehicleId);
  if (previo != null && mileageEntry < Number(previo) && !mileageCorrection) {
    throw errores.kilometrajeInvalido(
      `El kilometraje (${mileageEntry}) es menor al de la última orden del vehículo (${Number(previo)}); active la corrección explícita si corresponde.`
    );
  }

  const mechanicId = await validarMecanico(
    datos.mechanicId == null ? null : Number(datos.mechanicId)
  );

  return orderModel.create({
    clientId: vehiculo.clientId,
    vehicleId,
    mechanicId,
    mileageEntry,
    mileageCorrection,
    reason: datos.reason.trim(),
    notes: datos.notes ? datos.notes.trim() : null,
    createdBy: usuario.id,
  });
}

/** Mecánicos activos para el selector de asignación (FR-008, US4). */
export async function listarMecanicos() {
  return userModel.findMechanics();
}

/**
 * Carga la orden para operarla: existe (ORDEN_NO_ENCONTRADA), es del
 * mecánico que la pide (NO_AUTORIZADO) y no está cerrada (ORDEN_BLOQUEADA).
 */
async function obtenerOrdenOperable(id, usuario) {
  const orden = await orderModel.findById(id);
  if (!orden) {
    throw errores.ordenNoEncontrada();
  }
  if (usuario.role === 'MECHANIC' && orden.mechanicId !== usuario.id) {
    throw errores.noAutorizado();
  }
  verificarOrdenNoBloqueada(orden);
  return orden;
}

/**
 * Agrega una entrada fechada: diagnóstico, observación o recomendación
 * (FR-011/FR-014, Clarificación 5). Historial inmutable.
 */
export async function agregarEntrada(id, datos, usuario) {
  await obtenerOrdenOperable(id, usuario);
  return orderModel.createEntry({
    orderId: id,
    entryType: datos.entryType,
    content: datos.content.trim(),
    createdBy: usuario.id,
  });
}

/**
 * Agrega una partida de servicio o mano de obra; requiere haber avanzado a
 * DIAGNOSTICO (FR-011). Los importes son informativos (sin pagos).
 */
export async function agregarPartida(id, datos, usuario) {
  const orden = await obtenerOrdenOperable(id, usuario);
  if (orden.status === 'RECIBIDO') {
    throw errores.datosInvalidos(
      'La orden debe haber avanzado a DIAGNOSTICO antes de registrar servicios o mano de obra (FR-011).'
    );
  }
  return orderModel.createPart({
    orderId: id,
    description: datos.description.trim(),
    amount: Number(datos.amount),
    kind: datos.kind,
  });
}

/** Corrige una partida agregada por error (solo antes de cerrar la orden). */
export async function borrarPartida(id, partidaId, usuario) {
  await obtenerOrdenOperable(id, usuario);
  const partida = await orderModel.findPart(id, partidaId);
  if (!partida) {
    throw errores.recursoNoEncontrado('La partida');
  }
  await orderModel.deletePart(id, partidaId);
  return partida;
}

/**
 * Edita motivo, notas y/o kilometraje con corrección (PUT; solo estados de
 * trabajo, RN-4/RN-9). El cliente y el vehículo no se modifican.
 */
export async function editar(id, datos) {
  const orden = await orderModel.findById(id);
  if (!orden) {
    throw errores.ordenNoEncontrada();
  }
  verificarOrdenNoBloqueada(orden);

  const mileageEntry =
    datos.mileageEntry != null ? Number(datos.mileageEntry) : orden.mileageEntry;
  const mileageCorrection =
    datos.mileageCorrection != null
      ? datos.mileageCorrection === true
      : orden.mileageCorrection;

  const previo = await orderModel.findLastMileageByVehicle(
    orden.vehicleId,
    id
  );
  if (previo != null && mileageEntry < Number(previo) && !mileageCorrection) {
    throw errores.kilometrajeInvalido(
      `El kilometraje (${mileageEntry}) es menor al de la última orden del vehículo (${Number(previo)}); active la corrección explícita si corresponde.`
    );
  }

  return orderModel.update(id, {
    reason: datos.reason.trim(),
    notes: datos.notes ? datos.notes.trim() : null,
    mileageEntry,
    mileageCorrection,
  });
}

/**
 * Cambia el estado según la máquina de estados (FR-012, research D2):
 * valida rol y pertenencia, gestiona `previous_state` al pausar/retomar
 * ESPERANDO_REFACCION y guarda el motivo al cancelar. Las órdenes
 * ENTREGADO/CANCELADA no admiten cambios (RN-9).
 */
export async function cambiarEstado(id, datos, usuario) {
  const orden = await orderModel.findById(id);
  if (!orden) {
    throw errores.ordenNoEncontrada();
  }
  if (usuario.role === 'MECHANIC' && orden.mechanicId !== usuario.id) {
    throw errores.noAutorizado();
  }
  verificarOrdenNoBloqueada(orden);

  const estadoNuevo = datos.status;
  const esDuenio = orden.mechanicId === usuario.id;
  const resultado = transicionValida({
    estadoActual: orden.status,
    estadoNuevo,
    rol: usuario.role,
    esDuenio,
    estadoOrigenPausa: orden.previousState,
  });

  if (!resultado.valido) {
    const opciones = estadosSiguientes({
      estadoActual: orden.status,
      rol: usuario.role,
      estadoOrigenPausa: orden.previousState,
    });
    const sugerencia =
      opciones.length > 0 ? ` Opciones válidas: ${opciones.join(', ')}.` : '';
    throw errores.transicionInvalida(`${resultado.motivo}${sugerencia}`);
  }

  // previous_state: se guarda al entrar a la pausa y se limpia al salir.
  let previousState = orden.previousState;
  if (estadoNuevo === 'ESPERANDO_REFACCION') {
    previousState = orden.status;
  } else if (orden.status === 'ESPERANDO_REFACCION') {
    previousState = null;
  }

  const cancellationReason =
    estadoNuevo === 'CANCELADA'
      ? (datos.cancellationReason ?? orden.cancellationReason ?? null)
      : orden.cancellationReason;

  return orderModel.setStatus(id, {
    status: estadoNuevo,
    previousState,
    cancellationReason,
  });
}

/**
 * Asigna, reasigna o libera el mecánico de la orden (FR-009, Clarificación 4).
 * Solo recepción/administración llegan aquí (la ruta lo restringe) y las
 * órdenes ENTREGADO/CANCELADA no admiten cambios (RN-9).
 */
export async function asignarMecanico(id, mechanicId) {
  const orden = await orderModel.findById(id);
  if (!orden) {
    throw errores.ordenNoEncontrada();
  }
  verificarOrdenNoBloqueada(orden);
  const idMecanico = await validarMecanico(
    mechanicId == null ? null : Number(mechanicId)
  );
  return orderModel.setMechanic(id, idMecanico);
}

/**
 * Detalle completo de la orden (FR-015): cliente, vehículo, mecánico,
 * entradas fechadas, partidas y totales informativos.
 * El mecánico solo puede consultar sus propias órdenes (RN-15).
 */
export async function obtenerPorId(id, usuario) {
  const orden = await orderModel.findById(id);
  if (!orden) {
    throw errores.ordenNoEncontrada();
  }
  if (usuario.role === 'MECHANIC' && orden.mechanicId !== usuario.id) {
    throw errores.noAutorizado();
  }

  const [vehiculo, cliente, entradas, servicios, manoDeObra, totales, refaccionesOrden] =
    await Promise.all([
      vehicleModel.findById(orden.vehicleId),
      clientModel.findById(orden.clientId),
      orderModel.findEntries(id),
      orderModel.findServices(id),
      orderModel.findLabor(id),
      orderModel.findTotals(id),
      orderModel.findOrderParts(id),
    ]);

  let mecanico = null;
  if (orden.mechanicId != null) {
    const usuarioMecanico = await userModel.findById(orden.mechanicId);
    if (usuarioMecanico) {
      mecanico = {
        id: usuarioMecanico.id,
        username: usuarioMecanico.username,
        fullName: usuarioMecanico.fullName,
      };
    }
  }

  return {
    ...orden,
    client: cliente
      ? { id: cliente.id, fullName: cliente.fullName, phone: cliente.phone }
      : null,
    vehicle: vehiculo
      ? {
          id: vehiculo.id,
          plates: vehiculo.plates,
          brand: vehiculo.brand,
          model: vehiculo.model,
          year: vehiculo.year,
        }
      : null,
    mechanic: mecanico,
    entries: entradas,
    services: servicios,
    labor: manoDeObra,
    totals: totales,
    refacciones: refaccionesOrden,
  };
}

/**
 * Total a cobrar de la orden (Sprint 4, T009, FR-003): reutiliza el cálculo
 * existente de servicios + mano de obra sin duplicar importes (research D2).
 * Las refacciones del inventario no tienen precio unitario (Sprint 3), por lo
 * que no suman al total y se listan por cantidad en el ticket (CA-4).
 */
export async function obtenerTotalOrden(orderId) {
  const totales = await orderModel.findTotals(orderId);
  return totales.grand;
}

/**
 * Historial de servicios del vehículo (Sprint 3, US1/US2; FR-001 a FR-003).
 * Derivado de las órdenes terminadas/entregadas (RN-10, research D1): el
 * kilometraje mostrado es el registrado en cada servicio (RN-3) y la marca de
 * corrección deja constancia de cualquier ajuste explícito (RN-4).
 */
export async function historialVehiculo(vehicleId, { order = 'desc' } = {}) {
  const vehiculo = await vehicleModel.findById(vehicleId);
  if (!vehiculo) {
    throw errores.vehiculoNoDisponible();
  }

  const filas = await orderModel.findVehicleHistory(vehicleId, { order });
  const refaccionesPorOrden = await orderModel.findPartsByOrders(
    filas.map((fila) => fila.id)
  );
  const kilometrajeActual = await orderModel.findLastMileageByVehicle(vehicleId);

  const historial = filas.map((fila) => {
    const refaccionesDeLaOrden = refaccionesPorOrden
      .filter((refaccion) => refaccion.order_id === fila.id)
      .map((refaccion) => ({
        nombre: refaccion.part_name,
        cantidad: refaccion.quantity,
      }));
    const manoDeObra = Number(fila.labor_total);
    const servicios = Number(fila.services_total);
    return {
      orderId: fila.id,
      fecha: fila.created_at,
      kilometraje: fila.mileage_entry,
      correccionKilometraje: Boolean(fila.mileage_correction),
      motivo: fila.reason,
      notas: fila.notes,
      ultimaEntrada: fila.last_entry ?? null,
      mecanico: fila.mechanic_id
        ? { id: fila.mechanic_id, nombreCompleto: fila.mechanic_name }
        : null,
      resumen: {
        servicios: fila.services_count,
        manoObra: fila.labor_count,
        refacciones: fila.parts_count,
        total: servicios + manoDeObra,
      },
      refacciones: refaccionesDeLaOrden,
    };
  });

  return {
    vehiculo: {
      id: vehiculo.id,
      placas: vehiculo.plates,
      marca: vehiculo.brand,
      modelo: vehiculo.model,
      anio: vehiculo.year,
      kilometrajeActual: kilometrajeActual == null ? 0 : Number(kilometrajeActual),
    },
    historial,
  };
}

/**
 * Orden operable para gestionar refacciones (Sprint 3, US7, T047):
 * existe, no está cerrada (ENTREGADO/CANCELADA → ORDER_CLOSED) y el rol es
 * administración o el mecánico dueño (FORBIDDEN_ORDER, RN-15).
 */
async function obtenerOrdenParaRefacciones(orderId, usuario) {
  const orden = await orderModel.findById(orderId);
  if (!orden) {
    throw errores.ordenNoEncontrada();
  }
  if (orden.status === 'ENTREGADO' || orden.status === 'CANCELADA') {
    throw errores.ordenCerrada(orden.status);
  }
  if (usuario.role === 'RECEPTIONIST') {
    throw errores.noAutorizado();
  }
  if (usuario.role === 'MECHANIC' && orden.mechanicId !== usuario.id) {
    throw errores.ordenDeOtroMecanico();
  }
  return orden;
}

/**
 * Agrega una refacción a la orden (FR-011, RN-6/RN-7/RN-8): valida refacción
 * activa y stock suficiente; la salida (OUT con `order_id`) y la línea de la
 * orden se registran en la MISMA transacción con bloqueo de la fila (research
 * D4/D5). Si falta stock no se modifica nada (PART_SIN_STOCK 409 con
 * `details.stockDisponible`).
 */
export async function agregarRefaccionOrden(orderId, datos, usuario) {
  const orden = await obtenerOrdenParaRefacciones(orderId, usuario);

  const partId = Number(datos.partId);
  const cantidad = Number(datos.quantity);
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    throw errores.datosInvalidos(
      'La cantidad (quantity) debe ser un número entero mayor que cero.'
    );
  }

  return inventoryModel.conTransaccion(async (conexion) => {
    const parte = await inventoryModel.bloquearParte(conexion, partId);
    if (!parte.isActive) {
      throw errores.parteInactiva();
    }
    const { stockResult } = await inventoryModel.aplicarMovimiento(conexion, {
      partId,
      movementType: 'OUT',
      quantity: cantidad,
      orderId: orden.id,
      reason: `Uso en orden #${orden.id}`,
      createdBy: usuario.id,
    });
    const linea = await orderModel.createOrderPart(
      { orderId: orden.id, partId, quantity: cantidad, createdBy: usuario.id },
      conexion
    );
    return { ...linea, stockResult };
  });
}

/**
 * Retira una refacción de la orden (FR-012): la devolución genera un IN que
 * conserva el OUT original (research D5) y restaura el stock en la misma
 * transacción (RN-8).
 */
export async function retirarRefaccionOrden(orderId, orderPartId, usuario) {
  const orden = await obtenerOrdenParaRefacciones(orderId, usuario);

  return inventoryModel.conTransaccion(async (conexion) => {
    const linea = await orderModel.findOrderPart(orden.id, orderPartId, conexion);
    if (!linea) {
      throw errores.ordenPartNoEncontrada();
    }
    const { stockResult } = await inventoryModel.aplicarMovimiento(conexion, {
      partId: linea.partId,
      movementType: 'IN',
      quantity: linea.quantity,
      orderId: orden.id,
      reason: `Devolución de refacción de la orden #${orden.id}`,
      createdBy: usuario.id,
    });
    await orderModel.deleteOrderPart(orden.id, orderPartId, conexion);
    return { stockResult };
  });
}

/**
 * Error de aplicación con código HTTP y código de negocio (T010/T011).
 * Los services lanzan AppError y el middleware centralizado lo traduce a la
 * respuesta del contrato sin exponer detalles internos (Principio IV).
 */
export class AppError extends Error {
  /**
   * @param {number} status - Código HTTP de la respuesta.
   * @param {string} codigo - Código de negocio del catálogo (p. ej. DATOS_INVALIDOS).
   * @param {string} mensaje - Mensaje claro y accionable para el usuario final.
   * @param {object} [details] - Detalle opcional útil para el cliente (p. ej. stockDisponible).
   */
  constructor(status, codigo, mensaje, details = undefined) {
    super(mensaje);
    this.name = 'AppError';
    this.status = status;
    this.codigo = codigo;
    this.details = details;
  }
}

/** Atajos frecuentes del catálogo de errores (contracts/api-rest.md). */
export const errores = {
  datosInvalidos: (mensaje = 'Los datos enviados no son válidos.') =>
    new AppError(400, 'DATOS_INVALIDOS', mensaje),
  contrasenaInvalida: (mensaje = 'La contraseña no cumple la política mínima: 8 caracteres, mayúscula, minúscula y número.') =>
    new AppError(400, 'CONTRASENA_INVALIDA', mensaje),
  ultimoAdmin: () =>
    new AppError(400, 'ULTIMO_ADMIN', 'No es posible desactivar al único administrador activo.'),
  noAutenticado: () =>
    new AppError(401, 'NO_AUTENTICADO', 'Debe iniciar sesión para continuar.'),
  credencialesInvalidas: () =>
    new AppError(401, 'CREDENCIALES_INVALIDAS', 'Credenciales inválidas.'),
  sesionExpirada: () =>
    new AppError(401, 'SESION_EXPIRADA', 'La sesión ha expirado; inicie sesión de nuevo.'),
  noAutorizado: () =>
    new AppError(403, 'NO_AUTORIZADO', 'No tiene permisos para realizar esta operación.'),
  recursoNoEncontrado: (recurso = 'El recurso solicitado') =>
    new AppError(404, 'RECURSO_NO_ENCONTRADO', `${recurso} no existe.`),
  clienteNoEncontrado: () =>
    new AppError(404, 'CLIENTE_NO_ENCONTRADO', 'El cliente indicado no existe o está inactivo.'),
  usuarioDuplicado: () =>
    new AppError(409, 'USUARIO_DUPLICADO', 'Ya existe un usuario con ese nombre de usuario o correo electrónico.'),
  vehiculoDuplicado: () =>
    new AppError(409, 'VEHICULO_DUPLICADO', 'Ya existe un vehículo registrado con esas placas.'),
  // --- Sprint 2: citas y órdenes de servicio (T010) ---
  vehiculoNoDisponible: (mensaje = 'El vehículo indicado no existe o está inactivo.') =>
    new AppError(404, 'VEHICULO_NO_DISPONIBLE', mensaje),
  kilometrajeInvalido: (mensaje = 'El kilometraje es menor al de la última orden del vehículo; corrija explícitamente si corresponde.') =>
    new AppError(400, 'KILOMETRAJE_INVALIDO', mensaje),
  mecanicoInvalido: (mensaje = 'El mecánico indicado no es un usuario activo con rol mecánico.') =>
    new AppError(400, 'MECANICO_INVALIDO', mensaje),
  citaNoEncontrada: () =>
    new AppError(404, 'CITA_NO_ENCONTRADA', 'La cita indicada no existe.'),
  citaDuplicada: () =>
    new AppError(409, 'CITA_DUPLICADA', 'Ya existe una cita para ese vehículo en esa fecha y hora.'),
  citaNoModificable: (estado = 'final') =>
    new AppError(409, 'CITA_NO_MODIFICABLE', `La cita está ${estado} y no admite cambios; solo las citas PROGRAMADA pueden modificarse o cancelarse.`),
  ordenNoEncontrada: () =>
    new AppError(404, 'ORDEN_NO_ENCONTRADA', 'La orden de servicio indicada no existe.'),
  ordenBloqueada: (mensaje = 'La orden está cerrada y no admite cambios.') =>
    new AppError(409, 'ORDEN_BLOQUEADA', mensaje),
  transicionInvalida: (motivo) =>
    new AppError(400, 'TRANSICION_INVALIDA', motivo),
  // --- Sprint 3: historial, mantenimiento e inventario (T002) ---
  parteNoEncontrada: () =>
    new AppError(404, 'PART_NOT_FOUND', 'La refacción indicada no existe.'),
  parteDuplicada: () =>
    new AppError(409, 'PART_DUPLICATE', 'Ya existe una refacción registrada con ese código.'),
  parteInactiva: () =>
    new AppError(409, 'PART_INACTIVE', 'La refacción está inactiva y no puede agregarse a una orden.'),
  parteSinStock: (disponible, solicitado) =>
    new AppError(
      409,
      'PART_SIN_STOCK',
      `Stock insuficiente: se solicitan ${solicitado} y hay ${disponible} disponibles.`,
      { stockDisponible: Number(disponible) }
    ),
  movimientoInvalido: (mensaje = 'La cantidad del movimiento no es válida; debe ser distinta de cero.') =>
    new AppError(422, 'MOVEMENT_INVALID', mensaje),
  mantenimientoNoEncontrado: () =>
    new AppError(404, 'MAINTENANCE_NOT_FOUND', 'El mantenimiento indicado no existe.'),
  mantenimientoNoModificable: (estado) =>
    new AppError(
      409,
      'MAINTENANCE_NOT_MODIFIABLE',
      `El mantenimiento está ${estado} y no admite cambios; solo los mantenimientos PENDING pueden completarse o cancelarse.`
    ),
  mantenimientoUmbralInvalido: () =>
    new AppError(
      422,
      'MAINTENANCE_INVALID_THRESHOLD',
      'El mantenimiento debe indicar fecha objetivo, kilometraje objetivo o ambos.'
    ),
  ordenCerrada: (estado) =>
    new AppError(
      409,
      'ORDER_CLOSED',
      `La orden está ${estado} y no admite cambios en sus refacciones.`
    ),
  ordenPartNoEncontrada: () =>
    new AppError(404, 'ORDER_PART_NOT_FOUND', 'La refacción no está asignada a esta orden.'),
  ordenDeOtroMecanico: () =>
    new AppError(403, 'FORBIDDEN_ORDER', 'La orden pertenece a otro mecánico.'),
  // --- Sprint 4: pagos, tickets y dashboard (T002, contracts/api-rest.md) ---
  pagoNoEncontrado: () =>
    new AppError(404, 'PAYMENT_NOT_FOUND', 'El pago indicado no existe.'),
  pagoNoModificable: (estado) =>
    new AppError(
      409,
      'PAYMENT_NOT_MODIFIABLE',
      `El pago está ${estado} y no admite cambios; solo los pagos PENDING pueden completarse o expirar.`
    ),
  pagoExcedeSaldo: (saldoPendiente) =>
    new AppError(
      409,
      'PAYMENT_EXCEEDS_BALANCE',
      `El monto supera el saldo pendiente de la orden (${Number(saldoPendiente).toFixed(2)}).`,
      { saldoPendiente: Number(saldoPendiente) }
    ),
  cobroDigitalDuplicado: () =>
    new AppError(
      409,
      'PAYMENT_DUPLICATE_PENDING',
      'Ya existe un cobro digital vigente para esta orden; verifíquelo o espere a que caduque antes de crear otro.'
    ),
  ordenCancelada: () =>
    new AppError(409, 'ORDER_CANCELLED', 'La orden está cancelada; no se admiten pagos ni tickets sobre ella.'),
  errorProveedorPago: () =>
    new AppError(
      502,
      'MP_PROVIDER_ERROR',
      'No se pudo consultar el proveedor de pago; intente de nuevo. No se registró ningún cambio.'
    ),
  // --- 005-precio-venta-refacciones (contracts/api-rest.md) ---
  parteSinPrecio: (nombre = null) =>
    new AppError(
      409,
      'PART_SIN_PRECIO',
      nombre
        ? `La refacción "${nombre}" no tiene precio de venta asignado; pida a administración que registre el precio antes de usarla en una orden.`
        : 'La refacción no tiene precio de venta asignado; pida a administración que registre el precio antes de usarla en una orden.'
    ),
  totalIncompleto: (refaccionesSinPrecio = []) =>
    new AppError(
      409,
      'TOTAL_INCOMPLETO',
      'El total de la orden está incompleto porque falta el precio de venta de una refacción usada; asigne el precio para poder continuar.',
      { refaccionesSinPrecio }
    ),
};

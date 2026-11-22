/**
 * Servicio de refacciones e inventario (Sprint 3, T037, US5/US6).
 *
 * RN-6/RN-7/RN-8: el stock solo cambia mediante movimientos atómicos con
 * bloqueo de la fila (research D4). RN-8 uniforme (aclaración Q3): un
 * AJUSTE que dejaría stock negativo también se rechaza. El código es único
 * (PART_DUPLICATE 409) y la inactivación es baja lógica sin borrado (FR-010).
 */
import * as partModel from '../models/part.js';
import * as inventoryModel from '../models/inventory.js';
import { errores } from '../utils/errors.js';

/** Mensaje no bloqueante cuando el precio de venta es menor al de compra (006, FR-004). */
const ADVERTENCIA_VENTA_MENOR_COMPRA = 'El precio de venta es menor al precio de compra.';

/** El precio de compra solo se entrega a ADMIN (006, FR-005; research D4). */
function esAdmin(usuario) {
  return usuario?.role === 'ADMIN';
}

/** Texto opcional: vacío o ausente se guarda como null (categoría y marca). */
function textoOpcional(valor) {
  if (valor === undefined) {
    return undefined;
  }
  return valor === null || String(valor).trim() === '' ? null : String(valor).trim();
}

/** Importe opcional: `undefined` conserva, vacío/null limpia, otro valor se convierte. */
function importeOpcional(valor) {
  if (valor === undefined) {
    return undefined;
  }
  return valor === null || valor === '' ? null : Number(valor);
}

/**
 * Agrega la advertencia no bloqueante (FR-004) cuando se guardó un precio y
 * el de venta quedó por debajo del de compra; no impide el guardado.
 */
function conAdvertencia(parte, datos) {
  const tocoPrecios = datos.salePrice !== undefined || datos.purchasePrice !== undefined;
  if (
    tocoPrecios &&
    parte.purchasePrice != null &&
    parte.salePrice != null &&
    parte.salePrice < parte.purchasePrice
  ) {
    return { ...parte, advertencia: ADVERTENCIA_VENTA_MENOR_COMPRA };
  }
  return parte;
}

/**
 * Listado con búsqueda `q` (FR-009). Solo el administrador ve las
 * refacciones inactivas (US6); recepción y mecánico ven las activas.
 */
export async function listar(filtros = {}, usuario) {
  return partModel.findAll({
    q: filtros.q || null,
    soloActivas: usuario.role !== 'ADMIN',
    pendientesPrecio: Boolean(filtros.pendientesPrecio),
    incluirPrecioCompra: esAdmin(usuario),
  });
}

/** Auditoría de movimientos de una refacción (FR-009, US6). */
export async function historialMovimientos(partId) {
  const parte = await partModel.findById(partId);
  if (!parte) {
    throw errores.parteNoEncontrada();
  }
  return inventoryModel.listarMovimientos(partId);
}

/**
 * Alta de refacción: si tiene stock inicial se registra como movimiento IN
 * "Stock inicial" en la misma transacción (FR-008, FR-009, SC-004).
 */
export async function crear(datos, usuario) {
  const codigo = datos.code.trim();
  const existente = await partModel.findByCode(codigo);
  if (existente) {
    throw errores.parteDuplicada();
  }

  const stockInicial = datos.stock != null && datos.stock !== '' ? Number(datos.stock) : 0;
  const minStock = datos.minStock != null && datos.minStock !== '' ? Number(datos.minStock) : 0;

  return inventoryModel.conTransaccion(async (conexion) => {
    const parte = await partModel.create(
      {
        name: datos.name.trim(),
        code: codigo,
        minStock,
        // Precio de venta opcional (005, FR-001); null = pendiente.
        salePrice: datos.salePrice !== undefined && datos.salePrice !== ''
          ? Number(datos.salePrice)
          : null,
        // Categoría, marca y precio de compra opcionales (006, FR-001/FR-002).
        category: textoOpcional(datos.category) ?? null,
        brand: textoOpcional(datos.brand) ?? null,
        purchasePrice: importeOpcional(datos.purchasePrice) ?? null,
      },
      conexion
    );
    if (stockInicial > 0) {
      await inventoryModel.aplicarMovimiento(conexion, {
        partId: parte.id,
        movementType: 'IN',
        quantity: stockInicial,
        reason: 'Stock inicial',
        createdBy: usuario.id,
      });
    }
    // Se relee con la MISMA conexión para devolver el stock ya actualizado
    // antes del commit (con el pool general leería el estado previo).
    const creada = await partModel.findById(parte.id, conexion, {
      incluirPrecioCompra: esAdmin(usuario),
    });
    return conAdvertencia(creada, datos);
  });
}

/** Edición de metadatos; el stock solo cambia vía movimientos (FR-013). */
export async function editar(id, datos, usuario) {
  const parte = await partModel.findById(id);
  if (!parte) {
    throw errores.parteNoEncontrada();
  }

  if (datos.code !== undefined) {
    const codigo = String(datos.code).trim();
    const duplicada = await partModel.findByCode(codigo);
    if (duplicada && duplicada.id !== parte.id) {
      throw errores.parteDuplicada();
    }
  }

  const resultado = await partModel.update({
    id: parte.id,
    name: datos.name !== undefined ? String(datos.name).trim() : null,
    code: datos.code !== undefined ? String(datos.code).trim() : null,
    minStock:
      datos.minStock !== undefined && datos.minStock !== ''
        ? Number(datos.minStock)
        : null,
    isActive: datos.isActive !== undefined ? datos.isActive : null,
    // `salePrice` explícito (número o null para volver a dejarlo pendiente);
    // si no viene en el payload se conserva el precio actual (005, FR-001).
    salePrice:
      datos.salePrice === undefined
        ? undefined
        : datos.salePrice === null || datos.salePrice === ''
          ? null
          : Number(datos.salePrice),
    // Categoría, marca y precio de compra (006): undefined conserva, null limpia.
    category: textoOpcional(datos.category),
    brand: textoOpcional(datos.brand),
    purchasePrice: importeOpcional(datos.purchasePrice),
    incluirPrecioCompra: esAdmin(usuario),
  });

  // Adopción (005, FR-011, CA-11/CA-19): al asignar o cambiar el precio se
  // copia a los usos sin precio de las órdenes abiertas no liquidadas. Al
  // dejarlo pendiente (null) no hay precio que adoptar.
  if (resultado.salePrice !== null && resultado.salePrice !== undefined) {
    await partModel.adoptarPrecios(parte.id, resultado.salePrice);
  }
  return conAdvertencia(resultado, datos);
}

/**
 * Movimiento manual de stock (FR-014): solo IN y ADJUSTMENT; la cantidad
 * debe ser entera y distinta de cero (MOVEMENT_INVALID 422) y el IN con
 * signo positivo. Se aplica atómicamente con bloqueo de la fila.
 */
export async function registrarMovimiento(partId, datos, usuario) {
  const parte = await partModel.findById(partId);
  if (!parte) {
    throw errores.parteNoEncontrada();
  }

  const cantidad = Number(datos.quantity);
  if (!Number.isInteger(cantidad) || cantidad === 0) {
    throw errores.movimientoInvalido(
      'La cantidad del movimiento debe ser un número entero distinto de cero.'
    );
  }
  if (datos.movementType === 'IN' && cantidad < 0) {
    throw errores.movimientoInvalido(
      'Una entrada (IN) debe tener cantidad positiva; para restar use un ADJUSTMENT con signo.'
    );
  }

  return inventoryModel.conTransaccion(async (conexion) => {
    const resultado = await inventoryModel.aplicarMovimiento(conexion, {
      partId: parte.id,
      movementType: datos.movementType,
      quantity: cantidad,
      reason: datos.reason.trim(),
      createdBy: usuario.id,
    });
    return {
      partId: parte.id,
      movementType: datos.movementType,
      quantity: cantidad,
      reason: datos.reason.trim(),
      stockResult: resultado.stockResult,
    };
  });
}

/**
 * Acceso a datos de refacciones (Sprint 3, T035, US5/US6/US8).
 * `parts` con baja lógica (`is_active`, FR-010) y stock derivado de los
 * movimientos (FR-009): el `stock` nunca se edita directamente (FR-013).
 */
import { getPool } from '../config/db.js';

export function aObjeto(fila) {
  if (!fila) {
    return null;
  }
  const stock = Number(fila.stock);
  const minStock = Number(fila.min_stock);
  return {
    id: fila.id,
    name: fila.name,
    code: fila.code,
    stock,
    minStock,
    // Precio de venta (005, FR-001): null = pendiente de precio (D1).
    salePrice: fila.sale_price === null || fila.sale_price === undefined
      ? null
      : Number(fila.sale_price),
    isActive: Boolean(fila.is_active),
    // Alerta de stock bajo (FR-015, US8): cantidad <= mínimo.
    lowStock: stock <= minStock,
    createdAt: fila.created_at,
  };
}

/**
 * Listado con búsqueda opcional `q` por nombre o código (FR-009, US6),
 * filtro de activas (el rol que no es ADMIN no ve inactivas) y filtro de
 * pendientes de precio (005, FR-003): solo activas con `sale_price` nulo.
 */
export async function findAll({
  q = null,
  soloActivas = false,
  pendientesPrecio = false,
} = {}) {
  const condiciones = [];
  const parametros = [];

  if (q) {
    condiciones.push('(name LIKE ? OR code LIKE ?)');
    const busqueda = `%${q}%`;
    parametros.push(busqueda, busqueda);
  }
  if (soloActivas) {
    condiciones.push('is_active = 1');
  }
  if (pendientesPrecio) {
    // El filtro de pendientes siempre es sobre activas (D7, CA-17).
    condiciones.push('sale_price IS NULL');
    condiciones.push('is_active = 1');
  }

  const where = condiciones.length > 0 ? `WHERE ${condiciones.join(' AND ')}` : '';
  const [filas] = await getPool().query(
    `SELECT * FROM parts ${where} ORDER BY name ASC`,
    parametros
  );
  return filas.map(aObjeto);
}

export async function findById(id, conexion = null) {
  const db = conexion ?? getPool();
  const [filas] = await db.query('SELECT * FROM parts WHERE id = ?', [id]);
  return aObjeto(filas[0]);
}

export async function findByCode(code) {
  const [filas] = await getPool().query('SELECT * FROM parts WHERE code = ?', [code]);
  return aObjeto(filas[0]);
}

/**
 * Alta con stock inicial 0: el stock lo aporta el movimiento IN inicial.
 * `salePrice` null = pendiente de precio (005, FR-001).
 * Acepta la conexión de la transacción para que la lectura posterior (del
 * servicio) vea el stock actualizado antes del commit (T064).
 */
export async function create({ name, code, minStock, salePrice = null }, conexion = null) {
  const db = conexion ?? getPool();
  const [resultado] = await db.query(
    'INSERT INTO parts (name, code, stock, min_stock, is_active, sale_price) VALUES (?, ?, 0, ?, 1, ?)',
    [name, code, minStock ?? 0, salePrice ?? null]
  );
  return { id: resultado.insertId };
}

/**
 * Edición de metadatos: el stock NO es editable (FR-013). `salePrice`
 * distinto de `undefined` se persiste aunque sea `null` (volver a dejar la
 * refacción pendiente de precio, 005 FR-001); `undefined` lo conserva.
 */
export async function update({ id, name, code, minStock, isActive, salePrice }) {
  await getPool().query(
    `UPDATE parts
     SET name = COALESCE(?, name),
         code = COALESCE(?, code),
         min_stock = COALESCE(?, min_stock),
         is_active = COALESCE(?, is_active)
     WHERE id = ?`,
    [name ?? null, code ?? null, minStock ?? null, isActive ?? null, id]
  );
  if (salePrice !== undefined) {
    await getPool().query('UPDATE parts SET sale_price = ? WHERE id = ?', [
      salePrice ?? null,
      id,
    ]);
  }
  return findById(id);
}

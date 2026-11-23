/**
 * Acceso a datos de refacciones (Sprint 3, T035, US5/US6/US8).
 * `parts` con baja lógica (`is_active`, FR-010) y stock derivado de los
 * movimientos (FR-009): el `stock` nunca se edita directamente (FR-013).
 */
import { getPool } from '../config/db.js';

/**
 * Condición SQL de una refacción en alerta de stock: activa y con stock igual
 * o por debajo del mínimo (Sprint 3, FR-015; RN-8). Es la ÚNICA definición:
 * la comparten el panel de control (`dashboard.contarStockBajo`) y los avisos
 * (`findEnAlerta`) para que sus cifras coincidan (007, FR-005, CA-5).
 */
export const CONDICION_STOCK_EN_ALERTA = 'is_active = 1 AND stock <= min_stock';

/**
 * Refacciones en alerta de stock (007-notificaciones-internas, T032): bajas
 * (0 < stock <= mínimo) y agotadas (stock 0), con lo mínimo para el aviso.
 * No incluye datos financieros (no se lee `purchase_price`).
 */
export async function findEnAlerta() {
  const [filas] = await getPool().query(
    `SELECT id, name, code, stock, min_stock FROM parts
     WHERE ${CONDICION_STOCK_EN_ALERTA}
     ORDER BY stock ASC, id ASC`
  );
  return filas.map((fila) => ({
    id: fila.id,
    name: fila.name,
    code: fila.code,
    stock: Number(fila.stock),
    minStock: Number(fila.min_stock),
  }));
}

/**
 * Convierte una fila de `parts` al objeto de la API.
 *
 * Falla cerrada (006, research D4): `purchasePrice` (dato financiero exclusivo
 * de ADMIN) se OMITE por defecto —la clave ni siquiera existe— y solo se
 * incluye si quien llama lo pide explícitamente con `incluirPrecioCompra`.
 * Así, ninguna consulta nueva que use `aObjeto` puede exponerlo por descuido.
 */
export function aObjeto(fila, { incluirPrecioCompra = false } = {}) {
  if (!fila) {
    return null;
  }
  const stock = Number(fila.stock);
  const minStock = Number(fila.min_stock);
  const objeto = {
    id: fila.id,
    name: fila.name,
    code: fila.code,
    // Categoría (lista fija) y marca (006, FR-002): null = sin dato.
    category: fila.category ?? null,
    brand: fila.brand ?? null,
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
  if (incluirPrecioCompra) {
    // Precio de compra (006, FR-001): null = pendiente de captura.
    objeto.purchasePrice = fila.purchase_price === null || fila.purchase_price === undefined
      ? null
      : Number(fila.purchase_price);
  }
  return objeto;
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
  incluirPrecioCompra = false,
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
  // Función flecha: `map` pasaría el índice como segundo argumento.
  return filas.map((fila) => aObjeto(fila, { incluirPrecioCompra }));
}

export async function findById(id, conexion = null, opciones = {}) {
  const db = conexion ?? getPool();
  const [filas] = await db.query('SELECT * FROM parts WHERE id = ?', [id]);
  return aObjeto(filas[0], opciones);
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
export async function create(
  { name, code, minStock, salePrice = null, category = null, brand = null, purchasePrice = null },
  conexion = null
) {
  const db = conexion ?? getPool();
  const [resultado] = await db.query(
    `INSERT INTO parts
       (name, code, stock, min_stock, is_active, sale_price, category, brand, purchase_price)
     VALUES (?, ?, 0, ?, 1, ?, ?, ?, ?)`,
    [name, code, minStock ?? 0, salePrice ?? null, category ?? null, brand ?? null, purchasePrice ?? null]
  );
  return { id: resultado.insertId };
}

/**
 * Edición de metadatos: el stock NO es editable (FR-013). `salePrice`
 * distinto de `undefined` se persiste aunque sea `null` (volver a dejar la
 * refacción pendiente de precio, 005 FR-001); `undefined` lo conserva.
 */
export async function update({
  id,
  name,
  code,
  minStock,
  isActive,
  salePrice,
  category,
  brand,
  purchasePrice,
  incluirPrecioCompra = false,
}) {
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
  // Categoría, marca y precio de compra (006): `undefined` conserva el valor
  // guardado; `null` lo deja vacío.
  const nuevos = { category, brand, purchase_price: purchasePrice };
  for (const [columna, valor] of Object.entries(nuevos)) {
    if (valor !== undefined) {
      await getPool().query(`UPDATE parts SET ${columna} = ? WHERE id = ?`, [valor ?? null, id]);
    }
  }
  return findById(id, null, { incluirPrecioCompra });
}

/**
 * Adopción dirigida de precio (005, FR-011, research D4 + AMB-01 + T035): copia
 * el precio nuevo a los usos SIN precio (`unit_price IS NULL`) solo de órdenes
 * abiertas NO liquidadas, evaluando la liquidación contra el total PREVIO a la
 * adopción (servicios + mano de obra + usos ya con precio), de modo que una
 * orden ya pagada nunca adopta y no hay circularidad. Una orden se considera
 * liquidada SOLO si su total previo es mayor que cero y lo cobrado lo alcanza:
 * con total previo 0 (orden sin partidas) y cobrado 0 NO está liquidada y SÍ
 * adopta (T035). Los pagos registrados se conservan y el saldo se recalcula al
 * vuelo; la adopción nunca deja liquidada a una orden porque el precio no
 * reduce el total. El GROUP BY fuerza la materialización de la subconsulta
 * (evita el error 1093 de MySQL al leer `order_parts` mientras se actualiza).
 */
export async function adoptarPrecios(partId, precio) {
  await getPool().query(
    `UPDATE order_parts op
     JOIN service_orders so ON so.id = op.order_id
     JOIN (
       SELECT o.id AS orden_id,
              COALESCE((SELECT SUM(s.amount) FROM order_services s WHERE s.order_id = o.id), 0)
            + COALESCE((SELECT SUM(l.amount) FROM order_labor l WHERE l.order_id = o.id), 0)
            + COALESCE((SELECT SUM(x.unit_price * x.quantity) FROM order_parts x
                         WHERE x.order_id = o.id AND x.unit_price IS NOT NULL), 0) AS total_previo,
              COALESCE((SELECT SUM(p.amount) FROM payments p
                         WHERE p.order_id = o.id AND p.status = 'COMPLETED'), 0) AS cobrado
       FROM service_orders o
       GROUP BY o.id
     ) t ON t.orden_id = op.order_id
     SET op.unit_price = ?
     WHERE op.part_id = ?
       AND op.unit_price IS NULL
       AND so.status NOT IN ('ENTREGADO', 'CANCELADA')
       AND (t.total_previo = 0 OR t.cobrado < t.total_previo)`,
    [precio ?? null, partId]
  );
}

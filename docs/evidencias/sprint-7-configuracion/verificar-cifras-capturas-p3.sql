-- 008-configuracion-seguridad-reportes, T149 (bloque P3): cifras que deben verse en
-- pantalla al tomar las capturas s7-13 a s7-17. SOLO LECTURA: únicamente SELECT y
-- SET de variables de sesión; no modifica ninguna tabla.
--
-- Uso (cmd de Windows, con salida en tablas):
--   mysql -u root -p -D motorix -t < docs\evidencias\sprint-7-configuracion\verificar-cifras-capturas-p3.sql
--
-- Calcula, con las mismas reglas de los reportes, los dos meses que ofrece la
-- pantalla: «Mes anterior» y «Mes actual» (mes completo, hora local de MySQL).

SET @ini_anterior = TIMESTAMP(DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH));
SET @ini_actual = TIMESTAMP(DATE_FORMAT(CURDATE(), '%Y-%m-01'));
SET @ini_siguiente = TIMESTAMP(DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH));

SELECT '== 0. Rangos de los filtros ==' AS seccion;
SELECT 'Mes anterior' AS filtro, DATE(@ini_anterior) AS desde, DATE(@ini_actual - INTERVAL 1 DAY) AS hasta
UNION ALL
SELECT 'Mes actual', DATE(@ini_actual), DATE(@ini_siguiente - INTERVAL 1 DAY);

-- s7-13 · Ingresos: total cobrado y por método (la fila con método vacío es el total del mes).
SELECT '== 1. INGRESOS por método (s7-13). Método vacío = total cobrado del mes ==' AS seccion;
SELECT r.periodo, p.method AS metodo, COUNT(*) AS pagos, SUM(p.amount) AS total
FROM (SELECT 1 AS orden, 'Mes anterior' AS periodo, @ini_anterior AS ini, @ini_actual AS fin
      UNION ALL SELECT 2, 'Mes actual', @ini_actual, @ini_siguiente) r
JOIN payments p ON p.status = 'COMPLETED' AND p.created_at >= r.ini AND p.created_at < r.fin
GROUP BY r.orden, r.periodo, p.method WITH ROLLUP
HAVING r.periodo IS NOT NULL
ORDER BY r.orden, (p.method IS NULL), total DESC;

SELECT '== 1b. INGRESOS por día (s7-13) ==' AS seccion;
SELECT r.periodo, DATE_FORMAT(p.created_at, '%d/%m/%Y') AS dia, SUM(p.amount) AS total
FROM (SELECT 1 AS orden, 'Mes anterior' AS periodo, @ini_anterior AS ini, @ini_actual AS fin
      UNION ALL SELECT 2, 'Mes actual', @ini_actual, @ini_siguiente) r
JOIN payments p ON p.status = 'COMPLETED' AND p.created_at >= r.ini AND p.created_at < r.fin
GROUP BY r.orden, r.periodo, DATE(p.created_at), dia
ORDER BY r.orden, DATE(p.created_at);

-- s7-14 · Servicios (cantidad e importe por tipo de las órdenes cerradas).
SELECT '== 2. SERVICIOS por tipo (s7-14) ==' AS seccion;
SELECT r.periodo, COALESCE(t.name, 'Sin tipo') AS tipo, COUNT(*) AS cantidad, SUM(s.amount) AS importe
FROM (SELECT 1 AS orden, 'Mes anterior' AS periodo, @ini_anterior AS ini, @ini_actual AS fin
      UNION ALL SELECT 2, 'Mes actual', @ini_actual, @ini_siguiente) r
JOIN service_orders o ON o.status IN ('TERMINADO', 'ENTREGADO') AND o.status_changed_at >= r.ini AND o.status_changed_at < r.fin
JOIN order_services s ON s.order_id = o.id
LEFT JOIN service_types t ON t.id = s.service_type_id
GROUP BY r.orden, r.periodo, t.id, t.name
ORDER BY r.orden, cantidad DESC, tipo;

-- s7-14 · Productividad (órdenes cerradas y mano de obra por mecánico).
SELECT '== 3. PRODUCTIVIDAD por mecánico (s7-14) ==' AS seccion;
SELECT r.periodo, COALESCE(u.full_name, 'Sin asignar') AS mecanico, COUNT(*) AS ordenes,
       SUM((SELECT COALESCE(SUM(l.amount), 0) FROM order_labor l WHERE l.order_id = o.id)) AS mano_de_obra
FROM (SELECT 1 AS orden, 'Mes anterior' AS periodo, @ini_anterior AS ini, @ini_actual AS fin
      UNION ALL SELECT 2, 'Mes actual', @ini_actual, @ini_siguiente) r
JOIN service_orders o ON o.status IN ('TERMINADO', 'ENTREGADO') AND o.status_changed_at >= r.ini AND o.status_changed_at < r.fin
LEFT JOIN users u ON u.id = o.mechanic_id
GROUP BY r.orden, r.periodo, u.id, u.full_name
ORDER BY r.orden, (u.id IS NULL), ordenes DESC, mecanico;

-- s7-15 · Refacciones: totales de las líneas completas y líneas incompletas.
SELECT '== 4. REFACCIONES: resumen (s7-15) ==' AS seccion;
SELECT r.periodo, COUNT(*) AS lineas,
       SUM(op.unit_price IS NULL) AS sin_precio, SUM(p.purchase_price IS NULL) AS sin_costo,
       SUM(CASE WHEN op.unit_price IS NOT NULL AND p.purchase_price IS NOT NULL THEN op.unit_price * op.quantity END) AS ventas,
       SUM(CASE WHEN op.unit_price IS NOT NULL AND p.purchase_price IS NOT NULL THEN p.purchase_price * op.quantity END) AS costo,
       SUM(CASE WHEN op.unit_price IS NOT NULL AND p.purchase_price IS NOT NULL THEN (op.unit_price - p.purchase_price) * op.quantity END) AS margen
FROM (SELECT 1 AS orden, 'Mes anterior' AS periodo, @ini_anterior AS ini, @ini_actual AS fin
      UNION ALL SELECT 2, 'Mes actual', @ini_actual, @ini_siguiente) r
JOIN service_orders o ON o.status IN ('TERMINADO', 'ENTREGADO') AND o.status_changed_at >= r.ini AND o.status_changed_at < r.fin
JOIN order_parts op ON op.order_id = o.id
JOIN parts p ON p.id = op.part_id
GROUP BY r.orden, r.periodo
ORDER BY r.orden;

SELECT '== 4b. REFACCIONES: líneas, la más reciente primero (s7-15). Costo/margen vacíos = «sin costo» o «sin precio» ==' AS seccion;
SELECT r.periodo, p.code AS codigo, o.id AS orden, op.quantity AS cant, op.unit_price AS precio_unitario,
       p.purchase_price * op.quantity AS costo_total,
       (op.unit_price - p.purchase_price) * op.quantity AS margen_total
FROM (SELECT 1 AS orden, 'Mes anterior' AS periodo, @ini_anterior AS ini, @ini_actual AS fin
      UNION ALL SELECT 2, 'Mes actual', @ini_actual, @ini_siguiente) r
JOIN service_orders o ON o.status IN ('TERMINADO', 'ENTREGADO') AND o.status_changed_at >= r.ini AND o.status_changed_at < r.fin
JOIN order_parts op ON op.order_id = o.id
JOIN parts p ON p.id = op.part_id
ORDER BY r.orden, o.status_changed_at DESC, op.id DESC;

-- s7-16 · Rotación (salidas del mes ÷ existencia actual, refacciones activas).
SELECT '== 5. ROTACIÓN (s7-16). Rotación vacía = «sin existencia» ==' AS seccion;
SELECT r.periodo, p.code AS codigo, COALESCE(SUM(ABS(m.quantity)), 0) AS salidas, p.stock AS existencia,
       ROUND(COALESCE(SUM(ABS(m.quantity)), 0) / NULLIF(p.stock, 0), 2) AS rotacion
FROM (SELECT 1 AS orden, 'Mes anterior' AS periodo, @ini_anterior AS ini, @ini_actual AS fin
      UNION ALL SELECT 2, 'Mes actual', @ini_actual, @ini_siguiente) r
JOIN parts p ON p.is_active = 1
LEFT JOIN inventory_movements m ON m.part_id = p.id AND m.movement_type = 'OUT' AND m.created_at >= r.ini AND m.created_at < r.fin
GROUP BY r.orden, r.periodo, p.id, p.code, p.stock, p.name
ORDER BY r.orden, (p.stock = 0), rotacion DESC, p.name, p.id;

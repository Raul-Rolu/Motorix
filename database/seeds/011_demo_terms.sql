-- 008-configuracion-seguridad-reportes, T096 (bloque P2; FR-029, CA-12, CA-16,
-- CA-18): versión 1 de los términos y condiciones con el aviso de privacidad
-- (PLANTILLA en español) y cuatro entradas de bitácora de ejemplo.
--
-- Requiere las migraciones 022 y 023 y el seed 001 (orden obligatorio:
-- migraciones → seeds → servidor). Idempotente y NUNCA pisa lo que el usuario ya
-- hizo:
--
-- 1) Términos: la versión 1 (id 1) se inserta SOLO si la tabla está vacía. Si el
--    administrador ya publicó una versión (la que sea), no se siembra otra, no se
--    modifica ninguna y no se tocan las aceptaciones. Este seed NO inserta filas
--    en `terms_acceptances`: cada cuenta ve la pantalla de aceptación en su primer
--    inicio de sesión (la compuerta se activa en cuanto hay una versión vigente).
-- 2) Bitácora: las entradas de ejemplo se reconocen por su texto (cada detalle
--    termina con «(ejemplo)») y solo se insertan si no existen ya. No usan ids
--    fijos: en una base con bitácora real los ids 1–4 pueden estar ocupados, y
--    así no se pierden ni se mezclan con las entradas reales. En una base nueva
--    resultan ser los ids 1 a 4.

-- 1) Versión 1 de los términos y del aviso de privacidad.
INSERT INTO terms_versions (id, version, terms_text, privacy_text, published_by, published_at)
SELECT
  1,
  1,
  'TÉRMINOS Y CONDICIONES DE USO DE MOTORIX (PLANTILLA)

ADVERTENCIA: este texto es una plantilla de demostración. El taller debe revisarlo y adaptarlo, de preferencia con asesoría legal, y publicar su propia versión antes de usar el sistema con datos reales de clientes.

1. Uso permitido. Motorix es una herramienta de trabajo del taller. Cada persona usuaria puede utilizarla solo para las tareas propias de su puesto: registrar y consultar citas, clientes, vehículos, órdenes de servicio, inventario, pagos y avisos. No se permite usar el sistema para fines personales, ajenos al taller o contrarios a la ley.

2. Confidencialidad de clientes y vehículos. La información de clientes (nombre, teléfono, correo) y de sus vehículos (placas, marca, modelo, historial de servicios y kilometraje) es confidencial. Solo debe consultarse cuando sea necesario para atender al cliente, no debe copiarse ni compartirse fuera del taller y debe protegerse también al imprimir tickets o mostrar la pantalla.

3. Cuentas personales. Cada persona usuaria tiene una cuenta personal e intransferible. No debe compartir su contraseña ni dejar su sesión abierta sin vigilancia, y debe avisar de inmediato a la administración si sospecha que otra persona usó su cuenta. Las acciones realizadas con una cuenta se atribuyen a su titular y las acciones sensibles quedan registradas en una bitácora.

4. Cambios a estos términos. Cuando la administración publique una versión nueva, todas las personas usuarias deberán aceptarla para seguir usando el sistema.',
  'AVISO DE PRIVACIDAD (PLANTILLA)

ADVERTENCIA: este aviso de privacidad es una plantilla de demostración. El taller debe revisarlo y adaptarlo a su operación real y a la normativa aplicable antes de usar el sistema con datos reales.

Responsable. El taller que opera Motorix es el responsable del tratamiento de los datos personales que se registran en el sistema.

Datos que se tratan. Datos de clientes y de sus vehículos (nombre, teléfono, correo, placas, marca, modelo y kilometraje), datos de las citas, órdenes de servicio, pagos y tickets, y datos de las cuentas de las personas usuarias (nombre, usuario y correo). Las contraseñas se guardan cifradas y nunca se muestran.

Finalidades. Atender y dar seguimiento a los servicios del taller, emitir tickets, avisar al cliente de hechos de su servicio, y proteger la seguridad del sistema mediante una bitácora de acciones sensibles.

Derechos. Las personas titulares pueden solicitar al taller el acceso, la corrección o la cancelación de sus datos conforme a la normativa aplicable.',
  (SELECT id FROM users WHERE username = 'admin'),
  DATE_SUB(NOW(), INTERVAL 7 DAY)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM terms_versions)
ON DUPLICATE KEY UPDATE id = id;

-- 2) Cuatro entradas de bitácora de ejemplo con fechas relativas (sin datos
-- sensibles: ni contraseñas, ni tokens, ni importes de precio de compra).
INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail, created_at)
SELECT NULL, 'LOGIN_FAILED', 'SESSION', NULL,
  'Identificador: visitante (ejemplo)', DATE_SUB(NOW(), INTERVAL 3 DAY)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM audit_log WHERE action = 'LOGIN_FAILED' AND detail = 'Identificador: visitante (ejemplo)'
);

INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail, created_at)
SELECT (SELECT id FROM users WHERE username = 'admin'), 'USER_CREATED', 'USER',
  (SELECT id FROM users WHERE username = 'mecanico'),
  'Rol: MECHANIC (ejemplo)', DATE_SUB(NOW(), INTERVAL 2 DAY)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM audit_log WHERE action = 'USER_CREATED' AND detail = 'Rol: MECHANIC (ejemplo)'
);

INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail, created_at)
SELECT (SELECT id FROM users WHERE username = 'admin'), 'SETTINGS_UPDATED', 'SETTINGS', NULL,
  'Claves: shop.phone (ejemplo)', DATE_SUB(NOW(), INTERVAL 1 DAY)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM audit_log WHERE action = 'SETTINGS_UPDATED' AND detail = 'Claves: shop.phone (ejemplo)'
);

INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail, created_at)
SELECT (SELECT id FROM users WHERE username = 'admin'), 'PART_SALE_PRICE_CHANGED', 'PART',
  (SELECT MIN(id) FROM parts),
  'Precio de venta: 100.00 → 120.00 (ejemplo)', DATE_SUB(NOW(), INTERVAL 5 HOUR)
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM audit_log WHERE action = 'PART_SALE_PRICE_CHANGED' AND detail = 'Precio de venta: 100.00 → 120.00 (ejemplo)'
);

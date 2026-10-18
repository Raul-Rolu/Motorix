# Quickstart: Precio de venta de refacciones y total de la orden

**Feature**: `005-precio-venta-refacciones` | **Fecha**: 2026-10-18

Guía de validación de extremo a extremo. No incluye código de implementación (eso vive en `tasks.md` y en la fase de implementación); los detalles de datos y API están en [data-model.md](./data-model.md) y [contracts/api-rest.md](./contracts/api-rest.md).

## Prerrequisitos

- MySQL local con base del proyecto y usuario dedicado (variables `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` en `server/.env`, según `database/README.md`).
- Node.js LTS con las dependencias ya instaladas en `server/` (sin dependencias nuevas).
- Flutter SDK con el cliente en `client/`.

## Puesta en marcha

1. Aplicar la migración nueva (agrega `parts.sale_price` y `order_parts.unit_price`; no toca 001–015):

   ```bash
   node database/scripts/apply-migrations.mjs
   ```

   Resultado esperado: `016_add_part_prices.sql` aparece registrada en `schema_migrations`; las migraciones previas quedan intactas.

2. Cargar los datos de ejemplo (incluye el seed nuevo `008_demo_part_prices.sql`):

   ```bash
   node database/scripts/apply-seeds.mjs
   ```

   Resultado esperado: las 6 refacciones de ejemplo muestran precio de venta; existe una refacción activa sin precio (pendiente de filtro); la orden 2 tiene usos de refacciones con precio congelado y sus salidas de inventario; ninguna orden de ejemplo tiene total incompleto (CA-20).

## Validación automatizada

```bash
cd server && npm test        # Jest + supertest contra motorix_test
cd client && flutter test    # modelos y providers del frontend
```

Resultados esperados:
- Las pruebas existentes de inventario/órdenes/pagos/tickets siguen pasando, registrando un precio de venta en la preparación de los casos que agregan refacciones (SC-007, D10).
- Pruebas nuevas en verde: rechazo `PART_SIN_PRECIO`, bloqueo `TOTAL_INCOMPLETO` en pagos y ticket, precio congelado al agregar, adopción en órdenes abiertas y no adopción en pagadas, filtro `pending-price`, suma del total con refacciones.
- `flutter test` en verde con `salePrice`/`unitPrice` en los modelos.

## Validación manual (escenarios del spec)

Con la aplicación levantada (backend y cliente) y los seeds cargados:

1. **Precio en la ficha (US1)**: iniciar sesión como administración → Inventario → la refacción "Filtro de aceite" muestra precio de venta; editar un precio a `-5` ⇒ rechazo con mensaje y el valor no cambia (CA-2); el filtro/lista de pendientes muestra solo la refacción sin precio y queda vacía al asignarle precio (CA-17).
2. **Roles (CA-16)**: con usuario mecánico o recepción, el formulario de precio de venta no está disponible y la operación es denegada por el servidor.
3. **Total con refacciones (US2)**: abrir la orden 2 (EN_REPARACION) ⇒ su total suma servicios + mano de obra + importes de las refacciones usadas (CA-6); cambiar el precio de esa refacción en el inventario NO cambia el total de la orden 2 (CA-4); retirar una refacción de la orden baja el total por su importe (CA-15).
4. **Rechazo sin precio (CA-8)**: como mecánico, intentar agregar la refacción activa sin precio a una orden ⇒ `PART_SIN_PRECIO`, sin cambio en total ni stock.
5. **Cobro (US3)**: la orden 2 muestra cobrado y saldo pendiente derivados del total con refacciones (CA-12); registrar un pago por el saldo liquidala; intentar un pago en una orden **no liquidada** con total incompleto (crear un caso de prueba con uso sin precio) ⇒ `TOTAL_INCOMPLETO` (CA-10).
6. **Ticket (US3)**: generar el ticket de la orden 2 ⇒ total idéntico al de la orden y al monto liquidado (CA-14), con cada refacción listada por cantidad, precio e importe (CA-13); con total incompleto en una orden no liquidada, el ticket responde `TOTAL_INCOMPLETO` (CA-10); en una orden ya liquidada con usos sin precio, el ticket se emite con el total histórico y las líneas sin precio marcadas como "sin precio" (CA-21).
7. **Adopción (CA-19)**: con un caso de orden abierta con pago parcial y uso sin precio (preparado en pruebas), asignar precio a la refacción ⇒ total recalculado, pago conservado y saldo pendiente ajustado.
8. **Historial**: consultar el historial del vehículo de la orden 2 ⇒ el total de la orden incluye las refacciones (consistencia con el detalle).

## Solución de problemas

- **La migración 016 no aparece**: verificar que no haya quedado registrada en `schema_migrations` manualmente; el script omite solo las que ya están registradas por nombre.
- **El total de una orden real antigua aparece incompleto**: es el comportamiento esperado (usos pre-migración sin precio); asignar precio de venta a la refacción adopta el precio en órdenes abiertas no liquidadas (FR-011).
- **Una refacción no aparece en pendientes**: verificar que esté activa (`isActive = true`); el filtro considera solo activas.

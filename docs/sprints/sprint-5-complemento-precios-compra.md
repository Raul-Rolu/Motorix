<!--
Insumo de especificacion para /speckit.specify.
Sprint 5 (complemento) de Motorix: completa lo que le falta a la rama 005-precio-venta-refacciones
frente al Sprint 5 del equipo (docs/sprints/sprint-5-precios-refacciones-cobro.md).
Solo cubre la DIFERENCIA. Lo que ya existe NO se vuelve a especificar.
-->

# Insumo de especificacion - Sprint 5 (complemento): categoria, marca, precio de compra y cobro consistente

> **Referencias obligatorias para el agente:**
> - Contexto maestro: `docs/project-context.md`
> - Constitucion: `docs/reglas.md` y `.specify/memory/constitution.md`
> - Sprint 5 del equipo (referencia de alcance completo): `docs/sprints/sprint-5-precios-refacciones-cobro.md`
> - Lo ya implementado en este repo: `specs/005-precio-venta-refacciones/` (spec, plan, data-model, tasks)
> - Este documento describe unicamente lo que FALTA. No reescribir ni alterar lo ya cubierto (seccion 1.1).

## 1. Contexto del sprint

El Sprint 5 del equipo pide precios de refacciones y cobro completo. Esta rama ya implemento una parte (spec 005): precio de venta, snapshot en la orden, total con refacciones, cobro y ticket con refacciones. Este sprint cierra la brecha para quedar igual que el sprint del equipo: categoria, marca, precio de compra (solo administracion), limites y centavos enteros, Mercado Pago con total cambiante, seeds idempotentes y documentacion actualizada.

### 1.1 Ya cubierto por la spec 005 (NO se rehace)

| Sprint del equipo | Estado en esta rama |
|---|---|
| CA-3 precio de venta vigente guardado al agregar la refaccion (instantanea) | Cubierto (`order_parts.unit_price`) |
| CA-4 total = servicios + mano de obra + refacciones | Cubierto; falta solo el calculo en centavos enteros |
| CA-5 pago por el total con refacciones | Cubierto |
| CA-6 pagos y tickets anteriores sin cambios | Cubierto por la instantanea y el ticket derivado; falta una prueba de compatibilidad explicita |
| CA-7 ticket con cantidad, precio e importe por refaccion | Cubierto |
| CA-8 un solo pago vigente, sin datos de tarjeta | Heredado del Sprint 4 |
| CA-11 panel y listados con el nuevo total | Cubierto (verificado manualmente) |
| CA-2 (parcial) precio no negativo, numerico, 2 decimales | Cubierto para `sale_price` |
| Refaccion sin precio no se agrega a una orden | Cubierto (FR-005) |
| Orden solo con refacciones es cobrable | Cubierto |

## 2. Objetivo

Que cada refaccion tenga categoria, marca, precio de compra y precio de venta, con el precio de compra visible solo para administracion, y que el cobro siga correcto cuando el total de una orden cambia, calculando los importes en centavos enteros.

## 3. Historias de usuario del sprint

- **US1** - Como administrador, quiero registrar la categoria, la marca y el precio de compra de una refaccion para conocer su costo y clasificarla.
- **US2** - Como administrador, quiero que los precios respeten limites maximos y solo dos decimales para evitar capturas absurdas.
- **US3** - Como mecanico o recepcionista, quiero seguir trabajando con refacciones sin que el sistema me exponga el precio de compra para no revelar informacion financiera del taller.
- **US4** - Como recepcionista, quiero que un cobro de Mercado Pago pendiente cuyo importe ya no coincide con el total se detecte y se resuelva para no cobrar de mas ni de menos.
- **US5** - Como equipo, quiero que los datos de ejemplo se puedan cargar varias veces sin duplicarse para que cualquier instalacion muestre datos coherentes.

## 4. Flujo demostrable al cierre del sprint

    Administrador registra una refaccion con categoria, marca, precio de compra y precio de venta
    -> mecanico y recepcion consultan la refaccion y NO reciben el precio de compra (ni en pantalla ni en la API)
    -> se genera un cobro de Mercado Pago pendiente sobre una orden
    -> el administrador asigna precio a una refaccion usada en esa orden y el total cambia
    -> el cobro pendiente queda marcado como desfasado y se puede generar uno nuevo con el importe correcto
    -> se corren los seeds dos veces y no se duplican registros

## 5. Entidades y tablas que toca este sprint

| Entidad / tabla | Accion en este sprint |
|---|---|
| `parts` | agregar `category`, `brand`, `purchase_price`; editar y consultar (migracion aditiva `017_...sql`) |
| `payments` | agregar manejo de cobro desfasado (estado o marca, a decidir en clarify) |
| `order_services`, `order_labor` | agregar llaves unicas para hacer idempotente el seed 004 (hallazgo H-14) |
| servicios de pago y total de orden | calcular en centavos enteros |
| seeds | `005_demo_parts` y `008_demo_part_prices` con categoria, marca y precio de compra; todos idempotentes |
| `docs/project-context.md`, `docs/design-system.md` | actualizar |

## 6. Reglas de negocio aplicables

- RN-8: No permitir stock negativo (sin cambios).
- RN-13: Todo pago debe estar relacionado con una orden.
- RN-14: Los datos sensibles del procesamiento de pagos no deben almacenarse en la aplicacion.
- RN-15: Los permisos deben validarse en backend.

## 7. Criterios de aceptacion

- [ ] CA-1: Una refaccion puede registrarse y editarse con categoria, marca y precio de compra, ademas del precio de venta, y los datos persisten en MySQL local.
- [ ] CA-2: Los tres precios rechazan negativos, no numericos y mas de dos decimales; el precio maximo es 999,999.99 y el total maximo de una orden, 99,999,999.99.
- [ ] CA-3: El precio de compra solo lo reciben administracion; la API devuelve la refaccion sin ese campo a mecanico y recepcion, validado en backend con prueba por rol.
- [ ] CA-4: Solo administracion puede registrar o modificar categoria, marca y precio de compra; con otro rol la operacion se rechaza en backend.
- [ ] CA-5: Los totales de orden, saldos y pagos se calculan en centavos enteros y se guardan como `DECIMAL(10,2)`; no hay diferencias de redondeo en las pruebas.
- [ ] CA-6: Si el total de una orden cambia mientras existe un cobro de Mercado Pago pendiente, el cobro se detecta como desfasado, no puede confirmarse con el importe anterior y se permite generar uno nuevo.
- [ ] CA-7: Una prueba confirma que pagos y tickets emitidos antes del sprint se consultan igual (compatibilidad).
- [ ] CA-8: Los seeds 001 a 008 pueden correrse dos veces seguidas sin duplicar registros ni reiniciar datos de trabajo; se corrige el seed 004 (H-14).
- [ ] CA-9: Los seeds incluyen refacciones con categoria, marca, precio de compra y precio de venta.
- [ ] CA-10: Existen y pasan pruebas de limites, permisos por rol del precio de compra, centavos, cobro desfasado y compatibilidad; las suites previas siguen en verde.
- [ ] CA-11: Se actualizan `docs/project-context.md`, `docs/design-system.md` y los comentarios que dicen que las refacciones no suman importe.

## 8. Fuera de alcance de este sprint

- Costeo, margen, utilidad y reportes financieros (Sprint 7).
- Impuestos, facturacion, descuentos, reembolsos, catalogo de proveedores.
- Pagos parciales NUEVOS: ya existen desde el Sprint 4; no se rediseñan.
- Notificaciones, reportes, configuracion del taller y WhatsApp.
- Cualquier cambio a lo marcado como cubierto en la seccion 1.1, salvo el calculo en centavos.

## 9. Decisiones pendientes que deben resolverse en /speckit.clarify

Propuestas ya acordadas para ahorrar tiempo (confirmar o ajustar, no reabrir sin razon):

- Categoria: lista fija en el backend (no administrable) con valores de ejemplo; marca: texto libre de hasta 50 caracteres. Ambas opcionales.
- Precio de venta menor al de compra: se permite y se muestra una advertencia al administrador.
- Precio de venta para mecanico y recepcion: lo ven (ya lo usan en la orden); solo el precio de compra se oculta.
- Cobro desfasado de Mercado Pago: se marca como desfasado y se permite generar uno nuevo; no se actualiza el importe de un cobro ya generado.
- Correccion del precio de una linea de orden abierta: no se permite (se mantiene la instantanea).
- Tickets anteriores: se muestran igual que hoy, sin tocar su contenido.

Siguen abiertas:
- Representacion exacta del cobro desfasado (nuevo estado `STALE` en `payments` o columna aparte).
- Como se muestra categoria y marca en el listado de inventario del frontend (columnas, filtros).

## 10. Restricciones tecnicas heredadas

- Backend en ES Modules, nunca CommonJS.
- Solo el backend accede a MySQL; el frontend nunca se conecta directo.
- Permisos validados en backend, no solo en UI.
- Sin secretos en el repositorio.
- Idioma: espanol en chat, docs, comentarios y pruebas.
- MySQL local, InnoDB, llaves foraneas, `utf8mb4`.
- Pruebas de integracion contra `motorix_test`, nunca contra la base principal.
- Los seeds DEBEN ser idempotentes y dejar datos de ejemplo suficientes.
- Los importes se calculan en centavos enteros y se guardan como `DECIMAL(10,2)`.
- Las migraciones son aditivas y numeradas (`017_...sql`); no modifican las anteriores.
- Toda pantalla del frontend sigue `docs/design-system.md`.

# Lista de calidad de la especificación: Configuración, seguridad y reportes

**Propósito**: Validar la completitud y la calidad de la especificación antes de pasar a planificación
**Creada**: 2026-11-23
**Actualizada**: 2026-11-23 (tras `/speckit.clarify`)
**Feature**: [spec.md](../spec.md)

## Calidad del contenido

- [ ] Sin detalles de implementación (lenguajes, frameworks, APIs)
- [x] Enfocada en el valor para el usuario y en las necesidades del negocio
- [x] Redactada para interesados no técnicos
- [x] Todas las secciones obligatorias completas

## Completitud de los requisitos

- [x] No quedan marcadores [NEEDS CLARIFICATION]
- [x] Los requisitos son comprobables y no ambiguos
- [x] Los criterios de éxito son medibles
- [x] Los criterios de éxito son independientes de la tecnología (sin detalles de implementación)
- [x] Todos los escenarios de aceptación están definidos
- [x] Los casos límite están identificados
- [x] El alcance está claramente acotado
- [x] Las dependencias y los supuestos están identificados

## Preparación de la feature

- [x] Todos los requisitos funcionales tienen criterios de aceptación claros
- [x] Los escenarios de usuario cubren los flujos principales
- [x] La feature cumple los resultados medibles definidos en los criterios de éxito
- [ ] No se filtran detalles de implementación en la especificación

## Prioridades y línea de corte

- [x] Cada historia, requisito y criterio de aceptación está marcado con su prioridad (P1, P2 o P3)
- [x] El orden de las historias sigue los bloques del insumo: P1 configuración y catálogo, P2 seguridad y términos, P3 reportes
- [x] Cada bloque deja el sistema funcionando; cortar P3 (o parte de P2) no deja requisitos a medias
- [x] Los criterios de P3 solo se exigen si se entrega ese bloque

## Notas

- **Decisiones de la sección 10 del insumo**: aplicadas tal cual y registradas en «Aclaraciones» (sesión 2026-11-23); no se volvieron a preguntar.
- **Aclaraciones resueltas con el usuario el 2026-11-23**: (1) no se agregan `helmet` ni bloqueo por intentos fallidos; (2) el token se renueva con la actividad y su vigencia es el ajuste de inactividad (5 a 120 minutos, 30 por defecto); (3) «Próximo servicio» y la propuesta de mantenimiento se calculan desde la orden, sin columnas nuevas en `maintenance_plans`. Ningún marcador [NEEDS CLARIFICATION] abierto.
- **Ítems sin marcar (por decisión, no por calidad de redacción)**: «Sin detalles de implementación» (dos ítems). La spec nombra de forma deliberada tablas del insumo (`settings`, `service_types`, `audit_log`, `terms_versions`, `terms_acceptances`, `order_services.service_type_id`), el formato CSV con BOM y los archivos existentes donde viven las constantes, porque el insumo y el usuario los fijaron como alcance.
- **Diferencias entre el insumo y el código real** (registradas en «Supuestos»): `SHOP_*` no existe en `.env` (los datos son la constante `TALLER` en `ticket-service.js`); el token dura 30 minutos, no 8 horas; no existen `helmet` ni bloqueo por intentos; la política de contraseñas ya existe (RN-17); los pagos no se cancelan; órdenes y mantenimientos no están enlazados; las contraseñas sembradas difieren de las de `docs/project-context.md`; el ticket no persiste su contenido.
- **Historias**: 11 (el insumo tiene 10; US10 se dividió en bitácora y protección para poder cortar parte de P2 sin dejar piezas a medias).
- Marcar ítems `[x]` solo tras revisión.

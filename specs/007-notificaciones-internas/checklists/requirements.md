# Lista de calidad de la especificación: Notificaciones internas y clientes por avisar

**Propósito**: Validar la completitud y la calidad de la especificación antes de pasar a planificación
**Creada**: 2026-11-22
**Actualizada**: 2026-11-22 (tras `/speckit.clarify`)
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

## Notas

- **Aclaraciones resueltas el 2026-11-22** (sección «Aclaraciones» de la spec): FR-010 → fecha propia de último cambio de estado de la orden (`status_changed_at`, migración 018, rellenada con `updated_at`, N = 3 días); FR-015 → un mantenimiento avisado como próximo que pasa a vencido es el mismo hecho y no vuelve a la lista. Ya no queda ningún marcador [NEEDS CLARIFICATION] (solo la cita histórica del campo Input de la spec).
- **Ítems que siguen sin marcar (por decisión del usuario, no por calidad de redacción):**
  - «Sin detalles de implementación» (dos ítems): la spec menciona de forma deliberada elementos que el insumo o el usuario fijaron como alcance: la migración `018_...sql`, la fecha `status_changed_at`, los estados existentes `PROGRAMADA`, `COMPLETADA` y `CANCELADA`, la ausencia de WebSocket, la consulta cada 60 segundos y los archivos existentes (`order.js`, `order-service.js`, seed 004) que deben actualizar la fecha. Esto último responde a la instrucción expresa de indicar qué componentes existentes se verán afectados. No introducen stack, lenguajes ni estructura de código nueva.
- **Decisiones del plan confirmadas el 2026-11-22** (sección «Aclaraciones» de la spec): márgenes de «próximo» de 30 días o 1,000 km como constantes solo del aviso (FR-012, CA-5 redactados: vencidos al 100 %, próximos como subconjunto del conteo del panel); CA-8 y FR-008 corregidos porque la insignia de Inventario y `StockAlertsProvider` no existen (se compara con `alertasPanel`); seed 009 aceptado.
- Discrepancias entre el insumo y el sistema real, ya registradas en «Supuestos»: no existía historial de estados de órdenes (resuelto con la fecha propia); las citas no tienen estado «confirmada» (se usa `PROGRAMADA`); el panel de control cuenta las citas completadas de hoy mientras el centro las excluye.
- Revisión de otras ambigüedades de alto impacto: ninguna encontrada; los valores por defecto adoptados (cita identificada por su registro, independencia entre «leído» y «avisado», fecha local del servidor para «hoy» y «mañana») están en «Supuestos».
- Marcar ítems `[x]` solo tras revisión; `/speckit.clarify` reevalúa este archivo tras resolver las aclaraciones.

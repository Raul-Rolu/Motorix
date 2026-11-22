# Lista de calidad de la especificación: Notificaciones internas y clientes por avisar

**Propósito**: Validar la completitud y la calidad de la especificación antes de pasar a planificación
**Creada**: 2026-11-22
**Feature**: [spec.md](../spec.md)

## Calidad del contenido

- [ ] Sin detalles de implementación (lenguajes, frameworks, APIs)
- [x] Enfocada en el valor para el usuario y en las necesidades del negocio
- [x] Redactada para interesados no técnicos
- [x] Todas las secciones obligatorias completas

## Completitud de los requisitos

- [ ] No quedan marcadores [NEEDS CLARIFICATION]
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

- **Ítems pendientes por decisión del usuario (no por calidad de redacción):**
  - «No quedan marcadores [NEEDS CLARIFICATION]»: quedan **2** aclaraciones abiertas (máximo permitido: 3):
    1. **FR-010 (orden detenida)**: el sistema no guarda la fecha del último cambio de estado de una orden (la tabla de historial de estados que cita el insumo no existe). Opciones: (a) usar la última modificación del registro de la orden como aproximación (cualquier edición la reinicia), o (b) agregar una marca propia de «último cambio de estado» en la migración 018.
    2. **FR-015 (cliente avisado por mantenimiento)**: si un mantenimiento ya avisado como próximo pasa después a vencido, ¿es el mismo hecho (no vuelve a aparecer) o uno nuevo (vuelve a la lista)?
  - «Sin detalles de implementación»: la spec menciona de forma deliberada elementos del insumo que son entregables o restricciones heredadas (la migración `018_...sql`, los estados existentes `PROGRAMADA`, `COMPLETADA` y `CANCELADA`, la ausencia de WebSocket, la consulta cada 60 segundos y los archivos `docs/project-context.md` y `docs/design-system.md`). No introducen stack, lenguajes ni estructura de código; se conservan porque el insumo los fijó como alcance.
- Discrepancias detectadas entre el insumo y el sistema real (registradas en la sección «Supuestos»): no existe historial de estados de órdenes; las citas no tienen estado «confirmada»; el panel de control cuenta las citas completadas de hoy mientras el centro las excluye.
- El resto de los ítems se validó como cumplido al momento de crear el checklist.
- Marcar ítems `[x]` solo tras revisión; `/speckit.clarify` reevalúa este archivo tras resolver las aclaraciones.

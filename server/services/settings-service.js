/**
 * Servicio de configuración (008-configuracion-seguridad-reportes, T019; FR-001,
 * FR-002, FR-005, CA-1, CA-3).
 *
 * Los ajustes viven en la tabla `settings` (clave-valor). Si falta una clave o
 * su valor guardado es inválido se usa el valor de respaldo
 * (`utils/settings-defaults.js`), que repite las constantes de antes: una
 * instalación sin configuración guardada se comporta igual que en el Sprint 6.
 * No hay caché: cada consulta lee la tabla (una consulta), de modo que un
 * cambio del administrador se ve de inmediato.
 *
 * En el bloque P1 la API solo expone los grupos `taller` y `operacion`; los
 * minutos de inactividad se leen internamente pero se exponen desde P2.
 */
import * as settingModel from '../models/setting.js';
import * as auditService from './audit-service.js';
import { CLAVES, LIMITES, resolverValor } from '../utils/settings-defaults.js';

/**
 * Ajustes efectivos en un objeto plano para uso del backend (otros servicios):
 * `{ nombre, direccion, telefono, margenProximoDias, margenProximoKm,
 *    diasOrdenDetenida, minutosInactividad }`.
 */
export async function obtenerAjustes() {
  const guardado = await settingModel.findAll();
  const valor = (clave) => resolverValor(clave, guardado[clave]);
  return {
    nombre: valor(CLAVES.NOMBRE),
    direccion: valor(CLAVES.DIRECCION),
    telefono: valor(CLAVES.TELEFONO),
    margenProximoDias: valor(CLAVES.MARGEN_DIAS),
    margenProximoKm: valor(CLAVES.MARGEN_KM),
    diasOrdenDetenida: valor(CLAVES.DIAS_ORDEN_DETENIDA),
    minutosInactividad: valor(CLAVES.MINUTOS_INACTIVIDAD),
  };
}

/** Datos del taller en la forma que usa el ticket: `{ nombre, direccion, telefono }`. */
export function tallerDe(ajustes) {
  return {
    nombre: ajustes.nombre,
    direccion: ajustes.direccion,
    telefono: ajustes.telefono,
  };
}

/** Forma de la respuesta de `GET`/`PUT /api/settings` (contracts/api-rest.md, P1). */
export async function consultar() {
  const ajustes = await obtenerAjustes();
  return {
    taller: tallerDe(ajustes),
    operacion: {
      margenProximoDias: ajustes.margenProximoDias,
      margenProximoKm: ajustes.margenProximoKm,
      diasOrdenDetenida: ajustes.diasOrdenDetenida,
    },
    limites: {
      margenProximoDias: [...LIMITES[CLAVES.MARGEN_DIAS]],
      margenProximoKm: [...LIMITES[CLAVES.MARGEN_KM]],
      diasOrdenDetenida: [...LIMITES[CLAVES.DIAS_ORDEN_DETENIDA]],
    },
  };
}

/**
 * Guarda los cambios ya validados (claves de la tabla `settings`) y devuelve los
 * ajustes vigentes. La validación la hace el controlador con `validarAjustes`.
 */
export async function actualizar(cambios, usuario) {
  // Claves cuyo valor EFECTIVO realmente cambia (guardar el mismo valor, o el de
  // respaldo cuando no había nada guardado, no es un cambio) para la bitácora.
  const guardado = await settingModel.findAll();
  const modificadas = Object.keys(cambios).filter(
    (clave) => resolverValor(clave, guardado[clave]) !== cambios[clave]
  );

  await settingModel.upsertMany(cambios, usuario?.id ?? null);

  // Bitácora (008, FR-012): sin entrada si no cambió ningún valor.
  if (modificadas.length > 0) {
    await auditService.registrar('SETTINGS_UPDATED', {
      usuarioId: usuario?.id ?? null,
      datos: { claves: modificadas },
    });
  }
  return consultar();
}

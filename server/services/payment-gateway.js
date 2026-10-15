/**
 * Cliente del proveedor de pago (Sprint 4, T024, US2; research D6).
 *
 * Dos implementaciones con la MISMA interfaz, seleccionadas por MP_MODE:
 * - 'sandbox': API real del proveedor con el `fetch` nativo de Node (sin SDK).
 * - 'simulated': simulador interno sin red ni credenciales (decisión Q3 del
 *   clarify); reporta el cobro como confirmado para demostrar el flujo
 *   completo, y la caducidad se demuestra con cobros antiguos (FR-009).
 *
 * Credenciales SOLO en variables de entorno (RN-14, CA-7); jamás se guardan
 * en la base de datos. Un fallo del proveedor se señala con Error('MP_PROVIDER_ERROR')
 * y la capa superior traduce al catálogo central (MP_PROVIDER_ERROR, 502).
 */
import { randomUUID } from 'node:crypto';

const URL_BASE_PROVEEDOR = 'https://api.mercadopago.com/checkout/preferences';

/** 'sandbox' solo cuando se configura explícitamente; por defecto simulado. */
export function modoActual() {
  return process.env.MP_MODE === 'sandbox' ? 'sandbox' : 'simulated';
}

function token() {
  return process.env.MP_ACCESS_TOKEN ?? '';
}

/**
 * Crea la preferencia de pago (enlace de pago, FR-017) y devuelve
 * `{ enlace, referencia }`. La referencia es interna del sistema
 * (external_reference); nunca contiene datos de tarjeta (RN-14).
 */
export async function crearPreferencia({ monto, ordenId, referencia }) {
  if (modoActual() === 'sandbox') {
    let datos;
    try {
      const respuesta = await fetch(URL_BASE_PROVEEDOR, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          items: [
            {
              title: `Servicio Motorix (orden ${ordenId})`,
              quantity: 1,
              unit_price: monto,
            },
          ],
          external_reference: referencia,
        }),
      });
      if (!respuesta.ok) {
        throw new Error(`El proveedor respondió ${respuesta.status}.`);
      }
      datos = await respuesta.json();
    } catch {
      throw new Error('MP_PROVIDER_ERROR');
    }
    const enlace = datos.sandbox_init_point ?? datos.init_point;
    if (!enlace) {
      throw new Error('MP_PROVIDER_ERROR');
    }
    return { enlace, referencia: String(datos.id ?? referencia) };
  }

  // Simulado: mismo contrato, sin red (SC-008).
  return {
    enlace: `https://simulado.motorix.local/pago/${referencia}`,
    referencia,
  };
}

/**
 * Estado del cobro ante el proveedor (verificación bajo demanda, decisión
 * Q1): `{ confirmado: boolean }`. No hay notificaciones entrantes.
 */
export async function consultarEstado(referencia) {
  if (modoActual() === 'sandbox') {
    try {
      const respuesta = await fetch(
        `${URL_BASE_PROVEEDOR}/search?external_reference=${encodeURIComponent(referencia)}`,
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      if (!respuesta.ok) {
        throw new Error(`El proveedor respondió ${respuesta.status}.`);
      }
      const datos = await respuesta.json();
      const preferencia = datos.elements?.[0] ?? null;
      return { confirmado: preferencia?.status === 'approved' };
    } catch {
      throw new Error('MP_PROVIDER_ERROR');
    }
  }

  // Simulado: el cobro de prueba se confirma al verificar (demostración V4).
  return { confirmado: true };
}

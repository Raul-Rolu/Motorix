# Contrato: cambios de la API

Las rutas y respuestas existentes no cambian salvo lo siguiente.

## CORS

| Petición | Origen en `CORS_ORIGIN` | Otro origen o sin configurar |
|---|---|---|
| Cualquiera | `Access-Control-Allow-Origin` con ese origen, `Vary: Origin`, `Access-Control-Expose-Headers: Content-Disposition` | Sin cabeceras CORS |
| `OPTIONS` (preflight) | 204; métodos `GET, POST, PUT, PATCH, DELETE, OPTIONS`; cabeceras `Authorization, Content-Type`; `Max-Age` 600 | 204 sin cabeceras CORS |

Sin cookies ni credenciales de navegador. Las peticiones sin `Origin` (escritorio, guiones) no cambian.

## Límite de intentos

- Rutas: `POST /api/auth/login` y `POST /api/auth/change-password`, con un contador compartido por origen.
- Cuentan las respuestas 4xx; las correctas se descuentan.
- Tras 10 fallos en 15 minutos, toda petición a esas rutas desde ese origen responde:

```json
{ "error": { "codigo": "DEMASIADOS_INTENTOS", "mensaje": "Demasiados intentos fallidos. Espere 15 minutos y vuelva a intentar." } }
```

- Estado 429. No revela si la cuenta existe y no escribe en la bitácora.
- `crearApp()` acepta ajustar el límite solo desde código (pruebas); no hay variable para debilitarlo.

## Salud

`GET /api/health`, sin autenticación.

| Base | Estado | Cuerpo |
|---|---|---|
| Responde en 3 s | 200 | `servicio`, `estado: "ok"`, `baseDatos: "ok"` |
| Falla o tarda | 503 | `servicio`, `estado: "degradado"`, `baseDatos: "error"` |

No expone versión, servidor ni direcciones.

Con `LOG_CLIENT_IP=true`, cada consulta de salud escribe **solo en el registro del servicio** la IP resuelta y cuántas direcciones traía `X-Forwarded-For`. Es temporal, para ajustar `TRUST_PROXY`; la respuesta no cambia.

## Arranque

El proceso termina con código distinto de 0 y un mensaje en español si `JWT_SECRET` no cumple la regla o `TRUST_PROXY` no es válido. El mensaje no muestra valores. El diagnóstico informa base, TLS activado o no y desfase horario.

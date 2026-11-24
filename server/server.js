/**
 * Arranque del servidor backend (T017).
 * Toda la configuración viene de variables de entorno (nunca secretos en el código).
 */
import 'dotenv/config';
import { crearApp } from './app.js';
import { getPool } from './config/db.js';

const puerto = Number(process.env.PORT ?? 3000);

const app = crearApp();

/**
 * Diagnóstico de arranque (008, bloque P2): informa a qué base de datos está
 * conectado el servidor (sin credenciales) y si la tabla de la bitácora está
 * disponible. Un servidor apuntando a otra base, o con la migración 022 sin
 * aplicar, se detecta aquí y no en silencio. Nunca detiene el arranque.
 */
async function diagnosticoDeArranque() {
  console.log(
    `Base de datos: ${process.env.DB_NAME} en ${process.env.DB_HOST ?? 'localhost'}:${process.env.DB_PORT ?? 3306}`
  );
  try {
    await getPool().query('SELECT 1 FROM audit_log LIMIT 1');
    console.log('Bitácora: tabla audit_log disponible.');
  } catch (error) {
    console.error(
      `[bitácora] La tabla audit_log no está disponible (${error?.code ?? error?.message}); ` +
        'aplique las migraciones (hasta la migración 022) antes de arrancar el servidor: ' +
        'las acciones sensibles no quedarán registradas.'
    );
  }
}

app.listen(puerto, () => {
  console.log(`API de Motorix escuchando en el puerto ${puerto}`);
  diagnosticoDeArranque();
});

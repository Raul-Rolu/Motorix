/**
 * Arranque del servidor backend (T017).
 * Toda la configuración viene de variables de entorno (nunca secretos en el código).
 */
import 'dotenv/config';
import { crearApp } from './app.js';

const puerto = Number(process.env.PORT ?? 3000);

const app = crearApp();

app.listen(puerto, () => {
  console.log(`API de Motorix escuchando en el puerto ${puerto}`);
});

/** Guardado automático de borradores de formularios (recuperables tras un cierre inesperado). */
import { datos } from '../core/persistence/index.js';
import { sesion } from '../core/session.js';
import { ahora } from '../core/utils.js';

const clave = (k) => `${sesion.usuario()?.id}:${k}`;

export async function guardarBorrador(k, contenido) {
  await datos.guardar('borradores', { clave: clave(k), contenido, actualizado: ahora() });
}
export async function leerBorrador(k) { return datos.obtener('borradores', clave(k)); }
export async function descartarBorrador(k) { await datos.eliminar('borradores', clave(k)); }

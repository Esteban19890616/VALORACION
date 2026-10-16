/** Sesión local del prototipo (sessionStorage: se cierra al cerrar la pestaña). */
import { APP } from './config.js';
import { emit } from './events.js';

const CLAVE = 'si360.sesion';
let usuarioActual = null;
let temporizador = null;

const leer = () => { try { return JSON.parse(sessionStorage.getItem(CLAVE) || 'null'); } catch { return null; } };
const escribir = (v) => { try { v ? sessionStorage.setItem(CLAVE, JSON.stringify(v)) : sessionStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ } };

export const sesion = {
  usuario: () => usuarioActual,
  idGuardado: () => leer()?.usuarioId ?? null,
  iniciar(usuario) {
    usuarioActual = usuario;
    escribir({ usuarioId: usuario.id, inicio: new Date().toISOString() });
    this.reiniciarInactividad();
    emit('sesion', usuario);
  },
  restaurar(usuario) { usuarioActual = usuario; this.reiniciarInactividad(); },
  cerrar(motivo = '') {
    usuarioActual = null; escribir(null); clearTimeout(temporizador);
    emit('sesion', null); if (motivo) emit('aviso', { tipo: 'advertencia', texto: motivo });
  },
  reiniciarInactividad() {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => this.cerrar('La sesión se cerró por inactividad.'), APP.SESION_INACTIVIDAD_MIN * 60000);
  },
};

['click', 'keydown'].forEach((ev) => globalThis.addEventListener?.(ev, () => usuarioActual && sesion.reiniciarInactividad(), { passive: true }));

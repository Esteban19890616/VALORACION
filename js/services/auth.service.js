/**
 * Autenticación. Local: credenciales PBKDF2 en el navegador. Servidor: la API PHP valida la contraseña,
 * emite una cookie de sesión HttpOnly y un token CSRF; el cliente nunca recibe hashes.
 */
import { APP } from '../core/config.js';
import { datos } from '../core/persistence/index.js';
import { hashContrasena, verificarContrasena, validarPolitica } from '../core/crypto.js';
import { sesion } from '../core/session.js';
import { registrar } from '../core/audit.js';
import { uid, ahora } from '../core/utils.js';
import { validarEmail } from '../domain/validadores.js';

const SERVIDOR = APP.PERSISTENCIA === 'api';

export async function hayAdministrador() {
  if (SERVIDOR) return (await datos.estado()).administradorConfigurado;
  const us = await datos.porIndice('usuarios', 'rol', 'administrador');
  return us.some((u) => u.estado === 'activo');
}

/** Primer arranque: crea el administrador. Solo es posible si no existe ninguno. */
export async function crearAdministradorInicial({ nombre, email, contrasena }) {
  if (await hayAdministrador()) throw new Error('Ya existe un administrador. Inicie sesión.');
  const errores = [];
  if (!nombre?.trim()) errores.push('Ingrese el nombre completo.');
  if (!validarEmail(email)) errores.push('Ingrese un correo válido.');
  const pol = validarPolitica(contrasena);
  if (pol.length) errores.push(`La contraseña necesita ${pol.join(', ')}.`);
  if (errores.length) throw new Error(errores.join(' '));
  if (SERVIDOR) { const u = await datos.instalar({ nombre: nombre.trim(), email: email.trim().toLowerCase(), contrasena }); sesion.iniciar(u); return u; }
  const u = {
    id: uid(), nombre: nombre.trim(), email: email.trim().toLowerCase(), rol: 'administrador', estado: 'activo',
    cargo: 'Administrador del sistema', telefono: '', empresaId: null,
    credencial: await hashContrasena(contrasena), debeCambiarContrasena: false,
    intentosFallidos: 0, bloqueadoHasta: null, creadoEn: ahora(), creadoPor: 'primer-arranque', actualizadoEn: ahora(), version: 1,
  };
  await datos.guardar('usuarios', u);
  await registrar({ accion: 'crear', entidad: 'usuarios', entidadId: u.id, despues: u, motivo: 'Configuración inicial', usuario: u });
  sesion.iniciar(u);
  return u;
}

export async function ingresar(email, contrasena) {
  if (SERVIDOR) { const u = await datos.iniciarSesion(String(email || '').trim().toLowerCase(), contrasena); sesion.iniciar(u); return u; }
  const correo = String(email || '').trim().toLowerCase();
  const [u] = await datos.porIndice('usuarios', 'email', correo);
  const generico = 'Correo o contraseña incorrectos.';
  if (!u) { await registrar({ accion: 'ingreso_fallido', entidad: 'usuarios', motivo: 'Correo no registrado', resultado: 'rechazado' }); throw new Error(generico); }
  if (u.bloqueadoHasta && new Date(u.bloqueadoHasta) > new Date()) {
    const min = Math.ceil((new Date(u.bloqueadoHasta) - new Date()) / 60000);
    throw new Error(`Cuenta bloqueada temporalmente por intentos fallidos. Intente de nuevo en ${min} min.`);
  }
  if (u.estado !== 'activo') throw new Error('La cuenta está suspendida. Contacte al administrador.');
  if (!(await verificarContrasena(contrasena, u.credencial))) {
    u.intentosFallidos = (u.intentosFallidos || 0) + 1;
    if (u.intentosFallidos >= APP.INTENTOS_MAX) { u.bloqueadoHasta = new Date(Date.now() + APP.BLOQUEO_MIN * 60000).toISOString(); u.intentosFallidos = 0; }
    await datos.guardar('usuarios', u);
    await registrar({ accion: 'ingreso_fallido', entidad: 'usuarios', entidadId: u.id, resultado: 'rechazado', usuario: u });
    throw new Error(generico);
  }
  u.intentosFallidos = 0; u.bloqueadoHasta = null; u.ultimoIngreso = ahora();
  await datos.guardar('usuarios', u);
  sesion.iniciar(u);
  await registrar({ accion: 'ingreso', entidad: 'usuarios', entidadId: u.id });
  return u;
}

export async function restaurarSesion() {
  if (SERVIDOR) { const u = await datos.sesionActual(); if (u) sesion.restaurar(u); return u; }
  const id = sesion.idGuardado();
  if (!id) return null;
  const u = await datos.obtener('usuarios', id);
  if (!u || u.estado !== 'activo') { sesion.cerrar(); return null; }
  sesion.restaurar(u);
  return u;
}

export async function salir() {
  if (SERVIDOR) { try { await datos.cerrarSesion(); } catch { /* la sesión pudo expirar */ } sesion.cerrar(); return; }
  await registrar({ accion: 'salida', entidad: 'usuarios', entidadId: sesion.usuario()?.id });
  sesion.cerrar();
}

export async function cambiarContrasenaPropia(actual, nueva) {
  if (SERVIDOR) {
    const pol = validarPolitica(nueva);
    if (pol.length) throw new Error(`La nueva contraseña necesita ${pol.join(', ')}.`);
    const u = await datos.cambiarContrasena(actual, nueva); sesion.restaurar(u); return;
  }
  const u = await datos.obtener('usuarios', sesion.usuario()?.id);
  if (!u) throw new Error('Sesión no válida.');
  if (!(await verificarContrasena(actual, u.credencial))) throw new Error('La contraseña actual no es correcta.');
  const pol = validarPolitica(nueva);
  if (pol.length) throw new Error(`La nueva contraseña necesita ${pol.join(', ')}.`);
  u.credencial = await hashContrasena(nueva); u.debeCambiarContrasena = false; u.actualizadoEn = ahora();
  await datos.guardar('usuarios', u);
  sesion.restaurar(u);
  await registrar({ accion: 'cambio_contrasena', entidad: 'usuarios', entidadId: u.id, motivo: 'Cambio de contraseña propia' });
}

/** Gestión de usuarios (solo administrador). */
import { datos } from '../core/persistence/index.js';
import { hashContrasena, validarPolitica } from '../core/crypto.js';
import { sesion } from '../core/session.js';
import { registrar } from '../core/audit.js';
import { uid, ahora } from '../core/utils.js';
import { ROLES, APP } from '../core/config.js';
import { validarEmail, validarTelefono } from '../domain/validadores.js';
import { exigir, ErrorPermiso } from '../domain/permisos.js';

const yo = () => sesion.usuario();
const publico = ({ credencial, ...u }) => u;

export async function listarUsuarios() {
  const u = yo();
  if (u?.rol !== 'administrador') {
    const propio = await datos.obtener('usuarios', u?.id);
    return propio ? [publico(propio)] : [];
  }
  return (await datos.listar('usuarios')).map(publico).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export async function listarAsesoresActivos() {
  return (await datos.porIndice('usuarios', 'rol', 'asesor')).filter((u) => u.estado === 'activo').map(publico);
}

function validar(d, nuevo) {
  const e = [];
  if (!d.nombre?.trim()) e.push('Ingrese el nombre completo.');
  if (!validarEmail(d.email)) e.push('Ingrese un correo válido.');
  if (!ROLES[d.rol]) e.push('Seleccione un rol.');
  if (d.telefono && !validarTelefono(d.telefono)) e.push('El teléfono debe tener entre 7 y 13 dígitos.');
  if (d.rol === 'cliente' && !d.empresaId) e.push('Un usuario cliente debe estar vinculado a una empresa.');
  if (nuevo) { const p = validarPolitica(d.contrasena); if (p.length) e.push(`La contraseña temporal necesita ${p.join(', ')}.`); }
  if (e.length) throw new Error(e.join(' '));
}

export async function crearUsuario(d) {
  exigir(yo(), 'usuarios.administrar');
  validar(d, true);
  const email = d.email.trim().toLowerCase();
  if ((await datos.porIndice('usuarios', 'email', email)).length) throw new Error('Ya existe un usuario con ese correo.');
  const u = {
    id: uid(), nombre: d.nombre.trim(), email, rol: d.rol, estado: 'activo', cargo: d.cargo?.trim() || '',
    telefono: d.telefono?.trim() || '', empresaId: d.rol === 'cliente' ? d.empresaId : null,
    especialidades: d.especialidades || [], disponibilidadSemanal: Number(d.disponibilidadSemanal) || 0,
    credencial: await hashContrasena(d.contrasena), debeCambiarContrasena: true,
    intentosFallidos: 0, bloqueadoHasta: null, creadoEn: ahora(), creadoPor: yo().id, actualizadoEn: ahora(), version: 1,
  };
  await datos.guardar('usuarios', u);
  await registrar({ accion: 'crear', entidad: 'usuarios', entidadId: u.id, despues: u });
  return publico(u);
}

export async function actualizarUsuario(id, d) {
  exigir(yo(), 'usuarios.administrar');
  const antes = await datos.obtener('usuarios', id);
  if (!antes) throw new Error('El usuario no existe.');
  validar({ ...antes, ...d }, false);
  if (antes.rol === 'administrador' && d.rol && d.rol !== 'administrador') await protegerUltimoAdmin(id);
  const email = (d.email ?? antes.email).trim().toLowerCase();
  const otro = (await datos.porIndice('usuarios', 'email', email)).find((x) => x.id !== id);
  if (otro) throw new Error('Ya existe otro usuario con ese correo.');
  const despues = {
    ...antes, nombre: d.nombre?.trim() ?? antes.nombre, email, rol: d.rol ?? antes.rol, cargo: d.cargo ?? antes.cargo,
    telefono: d.telefono ?? antes.telefono, empresaId: (d.rol ?? antes.rol) === 'cliente' ? (d.empresaId ?? antes.empresaId) : null,
    especialidades: d.especialidades ?? antes.especialidades, disponibilidadSemanal: Number(d.disponibilidadSemanal ?? antes.disponibilidadSemanal) || 0,
    actualizadoEn: ahora(), actualizadoPor: yo().id, version: (antes.version || 1) + 1,
  };
  await datos.guardar('usuarios', despues);
  await registrar({ accion: 'modificar', entidad: 'usuarios', entidadId: id, antes, despues });
  return publico(despues);
}

async function protegerUltimoAdmin(id) {
  const admins = (await datos.porIndice('usuarios', 'rol', 'administrador')).filter((u) => u.estado === 'activo' && u.id !== id);
  if (!admins.length) throw new Error('Debe existir al menos un administrador activo.');
}

export async function cambiarEstadoUsuario(id, estado, motivo) {
  exigir(yo(), 'usuarios.administrar');
  if (id === yo().id) throw new ErrorPermiso('No puede suspender su propia cuenta.');
  if (!motivo?.trim()) throw new Error('Indique el motivo.');
  const antes = await datos.obtener('usuarios', id);
  if (estado === 'suspendido' && antes.rol === 'administrador') await protegerUltimoAdmin(id);
  const despues = { ...antes, estado, actualizadoEn: ahora(), actualizadoPor: yo().id, version: (antes.version || 1) + 1 };
  await datos.guardar('usuarios', despues);
  await registrar({ accion: estado === 'activo' ? 'activar' : 'suspender', entidad: 'usuarios', entidadId: id, antes, despues, motivo });
}

export async function restablecerContrasena(id, temporal) {
  exigir(yo(), 'usuarios.administrar');
  const p = validarPolitica(temporal);
  if (p.length) throw new Error(`La contraseña temporal necesita ${p.join(', ')}.`);
  if (APP.PERSISTENCIA === 'api') { await datos.restablecerContrasena(id, temporal); return; } // el servidor registra el evento en la bitácora
  const u = await datos.obtener('usuarios', id);
  u.credencial = await hashContrasena(temporal); u.debeCambiarContrasena = true; u.bloqueadoHasta = null; u.intentosFallidos = 0;
  u.actualizadoEn = ahora();
  await datos.guardar('usuarios', u);
  await registrar({ accion: 'modificar', entidad: 'usuarios', entidadId: id, motivo: 'Restablecimiento de contraseña por administrador' });
}

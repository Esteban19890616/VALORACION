/** Usuarios y roles (administrador). */
import { esc, fecha } from '../core/utils.js';
import { icono, pildora, TONO_ESTADO, modal, avisar, confirmar } from '../core/ui.js';
import { ROLES } from '../core/config.js';
import { sesion } from '../core/session.js';
import { PERMISOS } from '../domain/permisos.js';
import { listarUsuarios, crearUsuario, actualizarUsuario, cambiarEstadoUsuario, restablecerContrasena } from '../services/usuarios.service.js';
import { listarEmpresas } from '../services/empresas.service.js';

export async function vistaUsuarios(v) {
  const usuarios = await listarUsuarios();
  const empresas = await listarEmpresas({ estado: 'todas' });
  const cargaAsesor = (id) => empresas.filter((e) => e.asesorId === id && !['archivada', 'eliminada'].includes(e.estado)).length;
  const nombreEmpresa = new Map(empresas.map((e) => [e.id, e.razonSocial]));

  v.innerHTML = `
  <div class="titulo-vista"><div><h1>Usuarios y roles</h1><p>Cuentas de la consultora y de clientes de consulta. La asignación de empresas a asesores se hace desde el expediente de cada empresa.</p></div>
    <div class="acciones"><button class="btn btn-pri" id="btn-nuevo">${icono('mas')}Crear usuario</button></div></div>
  <div class="panel tabla-envoltura"><table class="tabla">
    <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Vínculo</th><th>Último ingreso</th><th>Estado</th><th></th></tr></thead>
    <tbody>${usuarios.map((u) => `<tr>
      <td><strong>${esc(u.nombre)}</strong>${u.cargo ? `<small>${esc(u.cargo)}</small>` : ''}${u.id === sesion.usuario().id ? ' ' + pildora('Usted', 'info') : ''}</td>
      <td>${esc(u.email)}</td><td>${esc(ROLES[u.rol])}</td>
      <td>${u.rol === 'asesor' ? `${cargaAsesor(u.id)} empresa(s)` : u.rol === 'cliente' ? esc(nombreEmpresa.get(u.empresaId) || '—') : 'Acceso global'}</td>
      <td>${fecha(u.ultimoIngreso, true)}</td>
      <td>${pildora(u.estado === 'activo' ? 'Activo' : 'Suspendido', TONO_ESTADO[u.estado])}${u.debeCambiarContrasena ? ' ' + pildora('Clave temporal', 'aviso') : ''}</td>
      <td><button class="btn btn-sec btn-peq" data-u="${u.id}">Abrir</button></td></tr>`).join('')}</tbody>
  </table></div>
  <section class="panel"><header><h2>Matriz de permisos</h2><small>Mínimo privilegio. En producción la aplica el servidor.</small></header>
    <div class="tabla-envoltura"><table class="tabla tabla-compacta"><thead><tr><th>Rol</th><th>Permisos</th></tr></thead><tbody>
      ${Object.entries(PERMISOS).map(([r, p]) => `<tr><td>${ROLES[r]}</td><td>${p.includes('*') ? 'Acceso global a todas las funciones' : p.map((x) => `<code>${x}</code>`).join(' ')}</td></tr>`).join('')}
    </tbody></table></div></section>`;

  v.querySelector('#btn-nuevo').onclick = () => formulario(null, empresas, () => vistaUsuarios(v));
  v.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => formulario(usuarios.find((u) => u.id === b.dataset.u), empresas, () => vistaUsuarios(v)));
}

async function formulario(u, empresas, recargar) {
  const nuevo = !u; const d = u || { rol: 'asesor' };
  const vigentes = empresas.filter((e) => !['archivada', 'eliminada'].includes(e.estado));
  const acciones = [{ texto: 'Cancelar', valor: null }];
  if (!nuevo && u.id !== sesion.usuario().id) {
    acciones.push({ texto: u.estado === 'activo' ? 'Suspender' : 'Reactivar', clase: u.estado === 'activo' ? 'btn-peligro' : 'btn-sec', valor: 'estado' });
    acciones.push({ texto: 'Restablecer contraseña', valor: 'clave' });
  }
  acciones.push({ texto: nuevo ? 'Crear usuario' : 'Guardar', clase: 'btn-pri', alPulsar: async (m) => {
    const f = Object.fromEntries(new FormData(m.querySelector('form')));
    if (nuevo) await crearUsuario(f); else await actualizarUsuario(u.id, f);
    avisar(nuevo ? 'Usuario creado. Entréguele la contraseña temporal por un canal seguro; deberá cambiarla al ingresar.' : 'Usuario actualizado.', 'exito', 8000);
    return 'ok';
  } });

  const r = await modal({
    titulo: nuevo ? 'Crear usuario' : `Usuario: ${u.nombre}`, ancho: 'modal-ancho',
    contenido: `<form class="rejilla-form" onsubmit="return false">
      <label class="campo"><span>Nombre completo *</span><input name="nombre" id="us-nombre" value="${esc(d.nombre || '')}" required></label>
      <label class="campo"><span>Correo *</span><input name="email" id="us-email" type="email" value="${esc(d.email || '')}" required></label>
      <label class="campo"><span>Rol *</span><select name="rol" id="us-rol">${Object.entries(ROLES).map(([k, t]) => `<option value="${k}" ${d.rol === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="campo"><span>Cargo</span><input name="cargo" id="us-cargo" value="${esc(d.cargo || '')}"></label>
      <label class="campo"><span>Teléfono</span><input name="telefono" id="us-tel" value="${esc(d.telefono || '')}"></label>
      <label class="campo"><span>Disponibilidad semanal (h)</span><input name="disponibilidadSemanal" id="us-disp" type="number" min="0" step="0.5" value="${esc(d.disponibilidadSemanal || '')}"><small class="ayuda">Para asesores; se usa en la planificación (Fase 4).</small></label>
      <label class="campo"><span>Empresa (solo cliente)</span><select name="empresaId" id="us-empresa"><option value="">—</option>${vigentes.map((e) => `<option value="${e.id}" ${d.empresaId === e.id ? 'selected' : ''}>${esc(e.razonSocial)}</option>`).join('')}</select></label>
      ${nuevo ? `<label class="campo"><span>Contraseña temporal *</span><input name="contrasena" id="us-pw" type="password" autocomplete="new-password" required><small class="ayuda">Mínimo 10 caracteres con letras y números. Se exigirá cambiarla.</small></label>` : ''}
    </form>`,
    acciones,
  });

  if (r === 'ok') return recargar();
  if (r === 'estado') {
    const act = u.estado !== 'activo';
    const c = await confirmar({ titulo: act ? 'Reactivar usuario' : 'Suspender usuario', mensaje: `<p>${act ? 'Se reactivará' : 'Se suspenderá'} la cuenta de <b>${esc(u.nombre)}</b>.${act ? '' : ' No podrá ingresar; sus registros se conservan.'}</p>`, textoAccion: act ? 'Reactivar' : 'Suspender', peligro: !act, pedirMotivo: true });
    if (c?.ok) { try { await cambiarEstadoUsuario(u.id, act ? 'activo' : 'suspendido', c.motivo); avisar('Estado actualizado.'); recargar(); } catch (x) { avisar(x.message, 'error'); } }
  }
  if (r === 'clave') {
    await modal({
      titulo: 'Restablecer contraseña',
      contenido: `<p>Defina una contraseña temporal para <b>${esc(u.nombre)}</b>. Deberá cambiarla al ingresar.</p><label class="campo"><span>Contraseña temporal</span><input type="password" id="rc-pw" autocomplete="new-password"></label>`,
      acciones: [{ texto: 'Cancelar', valor: null }, { texto: 'Restablecer', clase: 'btn-pri', alPulsar: async (m) => { await restablecerContrasena(u.id, m.querySelector('#rc-pw').value); avisar('Contraseña restablecida.'); } }],
    });
  }
}

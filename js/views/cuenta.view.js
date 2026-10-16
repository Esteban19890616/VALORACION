/** Mi cuenta: datos del usuario, cambio de contraseña (obligatorio si es temporal) y cierre de sesión. */
import { esc, fecha } from '../core/utils.js';
import { icono, avisar } from '../core/ui.js';
import { ROLES, APP } from '../core/config.js';
import { sesion } from '../core/session.js';
import { cambiarContrasenaPropia, salir } from '../services/auth.service.js';
import { ir } from '../core/router.js';

export async function vistaCuenta(v) {
  const u = sesion.usuario();
  const obligatorio = !!u.debeCambiarContrasena;
  v.innerHTML = `
  <div class="titulo-vista"><div><h1>Mi cuenta</h1><p>${esc(u.nombre)} · ${esc(ROLES[u.rol])}</p></div>
    <div class="acciones"><button class="btn btn-sec" id="btn-salir">${icono('salir')}Cerrar sesión</button></div></div>
  ${obligatorio ? `<div class="banda banda-critica">${icono('candado')}<span><b>Debe cambiar su contraseña temporal antes de continuar.</b> Las demás secciones se habilitan cuando la cambie.</span></div>` : ''}
  <section class="rejilla-2">
    <article class="panel"><header><h2>Datos de la cuenta</h2></header>
      <dl class="ficha"><dt>Nombre</dt><dd>${esc(u.nombre)}</dd><dt>Correo</dt><dd>${esc(u.email)}</dd><dt>Rol</dt><dd>${esc(ROLES[u.rol])}</dd>
        <dt>Último ingreso</dt><dd>${fecha(u.ultimoIngreso, true)}</dd><dt>Modo de operación</dt><dd>${APP.PERSISTENCIA === 'api' ? 'Servidor (sesión segura, cierre por inactividad)' : 'Prototipo local en este navegador'}</dd></dl>
      <p class="nota">La sesión se cierra tras ${APP.SESION_INACTIVIDAD_MIN} minutos sin actividad. Después de ${APP.INTENTOS_MAX} intentos fallidos la cuenta se bloquea ${APP.BLOQUEO_MIN} minutos.</p>
    </article>
    <form class="panel" id="f-clave" novalidate>
      <header><h2>Cambiar contraseña</h2></header>
      <label class="campo"><span>Contraseña actual</span><input type="password" id="pw-actual" autocomplete="current-password" required></label>
      <label class="campo"><span>Nueva contraseña</span><input type="password" id="pw-nueva" autocomplete="new-password" required><small class="ayuda">Mínimo 10 caracteres, con letras y números. No reutilice la contraseña temporal.</small></label>
      <label class="campo"><span>Confirmar nueva contraseña</span><input type="password" id="pw-conf" autocomplete="new-password" required></label>
      <p class="form-error" id="pw-error" role="alert" hidden></p>
      <div class="acciones"><button class="btn btn-pri" type="submit">Guardar nueva contraseña</button></div>
    </form>
  </section>`;
  v.querySelector('#btn-salir').onclick = async () => { await salir(); ir('/acceso'); };
  const f = v.querySelector('#f-clave'); const err = v.querySelector('#pw-error');
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); err.hidden = true;
    const a = f.querySelector('#pw-actual').value; const n = f.querySelector('#pw-nueva').value; const c = f.querySelector('#pw-conf').value;
    try {
      if (!a || !n) throw new Error('Complete la contraseña actual y la nueva.');
      if (n !== c) throw new Error('La confirmación no coincide con la nueva contraseña.');
      if (n === a) throw new Error('La nueva contraseña debe ser distinta de la actual.');
      await cambiarContrasenaPropia(a, n);
      avisar('Contraseña actualizada.');
      if (obligatorio) { ir('/tablero'); location.reload(); } else vistaCuenta(v);
    } catch (x) { err.textContent = x.message; err.hidden = false; }
  });
}

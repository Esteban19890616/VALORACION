/** Pantalla de acceso y configuración del primer administrador. */
import { icono } from '../core/ui.js';
import { logo } from './layout.js';
import { hayAdministrador, crearAdministradorInicial, ingresar } from '../services/auth.service.js';

export async function vistaAcceso(raiz, alIngresar) {
  const primerArranque = !(await hayAdministrador());
  raiz.innerHTML = `
  <div class="acceso">
    <section class="acceso-marca">
      <div class="acceso-logo">${logo(56)}<div><strong>SER INTEGRAL 360</strong><span>Ser Integral Consultora S.A.S.</span></div></div>
      <h1>Diagnóstico empresarial integral</h1>
      <p>Cumplimiento jurídico, Seguridad y Salud en el Trabajo, calidad y gestión ambiental en un solo expediente, con trazabilidad normativa de cada hallazgo.</p>
      <ul class="acceso-campos">
        <li><b>JUR</b>Jurídico empresarial</li><li><b>SST</b>Dec. 1072/2015 · Res. 0312/2019</li>
        <li><b>CAL</b>Gestión de procesos</li><li><b>AMB</b>Dec. 1076/2015</li>
      </ul>
    </section>
    <section class="acceso-panel">
      <form id="f-acceso" class="tarjeta" novalidate>
        <h2>${primerArranque ? 'Configuración inicial' : 'Iniciar sesión'}</h2>
        <p class="sub">${primerArranque ? 'No hay usuarios registrados en este navegador. Cree la cuenta del administrador responsable.' : 'Ingrese con su correo y contraseña.'}</p>
        ${primerArranque ? `<label class="campo"><span>Nombre completo</span><input name="nombre" id="acc-nombre" autocomplete="name" required></label>` : ''}
        <label class="campo"><span>Correo electrónico</span><input name="email" id="acc-email" type="email" autocomplete="username" required></label>
        <label class="campo"><span>Contraseña</span><input name="contrasena" id="acc-pw" type="password" autocomplete="${primerArranque ? 'new-password' : 'current-password'}" required>
          ${primerArranque ? '<small class="ayuda">Mínimo 10 caracteres, con letras y números.</small>' : ''}</label>
        ${primerArranque ? `<label class="campo"><span>Confirmar contraseña</span><input name="confirmacion" id="acc-pw2" type="password" autocomplete="new-password" required></label>` : ''}
        <p class="form-error" id="acc-error" role="alert" hidden></p>
        <button class="btn btn-pri btn-bloque" type="submit">${primerArranque ? 'Crear administrador e ingresar' : 'Ingresar'}</button>
        <p class="nota">${icono('candado')} Prototipo local: la autenticación protege el uso cotidiano en este equipo, no reemplaza la seguridad de un servidor. No publique esta versión en Internet con datos reales.</p>
      </form>
    </section>
  </div>`;

  const f = raiz.querySelector('#f-acceso'); const err = raiz.querySelector('#acc-error');
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); err.hidden = true;
    const d = Object.fromEntries(new FormData(f));
    const b = f.querySelector('button[type=submit]'); b.disabled = true;
    try {
      if (primerArranque) {
        if (d.contrasena !== d.confirmacion) throw new Error('Las contraseñas no coinciden.');
        await crearAdministradorInicial(d);
      } else await ingresar(d.email, d.contrasena);
      alIngresar();
    } catch (x) { err.textContent = x.message; err.hidden = false; }
    finally { b.disabled = false; }
  });
  f.querySelector('input')?.focus();
}

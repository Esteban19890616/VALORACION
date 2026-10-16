/** Estructura de la aplicación: menú lateral, encabezado, indicador de guardado. */
import { APP, ROLES } from '../core/config.js';
import { sesion } from '../core/session.js';
import { on } from '../core/events.js';
import { esc } from '../core/utils.js';
import { icono } from '../core/ui.js';
import { puede } from '../domain/permisos.js';
import { ir } from '../core/router.js';

export const MENU = [
  { grupo: 'Gestión' },
  { ruta: '/tablero', texto: 'Tablero general', icono: 'tablero', permiso: 'dashboard.ver' },
  { ruta: '/empresas', texto: 'Empresas', icono: 'empresas', permiso: 'empresas.ver' },
  { ruta: '/diagnosticos', texto: 'Diagnósticos', icono: 'diagnostico', permiso: 'diagnosticos.ver' },
  { ruta: '/planes', texto: 'Planes y horas', icono: 'planes', permiso: 'planes.ver' },
  { ruta: '/informes', texto: 'Informes PDF', icono: 'informes', permiso: 'dashboard.ver' },
  { grupo: 'Administración' },
  { ruta: '/catalogo', texto: 'Catálogo normativo', icono: 'catalogo', permiso: 'catalogo.ver' },
  { ruta: '/usuarios', texto: 'Usuarios y roles', icono: 'usuarios', permiso: 'usuarios.administrar' },
  { ruta: '/bitacora', texto: 'Bitácora', icono: 'bitacora', permiso: 'auditoria.propia' },
  { ruta: '/respaldo', texto: 'Respaldo y datos', icono: 'respaldo', permiso: 'respaldos.administrar' },
];

export function montarEstructura(raiz) {
  const u = sesion.usuario();
  const items = MENU.filter((m) => m.grupo || puede(u, m.permiso) || (m.permiso === 'auditoria.propia' && puede(u, 'auditoria.global')));
  // quitar encabezados de grupo vacíos
  const visibles = items.filter((m, i) => !m.grupo || (items[i + 1] && !items[i + 1].grupo));
  raiz.innerHTML = `
  <div class="app">
    <aside class="lateral" id="lateral" aria-label="Navegación principal">
      <div class="marca">
        ${logo()}
        <div class="marca-txt"><strong>SER INTEGRAL 360</strong><span>Ser Integral Consultora S.A.S.</span></div>
      </div>
      <nav class="menu">
        ${visibles.map((m) => m.grupo ? `<p class="menu-grupo">${m.grupo}</p>` : `
          <a href="#${m.ruta}" class="menu-item" data-ruta="${m.ruta}">${icono(m.icono)}<span>${m.texto}</span>${m.fase ? `<em class="menu-fase" title="Se habilita en la Fase ${m.fase}">F${m.fase}</em>` : ''}</a>`).join('')}
      </nav>
      <div class="lateral-pie">
        <span>v${APP.version} · ${esc(APP.fase)}</span>
        <span class="aviso-local">${icono('candado')} ${APP.PERSISTENCIA === 'api' ? 'Servidor seguro · datos en MySQL' : 'Prototipo local: los datos viven en este navegador'}</span>
      </div>
    </aside>
    <div class="velo" id="velo" hidden></div>
    <div class="principal">
      <header class="cabecera">
        <button class="btn-icono menu-movil" id="btn-menu" aria-label="Abrir menú" aria-controls="lateral" aria-expanded="false">${icono('menu')}</button>
        <div class="migas" id="migas"></div>
        <div class="estado-guardado" id="estado-guardado" aria-live="polite"><span class="punto"></span><span class="txt">Sin cambios pendientes</span></div>
        <button class="usuario" id="btn-usuario" aria-haspopup="dialog">
          <span class="avatar" aria-hidden="true">${esc(iniciales(u.nombre))}</span>
          <span class="usuario-txt"><strong>${esc(u.nombre)}</strong><span>${esc(ROLES[u.rol])}</span></span>
        </button>
      </header>
      <main id="vista" class="vista" tabindex="-1"></main>
    </div>
  </div>`;

  const lateral = raiz.querySelector('#lateral'); const velo = raiz.querySelector('#velo'); const bm = raiz.querySelector('#btn-menu');
  const alternar = (abrir) => { lateral.classList.toggle('abierto', abrir); velo.hidden = !abrir; bm.setAttribute('aria-expanded', String(abrir)); };
  bm.onclick = () => alternar(!lateral.classList.contains('abierto'));
  velo.onclick = () => alternar(false);
  lateral.addEventListener('click', (e) => { if (e.target.closest('.menu-item')) alternar(false); });
  raiz.querySelector('#btn-usuario').onclick = () => ir('/cuenta');

  const eg = raiz.querySelector('#estado-guardado');
  on('guardado', ({ estado, fecha }) => {
    eg.dataset.estado = estado;
    eg.querySelector('.txt').textContent = estado === 'guardando' ? 'Guardando…' : estado === 'error' ? 'Error al guardar' : `Guardado ${fecha.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;
  });
}

export function marcarMenu(ruta, migas) {
  document.querySelectorAll('.menu-item').forEach((a) => a.classList.toggle('activo', ruta.startsWith(a.dataset.ruta)));
  const m = document.getElementById('migas');
  if (m) m.innerHTML = migas.map((x, i) => (x.ruta && i < migas.length - 1 ? `<a href="#${x.ruta}">${esc(x.texto)}</a>` : `<span>${esc(x.texto)}</span>`)).join('<i>/</i>');
}

function iniciales(n = '') { return n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase(); }

export function logo(tam = 40) {
  // Monograma provisional "SI". Reemplazar por el logotipo oficial en assets/img/logo.svg.
  return `<svg class="logo" width="${tam}" height="${tam}" viewBox="0 0 40 40" aria-hidden="true">
    <rect width="40" height="40" rx="8" fill="var(--logo-fondo)"/>
    <path d="M10 26.5c1.6 1.4 3.6 2.1 5.7 2.1 2.6 0 4.3-1.2 4.3-3.1 0-4.4-9.6-2.6-9.6-8.6 0-2.9 2.5-5 6-5 2 0 3.8.6 5.2 1.6" fill="none" stroke="var(--logo-trazo)" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M28 12v16.5" stroke="var(--logo-acento)" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="28" cy="8.2" r="1.6" fill="var(--logo-acento)"/></svg>`;
}

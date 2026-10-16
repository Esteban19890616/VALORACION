/** Arranque de SER INTEGRAL 360. */
import { APP, ENTORNO_VALIDO } from './core/config.js';
import { datos } from './core/persistence/index.js';
import { sesion } from './core/session.js';
import { on } from './core/events.js';
import { avisar } from './core/ui.js';
import { esc } from './core/utils.js';
import { ruta, configurarGuardia, alNavegar, resolver, ir } from './core/router.js';
import { puede } from './domain/permisos.js';
import { restaurarSesion } from './services/auth.service.js';
import { montarEstructura, marcarMenu } from './views/layout.js';
import { vistaAcceso } from './views/acceso.view.js';
import { vistaTablero } from './views/tablero.view.js';
import { vistaEmpresas } from './views/empresas.view.js';
import { vistaEmpresaForm } from './views/empresa-form.view.js';
import { vistaEmpresaDetalle } from './views/empresa-detalle.view.js';
import { vistaUsuarios } from './views/usuarios.view.js';
import { vistaBitacora } from './views/bitacora.view.js';
import { vistaRespaldo } from './views/respaldo.view.js';
import { vistaInformes } from './views/informes.view.js';
import { vistaCuenta } from './views/cuenta.view.js';
import { vistaCatalogo } from './views/catalogo.view.js';
import { vistaDiagnosticos } from './views/diagnosticos.view.js';
import { vistaDiagnostico } from './views/diagnostico.view.js';
import { vistaPlanes, vistaPlanEmpresa } from './views/planes.view.js';
import { asegurarCatalogo } from './services/catalogo.service.js';
import { destruirGraficos } from './views/graficos.js';

const raiz = document.getElementById('app');
let estructuraMontada = false;

ruta('/acceso', null, { publica: true });
ruta('/tablero', vistaTablero, { permiso: 'dashboard.ver', migas: [{ texto: 'Tablero general' }] });
ruta('/empresas', vistaEmpresas, { permiso: 'empresas.ver', migas: [{ texto: 'Empresas' }] });
ruta('/empresas/nueva', vistaEmpresaForm, { permiso: 'empresas.administrar', migas: [{ texto: 'Empresas', ruta: '/empresas' }, { texto: 'Registrar' }] });
ruta('/empresas/:id', vistaEmpresaDetalle, { permiso: 'empresas.ver', migas: [{ texto: 'Empresas', ruta: '/empresas' }, { texto: 'Expediente' }] });
ruta('/empresas/:id/editar', vistaEmpresaForm, { permiso: 'empresas.administrar', migas: [{ texto: 'Empresas', ruta: '/empresas' }, { texto: 'Editar' }] });
ruta('/usuarios', vistaUsuarios, { permiso: 'usuarios.administrar', migas: [{ texto: 'Usuarios y roles' }] });
ruta('/bitacora', vistaBitacora, { permiso: 'auditoria.propia', migas: [{ texto: 'Bitácora' }] });
ruta('/respaldo', vistaRespaldo, { permiso: 'respaldos.administrar', migas: [{ texto: 'Respaldo y datos' }] });
ruta('/catalogo', vistaCatalogo, { permiso: 'catalogo.ver', migas: [{ texto: 'Catálogo normativo' }] });
ruta('/diagnosticos', vistaDiagnosticos, { permiso: 'diagnosticos.ver', migas: [{ texto: 'Diagnósticos' }] });
ruta('/diagnosticos/:id', vistaDiagnostico, { permiso: 'diagnosticos.ver', migas: [{ texto: 'Diagnósticos', ruta: '/diagnosticos' }, { texto: 'Diagnóstico' }] });
ruta('/planes', vistaPlanes, { permiso: 'planes.ver', migas: [{ texto: 'Planes y horas' }] });
ruta('/planes/:empresaId', vistaPlanEmpresa, { permiso: 'planes.ver', migas: [{ texto: 'Planes y horas', ruta: '/planes' }, { texto: 'Plan de la empresa' }] });
ruta('/cuenta', vistaCuenta, { migas: [{ texto: 'Mi cuenta' }] });
ruta('/informes', vistaInformes, { permiso: 'dashboard.ver', migas: [{ texto: 'Informes PDF' }] });

configurarGuardia(async (r) => {
  const u = sesion.usuario();
  if (r.publica) return u ? '/tablero' : null;
  if (!u) return '/acceso';
  if (u.debeCambiarContrasena && r.patron !== '/cuenta') return '/cuenta';
  if (r.permiso && !puede(u, r.permiso)) { avisar('No tiene permiso para abrir esa sección.', 'error'); return '/tablero'; }
  return null;
});

alNavegar(async (r, params) => {
  destruirGraficos();
  if (r.publica) {
    estructuraMontada = false;
    return vistaAcceso(raiz, () => ir('/tablero'));
  }
  if (!estructuraMontada) {
    // En el servidor el catálogo base se instala cuando ingresa un administrador (requiere sesión).
    if (APP.PERSISTENCIA === 'api' && puede(sesion.usuario(), 'catalogo.administrar')) { try { await asegurarCatalogo(); } catch (e) { console.error(e); } }
    montarEstructura(raiz); estructuraMontada = true;
  }
  marcarMenu(location.hash.slice(1), r.migas || []);
  const v = document.getElementById('vista');
  v.innerHTML = '<div class="cargando" aria-busy="true">Cargando…</div>';
  try { await r.vista(v, params); }
  catch (e) {
    if (e.estado === 401 || descargando) return; // sesión expirada (lleva al acceso) o página recargándose
    console.error(e);
    v.innerHTML = `<div class="panel vacio"><h2>No fue posible cargar esta sección</h2><p>${esc(e.message)}</p><a class="btn btn-sec" href="#/tablero">Volver al tablero</a></div>`;
  }
  v.focus({ preventScroll: true }); window.scrollTo(0, 0);
});

// Las solicitudes que el navegador cancela al recargar la página no son errores de la aplicación.
let descargando = false;
addEventListener('beforeunload', () => { descargando = true; });

on('sesion', (u) => { if (!u) { estructuraMontada = false; ir('/acceso'); } });
on('sesion-expirada', () => { if (sesion.usuario()) sesion.cerrar('Su sesión expiró. Ingrese de nuevo.'); });

async function iniciar() {
  try {
    if (!ENTORNO_VALIDO) throw new Error('No se pudo cargar la configuración del entorno (js/entorno.js o api/entorno.php).');
    await datos.abrir();
    if (APP.PERSISTENCIA !== 'api') await asegurarCatalogo();
    await restaurarSesion();
    document.title = APP.nombre;
    if (!location.hash) history.replaceState(null, '', `#${sesion.usuario() ? '/tablero' : '/acceso'}`);
    await resolver();
  } catch (e) {
    console.error(e);
    raiz.innerHTML = `<div class="fallo-arranque"><h1>SER INTEGRAL 360 no pudo iniciar</h1><p>${esc(e.message)}</p>
      <p>${APP.PERSISTENCIA === 'api' ? 'Verifique la conexión con el servidor e intente de nuevo. Si persiste, contacte al administrador.' : 'Abra la aplicación con el servidor local (<code>iniciar.bat</code>) en Chrome, Edge o Firefox, fuera de ventanas privadas.'}</p></div>`;
  }
}

addEventListener('unhandledrejection', (e) => { console.error(e.reason); avisar(e.reason?.message || 'Ocurrió un error inesperado.', 'error'); });
iniciar();

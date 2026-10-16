/** Tablero general con indicadores reales de cartera, cumplimiento, acciones y horas. */
import { esc, fecha } from '../core/utils.js';
import { pildora, TONO_ESTADO, icono } from '../core/ui.js';
import { ESTADOS_EMPRESA, SECTORES } from '../core/config.js';
import { sesion } from '../core/session.js';
import { CAMPOS } from '../data/catalogo-base.js';
import { CAMPOS_P, PRIORIDADES } from '../domain/priorizacion.js';
import { indicadoresGenerales } from '../services/dashboard.service.js';
import { listarAsesoresActivos } from '../services/usuarios.service.js';
import { graficoBarras, graficoPorcentaje, graficoLinea, destruirGraficos } from './graficos.js';
import { etiquetaMes } from '../domain/planificacion.js';

let filtros = { asesorId: '', sector: '', municipio: '', desde: '', hasta: '', campo: '' };

export async function vistaTablero(v) {
  const u = sesion.usuario();
  const asesores = u.rol === 'administrador' ? await listarAsesoresActivos() : [];
  const k = await indicadoresGenerales(filtros);
  const municipios = Object.keys(k.porMunicipio).filter((m) => m !== 'Sin dato').sort();
  const pct = (x) => (x == null ? '<span class="kpi-nd">Sin datos</span>' : `<span class="kpi-valor">${x} %</span>`);

  v.innerHTML = `
  <div class="titulo-vista"><div><h1>Tablero general</h1><p>${u.rol === 'asesor' ? 'Estado de las empresas asignadas a usted.' : u.rol === 'cliente' ? 'Estado de su empresa.' : 'Estado de la cartera de clientes.'}</p></div></div>
  ${k.demo ? `<div class="banda banda-aviso">${icono('alerta')}<span>Hay ${k.demo} empresa(s) de <b>demostración</b> incluidas en los indicadores. Retírelas en <a href="#/respaldo">Respaldo y datos</a> antes de usar el sistema con clientes reales.</span></div>` : ''}
  <form class="filtros" id="f-tablero">
    ${u.rol === 'administrador' ? `<label class="campo"><span>Asesor</span><select name="asesorId" id="ft-asesor"><option value="">Todos</option>${asesores.map((a) => `<option value="${a.id}" ${filtros.asesorId === a.id ? 'selected' : ''}>${esc(a.nombre)}</option>`).join('')}</select></label>` : ''}
    <label class="campo"><span>Sector</span><select name="sector" id="ft-sector"><option value="">Todos</option>${SECTORES.map((s) => `<option ${filtros.sector === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    <label class="campo"><span>Municipio</span><select name="municipio" id="ft-municipio"><option value="">Todos</option>${municipios.map((m) => `<option ${filtros.municipio === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
    <label class="campo"><span>Aprobados desde</span><input type="date" name="desde" id="ft-desde" value="${filtros.desde}"></label>
    <label class="campo"><span>Hasta</span><input type="date" name="hasta" id="ft-hasta" value="${filtros.hasta}"></label>
    <label class="campo"><span>Campo evaluado</span><select name="campo" id="ft-campo"><option value="">General</option>${CAMPOS_P.map((c) => `<option value="${c}" ${filtros.campo === c ? 'selected' : ''}>${CAMPOS[c].nombre}</option>`).join('')}</select></label>
  </form>

  <section class="kpis">
    <article class="kpi"><h3>Empresas vigentes</h3><span class="kpi-valor">${k.totalEmpresas}</span><small>${k.activas} activas · ${k.evaluadas} con diagnóstico aprobado</small></article>
    <article class="kpi"><h3>Evaluaciones</h3><span class="kpi-valor">${k.evaluacionesEnCurso}</span><small>en curso · ${k.pendientesAprobacion} pendiente(s) de aprobación</small></article>
    <article class="kpi ${k.empresasConCriticos ? 'kpi-critico' : ''}"><h3>Con incumplimientos críticos</h3><span class="kpi-valor">${k.empresasConCriticos}</span><small>según su último diagnóstico aprobado</small></article>
    <article class="kpi ${k.sinAsesor ? 'kpi-alerta' : ''}"><h3>Activas sin asesor</h3><span class="kpi-valor">${k.sinAsesor}</span><small>${k.sinAsesor ? 'Requieren asignación' : 'Todas asignadas'}</small></article>
  </section>
  <section class="kpis">
    <article class="kpi"><h3>Cumplimiento promedio simple</h3>${pct(k.promedioSimple)}<small>Cada empresa pesa igual (${k.evaluadas} empresa(s))</small></article>
    <article class="kpi"><h3>Promedio ponderado por trabajadores</h3>${pct(k.promedioPonderado)}<small>Pesa más donde hay más personas expuestas</small></article>
    <article class="kpi ${k.accionesVencidas ? 'kpi-alerta' : ''}"><h3>Acciones del plan</h3><span class="kpi-valor">${k.accionesPendientes}</span><small>abiertas · ${k.accionesVencidas} vencida(s)</small></article>
    <article class="kpi"><h3>Horas de ${esc(etiquetaMes(new Date().toISOString().slice(0, 7)))}</h3><span class="kpi-valor">${k.horasEjecutadasMes}</span><small>ejecutadas de ${k.horasProgramadasMes} programadas · ${k.horasPendientesMes} pendientes · ${k.horasContratadasMes} contratadas</small></article>
  </section>

  <section class="rejilla-2">
    <article class="panel"><header><h2>Cumplimiento promedio por campo</h2><small>Promedio simple entre empresas con datos en el campo</small></header><div class="lienzo"><canvas id="g-campo" role="img" aria-label="Cumplimiento promedio por campo"></canvas></div></article>
    <article class="panel"><header><h2>Comparación entre empresas</h2><small>${filtros.campo ? `Campo ${esc(CAMPOS[filtros.campo].nombre)}` : 'Promedio general'} del último diagnóstico aprobado</small></header>
      ${k.comparacion.length ? `<div class="lienzo lienzo-alto" style="height:${Math.max(220, k.comparacion.length * 34)}px"><canvas id="g-comp" role="img" aria-label="Comparación entre empresas"></canvas></div>` : '<p class="vacio-graf">Aún no hay diagnósticos aprobados.</p>'}</article>
  </section>
  <section class="rejilla-2">
    <article class="panel"><header><h2>Evolución histórica</h2><small>Promedio de los diagnósticos aprobados en cada mes</small></header>
      ${k.evolucion.length ? '<div class="lienzo"><canvas id="g-evol" role="img" aria-label="Evolución del cumplimiento"></canvas></div>' : '<p class="vacio-graf">La evolución aparece cuando haya diagnósticos aprobados.</p>'}</article>
    <article class="panel"><header><h2>Próximas actividades</h2><small>Fechas límite en los próximos 14 días</small></header>
      ${k.proximas.length ? `<ul class="lista">${k.proximas.map((a) => `<li><a href="#/planes/${a.empresaId}"><strong>${esc(a.codigo)} · ${esc(a.actividad)}</strong><span>${esc(a.empresa || '')} · límite ${esc(a.fechaLimite)}</span></a>${pildora(PRIORIDADES[a.prioridad].etiqueta, PRIORIDADES[a.prioridad].tono)}</li>`).join('')}</ul>` : '<p class="sub">No hay actividades con vencimiento próximo.</p>'}</article>
  </section>
  <section class="rejilla-2">
    <article class="panel"><header><h2>Empresas por sector</h2></header><div class="lienzo"><canvas id="g-sector" aria-label="Empresas por sector" role="img"></canvas></div></article>
    <article class="panel"><header><h2>Clase de riesgo laboral</h2><small>Decreto 1295 de 1994, art. 26 · clases I a V</small></header><div class="lienzo"><canvas id="g-riesgo" aria-label="Empresas por clase de riesgo" role="img"></canvas></div></article>
  </section>
  <section class="rejilla-2">
    <article class="panel"><header><h2>Carga por asesor</h2></header><div class="lienzo"><canvas id="g-asesor" aria-label="Empresas por asesor" role="img"></canvas></div></article>
    <article class="panel"><header><h2>Últimas empresas registradas</h2></header>
      ${k.recientes.length ? `<ul class="lista">${k.recientes.map((e) => `<li><a href="#/empresas/${e.id}"><strong>${esc(e.razonSocial)}</strong><span>${esc(e.codigo)} · NIT ${esc(e.nitFormato)} · ${fecha(e.creadoEn)}</span></a>${pildora(ESTADOS_EMPRESA[e.estado], TONO_ESTADO[e.estado])}</li>`).join('')}</ul>`
        : `<div class="vacio"><p>Aún no hay empresas registradas.</p>${u.rol === 'administrador' ? '<a class="btn btn-pri" href="#/empresas/nueva">Registrar la primera empresa</a>' : ''}</div>`}
    </article>
  </section>`;

  destruirGraficos();
  graficoPorcentaje('g-campo', CAMPOS_P.map((c) => `${CAMPOS[c].nombre}${k.porCampo[c] ? ` (n=${k.porCampo[c].n})` : ''}`), CAMPOS_P.map((c) => k.porCampo[c]?.promedio ?? null));
  if (k.comparacion.length) graficoPorcentaje('g-comp', k.comparacion.map((x) => x.empresa.length > 34 ? `${x.empresa.slice(0, 32)}…` : x.empresa), k.comparacion.map((x) => (filtros.campo ? x.porCampo?.[filtros.campo]?.porcentaje ?? null : x.promedio)), { horizontal: true });
  if (k.evolucion.length) graficoLinea('g-evol', k.evolucion.map((x) => etiquetaMes(x.mes)), [{ nombre: 'Promedio de diagnósticos aprobados', valores: k.evolucion.map((x) => x.promedio) }]);
  graficoBarras('g-sector', k.porSector, { horizontal: true });
  graficoBarras('g-riesgo', ordenarRiesgo(k.porRiesgo));
  graficoBarras('g-asesor', k.porAsesor, { horizontal: true });

  v.querySelector('#f-tablero').addEventListener('change', (e) => { filtros = { ...filtros, [e.target.name]: e.target.value }; vistaTablero(v); });
}

function ordenarRiesgo(o) {
  const orden = ['Clase I', 'Clase II', 'Clase III', 'Clase IV', 'Clase V', 'Sin dato'];
  return Object.fromEntries(orden.filter((x) => o[x]).map((x) => [x, o[x]]));
}

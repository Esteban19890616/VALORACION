/** Panel de indicadores de una empresa: cumplimiento, evolución, hallazgos, horas y acciones. */
import { esc, fecha } from '../core/utils.js';
import { pildora, icono } from '../core/ui.js';
import { datos } from '../core/persistence/index.js';
import { sesion } from '../core/session.js';
import { puede } from '../domain/permisos.js';
import { CAMPOS } from '../data/catalogo-base.js';
import { CAMPOS_P, PRIORIDADES, horasPorCampo } from '../domain/priorizacion.js';
import { vencida, etiquetaMes } from '../domain/planificacion.js';
import { listarDiagnosticos } from '../services/diagnosticos.service.js';
import { contextoPlan } from '../services/planes.service.js';
import { graficoPorcentaje, graficoRadar, graficoLinea, destruirGraficos, registrarGrafico } from './graficos.js';

const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const n1 = (v) => (Math.round((Number(v) || 0) * 10) / 10).toLocaleString('es-CO');

export async function pintarIndicadores(panel, empresa) {
  const u = sesion.usuario();
  const dxs = puede(u, 'diagnosticos.ver') ? (await listarDiagnosticos({ empresaId: empresa.id })).filter((d) => ['aprobado', 'cerrado'].includes(d.estado) && d.resultados).sort((a, b) => a.aprobadoEn.localeCompare(b.aprobadoEn)) : [];
  const ult = dxs.at(-1); const ant = dxs.at(-2);
  let plan = null; try { plan = await contextoPlan(empresa.id); } catch { /* sin plan visible */ }
  const hallazgos = ult ? await datos.porIndice('hallazgos', 'diagnosticoId', ult.id) : [];
  const evid = (await datos.porIndice('evidencias', 'empresaId', empresa.id)).filter((x) => !x.eliminado).length;
  const docs = (await datos.porIndice('documentos', 'empresaId', empresa.id)).filter((x) => !x.eliminado).length;
  const hoy = new Date().toISOString().slice(0, 10); const mes = hoy.slice(0, 7);
  const acts = plan?.actividades?.filter((a) => a.estado !== 'cancelada') || [];
  const k = plan?.consolidado;
  const porSev = ['critica', 'alta', 'media', 'baja'].map((s) => hallazgos.filter((h) => h.severidad === s && h.estado !== 'cerrado_verificado').length);
  const pendVerif = ult ? (ult.resultados.pendientes || 0) : 0;

  if (!ult && !plan?.plan) {
    panel.innerHTML = `<div class="panel vacio"><p>El panel de indicadores se llena cuando la empresa tenga un diagnóstico aprobado.</p>${puede(u, 'diagnosticos.crear') ? `<a class="btn btn-pri" href="#/diagnosticos">Ir a diagnósticos</a>` : ''}</div>`;
    return;
  }
  const delta = (a, b) => (a == null || b == null ? '' : `${b - a >= 0 ? '+' : ''}${n1(b - a)} pp frente a ${ant.codigo}`);
  panel.innerHTML = `
  <section class="kpis">
    <article class="kpi"><h3>Cumplimiento general</h3><span class="kpi-valor">${ult?.resultados.promedioSimple ?? '—'}${ult?.resultados.promedioSimple != null ? ' %' : ''}</span><small>${ult ? `${esc(ult.codigo)} · aprobado ${fecha(ult.aprobadoEn)}${ant ? ` · ${delta(ant.resultados.promedioSimple, ult.resultados.promedioSimple)}` : ''}` : 'Sin diagnóstico aprobado'}</small></article>
    <article class="kpi ${porSev[0] ? 'kpi-critico' : ''}"><h3>Hallazgos abiertos</h3><span class="kpi-valor">${porSev.reduce((a, b) => a + b, 0)}</span><small>${porSev[0]} crítico(s) · ${porSev[1]} alto(s) · ${pendVerif} requisito(s) pendientes de verificación</small></article>
    <article class="kpi ${acts.some((a) => vencida(a, hoy)) ? 'kpi-alerta' : ''}"><h3>Acciones del plan</h3><span class="kpi-valor">${acts.filter((a) => a.estado !== 'verificada').length}</span><small>abiertas · ${acts.filter((a) => vencida(a, hoy)).length} vencida(s) · ${acts.filter((a) => a.estado === 'verificada').length} cerrada(s)</small></article>
    <article class="kpi"><h3>Horas del mes</h3><span class="kpi-valor">${k?.porMes[mes] ? n1(k.totalMes(mes).ejecutadas) : 0}</span><small>ejecutadas de ${n1(empresa.horasContratadasMes)} contratadas${k?.porMes[mes] ? ` · ${n1(k.totalMes(mes).programadas)} programadas` : ''}</small></article>
  </section>
  ${ult?.resultados.res0312 ? `<div class="banda ${ult.resultados.res0312.valoracion?.tono === 'ok' ? 'banda-ok' : ult.resultados.res0312.valoracion?.tono === 'critico' ? 'banda-critica' : 'banda-aviso'}">${icono('alerta')}<span>Estándares Mínimos (Res. 0312 de 2019): <b>${ult.resultados.res0312.porcentaje} % · ${esc(ult.resultados.res0312.valoracion?.etiqueta || '')}</b>. ${esc(ult.resultados.res0312.valoracion?.accion || '')}</span></div>` : ''}
  <section class="rejilla-2">
    <article class="panel"><header><h2>Resultado por campo</h2><small>${ant ? `${esc(ant.codigo)} frente a ${esc(ult.codigo)}` : ult ? esc(ult.codigo) : ''}</small></header><div class="lienzo"><canvas id="gi-campos" role="img" aria-label="Resultado por campo"></canvas></div></article>
    <article class="panel"><header><h2>Perfil de cumplimiento</h2></header><div class="lienzo"><canvas id="gi-radar" role="img" aria-label="Radar por campo"></canvas></div></article>
  </section>
  <section class="rejilla-2">
    <article class="panel"><header><h2>Evolución del cumplimiento</h2><small>${dxs.length} diagnóstico(s) aprobado(s)</small></header>${dxs.length >= 2 ? '<div class="lienzo"><canvas id="gi-evol" role="img" aria-label="Evolución"></canvas></div>' : '<p class="vacio-graf">La evolución aparece con dos o más diagnósticos aprobados.</p>'}</article>
    <article class="panel"><header><h2>Hallazgos abiertos por severidad y prioridad</h2></header><div class="lienzo"><canvas id="gi-sev" role="img" aria-label="Hallazgos por severidad"></canvas></div></article>
  </section>
  <section class="rejilla-2">
    <article class="panel"><header><h2>Distribución de horas</h2><small>${plan?.plan ? `${n1(plan.plan.horasMes)} h/mes · plan ${plan.plan.estado === 'aprobado' ? `aprobado v${plan.plan.version}` : 'en borrador'}` : 'Sin plan configurado'}</small></header>
      ${plan?.plan ? `<div class="tabla-envoltura"><table class="tabla tabla-compacta"><thead><tr><th>Campo</th><th class="num">%</th><th class="num">Asignadas/mes</th><th class="num">Programadas (total)</th><th class="num">Ejecutadas (total)</th></tr></thead><tbody>
        ${CAMPOS_P.map((c) => `<tr><td>${CAMPOS[c].nombre}</td><td class="num">${plan.plan.distribucion[c]}</td><td class="num">${n1(horasPorCampo(plan.plan.horasMes, plan.plan.distribucion)[c])}</td><td class="num">${n1(k.anual[c].programadas)}</td><td class="num">${n1(k.anual[c].ejecutadas)}</td></tr>`).join('')}
        <tr class="fila-total"><td>Total</td><td class="num">100</td><td class="num">${n1(plan.plan.horasMes)}</td><td class="num">${n1(k.totalAnual.programadas)}</td><td class="num">${n1(k.totalAnual.ejecutadas)}</td></tr></tbody></table></div>
        <a class="btn btn-sec btn-peq" href="#/planes/${empresa.id}">Abrir plan de trabajo</a>` : '<p class="sub">Configure el plan desde Planes y horas.</p>'}
    </article>
    <article class="panel"><header><h2>Próximos vencimientos</h2><small>30 días</small></header>
      ${(() => { const en30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10); const p = acts.filter((a) => a.fechaLimite && a.fechaLimite <= en30 && a.estado !== 'verificada').sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite)).slice(0, 8);
        return p.length ? `<ul class="lista">${p.map((a) => `<li><a href="#/planes/${empresa.id}"><strong>${esc(a.codigo)} · ${esc(a.actividad)}</strong><span>límite ${esc(a.fechaLimite)}${vencida(a, hoy) ? ' · vencida' : ''}</span></a>${pildora(PRIORIDADES[a.prioridad].etiqueta, PRIORIDADES[a.prioridad].tono)}</li>`).join('')}</ul>` : '<p class="sub">Sin vencimientos próximos.</p>'; })()}
    </article>
  </section>
  <section class="rejilla-2">
    <article class="panel"><header><h2>Recomendaciones principales</h2><small>Hallazgos abiertos de mayor riesgo</small></header>
      ${hallazgos.length ? `<ul class="lista-simple">${hallazgos.filter((h) => h.estado !== 'cerrado_verificado' && h.tipo !== 'pendiente_verificacion').sort((a, b) => (b.riesgo?.valor || 0) - (a.riesgo?.valor || 0)).slice(0, 6).map((h) => `<li><b class="mono">${esc(h.codigo)}</b> ${pildora(h.riesgo?.etiqueta || '', h.riesgo?.tono || 'neutro')} ${esc(h.recomendacion || h.descripcion)}</li>`).join('')}</ul>` : '<p class="sub">Sin hallazgos registrados.</p>'}
    </article>
    <article class="panel"><header><h2>Documentos y evidencias</h2></header>
      <dl class="conteos"><dt>Documentos del expediente</dt><dd>${docs}</dd><dt>Evidencias (diagnósticos y actividades)</dt><dd>${evid}</dd><dt>Diagnósticos aprobados</dt><dd>${dxs.length}</dd>${plan?.meses ? `<dt>Horizonte del plan</dt><dd>${esc(etiquetaMes(plan.meses[0]))} – ${esc(etiquetaMes(plan.meses.at(-1)))}</dd>` : ''}</dl>
    </article>
  </section>`;

  destruirGraficos();
  if (ult) {
    const campos = CAMPOS_P.filter((c) => ult.campos.includes(c));
    if (ant) {
      const el = document.getElementById('gi-campos');
      registrarGrafico(new Chart(el, { type: 'bar', data: { labels: campos.map((c) => CAMPOS[c].nombre), datasets: [
        { label: ant.codigo, data: campos.map((c) => ant.resultados.porCampo[c]?.porcentaje ?? null), backgroundColor: css('--linea-fuerte'), borderRadius: 3, maxBarThickness: 30 },
        { label: ult.codigo, data: campos.map((c) => ult.resultados.porCampo[c]?.porcentaje ?? null), backgroundColor: css('--graf-1'), borderRadius: 3, maxBarThickness: 30 }] },
        options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: css('--texto-2') } } }, scales: { y: { min: 0, max: 100, ticks: { color: css('--texto-2'), callback: (v) => `${v} %` }, grid: { color: css('--linea') } }, x: { ticks: { color: css('--texto-2') }, grid: { display: false } } } } }));
    } else graficoPorcentaje('gi-campos', campos.map((c) => CAMPOS[c].nombre), campos.map((c) => ult.resultados.porCampo[c]?.porcentaje ?? null));
    const conDatos = campos.filter((c) => ult.resultados.porCampo[c]?.porcentaje != null);
    if (conDatos.length >= 3) graficoRadar('gi-radar', conDatos.map((c) => CAMPOS[c].nombre), [...(ant ? [{ nombre: ant.codigo, valores: conDatos.map((c) => ant.resultados.porCampo[c]?.porcentaje ?? 0) }] : []), { nombre: ult.codigo, valores: conDatos.map((c) => ult.resultados.porCampo[c].porcentaje) }].reverse());
    else document.getElementById('gi-radar')?.replaceWith(Object.assign(document.createElement('p'), { className: 'vacio-graf', textContent: 'El radar requiere tres campos con datos.' }));
    if (dxs.length >= 2) graficoLinea('gi-evol', dxs.map((d) => d.codigo), [{ nombre: 'General', valores: dxs.map((d) => d.resultados.promedioSimple) }, ...campos.map((c) => ({ nombre: CAMPOS[c].nombre, valores: dxs.map((d) => d.resultados.porCampo[c]?.porcentaje ?? null) }))]);
  }
  const el = document.getElementById('gi-sev');
  if (el && globalThis.Chart) {
    const sev = ['Crítica', 'Alta', 'Media', 'Baja'];
    registrarGrafico(new Chart(el, { type: 'bar', data: { labels: sev, datasets: [{ data: porSev, backgroundColor: [css('--critico'), css('--aviso'), css('--graf-1'), css('--linea-fuerte')], borderRadius: 3, maxBarThickness: 46 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed.y} hallazgo(s)` } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0, color: css('--texto-2') }, grid: { color: css('--linea') } }, x: { ticks: { color: css('--texto-2') }, grid: { display: false } } } } }));
  }
}

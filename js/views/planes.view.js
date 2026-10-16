/** Priorización, distribución de horas, plan semanal/mensual/anual y seguimiento. */
import { esc, fecha, tamano } from '../core/utils.js';
import { icono, pildora, modal, avisar, confirmar, descargar, marcarErrores } from '../core/ui.js';
import { sesion } from '../core/session.js';
import { puede } from '../domain/permisos.js';
import { CAMPOS } from '../data/catalogo-base.js';
import { CAMPOS_P, PRIORIDADES, horasPorCampo, validarDistribucion, proponerDistribucion } from '../domain/priorizacion.js';
import { etiquetaMes, rangoSemana, semanaDeFecha } from '../domain/planificacion.js';
import {
  resumenPlanes, contextoPlan, guardarConfiguracion, generarPlan, reprogramar, aprobarPlan, actualizarActividad, crearActividadManual,
  registrarHoras, anularRegistroHoras, adjuntarEvidenciaActividad, cambiarEstadoActividad, ESTADOS_ACT, TONO_ACT, vencida,
} from '../services/planes.service.js';
import { obtenerEvidencia } from '../services/diagnosticos.service.js';
import { destruirGraficos, registrarGrafico } from './graficos.js';
import { generarYMostrar } from './informes.view.js';

const UI = { empresaId: null, vista: 'mensual', mes: null, semana: 1, campo: '' };
const n1 = (x) => (Math.round((Number(x) || 0) * 10) / 10).toLocaleString('es-CO');

export async function vistaPlanes(v) {
  const filas = await resumenPlanes();
  v.innerHTML = `
  <div class="titulo-vista"><div><h1>Planes y horas</h1><p>Distribución de la bolsa de horas, priorización de hallazgos y seguimiento de la ejecución por empresa.</p></div></div>
  ${filas.length ? `<div class="panel tabla-envoltura"><table class="tabla">
    <thead><tr><th>Empresa</th><th>Diagnóstico base</th><th>Plan</th><th class="num">Horas/mes</th><th class="num">Programadas este mes</th><th class="num">Ejecutadas este mes</th><th class="num">Abiertas</th><th class="num">Vencidas</th><th></th></tr></thead>
    <tbody>${filas.map((f) => `<tr>
      <td><strong>${esc(f.empresa.razonSocial)}</strong>${f.empresa.demo ? ' ' + pildora('DEMO', 'aviso') : ''}</td>
      <td>${f.dx ? `<a href="#/diagnosticos/${f.dx.id}" class="mono">${esc(f.dx.codigo)}</a>` : '<span class="sub">Sin diagnóstico aprobado</span>'}</td>
      <td>${f.plan ? pildora(f.plan.estado === 'aprobado' ? `Aprobado v${f.plan.version}` : 'Borrador', f.plan.estado === 'aprobado' ? 'ok' : 'aviso') : '<span class="sub">Sin plan</span>'}</td>
      <td class="num">${n1(f.plan?.horasMes ?? f.empresa.horasContratadasMes)}</td><td class="num">${n1(f.programadasMes)}</td><td class="num">${n1(f.ejecutadasMes)}</td>
      <td class="num">${f.abiertas ?? 0}</td><td class="num">${f.vencidas ? `<span class="txt-alerta">${f.vencidas}</span>` : 0}</td>
      <td><a class="btn btn-sec btn-peq" href="#/planes/${f.empresa.id}">Abrir</a></td></tr>`).join('')}</tbody></table></div>`
    : '<div class="panel vacio"><p>No hay empresas vigentes asignadas.</p></div>'}`;
}

export async function vistaPlanEmpresa(v, { empresaId }) {
  if (UI.empresaId !== empresaId) Object.assign(UI, { empresaId, vista: 'mensual', mes: null, semana: 1, campo: '' });
  const c = await contextoPlan(empresaId);
  const u = sesion.usuario();
  if (!UI.mes || !c.meses.includes(UI.mes)) UI.mes = c.meses.includes(new Date().toISOString().slice(0, 7)) ? new Date().toISOString().slice(0, 7) : c.meses[0];
  const ed = c.editable;
  const dist = { ...c.config.distribucion };
  const val = validarDistribucion(dist);
  const k = c.consolidado;
  const ejecAct = k.ejecutadasPorActividad;
  const evPorAct = c.evidencias.reduce((m, x) => { (m[x.actividadId] ||= []).push(x); return m; }, {});
  const inmediatos = c.hallazgos.filter((h) => h.prioridad === 'inmediata' && h.estado !== 'cerrado_verificado');

  v.innerHTML = `
  <div class="titulo-vista">
    <div><p class="eyebrow">${c.dx ? `Base: <a class="mono" href="#/diagnosticos/${c.dx.id}">${esc(c.dx.codigo)}</a> aprobado ${fecha(c.dx.aprobadoEn)}` : 'Sin diagnóstico aprobado'}</p>
      <h1>Plan de trabajo de <a class="enlace-titulo" href="#/empresas/${c.e.id}">${esc(c.e.razonSocial)}</a></h1>
      <p>${c.plan ? pildora(c.plan.estado === 'aprobado' ? `Aprobado v${c.plan.version} · ${fecha(c.plan.aprobadoEn)} · ${esc(c.plan.aprobadoPorNombre || '')}` : 'Borrador: requiere aprobación', c.plan.estado === 'aprobado' ? 'ok' : 'aviso') : pildora('Sin configurar', 'neutro')}
      ${c.e.demo ? pildora('DEMO', 'aviso') : ''}</p></div>
    <div class="acciones">${ed && c.plan ? `<button class="btn btn-sec" id="btn-reprog">Reprogramar pendientes</button>${c.plan.estado !== 'aprobado' ? '<button class="btn btn-pri" id="btn-aprobar-plan">Aprobar plan</button>' : ''}` : ''}</div>
  </div>
  ${inmediatos.length ? `<div class="banda banda-critica">${icono('alerta')}<span><b>${inmediatos.length} hallazgo(s) de intervención inmediata.</b> Se programan en el primer mes aunque su campo tenga un porcentaje bajo de horas: ${inmediatos.slice(0, 6).map((h) => esc(h.codigo)).join(', ')}.</span></div>` : ''}
  ${(c.plan?.alertasProgramacion || []).length ? `<div class="banda banda-aviso">${icono('alerta')}<div><b>Alertas de capacidad</b><ul>${c.plan.alertasProgramacion.slice(0, 8).map((a) => `<li>${esc(a.texto)}</li>`).join('')}</ul></div></div>` : ''}

  <section class="rejilla-2 rejilla-plan">
    <article class="panel">
      <header><h2>Bolsa de horas y distribución</h2><small>Horas del campo = horas disponibles × porcentaje</small></header>
      <form id="f-config" class="rejilla-form" novalidate>
        <label class="campo"><span>Horas disponibles por mes</span><input type="number" name="horasMes" id="pc-horas" min="1" step="0.5" value="${c.config.horasMes}" ${ed ? '' : 'disabled'}></label>
        <label class="campo"><span>Capacidad semanal del equipo (h)</span><input type="number" name="capacidadSemanal" id="pc-cap" min="1" step="0.5" value="${c.config.capacidadSemanal}" ${ed ? '' : 'disabled'}></label>
        <label class="campo"><span>Mes de inicio</span><input type="month" name="mesInicio" id="pc-mes" value="${c.config.mesInicio}" ${ed ? '' : 'disabled'}></label>
        <label class="campo"><span>Horizonte (meses)</span><input type="number" name="meses" id="pc-meses" min="1" max="12" value="${c.config.meses}" ${ed ? '' : 'disabled'}></label>
        <div class="campo-ancho dist">
          ${CAMPOS_P.map((cp) => `<label class="dist-fila"><span>${esc(CAMPOS[cp].largo)}</span>
            <span class="dist-in"><input type="number" name="d_${cp}" id="pc-d-${cp}" min="0" max="100" step="1" value="${dist[cp]}" ${ed ? '' : 'disabled'}><i>%</i></span>
            <b class="mono" data-h="${cp}">${n1(horasPorCampo(c.config.horasMes, dist)[cp])} h/mes</b></label>`).join('')}
          <p class="dist-suma ${val.valida ? 'ok' : 'error'}" id="dist-suma">Total ${val.suma} % ${val.valida ? '· distribución válida' : '· debe sumar exactamente 100 %'}</p>
        </div>
        ${c.plan?.estado === 'aprobado' && ed ? '<label class="campo campo-ancho"><span>Motivo del ajuste (el plan volverá a borrador)</span><input name="motivo" id="pc-motivo"></label>' : ''}
        ${ed ? `<div class="acciones campo-ancho"><button type="button" class="btn btn-sec" id="btn-asistente">Proponer con el asistente</button><button type="submit" class="btn btn-pri">Guardar configuración</button></div>` : ''}
      </form>
      ${c.plan?.justificacion ? `<details class="plegable"><summary>Justificación de la distribución (${c.plan.origenDistribucion === 'asistente' ? 'propuesta del asistente' : 'definida por el asesor'})</summary><p class="texto-largo sub">${esc(c.plan.justificacion)}</p></details>` : ''}
    </article>
    <article class="panel">
      <header><h2>Horas del ${esc(etiquetaMes(UI.mes))}</h2><small>Asignadas, programadas y ejecutadas por campo</small></header>
      <div class="lienzo"><canvas id="g-horas" role="img" aria-label="Horas por campo"></canvas></div>
      <dl class="conteos conteos-4">${(() => { const t = k.totalMes(UI.mes); return `<dt>Asignadas</dt><dd>${n1(t.asignadas)} h</dd><dt>Programadas</dt><dd>${n1(t.programadas)} h</dd><dt>Ejecutadas</dt><dd>${n1(t.ejecutadas)} h</dd><dt>Facturables</dt><dd>${n1(t.facturables)} h</dd>`; })()}</dl>
    </article>
  </section>

  <article class="panel">
    <header><h2>Hallazgos priorizados</h2><small>Prioridad de atención = riesgo del hallazgo; es independiente del porcentaje de horas del campo</small></header>
    ${c.hallazgos.length ? `<div class="tabla-envoltura"><table class="tabla tabla-compacta"><thead><tr><th>Prioridad</th><th>Requisito</th><th>Hallazgo</th><th class="num">Puntaje</th><th class="num">Horas est.</th><th>Actividad</th><th>Estado</th></tr></thead><tbody>
      ${c.hallazgos.map((h) => { const a = c.actividades.find((x) => x.hallazgoId === h.id); return `<tr>
        <td>${pildora(PRIORIDADES[h.prioridad].etiqueta, PRIORIDADES[h.prioridad].tono)}</td><td class="mono">${esc(h.codigo)}<small>${esc(CAMPOS[h.campo].nombre)}</small></td>
        <td>${esc(h.descripcion)}<small title="${esc(h.motivo)}">Riesgo ${esc(h.riesgo?.etiqueta || '')} · ${esc(h.motivo)}</small></td>
        <td class="num">${h.puntaje}</td><td class="num">${n1(h.horasEstimadas)}</td><td>${a ? `<span class="mono">${esc(a.codigo)}</span>` : '<span class="sub">Sin actividad</span>'}</td>
        <td>${h.estado === 'cerrado_verificado' ? pildora('Cerrado', 'ok') : pildora('Abierto', 'neutro')}</td></tr>`; }).join('')}</tbody></table></div>
      ${ed && c.plan && c.dx ? `<div class="acciones"><button class="btn btn-pri" id="btn-generar">${icono('planes')}Generar actividades para hallazgos sin plan</button></div>` : ''}`
      : `<p class="sub">${c.dx ? 'El diagnóstico aprobado no tiene hallazgos.' : 'Apruebe un diagnóstico para priorizar sus hallazgos.'}</p>`}
  </article>

  <article class="panel">
    <header class="cab-plan"><h2>Plan de trabajo</h2>
      ${c.plan ? `<div class="barra-informes"><span class="eyebrow">PDF</span><button class="btn btn-sec btn-peq" data-pdf="plan_mensual">Mes</button><button class="btn btn-sec btn-peq" data-pdf="plan_anual">Anual</button><button class="btn btn-sec btn-peq" data-pdf="avance">Avance</button><button class="btn btn-sec btn-peq" data-pdf="horas">Horas</button></div>` : ''}
      <div class="segmentado" role="radiogroup" aria-label="Vista del plan">${[['semanal', 'Semanal'], ['mensual', 'Mensual'], ['anual', 'Anual']].map(([kk, t]) => `<button role="radio" aria-checked="${UI.vista === kk}" data-vista="${kk}">${t}</button>`).join('')}</div>
    </header>
    <div class="filtros">
      ${UI.vista !== 'anual' ? `<label class="campo"><span>Mes</span><select id="pl-mes">${c.meses.map((m) => `<option value="${m}" ${UI.mes === m ? 'selected' : ''}>${esc(etiquetaMes(m))}</option>`).join('')}</select></label>` : ''}
      ${UI.vista === 'semanal' ? `<label class="campo"><span>Semana</span><select id="pl-semana">${[1, 2, 3, 4].map((s) => { const r = rangoSemana(UI.mes, s); return `<option value="${s}" ${UI.semana === s ? 'selected' : ''}>Semana ${s} (${r.inicio.slice(8)}–${r.fin.slice(8)})</option>`; }).join('')}</select></label>` : ''}
      <label class="campo"><span>Campo</span><select id="pl-campo"><option value="">Todos</option>${CAMPOS_P.map((cp) => `<option value="${cp}" ${UI.campo === cp ? 'selected' : ''}>${CAMPOS[cp].nombre}</option>`).join('')}</select></label>
      ${ed && c.plan ? `<button class="btn btn-sec" id="btn-act-manual">${icono('mas')}Actividad manual</button>` : ''}
    </div>
    <div id="plan-cuerpo"></div>
  </article>
  ${c.plan?.historial?.length ? `<details class="panel plegable-panel"><summary><h2>Historial del plan</h2></summary><ol class="linea-tiempo">${[...c.plan.historial].reverse().map((h) => `<li><div class="lt-cab"><strong>${esc(h.evento)}</strong><span>${fecha(h.fecha, true)} · ${esc(h.usuario)}</span></div>${h.comentario ? `<p class="lt-motivo">${esc(h.comentario)}</p>` : ''}</li>`).join('')}</ol></details>` : ''}`;

  /* --- gráfico de horas del mes --- */
  destruirGraficos();
  const pm = k.porMes[UI.mes] || {};
  graficoBarrasHoras('g-horas', CAMPOS_P.map((cp) => CAMPOS[cp].nombre), [
    { nombre: 'Asignadas', valores: CAMPOS_P.map((cp) => pm[cp]?.asignadas || 0) },
    { nombre: 'Programadas', valores: CAMPOS_P.map((cp) => pm[cp]?.programadas || 0) },
    { nombre: 'Ejecutadas', valores: CAMPOS_P.map((cp) => pm[cp]?.ejecutadas || 0) },
  ]);

  /* --- configuración --- */
  const f = v.querySelector('#f-config');
  const leerDist = () => Object.fromEntries(CAMPOS_P.map((cp) => [cp, Number(f.querySelector(`[name=d_${cp}]`).value) || 0]));
  const recalcular = () => {
    const d = leerDist(); const hm = Number(f.querySelector('[name=horasMes]').value) || 0; const h = horasPorCampo(hm, d); const vv = validarDistribucion(d);
    CAMPOS_P.forEach((cp) => { f.querySelector(`[data-h="${cp}"]`).textContent = `${n1(h[cp])} h/mes`; });
    const s = f.querySelector('#dist-suma'); s.className = `dist-suma ${vv.valida ? 'ok' : 'error'}`; s.textContent = `Total ${vv.suma} % ${vv.valida ? '· distribución válida' : '· debe sumar exactamente 100 %'}`;
  };
  f.addEventListener('input', recalcular);
  let origen = c.plan?.origenDistribucion || 'manual'; let justificacion = c.plan?.justificacion || '';
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const x = Object.fromEntries(new FormData(f));
    try {
      await guardarConfiguracion(empresaId, { horasMes: x.horasMes, capacidadSemanal: x.capacidadSemanal, mesInicio: x.mesInicio, meses: x.meses, distribucion: leerDist(), origenDistribucion: origen, justificacion }, x.motivo || '');
      const vv = validarDistribucion(leerDist());
      avisar(vv.valida ? 'Configuración guardada.' : `Configuración guardada. ${vv.mensaje}`, vv.valida ? 'exito' : 'advertencia');
      vistaPlanEmpresa(v, { empresaId });
    } catch (x2) { avisar(x2.message, 'error'); }
  });
  v.querySelector('#btn-asistente')?.addEventListener('click', async () => {
    const hm = Number(f.querySelector('[name=horasMes]').value) || 0;
    const p = proponerDistribucion(c.hallazgos.filter((h) => h.estado !== 'cerrado_verificado'), hm);
    const r = await modal({
      titulo: 'Propuesta del asistente de priorización', ancho: 'modal-ancho',
      contenido: `<p class="sub">Propuesta basada en ${c.hallazgos.length} hallazgo(s) del diagnóstico ${esc(c.dx?.codigo || '—')}: severidad, probabilidad, tipo de hallazgo, naturaleza del requisito y esfuerzo estimado. Puede ajustarla después.</p>
        <div class="tabla-envoltura"><table class="tabla tabla-compacta"><thead><tr><th>Campo</th><th class="num">Propuesto</th><th class="num">Horas/mes</th><th>Por qué</th></tr></thead><tbody>
        ${p.explicacion.map((x) => `<tr><td>${esc(CAMPOS[x.campo].nombre)}</td><td class="num"><b>${x.porcentaje} %</b></td><td class="num">${n1(x.horas)}</td><td>${esc(x.texto)}</td></tr>`).join('')}</tbody></table></div>
        ${p.alertas.map((a) => `<p class="txt-alerta">${icono('alerta')} ${esc(a)}</p>`).join('')}`,
      acciones: [{ texto: 'Cancelar', valor: null }, { texto: 'Aplicar propuesta', clase: 'btn-pri', valor: 'ok' }],
    });
    if (r !== 'ok') return;
    CAMPOS_P.forEach((cp) => { f.querySelector(`[name=d_${cp}]`).value = p.distribucion[cp]; });
    origen = 'asistente';
    justificacion = `Propuesta del asistente (${new Date().toLocaleDateString('es-CO')}) sobre ${hm} h/mes:\n${p.explicacion.map((x) => `• ${CAMPOS[x.campo].nombre}: ${x.porcentaje} % (${n1(x.horas)} h) — ${x.texto}`).join('\n')}${p.alertas.length ? `\nAlertas: ${p.alertas.join(' ')}` : ''}`;
    recalcular(); avisar('Propuesta aplicada. Revísela y guarde la configuración.', 'advertencia');
  });
  v.querySelector('#btn-generar')?.addEventListener('click', async () => {
    try { const r = await generarPlan(empresaId); avisar(`${r.creadas} actividad(es) creada(s) y programada(s).`); if (r.alertas.length) avisar(`${r.alertas.length} alerta(s) de capacidad: revíselas arriba.`, 'advertencia'); vistaPlanEmpresa(v, { empresaId }); }
    catch (x) { avisar(x.message, 'error'); }
  });
  v.querySelector('#btn-reprog')?.addEventListener('click', async () => { try { const a = await reprogramar(empresaId); avisar(`Pendientes reprogramadas. ${a.length} alerta(s).`); vistaPlanEmpresa(v, { empresaId }); } catch (x) { avisar(x.message, 'error'); } });
  v.querySelector('#btn-aprobar-plan')?.addEventListener('click', async () => {
    const r = await confirmar({ titulo: 'Aprobar plan de trabajo', mensaje: `<p>Distribución: ${CAMPOS_P.map((cp) => `${CAMPOS[cp].nombre} ${dist[cp]} %`).join(' · ')}. ${val.valida ? '' : `<b class="txt-alerta">${esc(val.mensaje)}</b>`}</p>`, textoAccion: 'Aprobar' });
    if (!r?.ok) return;
    try { await aprobarPlan(empresaId); avisar('Plan aprobado.'); vistaPlanEmpresa(v, { empresaId }); } catch (x) { avisar(x.message, 'error'); }
  });

  /* --- cuerpo del plan --- */
  const filtrar = (arr) => arr.filter((a) => !UI.campo || a.campo === UI.campo);
  const filaAct = (a) => `<tr data-act="${a.id}" class="${vencida(a) ? 'fila-vencida' : ''}">
    <td class="mono">${esc(a.codigo)}${a.requisitoCodigo ? `<small>${esc(a.requisitoCodigo)}</small>` : '<small>Manual</small>'}</td>
    <td>${pildora(PRIORIDADES[a.prioridad].etiqueta, PRIORIDADES[a.prioridad].tono)}</td>
    <td><span class="txt-2l">${esc(a.actividad)}</span><small>${esc(CAMPOS[a.campo].nombre)} · ${esc(a.responsable || 'sin responsable')}${a.fechaLimite ? ` · límite ${esc(a.fechaLimite)}` : ''}${vencida(a) ? ' · <b class="txt-alerta">vencida</b>' : ''}</small></td>
    <td class="num">${n1(a.horasEstimadas)}</td><td class="num">${n1(a.horasProgramadas)}</td><td class="num">${n1(ejecAct.get(a.id) || 0)}</td>
    <td>${pildora(ESTADOS_ACT[a.estado], TONO_ACT[a.estado])}${(evPorAct[a.id] || []).length ? ` <small>${evPorAct[a.id].length} evid.</small>` : ''}${a.excedeCampo ? ' <small class="txt-alerta">excede campo</small>' : ''}${a.sobrecupoSemana ? ' <small class="txt-alerta">sobrecupo</small>' : ''}</td>
    <td><button class="btn btn-sec btn-peq" data-abrir="${a.id}">Abrir</button></td></tr>`;
  const tabla = (arr) => (arr.length ? `<div class="tabla-envoltura"><table class="tabla tabla-compacta"><thead><tr><th>Código</th><th>Prioridad</th><th>Actividad</th><th class="num">Est.</th><th class="num">Prog.</th><th class="num">Ejec.</th><th>Estado</th><th></th></tr></thead><tbody>${arr.map(filaAct).join('')}</tbody></table></div>` : '<p class="sub">Sin actividades en este periodo.</p>');

  const cuerpo = v.querySelector('#plan-cuerpo');
  const pintar = () => {
    if (!c.plan) { cuerpo.innerHTML = '<p class="sub">Guarde la configuración y genere las actividades desde los hallazgos.</p>'; return; }
    if (UI.vista === 'mensual') {
      const delMes = filtrar(c.actividades.filter((a) => a.mesProgramado === UI.mes));
      const sinProg = filtrar(c.actividades.filter((a) => !a.mesProgramado && a.estado !== 'cancelada'));
      const res = k.porMes[UI.mes];
      cuerpo.innerHTML = `
        <div class="tabla-envoltura"><table class="tabla tabla-compacta resumen-horas"><thead><tr><th>Campo</th><th class="num">Asignadas</th><th class="num">Programadas</th><th class="num">Ejecutadas</th><th class="num">Pendientes</th><th class="num">Facturables</th></tr></thead><tbody>
          ${CAMPOS_P.map((cp) => `<tr class="${res[cp].programadas > res[cp].asignadas ? 'fila-exceso' : ''}"><td>${CAMPOS[cp].nombre}</td><td class="num">${n1(res[cp].asignadas)}</td><td class="num">${n1(res[cp].programadas)}</td><td class="num">${n1(res[cp].ejecutadas)}</td><td class="num">${n1(Math.max(0, res[cp].programadas - res[cp].ejecutadas))}</td><td class="num">${n1(res[cp].facturables)}</td></tr>`).join('')}
          ${(() => { const t = k.totalMes(UI.mes); return `<tr class="fila-total"><td>Total</td><td class="num">${n1(t.asignadas)}</td><td class="num">${n1(t.programadas)}</td><td class="num">${n1(t.ejecutadas)}</td><td class="num">${n1(Math.max(0, t.programadas - t.ejecutadas))}</td><td class="num">${n1(t.facturables)}</td></tr>`; })()}
        </tbody></table></div>
        ${[1, 2, 3, 4].map((s) => { const arr = delMes.filter((a) => a.semanaProgramada === s); const r = rangoSemana(UI.mes, s); return `<h3 class="sem-tit">Semana ${s} · ${r.inicio.slice(8)}–${r.fin.slice(8)} <small>${n1(arr.reduce((t, a) => t + Number(a.horasProgramadas || 0), 0))} h de ${n1(c.config.capacidadSemanal)} h</small></h3>${tabla(arr)}`; }).join('')}
        ${sinProg.length ? `<h3 class="sem-tit txt-alerta">Sin programar (${sinProg.length})</h3>${tabla(sinProg)}` : ''}`;
    } else if (UI.vista === 'semanal') {
      const arr = filtrar(c.actividades.filter((a) => a.mesProgramado === UI.mes && a.semanaProgramada === UI.semana));
      const regs = c.registros.filter((r) => r.fecha.startsWith(UI.mes) && semanaDeFecha(r.fecha) === UI.semana);
      cuerpo.innerHTML = `${tabla(arr)}<h3 class="sem-tit">Horas registradas en la semana <small>${n1(regs.reduce((t, r) => t + r.horas, 0))} h</small></h3>
        ${regs.length ? `<ul class="lista-simple">${regs.map((r) => `<li>${esc(r.fecha)} · ${n1(r.horas)} h · ${esc(c.actividades.find((a) => a.id === r.actividadId)?.codigo || '')} · ${esc(r.usuarioNombre)} — ${esc(r.descripcion)}${r.facturable ? '' : ' (no facturable)'}</li>`).join('')}</ul>` : '<p class="sub">Sin registros.</p>'}`;
    } else {
      cuerpo.innerHTML = `<p class="sub">Consolidado calculado: cada actividad se programa una sola vez y cada hora ejecutada se suma por la fecha de su registro, sin duplicar entre vistas.</p>
        <div class="tabla-envoltura"><table class="tabla tabla-compacta anual"><thead><tr><th>Mes</th>${CAMPOS_P.filter((cp) => !UI.campo || cp === UI.campo).map((cp) => `<th class="num">${CAMPOS[cp].sigla} prog.</th><th class="num">${CAMPOS[cp].sigla} ejec.</th>`).join('')}<th class="num">Total asignadas</th><th class="num">Total prog.</th><th class="num">Total ejec.</th><th class="num">Facturables</th></tr></thead><tbody>
        ${c.meses.map((m) => { const t = k.totalMes(m); return `<tr class="${t.programadas > t.asignadas ? 'fila-exceso' : ''}"><td>${esc(etiquetaMes(m))}</td>${CAMPOS_P.filter((cp) => !UI.campo || cp === UI.campo).map((cp) => `<td class="num">${n1(k.porMes[m][cp].programadas)}</td><td class="num">${n1(k.porMes[m][cp].ejecutadas)}</td>`).join('')}<td class="num">${n1(t.asignadas)}</td><td class="num">${n1(t.programadas)}</td><td class="num">${n1(t.ejecutadas)}</td><td class="num">${n1(t.facturables)}</td></tr>`; }).join('')}
        <tr class="fila-total"><td>Total del plan</td>${CAMPOS_P.filter((cp) => !UI.campo || cp === UI.campo).map((cp) => `<td class="num">${n1(k.anual[cp].programadas)}</td><td class="num">${n1(k.anual[cp].ejecutadas)}</td>`).join('')}<td class="num">${n1(k.totalAnual.asignadas)}</td><td class="num">${n1(k.totalAnual.programadas)}</td><td class="num">${n1(k.totalAnual.ejecutadas)}</td><td class="num">${n1(k.totalAnual.facturables)}</td></tr>
        </tbody></table></div>`;
    }
    cuerpo.querySelectorAll('[data-abrir]').forEach((b) => b.onclick = () => abrirActividad(c.actividades.find((a) => a.id === b.dataset.abrir)));
  };
  pintar();
  v.querySelectorAll('[data-vista]').forEach((b) => b.onclick = () => { UI.vista = b.dataset.vista; vistaPlanEmpresa(v, { empresaId }); });
  v.querySelector('#pl-mes')?.addEventListener('change', (e) => { UI.mes = e.target.value; vistaPlanEmpresa(v, { empresaId }); });
  v.querySelector('#pl-semana')?.addEventListener('change', (e) => { UI.semana = Number(e.target.value); pintar(); });
  v.querySelector('#pl-campo')?.addEventListener('change', (e) => { UI.campo = e.target.value; pintar(); });
  v.querySelector('#btn-act-manual')?.addEventListener('click', () => actividadManual());
  v.querySelectorAll('[data-pdf]').forEach((b) => b.onclick = () => {
    const t = b.dataset.pdf; const hoy = new Date().toISOString().slice(0, 10);
    const p = { empresaId, ...(t === 'plan_mensual' ? { mes: UI.mes } : {}), ...(t === 'horas' ? { desde: `${c.meses[0]}-01`, hasta: hoy } : {}) };
    generarYMostrar(t, p, b);
  });

  async function actividadManual() {
    const r = await modal({ titulo: 'Agregar actividad manual', ancho: 'modal-ancho',
      contenido: `<form class="rejilla-form" onsubmit="return false">
        <label class="campo"><span>Campo *</span><select name="campo" id="am-campo">${CAMPOS_P.map((cp) => `<option value="${cp}">${CAMPOS[cp].largo}</option>`).join('')}</select></label>
        <label class="campo"><span>Prioridad</span><select name="prioridad" id="am-prio">${Object.entries(PRIORIDADES).map(([kk, p]) => `<option value="${kk}" ${kk === 'media' ? 'selected' : ''}>${p.etiqueta}</option>`).join('')}</select></label>
        <label class="campo campo-ancho"><span>Actividad *</span><input name="actividad" id="am-act"></label>
        <label class="campo"><span>Objetivo</span><input name="objetivo" id="am-obj"></label><label class="campo"><span>Entregable</span><input name="entregable" id="am-ent"></label>
        <label class="campo"><span>Responsable</span><input name="responsable" id="am-resp"></label><label class="campo"><span>Horas estimadas *</span><input type="number" min="0.5" step="0.5" name="horasEstimadas" id="am-h"></label>
        <label class="campo campo-ancho"><span>Indicador de resultado</span><input name="indicador" id="am-ind"></label></form>`,
      acciones: [{ texto: 'Cancelar', valor: null }, { texto: 'Agregar', clase: 'btn-pri', alPulsar: async (m) => { await crearActividadManual(empresaId, Object.fromEntries(new FormData(m.querySelector('form')))); return 'ok'; } }] });
    if (r === 'ok') { avisar('Actividad agregada. Use "Reprogramar pendientes" para ubicarla en el calendario.'); vistaPlanEmpresa(v, { empresaId }); }
  }

  async function abrirActividad(a) {
    const regs = c.registros.filter((r) => r.actividadId === a.id);
    const evs = evPorAct[a.id] || [];
    const abierta = !['verificada', 'cancelada'].includes(a.estado);
    const puedeEd = ed && abierta;
    const revisor = puede(u, 'diagnosticos.aprobar');
    const acciones = [{ texto: 'Cerrar', valor: null }];
    if (puedeEd) {
      if (a.estado === 'en_curso') acciones.push({ texto: 'Marcar ejecutada', clase: 'btn-sec', valor: 'ejecutada' });
      acciones.push({ texto: 'Cancelar actividad', clase: 'btn-sec', valor: 'cancelada' });
      acciones.push({ texto: 'Guardar cambios', clase: 'btn-pri', alPulsar: async (m) => {
        const form = m.querySelector('#f-act'); const x = Object.fromEntries(new FormData(form)); x.facturable = !!form.querySelector('[name=facturable]').checked;
        try { await actualizarActividad(a.id, x); } catch (e) { if (e.campos) marcarErrores(form, e.campos); throw e; }
        avisar('Actividad actualizada.'); return 'guardada';
      } });
    }
    if (revisor && a.estado === 'ejecutada') acciones.push({ texto: 'Verificar cierre', clase: 'btn-pri', valor: 'verificada' });
    const r = await modal({ titulo: `${a.codigo} · ${CAMPOS[a.campo].nombre}`, ancho: 'modal-ancho',
      contenido: `
      <p>${pildora(ESTADOS_ACT[a.estado], TONO_ACT[a.estado])} ${pildora(PRIORIDADES[a.prioridad].etiqueta, PRIORIDADES[a.prioridad].tono)} ${a.requisitoCodigo ? `<span class="mono">${esc(a.requisitoCodigo)}</span>` : ''}</p>
      ${a.motivoPrioridad ? `<p class="sub">Prioridad: ${esc(a.motivoPrioridad)}</p>` : ''}
      <form id="f-act" class="rejilla-form" onsubmit="return false">
        <label class="campo campo-ancho"><span>Actividad</span><textarea name="actividad" id="ac-act" rows="2" ${puedeEd ? '' : 'disabled'}>${esc(a.actividad)}</textarea></label>
        <label class="campo"><span>Objetivo</span><input name="objetivo" id="ac-obj" value="${esc(a.objetivo || '')}" ${puedeEd ? '' : 'disabled'}></label>
        <label class="campo"><span>Entregable</span><input name="entregable" id="ac-ent" value="${esc(a.entregable || '')}" ${puedeEd ? '' : 'disabled'}></label>
        <label class="campo"><span>Responsable</span><input name="responsable" id="ac-resp" value="${esc(a.responsable || '')}" ${puedeEd ? '' : 'disabled'}></label>
        <label class="campo"><span>Especialista requerido</span><input name="especialista" id="ac-esp" value="${esc(a.especialista || '')}" ${puedeEd ? '' : 'disabled'}></label>
        <label class="campo"><span>Prioridad</span><select name="prioridad" id="ac-prio" ${puedeEd ? '' : 'disabled'}>${Object.entries(PRIORIDADES).map(([kk, p]) => `<option value="${kk}" ${a.prioridad === kk ? 'selected' : ''}>${p.etiqueta}</option>`).join('')}</select></label>
        <label class="campo"><span>Horas estimadas</span><input type="number" step="0.5" min="0.5" name="horasEstimadas" id="ac-he" value="${a.horasEstimadas}" ${puedeEd ? '' : 'disabled'}></label>
        <label class="campo"><span>Horas programadas</span><input type="number" step="0.5" min="0.5" name="horasProgramadas" id="ac-hp" value="${a.horasProgramadas}" ${puedeEd ? '' : 'disabled'}></label>
        <label class="campo"><span>Mes programado</span><select name="mesProgramado" id="ac-mes" ${puedeEd ? '' : 'disabled'}><option value="">Sin programar</option>${c.meses.map((m) => `<option value="${m}" ${a.mesProgramado === m ? 'selected' : ''}>${esc(etiquetaMes(m))}</option>`).join('')}</select></label>
        <label class="campo"><span>Semana</span><select name="semanaProgramada" id="ac-sem" ${puedeEd ? '' : 'disabled'}><option value="">—</option>${[1, 2, 3, 4].map((s) => `<option value="${s}" ${a.semanaProgramada === s ? 'selected' : ''}>Semana ${s}</option>`).join('')}</select></label>
        <label class="campo"><span>Fecha de inicio</span><input type="date" name="fechaInicio" id="ac-fi" value="${esc(a.fechaInicio || '')}" ${puedeEd ? '' : 'disabled'}></label>
        <label class="campo"><span>Fecha límite</span><input type="date" name="fechaLimite" id="ac-fl" value="${esc(a.fechaLimite || '')}" ${puedeEd ? '' : 'disabled'}></label>
        <label class="campo campo-ancho"><span>Indicador de resultado</span><input name="indicador" id="ac-ind" value="${esc(a.indicador || '')}" ${puedeEd ? '' : 'disabled'}></label>
        <label class="campo campo-check"><input type="checkbox" name="facturable" id="ac-fact" ${a.facturable !== false ? 'checked' : ''} ${puedeEd ? '' : 'disabled'}><span>Horas facturables por defecto</span></label>
      </form>
      <section class="subpanel"><h3>Horas ejecutadas · ${n1(regs.reduce((t, x) => t + x.horas, 0))} h de ${n1(a.horasProgramadas)} h programadas</h3>
        ${regs.length ? `<ul class="lista-simple">${regs.map((x) => `<li>${esc(x.fecha)} · <b>${n1(x.horas)} h</b> · ${esc(x.usuarioNombre)} — ${esc(x.descripcion)}${x.facturable ? '' : ' (no facturable)'} ${puede(u, 'horas.registrar') && abierta ? `<button class="enlace" data-anular="${x.id}">anular</button>` : ''}</li>`).join('')}</ul>` : '<p class="sub">Sin registros.</p>'}
        ${puede(u, 'horas.registrar') && abierta ? `<div class="rejilla-form reg-horas"><label class="campo"><span>Fecha</span><input type="date" id="rh-fecha" value="${new Date().toISOString().slice(0, 10)}" max="${new Date().toISOString().slice(0, 10)}"></label>
          <label class="campo"><span>Horas</span><input type="number" id="rh-horas" min="0.25" max="12" step="0.25"></label>
          <label class="campo campo-ancho"><span>Trabajo realizado</span><input id="rh-desc"></label>
          <label class="campo campo-check"><input type="checkbox" id="rh-fact" ${a.facturable !== false ? 'checked' : ''}><span>Facturable</span></label>
          <button type="button" class="btn btn-sec" id="rh-btn">Registrar horas</button></div>` : ''}
      </section>
      <section class="subpanel"><h3>Evidencias de cierre (${evs.length})</h3>
        <div class="req-evid">${evs.map((x) => `<button class="chip" data-ev="${x.id}">${icono('archivo')}${esc(x.nombre)} <small>${tamano(x.tamano)}</small></button>`).join('') || '<span class="sub">Sin evidencias. La actividad no puede verificarse sin al menos una.</span>'}
        ${puede(u, 'evidencias.adjuntar') && abierta ? `<label class="btn btn-sec btn-peq chip-subir">${icono('cargar')}Adjuntar<input type="file" class="sr" id="ac-evid" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"></label>` : ''}</div>
      </section>`,
      acciones,
      alAbrir: (m) => {
        m.querySelector('#rh-btn')?.addEventListener('click', async () => {
          try { await registrarHoras(a.id, { fecha: m.querySelector('#rh-fecha').value, horas: m.querySelector('#rh-horas').value, descripcion: m.querySelector('#rh-desc').value, facturable: m.querySelector('#rh-fact').checked });
            avisar('Horas registradas.'); m.closest('.modal-fondo').remove(); vistaPlanEmpresa(v, { empresaId }); }
          catch (x) { avisar(x.message, 'error'); }
        });
        m.querySelectorAll('[data-anular]').forEach((b) => b.addEventListener('click', async () => {
          const rr = await confirmar({ titulo: 'Anular registro de horas', mensaje: '<p>El registro queda anulado (no se borra) y deja de sumar.</p>', textoAccion: 'Anular', peligro: true, pedirMotivo: true });
          if (!rr?.ok) return;
          try { await anularRegistroHoras(b.dataset.anular, rr.motivo); avisar('Registro anulado.'); m.closest('.modal-fondo')?.remove(); vistaPlanEmpresa(v, { empresaId }); } catch (x) { avisar(x.message, 'error'); }
        }));
        m.querySelector('#ac-evid')?.addEventListener('change', async (e) => {
          try { await adjuntarEvidenciaActividad(a.id, e.target.files[0], { fechaEvidencia: new Date().toISOString().slice(0, 10), descripcion: '' }); avisar('Evidencia adjuntada.'); m.closest('.modal-fondo').remove(); vistaPlanEmpresa(v, { empresaId }); }
          catch (x) { avisar(x.message, 'error'); }
        });
        m.querySelectorAll('[data-ev]').forEach((b) => b.addEventListener('click', async () => { const x = await obtenerEvidencia(b.dataset.ev); descargar(x.archivo, x.nombre); }));
      },
    });
    if (r === 'guardada') return vistaPlanEmpresa(v, { empresaId });
    if (['ejecutada', 'verificada', 'cancelada'].includes(r)) {
      const msg = { ejecutada: '<p>La actividad pasará a "Ejecutada" y quedará a la espera de verificación con evidencia.</p>', verificada: '<p>Confirma que revisó las evidencias y que la brecha está cerrada. Si todas las actividades del hallazgo quedan verificadas, el hallazgo se cerrará.</p>', cancelada: '<p>La actividad no se ejecutará. Sus horas registradas se conservan.</p>' }[r];
      const cc = await confirmar({ titulo: { ejecutada: 'Marcar como ejecutada', verificada: 'Verificar cierre', cancelada: 'Cancelar actividad' }[r], mensaje: msg, textoAccion: 'Confirmar', peligro: r === 'cancelada', pedirMotivo: r !== 'ejecutada' });
      if (!cc?.ok) return;
      try { await cambiarEstadoActividad(a.id, r, cc.motivo || ''); avisar('Estado actualizado.'); vistaPlanEmpresa(v, { empresaId }); } catch (x) { avisar(x.message, 'error'); }
    }
  }
}

function graficoBarrasHoras(id, etiquetas, series) {
  const el = document.getElementById(id);
  if (!el || !globalThis.Chart) return;
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const colores = [css('--linea-fuerte'), css('--graf-1'), css('--ok')];
  const g = new Chart(el, { type: 'bar',
    data: { labels: etiquetas, datasets: series.map((s, i) => ({ label: s.nombre, data: s.valores, backgroundColor: colores[i], borderRadius: 3, maxBarThickness: 22 })) },
    options: { responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { labels: { color: css('--texto-2'), boxWidth: 12 } }, tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y} h` } } },
      scales: { y: { beginAtZero: true, ticks: { color: css('--texto-2') }, grid: { color: css('--linea') } }, x: { ticks: { color: css('--texto-2') }, grid: { display: false } } } } });
  registrarGrafico(g);
}

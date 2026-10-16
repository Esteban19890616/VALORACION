/** Diagnóstico: lista de chequeo con autoguardado, resultados, hallazgos, exclusiones y revisión. */
import { esc, fecha, debounce, tamano } from '../core/utils.js';
import { icono, pildora, modal, avisar, confirmar, descargar } from '../core/ui.js';
import { sesion } from '../core/session.js';
import { puede } from '../domain/permisos.js';
import { etiquetaGrupo } from '../domain/perfil.js';
import { RESPUESTAS, MADUREZ, nivelRiesgo, estadoEfectivo } from '../domain/calificacion.js';
import { CAMPOS } from '../data/catalogo-base.js';
import { NATURALEZAS, VIGENCIAS, SEVERIDADES_TXT } from '../services/catalogo.service.js';
import { TONO_VIGENCIA, TONO_SEV, htmlFichaNormativa } from './catalogo.view.js';
import {
  contextoDiagnostico, guardarRespuesta, guardarCierre, incluirManualmente, actualizarPerfil, adjuntarEvidencia, obtenerEvidencia, retirarEvidencia,
  enviarARevision, resolverNoAplica, devolver, aprobar, cerrar, analisisImpacto, crearRevision, ESTADOS_DX, TONO_DX, CAMPOS_ORDEN,
} from '../services/diagnosticos.service.js';
import { graficoPorcentaje, graficoRadar, destruirGraficos } from './graficos.js';
import { generarYMostrar } from './informes.view.js';
import { ir } from '../core/router.js';

const UI = { pestana: 'lista', campo: null, categoria: null, filtro: 'todos', dxId: null };
const TIPO_HALLAZGO = { incumplimiento: ['Incumplimiento', 'critico'], cumplimiento_parcial: ['Cumplimiento parcial', 'aviso'], pendiente_verificacion: ['Pendiente de verificación', 'neutro'] };

export async function vistaDiagnostico(v, { id }) {
  if (UI.dxId !== id) Object.assign(UI, { pestana: 'lista', campo: null, categoria: null, filtro: 'todos', dxId: id });
  let c = await contextoDiagnostico(id);
  const u = sesion.usuario();
  const revisor = puede(u, 'diagnosticos.aprobar');

  const encabezado = () => {
    const r = c.resultados;
    const naPend = c.items.filter((i) => i.respuesta?.respuesta === 'no_aplica' && i.respuesta.naEstado === 'pendiente').length;
    return `
    <div class="titulo-vista">
      <div>
        <p class="eyebrow mono">${esc(c.d.codigo)}${c.d.version > 1 ? ` · revisión ${c.d.version}` : ''} · catálogo ${esc(c.d.catalogoVersion)} · corte normativo ${fecha(c.d.fechaCorteNormativo + 'T12:00:00')}</p>
        <h1>Diagnóstico de <a class="enlace-titulo" href="#/empresas/${c.e.id}">${esc(c.e.razonSocial)}</a></h1>
        <p>${pildora(ESTADOS_DX[c.d.estado], TONO_DX[c.d.estado])} ${c.e.demo ? pildora('DEMO', 'aviso') : ''} Estándares Mínimos: ${esc(etiquetaGrupo(c.d.grupo0312))} · inicio ${fecha(c.d.fechaInicio + 'T12:00:00')}${c.d.aprobadoEn ? ` · aprobado ${fecha(c.d.aprobadoEn, true)} por ${esc(c.d.aprobadoPorNombre)}` : ''}</p>
      </div>
      <div class="progreso-dx" aria-label="Avance del diagnóstico">
        <div class="progreso-cifras"><b>${r.progreso} %</b><span>${r.respondidos} de ${r.total} requisitos respondidos</span></div>
        <div class="barra"><span style="width:${r.progreso}%"></span></div>
        ${r.alertas.length ? `<span class="txt-critico">${icono('alerta')} ${r.alertas.length} alerta(s) crítica(s)</span>` : ''}
      </div>
    </div>
    ${c.d.estado === 'devuelto' ? `<div class="banda banda-critica">${icono('alerta')}<span><b>Devuelto para ajustes:</b> ${esc(c.d.historial.at(-1)?.comentario || '')}</span></div>` : ''}
    ${c.d.estado === 'pendiente_revision' ? `<div class="banda banda-aviso">${icono('alerta')}<span>En revisión. ${revisor ? `Valide los "No aplica" (${naPend} pendientes) y apruebe o devuelva desde la pestaña Revisión.` : 'El asesor no puede modificarlo hasta que el revisor lo devuelva o lo apruebe.'}</span></div>` : ''}
    <div class="pestanas" role="tablist">
      ${[['lista', 'Lista de chequeo'], ['resultados', 'Resultados'], ['hallazgos', `Hallazgos (${c.hallazgos.length})`], ['excluidos', `No aplican por perfil (${c.excluidos.length})`], ['revision', `Revisión e historial${revisor && naPend ? ` (${naPend})` : ''}`]]
        .map(([k, t]) => `<button role="tab" data-tab="${k}" aria-selected="${UI.pestana === k}">${t}</button>`).join('')}
    </div>
    <div id="panel-dx"></div>`;
  };

  const recargar = async () => { c = await contextoDiagnostico(id); v.innerHTML = encabezado(); enlazarPestanas(); await PESTANAS[UI.pestana](); };
  const enlazarPestanas = () => v.querySelector('.pestanas').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    UI.pestana = b.dataset.tab; v.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    destruirGraficos(); await PESTANAS[UI.pestana]();
  });

  /* ---------------- Lista de chequeo ---------------- */
  const listaChequeo = async () => {
    const panel = v.querySelector('#panel-dx');
    const porCampo = {};
    for (const it of c.items) {
      const k = it.requisito.campo; porCampo[k] ??= new Map();
      const cat = it.requisito.categoria; if (!porCampo[k].has(cat)) porCampo[k].set(cat, []);
      porCampo[k].get(cat).push(it);
    }
    const campos = CAMPOS_ORDEN.filter((k) => porCampo[k]);
    if (!campos.length) { panel.innerHTML = '<div class="panel vacio"><p>No hay requisitos aplicables con el perfil actual.</p></div>'; return; }
    if (!UI.campo || !porCampo[UI.campo]) UI.campo = campos[0];
    if (!UI.categoria || !porCampo[UI.campo].has(UI.categoria)) UI.categoria = [...porCampo[UI.campo].keys()][0];
    const resp = (it) => estadoEfectivo(it.respuesta);
    const cuenta = (arr) => `${arr.filter((i) => resp(i) !== 'pendiente').length}/${arr.length}`;
    const alerta = (arr) => arr.some((i) => i.requisito.severidad === 'critica' && ['no_cumple', 'parcial', 'pendiente'].includes(resp(i)));

    panel.innerHTML = `<div class="dx-cols">
      <nav class="dx-nav panel" aria-label="Categorías">
        ${campos.map((k) => `<div class="dx-nav-campo ${UI.campo === k ? 'abierto' : ''}">
          <button class="dx-nav-titulo" data-campo="${k}"><span>${esc(CAMPOS[k].largo)}</span><em>${cuenta([...porCampo[k].values()].flat())}</em></button>
          ${UI.campo === k ? `<ul>${[...porCampo[k].entries()].map(([cat, arr]) => `<li><button data-cat="${esc(cat)}" class="${UI.categoria === cat ? 'activo' : ''}">${alerta(arr) ? '<i class="punto-critico" title="Requisito crítico abierto"></i>' : ''}<span>${esc(cat)}</span><em>${cuenta(arr)}</em></button></li>`).join('')}</ul>` : ''}
        </div>`).join('')}
      </nav>
      <section class="dx-main">
        <div class="dx-main-cab">
          <div><p class="eyebrow">${esc(CAMPOS[UI.campo].largo)}</p><h2>${esc(UI.categoria)}</h2></div>
          <div class="segmentado" role="radiogroup" aria-label="Filtrar requisitos">
            ${[['todos', 'Todos'], ['sin', 'Sin responder'], ['criticos', 'Críticos'], ['brechas', 'Con brecha']].map(([k, t]) => `<button role="radio" aria-checked="${UI.filtro === k}" data-filtro="${k}">${t}</button>`).join('')}
          </div>
        </div>
        <div id="tarjetas"></div>
      </section>
    </div>`;

    const pintarTarjetas = () => {
      let arr = porCampo[UI.campo].get(UI.categoria);
      if (UI.filtro === 'sin') arr = arr.filter((i) => resp(i) === 'pendiente');
      if (UI.filtro === 'criticos') arr = arr.filter((i) => i.requisito.severidad === 'critica');
      if (UI.filtro === 'brechas') arr = arr.filter((i) => ['no_cumple', 'parcial'].includes(resp(i)));
      panel.querySelector('#tarjetas').innerHTML = arr.length ? arr.map(tarjeta).join('') : '<div class="panel vacio"><p>Ningún requisito de esta categoría coincide con el filtro.</p></div>';
    };
    pintarTarjetas();

    panel.querySelector('.dx-nav').addEventListener('click', (e) => {
      const bc = e.target.closest('[data-campo]'); const bt = e.target.closest('[data-cat]');
      if (bc) { UI.campo = bc.dataset.campo; UI.categoria = null; listaChequeo(); }
      if (bt) { UI.categoria = bt.dataset.cat; listaChequeo(); panel.querySelector('.dx-main').scrollIntoView({ block: 'start' }); }
    });
    panel.querySelector('.segmentado').addEventListener('click', (e) => { const b = e.target.closest('[data-filtro]'); if (b) { UI.filtro = b.dataset.filtro; listaChequeo(); } });
    enlazarTarjetas(panel.querySelector('#tarjetas'));
  };

  const tarjeta = (it) => {
    const r = it.requisito; const a = it.respuesta || {}; const e = estadoEfectivo(it.respuesta);
    const dis = c.editable ? '' : 'disabled';
    const evs = c.evidencias.get(r.id) || [];
    const brecha = ['no_cumple', 'parcial'].includes(a.respuesta);
    const riesgo = brecha ? nivelRiesgo(r.severidad, a.probabilidad || 'media') : null;
    return `<article class="req ${r.severidad === 'critica' ? 'req-critico' : ''}" data-req="${esc(r.id)}" id="req-${esc(r.codigo)}">
      <header class="req-cab">
        <span class="mono req-cod">${esc(r.codigo)}</span>
        ${pildora(SEVERIDADES_TXT[r.severidad], TONO_SEV[r.severidad])}
        ${pildora(NATURALEZAS[r.naturaleza], r.naturaleza === 'legal' ? 'info' : 'neutro')}
        ${r.vigencia !== 'verificada' ? pildora(VIGENCIAS[r.vigencia], TONO_VIGENCIA[r.vigencia]) : ''}
        ${it.aplicabilidad.aplica === null ? `<span title="${esc(it.aplicabilidad.motivos.join(' · '))}">${pildora('Aplicabilidad por confirmar', 'aviso')}</span>` : ''}
        <span class="req-guardado" aria-live="polite"></span>
      </header>
      <p class="req-pregunta">${esc(r.pregunta)}</p>
      <p class="req-norma">${esc([r.norma, r.disposicion].filter(Boolean).join(' · ') || 'Buena práctica sin norma asociada')}</p>
      <details class="req-ficha"><summary>Ficha normativa, evidencia esperada y método</summary>${htmlFichaNormativa(r)}</details>
      <fieldset class="respuestas" ${dis}><legend class="sr">Respuesta</legend>
        ${Object.entries(RESPUESTAS).map(([k, t]) => `<label class="resp resp-${k}"><input type="radio" name="resp-${esc(r.id)}" value="${k}" ${(a.respuesta || 'pendiente') === k ? 'checked' : ''}><span>${t}</span></label>`).join('')}
      </fieldset>
      ${a.respuesta === 'no_aplica' ? `<div class="req-na">
        <label class="campo"><span>Justificación del "No aplica" (obligatoria)</span><textarea data-k="justificacionNA" rows="2" ${dis}>${esc(a.justificacionNA || '')}</textarea></label>
        <p>${pildora({ pendiente: 'Pendiente de validación del revisor', aprobada: 'Exclusión validada', rechazada: 'Exclusión rechazada' }[a.naEstado || 'pendiente'], { pendiente: 'aviso', aprobada: 'ok', rechazada: 'critico' }[a.naEstado || 'pendiente'])}
          ${a.comentarioRevision ? `<span class="sub"> Revisor: ${esc(a.comentarioRevision)}</span>` : ''}</p>
        ${revisor && c.d.estado === 'pendiente_revision' && a.naEstado !== 'aprobada' ? `<div class="acciones"><button class="btn btn-sec btn-peq" data-na="rechazada">Rechazar exclusión</button><button class="btn btn-pri btn-peq" data-na="aprobada">Validar exclusión</button></div>` : ''}
      </div>` : ''}
      ${brecha ? `<div class="rejilla-form req-brecha">
        <label class="campo"><span>Probabilidad de materialización</span><select data-k="probabilidad" ${dis}>${['baja', 'media', 'alta'].map((p) => `<option value="${p}" ${(a.probabilidad || 'media') === p ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></label>
        <div class="campo"><span>Nivel de riesgo</span><p>${pildora(riesgo.etiqueta, riesgo.tono)} <small class="sub">severidad ${esc(SEVERIDADES_TXT[r.severidad].toLowerCase())} × probabilidad</small></p></div>
        <label class="campo"><span>Responsable sugerido</span><input data-k="responsable" value="${esc(a.responsable ?? r.responsable ?? '')}" ${dis}></label>
        <label class="campo"><span>Fecha de verificación</span><input type="date" data-k="fechaVerificacion" value="${esc(a.fechaVerificacion || '')}" ${dis}></label>
        <label class="campo campo-ancho"><span>Recomendación</span><textarea data-k="recomendacion" rows="2" placeholder="${esc(r.recomendacion)}" ${dis}>${esc(a.recomendacion || '')}</textarea></label>
      </div>` : ''}
      <label class="campo"><span>Observaciones del asesor (hallazgo)</span><textarea data-k="observaciones" rows="2" ${dis} placeholder="Describa lo verificado: documento, fecha, versión, entrevista o inspección.">${esc(a.observaciones || '')}</textarea></label>
      <div class="req-evid">
        <span class="eyebrow">Evidencias (${evs.length})</span>
        ${evs.map((x) => `<button class="chip" data-ev="${x.id}">${icono('archivo')}${esc(x.nombre)} <small>${tamano(x.tamano)}${x.fechaEvidencia ? ` · ${esc(x.fechaEvidencia)}` : ''}</small></button>`).join('')}
        ${c.editable ? `<label class="btn btn-sec btn-peq chip-subir">${icono('cargar')}Adjuntar<input type="file" class="sr" data-subir accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"></label>` : ''}
      </div>
    </article>`;
  };

  const enlazarTarjetas = (cont) => {
    const guardar = async (art, cambios, rerender) => {
      const reqId = art.dataset.req; const est = art.querySelector('.req-guardado');
      est.textContent = 'Guardando…';
      try {
        const r = await guardarRespuesta(id, reqId, cambios);
        const it = c.items.find((i) => i.requisito.id === reqId); it.respuesta = r;
        est.textContent = `Guardado ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;
        if (rerender) { c = await contextoDiagnostico(id); art.outerHTML = tarjeta(c.items.find((i) => i.requisito.id === reqId)); actualizarCabecera(); }
      } catch (x) { est.textContent = 'No se guardó'; avisar(x.message, 'error'); }
    };
    const textoDebounced = new Map();
    cont.addEventListener('change', (e) => {
      const art = e.target.closest('.req'); if (!art) return;
      if (e.target.type === 'radio') return guardar(art, { respuesta: e.target.value }, true);
      if (e.target.dataset.subir !== undefined) return subirEvidencia(art.dataset.req, e.target.files[0]);
      if (e.target.dataset.k === 'probabilidad') return guardar(art, { probabilidad: e.target.value }, true);
      if (e.target.dataset.k === 'fechaVerificacion') return guardar(art, { fechaVerificacion: e.target.value });
    });
    cont.addEventListener('input', (e) => {
      const art = e.target.closest('.req'); const k = e.target.dataset.k;
      if (!art || !k || e.target.tagName === 'SELECT' || e.target.type === 'date') return;
      const clave = `${art.dataset.req}:${k}`;
      if (!textoDebounced.has(clave)) textoDebounced.set(clave, debounce((val) => guardar(art, { [k]: val }, k === 'justificacionNA' && false), 700));
      art.querySelector('.req-guardado').textContent = 'Cambios sin guardar…';
      textoDebounced.get(clave)(e.target.value);
    });
    cont.addEventListener('click', async (e) => {
      const ev = e.target.closest('[data-ev]'); const na = e.target.closest('[data-na]');
      if (ev) return abrirEvidencia(ev.dataset.ev);
      if (na) {
        const art = na.closest('.req'); let comentario = '';
        if (na.dataset.na === 'rechazada') {
          const r = await confirmar({ titulo: 'Rechazar exclusión', mensaje: '<p>El requisito volverá a "Pendiente de verificación" para que el asesor lo evalúe.</p>', textoAccion: 'Rechazar', pedirMotivo: true });
          if (!r?.ok) return; comentario = r.motivo;
        }
        try { await resolverNoAplica(id, art.dataset.req, na.dataset.na, comentario); avisar(na.dataset.na === 'aprobada' ? 'Exclusión validada.' : 'Exclusión rechazada.'); await recargar(); }
        catch (x) { avisar(x.message, 'error'); }
      }
    });
  };

  const actualizarCabecera = () => {
    const r = c.resultados; const p = v.querySelector('.progreso-dx');
    if (p) { p.querySelector('b').textContent = `${r.progreso} %`; p.querySelector('.progreso-cifras span').textContent = `${r.respondidos} de ${r.total} requisitos respondidos`; p.querySelector('.barra span').style.width = `${r.progreso}%`; }
  };

  const subirEvidencia = async (reqId, archivo) => {
    if (!archivo) return;
    const r = await modal({
      titulo: 'Adjuntar evidencia', contenido: `<p><b>${esc(archivo.name)}</b> · ${tamano(archivo.size)}</p>
        <label class="campo"><span>Fecha de la evidencia</span><input type="date" id="ev-fecha"></label>
        <label class="campo"><span>Descripción</span><input id="ev-desc" placeholder="Ej.: Acta de conformación del COPASST 2026–2028"></label>`,
      acciones: [{ texto: 'Cancelar', valor: null }, { texto: 'Adjuntar', clase: 'btn-pri', alPulsar: async (m) => { await adjuntarEvidencia(id, reqId, archivo, { fechaEvidencia: m.querySelector('#ev-fecha').value, descripcion: m.querySelector('#ev-desc').value }); return 'ok'; } }],
    });
    if (r === 'ok') { avisar('Evidencia adjuntada.'); c = await contextoDiagnostico(id); const art = v.querySelector(`[data-req="${CSS.escape(reqId)}"]`); if (art) art.outerHTML = tarjeta(c.items.find((i) => i.requisito.id === reqId)); }
  };

  const abrirEvidencia = async (evId) => {
    const x = await obtenerEvidencia(evId);
    const url = URL.createObjectURL(x.archivo);
    const acciones = [{ texto: 'Cerrar', valor: null }];
    if (c.editable) acciones.push({ texto: 'Retirar evidencia', clase: 'btn-peligro', alPulsar: async (m) => { await retirarEvidencia(evId, m.querySelector('#ev-motivo').value); return 'retirada'; } });
    acciones.push({ texto: 'Descargar', clase: 'btn-pri', alPulsar: () => { descargar(x.archivo, x.nombre); return false; } });
    const r = await modal({ titulo: x.nombre, ancho: 'modal-ancho', acciones,
      contenido: `<dl class="ficha"><dt>Requisito</dt><dd class="mono">${esc(x.requisitoCodigo)}</dd><dt>Fecha de la evidencia</dt><dd>${esc(x.fechaEvidencia || '—')}</dd><dt>Descripción</dt><dd>${esc(x.descripcion || '—')}</dd><dt>Cargada</dt><dd>${fecha(x.creadoEn, true)}</dd></dl>
        ${x.mime.startsWith('image/') ? `<img class="previa" src="${url}" alt="${esc(x.nombre)}">` : '<p class="sub">Vista previa no disponible para este formato.</p>'}
        ${c.editable ? '<label class="campo"><span>Motivo de retiro (solo si la va a retirar)</span><input id="ev-motivo"></label>' : ''}` });
    URL.revokeObjectURL(url);
    if (r === 'retirada') { avisar('Evidencia retirada (eliminación lógica).'); await recargar(); }
  };

  /* ---------------- Resultados ---------------- */
  const resultados = async () => {
    const panel = v.querySelector('#panel-dx'); const r = c.resultados; const q = c.res0312;
    const congelado = !!c.d.resultados;
    panel.innerHTML = `
    <div class="barra-informes"><span class="eyebrow">Informe PDF${congelado ? '' : ' (preliminar)'}</span>
      <button class="btn btn-pri btn-peq" data-pdf="diagnostico_integral">${icono('informes')}Integral</button>
      ${c.d.campos.map((k) => `<button class="btn btn-sec btn-peq" data-pdf="diagnostico_${k}">${esc(CAMPOS[k].nombre)}</button>`).join('')}</div>
    ${congelado ? `<div class="banda banda-ok">${icono('ok')}<span>Resultados calculados y congelados al aprobar (${fecha(c.d.resultados.calculadoEn, true)}). Cambios posteriores del catálogo o de los parámetros no los alteran.</span></div>` : ''}
    <section class="rejilla-campos">${c.d.campos.map((k) => { const x = r.porCampo[k]; return `<article class="panel campo-res">
      <header><h2>${esc(CAMPOS[k].largo)}</h2></header>
      ${x.porcentaje === null ? '<p class="res-nd">Sin datos suficientes</p>' : `<p class="res-pct">${x.porcentaje} %</p>${pildora(`Nivel ${x.rango.etiqueta.toLowerCase()} (criterio interno)`, x.rango.tono)}`}
      <div class="cobertura"><span>Cobertura de la evaluación</span><div class="barra"><span style="width:${x.cobertura ?? 0}%"></span></div><b>${x.cobertura ?? 0} %</b></div>
      ${x.incompleto ? `<p class="txt-alerta">${icono('alerta')} Resultado incompleto: ${x.conteos.pendiente} pendiente(s)${x.conteos.na_por_validar ? ` y ${x.conteos.na_por_validar} "No aplica" sin validar` : ''}.</p>` : ''}
      <dl class="conteos"><dt>Cumple</dt><dd>${x.conteos.cumple}</dd><dt>Parcial</dt><dd>${x.conteos.parcial}</dd><dt>No cumple</dt><dd>${x.conteos.no_cumple}</dd><dt>No aplica validado</dt><dd>${x.conteos.na_validado}</dd><dt>Pendientes</dt><dd>${x.conteos.pendiente + x.conteos.na_por_validar}</dd></dl>
    </article>`; }).join('')}</section>
    <section class="rejilla-2">
      <article class="panel"><header><h2>Cumplimiento por campo</h2><small>Promedio simple entre campos con datos: <b>${r.promedioSimple ?? '—'}${r.promedioSimple != null ? ' %' : ''}</b></small></header><div class="lienzo"><canvas id="g-campos" role="img" aria-label="Cumplimiento por campo"></canvas></div></article>
      <article class="panel"><header><h2>Perfil de cumplimiento</h2><small>Solo campos con datos</small></header><div class="lienzo"><canvas id="g-radar" role="img" aria-label="Radar de cumplimiento"></canvas></div></article>
    </section>
    ${q ? `<article class="panel res-0312">
      <header><h2>Autoevaluación de Estándares Mínimos — Resolución 0312 de 2019</h2>${q.provisional ? pildora(`Provisional: ${q.pendientes} ítem(s) sin respuesta definitiva`, 'aviso') : ''}</header>
      <div class="res-0312-cuerpo"><p class="res-pct">${q.porcentaje} %</p><div>${pildora(q.valoracion.etiqueta, q.valoracion.tono)}<p>${esc(q.valoracion.accion)}</p>
      <p class="sub">${q.valorObtenido} de ${q.valorTotal} puntos de la tabla de valores (art. 27) · ${q.itemsEvaluados} ítems del grupo ${esc(etiquetaGrupo(q.grupo))}. Solo "Cumple" suma; "Cumple parcialmente" se trata como no cumplido; "No aplica" validado recibe el valor del ítem.</p></div></div>
    </article>` : ''}
    <article class="panel"><header><h2>Alertas críticas</h2><small>Se muestran siempre, sin importar el promedio</small></header>
      ${r.alertas.length ? `<ul class="lista-alertas">${r.alertas.map((a) => `<li><button class="enlace" data-ir="${esc(a.codigo)}">${esc(a.codigo)}</button> ${pildora(RESPUESTAS[a.estado] || 'No aplica sin validar', a.bloqueaAprobacion ? 'aviso' : 'critico')} ${esc(a.pregunta)}${a.bloqueaAprobacion ? ' <small class="txt-alerta">Impide la aprobación</small>' : ''}</li>`).join('')}</ul>` : '<p class="sub">No hay requisitos críticos incumplidos ni pendientes.</p>'}
    </article>
    <article class="panel"><header><h2>Madurez y conclusiones</h2><small>La madurez es una valoración cualitativa del asesor, independiente del porcentaje</small></header>
      <div class="rejilla-form">${c.d.campos.map((k) => `<div class="campo campo-ancho madurez">
        <label class="campo"><span>Madurez — ${esc(CAMPOS[k].largo)}</span><select data-madurez="${k}" ${c.editable ? '' : 'disabled'}><option value="">Sin calificar</option>${MADUREZ.map((m) => `<option value="${m.nivel}" ${Number(c.d.madurez?.[k]) === m.nivel ? 'selected' : ''}>${m.nivel}. ${m.nombre} — ${m.descripcion}</option>`).join('')}</select></label>
        <label class="campo"><span>Conclusión — ${esc(CAMPOS[k].nombre)}</span><textarea rows="3" data-concl="${k}" ${c.editable ? '' : 'disabled'}>${esc(c.d.conclusiones?.[k] || '')}</textarea></label></div>`).join('')}
        <label class="campo campo-ancho"><span>Conclusión general y limitaciones del diagnóstico</span><textarea rows="4" data-concl="general" ${c.editable ? '' : 'disabled'} placeholder="Incluya limitaciones: información no suministrada, sedes no visitadas, requisitos con norma pendiente de validación.">${esc(c.d.conclusiones?.general || '')}</textarea></label>
      </div><small class="sub" id="estado-cierre"></small>
    </article>
    <details class="panel plegable-panel"><summary><h2>Cómo se calcula</h2></summary><div class="texto-largo">
      <p>Cumplimiento del campo = suma de (peso × puntaje) ÷ suma de pesos de los requisitos evaluados. Puntajes: Cumple ${c.parametros.puntajes.cumple}, Parcial ${c.parametros.puntajes.parcial}, No cumple ${c.parametros.puntajes.no_cumple}.</p>
      <p>"No aplica" se excluye solo si está justificado y validado por el revisor. "Pendiente de verificación" no cuenta como cumplimiento y reduce la cobertura. Sin requisitos evaluados se informa "Sin datos suficientes".</p>
      <p>Porcentaje de cumplimiento, nivel de riesgo (severidad × probabilidad), criticidad (severidad del catálogo), prioridad de intervención (módulo Planes y horas) y madurez (valoración del asesor) son dimensiones distintas.</p></div></details>`;
    const conDatos = c.d.campos.filter((k) => r.porCampo[k].porcentaje !== null);
    graficoPorcentaje('g-campos', c.d.campos.map((k) => CAMPOS[k].nombre), c.d.campos.map((k) => r.porCampo[k].porcentaje));
    if (conDatos.length >= 3) graficoRadar('g-radar', conDatos.map((k) => CAMPOS[k].nombre), [{ nombre: c.d.codigo, valores: conDatos.map((k) => r.porCampo[k].porcentaje) }]);
    else panel.querySelector('#g-radar').replaceWith(Object.assign(document.createElement('p'), { className: 'vacio-graf', textContent: 'El radar requiere al menos tres campos con datos.' }));
    panel.querySelectorAll('[data-ir]').forEach((b) => b.onclick = () => irARequisito(b.dataset.ir));
    panel.querySelectorAll('[data-pdf]').forEach((b) => b.onclick = () => generarYMostrar(b.dataset.pdf, { diagnosticoId: id }, b));
    const est = panel.querySelector('#estado-cierre');
    const guardarC = debounce(async (cambios) => { try { await guardarCierre(id, cambios); est.textContent = `Guardado ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`; } catch (x) { avisar(x.message, 'error'); } }, 700);
    panel.addEventListener('input', (e) => {
      if (e.target.dataset.concl) { est.textContent = 'Cambios sin guardar…'; guardarC({ conclusiones: { [e.target.dataset.concl]: e.target.value } }); }
      if (e.target.dataset.madurez) guardarC({ madurez: { [e.target.dataset.madurez]: e.target.value } });
    });
  };

  const irARequisito = (codigo) => {
    const it = c.items.find((i) => i.requisito.codigo === codigo); if (!it) return;
    Object.assign(UI, { pestana: 'lista', campo: it.requisito.campo, categoria: it.requisito.categoria, filtro: 'todos' });
    v.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x.dataset.tab === 'lista')));
    listaChequeo().then(() => document.getElementById(`req-${codigo}`)?.scrollIntoView({ block: 'center' }));
  };

  /* ---------------- Hallazgos ---------------- */
  const hallazgos = async () => {
    const panel = v.querySelector('#panel-dx');
    const h = [...c.hallazgos].sort((a, b) => b.riesgo.valor - a.riesgo.valor);
    panel.innerHTML = h.length ? `<div class="banda banda-ok">${icono('alerta')}<span>Los hallazgos se generan de las respuestas "No cumple", "Cumple parcialmente" y "Pendiente". Al aprobar el diagnóstico se registran para el plan de trabajo; la prioridad de intervención se calcula en Planes y horas.</span></div>
      <div class="panel tabla-envoltura"><table class="tabla">
      <thead><tr><th>Requisito</th><th>Tipo</th><th>Hallazgo</th><th>Severidad</th><th>Riesgo</th><th>Naturaleza</th><th>Recomendación</th></tr></thead>
      <tbody>${h.map((x) => `<tr><td><button class="enlace mono" data-ir="${esc(x.codigo)}">${esc(x.codigo)}</button><small>${esc(CAMPOS[x.campo].nombre)}</small></td>
        <td>${pildora(...TIPO_HALLAZGO[x.tipo])}</td><td>${esc(x.descripcion)}<small>${esc(x.norma)}</small></td>
        <td>${pildora(SEVERIDADES_TXT[x.severidad], TONO_SEV[x.severidad])}</td><td>${pildora(x.riesgo.etiqueta, x.riesgo.tono)}</td>
        <td>${esc(NATURALEZAS[x.naturaleza])}</td><td>${esc(x.recomendacion || '—')}<small>${esc(x.responsable || '')}</small></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="panel vacio"><p>Sin hallazgos: no hay requisitos incumplidos, parciales ni pendientes.</p></div>';
    panel.querySelectorAll('[data-ir]').forEach((b) => b.onclick = () => irARequisito(b.dataset.ir));
  };

  /* ---------------- Excluidos por perfil ---------------- */
  const excluidos = async () => {
    const panel = v.querySelector('#panel-dx');
    panel.innerHTML = `<div class="banda banda-ok">${icono('alerta')}<span>Estos requisitos no aplican según el perfil registrado de la empresa (trabajadores, clase de riesgo, grupo de estándares y condiciones del perfil). No se califican. Si el perfil está mal registrado, corríjalo en el expediente y actualícelo aquí.</span></div>
      ${c.editable ? `<div class="acciones"><button class="btn btn-sec" id="btn-perfil">Actualizar con el perfil actual de la empresa</button></div>` : ''}
      ${c.excluidos.length ? `<div class="panel tabla-envoltura"><table class="tabla"><thead><tr><th>Requisito</th><th>Motivo de exclusión</th><th></th></tr></thead><tbody>
        ${c.excluidos.map((x) => `<tr><td><span class="mono">${esc(x.requisito.codigo)}</span><small>${esc(x.requisito.pregunta)}</small></td><td>${esc(x.motivos.join(' · '))}</td>
        <td>${c.editable ? `<button class="btn btn-sec btn-peq" data-incluir="${esc(x.requisito.codigo)}">Incluir</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="panel vacio"><p>Todos los requisitos del alcance aplican a la empresa.</p></div>'}`;
    panel.querySelector('#btn-perfil')?.addEventListener('click', async () => { try { await actualizarPerfil(id); avisar('Perfil de aplicabilidad actualizado.'); await recargar(); } catch (x) { avisar(x.message, 'error'); } });
    panel.querySelectorAll('[data-incluir]').forEach((b) => b.onclick = async () => {
      const r = await confirmar({ titulo: `Incluir ${b.dataset.incluir}`, mensaje: '<p>El requisito se evaluará aunque el perfil lo excluya.</p>', textoAccion: 'Incluir', pedirMotivo: true });
      if (r?.ok) { try { await incluirManualmente(id, b.dataset.incluir, r.motivo); avisar('Requisito incluido.'); await recargar(); } catch (x) { avisar(x.message, 'error'); } }
    });
  };

  /* ---------------- Revisión e historial ---------------- */
  const revision = async () => {
    const panel = v.querySelector('#panel-dx');
    const imp = await analisisImpacto(id);
    const naPend = c.items.filter((i) => i.respuesta?.respuesta === 'no_aplica' && i.respuesta.naEstado === 'pendiente');
    const bloqueos = c.resultados.alertas.filter((a) => a.bloqueaAprobacion);
    const botones = [];
    if (c.editable && puede(u, 'diagnosticos.diligenciar')) botones.push(`<button class="btn btn-pri" data-acc="enviar">Enviar a revisión</button>`);
    if (revisor && c.d.estado === 'pendiente_revision') botones.push('<button class="btn btn-sec" data-acc="devolver">Devolver para ajustes</button>', '<button class="btn btn-pri" data-acc="aprobar">Aprobar diagnóstico</button>');
    if (revisor && c.d.estado === 'aprobado') botones.push('<button class="btn btn-sec" data-acc="cerrar">Cerrar diagnóstico</button>');
    if (['aprobado', 'cerrado'].includes(c.d.estado) && puede(u, 'diagnosticos.crear')) botones.push('<button class="btn btn-sec" data-acc="revision">Crear nueva revisión</button>');
    if (['aprobado', 'cerrado'].includes(c.d.estado) && puede(u, 'planes.generar')) botones.push(`<a class="btn btn-pri" href="#/planes/${c.e.id}">Priorizar y planificar</a>`);
    panel.innerHTML = `
    <section class="rejilla-2">
      <article class="panel"><header><h2>Flujo de aprobación</h2></header>
        <ol class="flujo">${Object.entries(ESTADOS_DX).filter(([k]) => k !== 'devuelto').map(([k, t]) => `<li class="${k === c.d.estado ? 'actual' : ''}">${t}</li>`).join('')}</ol>
        <ul class="lista-check">
          <li class="${bloqueos.length ? 'no' : 'si'}">${bloqueos.length ? `${bloqueos.length} requisito(s) crítico(s) sin verificar o con "No aplica" sin validar` : 'Sin críticos pendientes'}</li>
          <li class="${naPend.length ? 'no' : 'si'}">${naPend.length ? `${naPend.length} "No aplica" pendiente(s) de validación` : 'Todos los "No aplica" validados'}</li>
          <li class="${c.resultados.pendientes ? 'aviso' : 'si'}">${c.resultados.pendientes ? `${c.resultados.pendientes} requisito(s) pendiente(s): el resultado se informará como incompleto` : 'Cobertura completa'}</li>
        </ul>
        <div class="acciones">${botones.join('') || '<span class="sub">No hay acciones disponibles para su rol en este estado.</span>'}</div>
      </article>
      <article class="panel"><header><h2>Cambios normativos posteriores</h2></header>
        ${imp.mismaVersion ? `<p class="sub">El diagnóstico usa la versión vigente del catálogo (${esc(c.d.catalogoVersion)}).</p>` : `
          <p>Se publicó la versión <b class="mono">${esc(imp.vigente.version)}</b>. Impacto sobre los campos de este diagnóstico:</p>
          <dl class="conteos"><dt>Requisitos modificados</dt><dd>${imp.modificados.length}</dd><dt>Nuevos</dt><dd>${imp.nuevos.length}</dd><dt>Retirados</dt><dd>${imp.retirados.length}</dd></dl>
          ${imp.modificados.length ? `<ul class="lista-simple">${imp.modificados.slice(0, 12).map((m) => `<li><b class="mono">${esc(m.despues.codigo)}</b>: ${esc(m.campos.join(', '))}</li>`).join('')}</ul>` : ''}
          <p class="sub">Los resultados aprobados no se modifican. Cree una nueva revisión para evaluar con la versión vigente.</p>`}
      </article>
    </section>
    ${revisor && naPend.length ? `<article class="panel"><header><h2>"No aplica" por validar</h2></header><div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Requisito</th><th>Justificación del asesor</th><th></th></tr></thead><tbody>
      ${naPend.map((i) => `<tr data-req="${esc(i.requisito.id)}"><td><span class="mono">${esc(i.requisito.codigo)}</span><small>${esc(i.requisito.pregunta)}</small></td><td>${esc(i.respuesta.justificacionNA || '— sin justificación —')}</td>
      <td class="acciones-celda">${c.d.estado === 'pendiente_revision' ? '<button class="btn btn-sec btn-peq" data-na2="rechazada">Rechazar</button><button class="btn btn-pri btn-peq" data-na2="aprobada">Validar</button>' : '<span class="sub">Se valida cuando se envíe a revisión</span>'}</td></tr>`).join('')}</tbody></table></div></article>` : ''}
    <article class="panel"><header><h2>Historial del diagnóstico</h2></header>
      <ol class="linea-tiempo">${[...c.d.historial].reverse().map((h) => `<li><div class="lt-cab"><strong>${h.de ? `${esc(ESTADOS_DX[h.de])} → ` : ''}${esc(ESTADOS_DX[h.a])}</strong><span>${fecha(h.fecha, true)} · ${esc(h.usuario)}</span></div>${h.comentario ? `<p class="lt-motivo">${esc(h.comentario)}</p>` : ''}</li>`).join('')}</ol>
      <p class="sub">Alcance: ${esc(c.d.alcance)}${c.d.sedes?.length ? ` · Sedes: ${esc(c.d.sedes.join('; '))}` : ''}</p>
    </article>`;

    panel.querySelectorAll('[data-na2]').forEach((b) => b.onclick = async () => {
      const reqId = b.closest('tr').dataset.req; let comentario = '';
      if (b.dataset.na2 === 'rechazada') { const r = await confirmar({ titulo: 'Rechazar exclusión', mensaje: '<p>El requisito volverá a pendiente.</p>', textoAccion: 'Rechazar', pedirMotivo: true }); if (!r?.ok) return; comentario = r.motivo; }
      try { await resolverNoAplica(id, reqId, b.dataset.na2, comentario); avisar('Decisión registrada.'); await recargar(); } catch (x) { avisar(x.message, 'error'); }
    });
    panel.querySelectorAll('[data-acc]').forEach((b) => b.onclick = async () => {
      const acc = b.dataset.acc;
      const cfg = {
        enviar: { titulo: 'Enviar a revisión', msg: `<p>El diagnóstico quedará bloqueado para edición hasta que el revisor lo apruebe o lo devuelva.</p>${c.resultados.pendientes ? `<p class="txt-alerta">Hay ${c.resultados.pendientes} requisito(s) pendiente(s); el resultado se informará como incompleto.</p>` : ''}`, txt: 'Enviar', motivo: false, fn: (m) => enviarARevision(id, m) },
        devolver: { titulo: 'Devolver para ajustes', msg: '<p>Explique los ajustes requeridos; el asesor podrá editar de nuevo.</p>', txt: 'Devolver', motivo: true, fn: (m) => devolver(id, m) },
        aprobar: { titulo: 'Aprobar diagnóstico', msg: '<p>Los resultados se congelan con los parámetros actuales y los hallazgos quedan registrados para el plan de trabajo. La aprobación queda a su nombre en la bitácora.</p>', txt: 'Aprobar', motivo: false, fn: (m) => aprobar(id, m) },
        cerrar: { titulo: 'Cerrar diagnóstico', msg: '<p>El diagnóstico quedará cerrado y de solo lectura.</p>', txt: 'Cerrar', motivo: true, fn: (m) => cerrar(id, m) },
        revision: { titulo: 'Crear nueva revisión', msg: '<p>Se crea un diagnóstico nuevo con el catálogo vigente. Las respuestas de requisitos sin cambios se conservan; los modificados quedan pendientes.</p>', txt: 'Crear revisión', motivo: true, fn: async (m) => { const n = await crearRevision(id, m); ir(`/diagnosticos/${n.id}`); return n; } },
      }[acc];
      const r = await confirmar({ titulo: cfg.titulo, mensaje: cfg.msg, textoAccion: cfg.txt, pedirMotivo: cfg.motivo });
      if (!r?.ok) return;
      try { await cfg.fn(r.motivo || ''); avisar(`${cfg.titulo}: listo.`); if (acc !== 'revision') await recargar(); } catch (x) { avisar(x.message, 'error'); }
    });
  };

  const PESTANAS = { lista: listaChequeo, resultados, hallazgos, excluidos, revision };
  v.innerHTML = encabezado();
  enlazarPestanas();
  await PESTANAS[UI.pestana]();
}

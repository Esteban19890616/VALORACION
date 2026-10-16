/** Catálogo normativo: consulta (asesor y administrador) y edición por versiones (administrador). */
import { esc, fecha, debounce } from '../core/utils.js';
import { icono, pildora, modal, avisar, confirmar, marcarErrores } from '../core/ui.js';
import { sesion } from '../core/session.js';
import { puede } from '../domain/permisos.js';
import { CONDICIONES, textoCondicion, etiquetaGrupo } from '../domain/perfil.js';
import {
  catalogoVigente, borradorActual, listarCatalogos, listarRequisitos, crearBorrador, guardarRequisito, cambiarEstadoRequisito,
  publicarBorrador, descartarBorrador, compararCatalogos, obtenerParametros, guardarParametros,
  CAMPOS_CATALOGO, VIGENCIAS, NATURALEZAS, SEVERIDADES_TXT,
} from '../services/catalogo.service.js';

const f = { campo: '', categoria: '', vigencia: '', texto: '', vista: 'vigente' };
export const TONO_VIGENCIA = { verificada: 'ok', pendiente_validacion: 'aviso', sin_norma: 'neutro', derogada: 'critico' };
export const TONO_SEV = { critica: 'critico', alta: 'aviso', media: 'info', baja: 'neutro' };

export async function vistaCatalogo(v) {
  const admin = puede(sesion.usuario(), 'catalogo.administrar');
  const vig = await catalogoVigente();
  const bor = admin ? await borradorActual() : null;
  if (f.vista === 'borrador' && !bor) f.vista = 'vigente';
  const cat = f.vista === 'borrador' ? bor : vig;
  const todos = await listarRequisitos(cat.id, { incluirRetirados: f.vista === 'borrador' });
  const categorias = [...new Set(todos.filter((r) => !f.campo || r.campo === f.campo).map((r) => r.categoria))].sort((a, b) => a.localeCompare(b, 'es'));
  const cuenta = (k) => todos.filter((r) => r.vigencia === k && r.estado !== 'retirado').length;

  v.innerHTML = `
  <div class="titulo-vista">
    <div><h1>Catálogo normativo</h1>
      <p>Versión publicada <b class="mono">${esc(vig.version)}</b> · fecha de corte ${fecha(vig.fechaCorte + 'T12:00:00')} · ${todos.filter((r) => r.estado !== 'retirado').length} requisitos.
      Cada diagnóstico conserva la versión con la que se realizó.</p></div>
    <div class="acciones">
      ${admin ? `<button class="btn btn-sec" id="btn-param">Parámetros de calificación</button>` : ''}
      ${admin && !bor ? `<button class="btn btn-pri" id="btn-borrador">${icono('mas')}Crear borrador de nueva versión</button>` : ''}
    </div>
  </div>
  ${bor ? `<div class="banda banda-aviso">${icono('alerta')}<div><b>Borrador ${esc(bor.version)} en edición.</b> Los cambios no afectan a los diagnósticos hasta que se publique.
    <div class="acciones mt">
      <button class="btn btn-sec btn-peq" data-vista="${f.vista === 'borrador' ? 'vigente' : 'borrador'}">${f.vista === 'borrador' ? 'Ver versión publicada' : 'Editar borrador'}</button>
      <button class="btn btn-sec btn-peq" id="btn-comparar">Comparar con la publicada</button>
      <button class="btn btn-pri btn-peq" id="btn-publicar">Publicar ${esc(bor.version)}</button>
      <button class="btn btn-peligro btn-peq" id="btn-descartar">Descartar borrador</button></div></div></div>` : ''}
  <section class="kpis kpis-3">
    <article class="kpi"><h3>Verificados</h3><span class="kpi-valor">${cuenta('verificada')}</span><small>Fuente oficial o confiable consultada</small></article>
    <article class="kpi ${cuenta('pendiente_validacion') ? 'kpi-alerta' : ''}"><h3>Pendientes de validación</h3><span class="kpi-valor">${cuenta('pendiente_validacion')}</span><small>Cotejar con el texto oficial antes de concluir</small></article>
    <article class="kpi"><h3>Buenas prácticas</h3><span class="kpi-valor">${cuenta('sin_norma')}</span><small>Recomendación profesional, no obligación</small></article>
  </section>
  <form class="filtros" id="f-cat">
    <label class="campo campo-busqueda"><span>Buscar</span><input type="search" name="texto" id="fc-texto" value="${esc(f.texto)}" placeholder="Código, pregunta, norma o artículo"></label>
    <label class="campo"><span>Campo</span><select name="campo" id="fc-campo"><option value="">Todos</option>${Object.entries(CAMPOS_CATALOGO).map(([k, c]) => `<option value="${k}" ${f.campo === k ? 'selected' : ''}>${c.nombre}</option>`).join('')}</select></label>
    <label class="campo"><span>Categoría</span><select name="categoria" id="fc-categoria"><option value="">Todas</option>${categorias.map((c) => `<option ${f.categoria === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    <label class="campo"><span>Verificación</span><select name="vigencia" id="fc-vigencia"><option value="">Todas</option>${Object.entries(VIGENCIAS).map(([k, t]) => `<option value="${k}" ${f.vigencia === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
  </form>
  ${f.vista === 'borrador' ? `<div class="acciones"><button class="btn btn-pri" id="btn-nuevo-req">${icono('mas')}Agregar requisito al borrador</button></div>` : ''}
  <div id="t-cat"></div>
  <details class="panel plegable-panel"><summary><h2>Historial de versiones</h2></summary><div id="hist-cat"></div></details>`;

  const pintar = async () => {
    const filas = await listarRequisitos(cat.id, { ...f, incluirRetirados: f.vista === 'borrador' });
    v.querySelector('#t-cat').innerHTML = `<div class="panel tabla-envoltura"><table class="tabla">
      <thead><tr><th>Código</th><th>Requisito</th><th>Norma y disposición</th><th>Naturaleza</th><th>Verificación</th><th class="num">Peso</th><th>Severidad</th><th></th></tr></thead>
      <tbody>${filas.map((r) => `<tr class="${r.estado === 'retirado' ? 'fila-retirada' : ''}">
        <td class="mono">${esc(r.codigo)}</td>
        <td><strong class="txt-2l">${esc(r.pregunta)}</strong><small>${esc(CAMPOS_CATALOGO[r.campo].nombre)} · ${esc(r.categoria)}${r.estado === 'retirado' ? ' · RETIRADO' : ''}</small></td>
        <td>${esc(r.norma || '—')}<small>${esc(r.disposicion)}</small></td>
        <td>${esc(NATURALEZAS[r.naturaleza])}</td>
        <td>${pildora(VIGENCIAS[r.vigencia], TONO_VIGENCIA[r.vigencia])}</td>
        <td class="num">${r.peso}</td><td>${pildora(SEVERIDADES_TXT[r.severidad], TONO_SEV[r.severidad])}</td>
        <td><button class="btn btn-sec btn-peq" data-req="${esc(r.codigo)}">Abrir</button></td></tr>`).join('') || '<tr><td colspan="8">Ningún requisito coincide con los filtros.</td></tr>'}</tbody></table></div>`;
    v.querySelectorAll('[data-req]').forEach((b) => b.onclick = () => ficha(filas.find((r) => r.codigo === b.dataset.req), f.vista === 'borrador' ? cat : null, () => vistaCatalogo(v)));
  };
  v.querySelector('#f-cat').addEventListener('input', debounce((e) => { f[e.target.name] = e.target.value; if (e.target.name === 'campo') { f.categoria = ''; vistaCatalogo(v); } else pintar(); }, 250));
  v.querySelectorAll('[data-vista]').forEach((b) => b.onclick = () => { f.vista = b.dataset.vista; vistaCatalogo(v); });
  v.querySelector('#btn-borrador')?.addEventListener('click', () => nuevoBorrador(v));
  v.querySelector('#btn-nuevo-req')?.addEventListener('click', () => editar(null, cat, () => vistaCatalogo(v)));
  v.querySelector('#btn-publicar')?.addEventListener('click', async () => {
    const r = await confirmar({ titulo: `Publicar versión ${bor.version}`, mensaje: '<p>Los diagnósticos nuevos usarán esta versión. Los diagnósticos existentes conservan la suya y podrán ver el análisis de impacto.</p>', textoAccion: 'Publicar', pedirMotivo: true });
    if (!r?.ok) return;
    try { await publicarBorrador(r.motivo); f.vista = 'vigente'; avisar(`Versión ${bor.version} publicada.`); vistaCatalogo(v); } catch (x) { avisar(x.message, 'error'); }
  });
  v.querySelector('#btn-descartar')?.addEventListener('click', async () => {
    const r = await confirmar({ titulo: 'Descartar borrador', mensaje: `<p>Se descartarán todos los cambios del borrador ${esc(bor.version)}.</p>`, textoAccion: 'Descartar', peligro: true, pedirMotivo: true });
    if (!r?.ok) return;
    try { await descartarBorrador(r.motivo); f.vista = 'vigente'; avisar('Borrador descartado.'); vistaCatalogo(v); } catch (x) { avisar(x.message, 'error'); }
  });
  v.querySelector('#btn-comparar')?.addEventListener('click', async () => mostrarComparacion(await compararCatalogos(vig.id, bor.id), vig, bor));
  v.querySelector('#btn-param')?.addEventListener('click', () => parametros());
  const hist = await listarCatalogos();
  v.querySelector('#hist-cat').innerHTML = `<div class="tabla-envoltura"><table class="tabla tabla-compacta"><thead><tr><th>Versión</th><th>Estado</th><th>Fecha de corte</th><th>Publicada</th><th>Notas</th></tr></thead><tbody>
    ${hist.map((c) => `<tr><td class="mono">${esc(c.version)}</td><td>${esc({ publicado: 'Publicada (vigente)', borrador: 'Borrador', reemplazado: 'Reemplazada' }[c.estado])}</td><td>${fecha(c.fechaCorte + 'T12:00:00')}</td><td>${fecha(c.publicadoEn, true)}</td><td>${esc(c.notasPublicacion || c.notas || '')}</td></tr>`).join('')}</tbody></table></div>`;
  await pintar();
}

function textoAplicabilidad(a = {}) {
  const p = [];
  if (a.grupos0312?.length) p.push(`Grupos de la Res. 0312: ${a.grupos0312.map(etiquetaGrupo).join('; ')}`);
  if (a.minTrabajadores != null) p.push(`Desde ${a.minTrabajadores} trabajadores`);
  if (a.maxTrabajadores != null) p.push(`Hasta ${a.maxTrabajadores} trabajadores`);
  if (a.minContratistas != null) p.push('Con contratistas');
  if (a.condiciones?.length) p.push(`Si: ${a.condiciones.map(textoCondicion).join('; ')}`);
  if (a.algunaCondicion?.length) p.push(`Si alguna: ${a.algunaCondicion.map(textoCondicion).join(' / ')}`);
  return p.length ? p.join(' · ') : 'Aplica a todas las empresas del alcance';
}

export function htmlFichaNormativa(r) {
  const fila = (t, val) => (val ? `<dt>${t}</dt><dd>${val}</dd>` : '');
  return `<dl class="ficha">
    ${fila('Pregunta', `<b>${esc(r.pregunta)}</b>`)}
    ${fila('Criterio', esc(r.criterio))}
    ${fila('Naturaleza', esc(NATURALEZAS[r.naturaleza]))}
    ${fila('Norma', esc(r.norma))}
    ${fila('Disposición', esc(r.disposicion))}
    ${fila('Normas relacionadas', esc(r.normasRelacionadas))}
    ${fila('Fuente', `${esc(r.fuente)}${r.enlace ? ` · <a href="${esc(r.enlace)}" target="_blank" rel="noopener">abrir fuente</a>` : ''}`)}
    ${fila('Expedición', esc(r.fechaExpedicion))}
    ${fila('Verificación', `${pildora(VIGENCIAS[r.vigencia], TONO_VIGENCIA[r.vigencia])} revisado ${esc(r.fechaRevision)}`)}
    ${fila('Nota de verificación', esc(r.notaVerificacion))}
    ${fila('Aplicabilidad', esc(textoAplicabilidad(r.aplicabilidad)))}
    ${fila('Evidencia esperada', esc(r.evidencia))}
    ${fila('Método de verificación', esc(r.metodo))}
    ${fila('Peso · severidad', `${r.peso} · ${esc(SEVERIDADES_TXT[r.severidad])}`)}
    ${fila('Recomendación orientativa', esc(r.recomendacion))}
    ${fila('Responsable sugerido', esc(r.responsable))}
    ${fila('Periodicidad', esc(r.periodicidad))}
  </dl>`;
}

async function ficha(r, borrador, recargar) {
  const acciones = [{ texto: 'Cerrar', valor: null }];
  if (borrador) {
    acciones.push({ texto: r.estado === 'retirado' ? 'Reincorporar' : 'Retirar', clase: r.estado === 'retirado' ? 'btn-sec' : 'btn-peligro', valor: 'estado' });
    acciones.push({ texto: 'Editar', clase: 'btn-pri', valor: 'editar' });
  }
  const op = await modal({ titulo: `${r.codigo} · ${CAMPOS_CATALOGO[r.campo].nombre}`, ancho: 'modal-ancho', contenido: htmlFichaNormativa(r), acciones });
  if (op === 'editar') return editar(r, borrador, recargar);
  if (op === 'estado') {
    const nuevo = r.estado === 'retirado' ? 'vigente' : 'retirado';
    const c = await confirmar({ titulo: nuevo === 'retirado' ? 'Retirar requisito' : 'Reincorporar requisito', mensaje: `<p>${esc(r.codigo)} — ${esc(r.pregunta)}</p>`, textoAccion: nuevo === 'retirado' ? 'Retirar' : 'Reincorporar', peligro: nuevo === 'retirado', pedirMotivo: true });
    if (c?.ok) { try { await cambiarEstadoRequisito(borrador.id, r.codigo, nuevo, c.motivo); avisar('Requisito actualizado en el borrador.'); recargar(); } catch (x) { avisar(x.message, 'error'); } }
  }
}

async function editar(r, borrador, recargar) {
  const d = r || { campo: 'juridico', naturaleza: 'legal', vigencia: 'pendiente_validacion', severidad: 'media', peso: 1.5, aplicabilidad: {} };
  const a = d.aplicabilidad || {};
  const sel = (n, obj, val) => `<select name="${n}" id="rq-${n}">${Object.entries(obj).map(([k, t]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${esc(typeof t === 'string' ? t : t.nombre)}</option>`).join('')}</select>`;
  const inp = (n, t, val, extra = '') => `<label class="campo"><span>${t}</span><input name="${n}" id="rq-${n}" value="${esc(val ?? '')}" ${extra}></label>`;
  const area = (n, t, val) => `<label class="campo campo-ancho"><span>${t}</span><textarea name="${n}" id="rq-${n}" rows="2">${esc(val ?? '')}</textarea></label>`;
  await modal({
    titulo: r ? `Editar ${r.codigo}` : 'Nuevo requisito', ancho: 'modal-ancho',
    contenido: `<form class="rejilla-form" onsubmit="return false">
      ${inp('codigo', 'Código *', d.codigo, r ? 'readonly' : 'placeholder="JUR-25"')}
      <label class="campo"><span>Campo *</span>${sel('campo', CAMPOS_CATALOGO, d.campo)}</label>
      ${inp('categoria', 'Categoría *', d.categoria)}
      ${inp('subcategoria', 'Subcategoría', d.subcategoria)}
      ${area('pregunta', 'Pregunta verificable *', d.pregunta)}
      ${area('criterio', 'Obligación o criterio evaluado', d.criterio)}
      <label class="campo"><span>Naturaleza *</span>${sel('naturaleza', NATURALEZAS, d.naturaleza)}</label>
      ${inp('norma', 'Norma aplicable', d.norma)}
      ${inp('normaNumero', 'Número y año', d.normaNumero)}
      ${inp('disposicion', 'Artículo, numeral o disposición', d.disposicion)}
      ${inp('fuente', 'Fuente oficial', d.fuente)}
      ${inp('enlace', 'Enlace verificable', d.enlace, 'type="url"')}
      ${inp('fechaExpedicion', 'Fecha de expedición', d.fechaExpedicion)}
      <label class="campo"><span>Estado de verificación *</span>${sel('vigencia', VIGENCIAS, d.vigencia)}</label>
      ${inp('fechaRevision', 'Fecha de última revisión', d.fechaRevision || new Date().toISOString().slice(0, 10), 'type="date"')}
      ${area('notaVerificacion', 'Nota de verificación (qué se consultó y cuándo)', d.notaVerificacion)}
      ${area('normasRelacionadas', 'Normas relacionadas', d.normasRelacionadas)}
      ${area('evidencia', 'Evidencia esperada', d.evidencia)}
      ${inp('metodo', 'Método de verificación', d.metodo)}
      ${inp('peso', 'Peso *', d.peso, 'type="number" min="0.1" step="0.1"')}
      <label class="campo"><span>Severidad del incumplimiento *</span>${sel('severidad', SEVERIDADES_TXT, d.severidad)}</label>
      ${area('recomendacion', 'Recomendación orientativa', d.recomendacion)}
      ${inp('responsable', 'Responsable sugerido', d.responsable)}
      ${inp('periodicidad', 'Periodicidad de revisión', d.periodicidad)}
      <fieldset class="campo-ancho subpanel"><legend>Condiciones de aplicabilidad</legend>
        <div class="rejilla-form">
          ${inp('ap_min', 'Desde N trabajadores', a.minTrabajadores ?? '', 'type="number" min="0"')}
          ${inp('ap_max', 'Hasta N trabajadores', a.maxTrabajadores ?? '', 'type="number" min="0"')}
          <label class="campo campo-ancho"><span>Grupos de la Res. 0312 (vacío = todos)</span><span class="checks">${['art3', 'art7', 'art9', 'art16'].map((g) => `<label><input type="checkbox" name="ap_g_${g}" ${a.grupos0312?.includes(g) ? 'checked' : ''}> ${etiquetaGrupo(g)}</label>`).join('')}</span></label>
          <label class="campo campo-ancho"><span>Aplica solo si la empresa cumple TODAS estas condiciones</span><span class="checks">${CONDICIONES.map((c) => `<label><input type="checkbox" name="ap_c_${c.clave}" ${a.condiciones?.includes(c.clave) ? 'checked' : ''}> ${esc(c.texto)}</label>`).join('')}</span></label>
        </div>
      </fieldset>
    </form>`,
    acciones: [{ texto: 'Cancelar', valor: null }, { texto: 'Guardar en el borrador', clase: 'btn-pri', alPulsar: async (m) => {
      const form = m.querySelector('form'); const x = Object.fromEntries(new FormData(form));
      const ap = { ...(d.aplicabilidad || {}) };
      ap.minTrabajadores = x.ap_min === '' ? undefined : Number(x.ap_min);
      ap.maxTrabajadores = x.ap_max === '' ? undefined : Number(x.ap_max);
      const grupos = ['art3', 'art7', 'art9', 'art16'].filter((g) => x[`ap_g_${g}`]);
      ap.grupos0312 = grupos.length ? grupos : undefined;
      const cond = CONDICIONES.filter((c) => x[`ap_c_${c.clave}`]).map((c) => c.clave);
      ap.condiciones = cond.length ? cond : undefined;
      Object.keys(ap).forEach((k) => ap[k] === undefined && delete ap[k]);
      Object.keys(x).filter((k) => k.startsWith('ap_')).forEach((k) => delete x[k]);
      try { await guardarRequisito(borrador.id, { ...d, ...x, aplicabilidad: ap }, r?.codigo || null); }
      catch (e) { if (e.campos) marcarErrores(form, e.campos); throw e; }
      avisar('Requisito guardado en el borrador.');
      return 'ok';
    } }],
  });
  recargar();
}

async function nuevoBorrador(v) {
  const r = await modal({
    titulo: 'Crear borrador de nueva versión',
    contenido: `<p>Se copiará la versión publicada para que pueda editar, agregar o retirar requisitos. Nada cambia para los diagnósticos hasta que publique.</p>
      <label class="campo"><span>Número de versión</span><input id="nb-version" placeholder="2026.11"></label>
      <label class="campo"><span>Motivo o alcance de la actualización</span><textarea id="nb-notas" rows="3"></textarea></label>`,
    acciones: [{ texto: 'Cancelar', valor: null }, { texto: 'Crear borrador', clase: 'btn-pri', alPulsar: async (m) => { await crearBorrador({ version: m.querySelector('#nb-version').value, notas: m.querySelector('#nb-notas').value }); return 'ok'; } }],
  });
  if (r === 'ok') { f.vista = 'borrador'; avisar('Borrador creado.'); vistaCatalogo(v); }
}

function mostrarComparacion(c, a, b) {
  const lista = (arr, fn) => (arr.length ? `<ul class="lista-simple">${arr.map(fn).join('')}</ul>` : '<p class="sub">Ninguno.</p>');
  modal({
    titulo: `Cambios de ${a.version} a ${b.version}`, ancho: 'modal-ancho',
    contenido: c.sinCambios ? '<p>El borrador no tiene cambios sustanciales.</p>' : `
      <h3>Modificados (${c.modificados.length})</h3>${lista(c.modificados, (m) => `<li><b class="mono">${esc(m.despues.codigo)}</b> — cambia: ${m.campos.join(', ')}</li>`)}
      <h3>Nuevos (${c.nuevos.length})</h3>${lista(c.nuevos, (r) => `<li><b class="mono">${esc(r.codigo)}</b> — ${esc(r.pregunta)}</li>`)}
      <h3>Retirados (${c.retirados.length})</h3>${lista(c.retirados, (r) => `<li><b class="mono">${esc(r.codigo)}</b> — ${esc(r.pregunta)}</li>`)}`,
    acciones: [{ texto: 'Cerrar', valor: null }],
  });
}

async function parametros() {
  const p = await obtenerParametros();
  await modal({
    titulo: 'Parámetros de calificación', ancho: 'modal-ancho',
    contenido: `<p class="sub">Los diagnósticos aprobados conservan los parámetros vigentes al momento de su aprobación.</p>
      <div class="rejilla-form">
        <label class="campo"><span>Cumple</span><input type="number" id="pp-cumple" value="${p.puntajes.cumple}" readonly></label>
        <label class="campo"><span>Cumple parcialmente</span><input type="number" id="pp-parcial" value="${p.puntajes.parcial}" min="1" max="99"></label>
        <label class="campo"><span>No cumple</span><input type="number" id="pp-no" value="${p.puntajes.no_cumple}" readonly></label>
      </div>
      <h3>Rangos visuales del porcentaje (criterio interno, no categoría legal)</h3>
      <div class="rejilla-form">${p.rangos.map((r, i) => `
        <label class="campo"><span>${esc(r.etiqueta)} desde</span><input type="number" step="0.01" id="pr-d-${i}" value="${r.desde}"></label>
        <label class="campo"><span>${esc(r.etiqueta)} hasta</span><input type="number" step="0.01" id="pr-h-${i}" value="${r.hasta}"></label>`).join('')}</div>
      <label class="campo"><span>Motivo del cambio</span><input id="pp-motivo"></label>`,
    acciones: [{ texto: 'Cancelar', valor: null }, { texto: 'Guardar parámetros', clase: 'btn-pri', alPulsar: async (m) => {
      const q = (s) => Number(m.querySelector(s).value);
      await guardarParametros({ puntajes: { cumple: 100, parcial: q('#pp-parcial'), no_cumple: 0 }, rangos: p.rangos.map((r, i) => ({ ...r, desde: q(`#pr-d-${i}`), hasta: q(`#pr-h-${i}`) })) }, m.querySelector('#pp-motivo').value);
      avisar('Parámetros actualizados.');
    } }],
  });
}

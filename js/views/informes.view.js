/** Informes PDF: generación, vista previa, descarga, registro de trazabilidad y verificación de autenticidad. */
import { esc, fecha, tamano } from '../core/utils.js';
import { icono, pildora, modal, avisar, descargar } from '../core/ui.js';
import { sesion } from '../core/session.js';
import { puede } from '../domain/permisos.js';
import { listarEmpresas } from '../services/empresas.service.js';
import { listarDiagnosticos, ESTADOS_DX } from '../services/diagnosticos.service.js';
import { contextoPlan } from '../services/planes.service.js';
import { etiquetaMes } from '../domain/planificacion.js';
import { TIPOS_INFORME, generarInforme, regenerarInforme, listarInformes, verificarArchivo } from '../services/informes.service.js';

const f = { tipo: 'diagnostico_integral', empresaId: '' };

/** Genera, registra y ofrece el PDF. Reutilizable desde otras vistas. */
export async function generarYMostrar(tipo, parametros, boton) {
  const txt = boton?.innerHTML;
  if (boton) { boton.disabled = true; boton.textContent = 'Generando PDF…'; }
  try {
    const r = await generarInforme(tipo, parametros);
    mostrarPDF(r);
    return r;
  } catch (x) { avisar(x.message, 'error'); return null; }
  finally { if (boton) { boton.disabled = false; boton.innerHTML = txt; } }
}

export function mostrarPDF({ blob, archivo, registro }) {
  const url = URL.createObjectURL(blob);
  modal({
    titulo: `${registro.codigo} · ${registro.nombre}`, ancho: 'modal-ancho modal-pdf',
    contenido: `<p class="sub">${esc(registro.empresaNombre)} · ${esc(registro.objeto)} · versión ${registro.version} · ${registro.paginas} página(s) · ${tamano(registro.tamano)}
      ${registro.estadoFuente !== 'aprobado' ? pildora('Preliminar: fuente no aprobada', 'aviso') : pildora('Fuente aprobada', 'ok')} ${registro.demo ? pildora('DEMO', 'aviso') : ''}</p>
      <iframe class="visor-pdf" src="${url}#toolbar=1&view=FitH" title="Vista previa del informe"></iframe>
      <p class="nota">Huella SHA-256: <code class="huella">${registro.sha256}</code>. Si la vista previa o la descarga no se habilitan en este visor, abra la aplicación en su equipo con iniciar.bat.</p>`,
    acciones: [{ texto: 'Cerrar', valor: null }, { texto: 'Descargar PDF', clase: 'btn-pri', alPulsar: () => { descargar(blob, archivo); return false; } }],
  }).then(() => setTimeout(() => URL.revokeObjectURL(url), 2000));
}

export async function vistaInformes(v) {
  const u = sesion.usuario();
  const generar = puede(u, 'informes.generar') || puede(u, 'informes.descargar_autorizados');
  const empresas = await listarEmpresas({ estado: 'vigentes' });
  if (!f.empresaId && empresas.length) f.empresaId = empresas[0].id;
  const registros = await listarInformes();

  v.innerHTML = `
  <div class="titulo-vista"><div><h1>Informes PDF</h1><p>Informes institucionales con paginación, código de documento, fecha de generación y registro de trazabilidad. Los diagnósticos o planes no aprobados se marcan como preliminares.</p></div>
    <div class="acciones"><label class="btn btn-sec">${icono('candado')}Verificar un PDF<input type="file" class="sr" id="in-verificar" accept="application/pdf"></label></div></div>
  ${generar ? `<form class="panel" id="f-inf">
    <header><h2>Generar informe</h2></header>
    <div class="rejilla-form">
      <label class="campo"><span>Tipo de informe</span><select name="tipo" id="fi-tipo">
        ${['Diagnóstico', 'Plan'].map((g) => `<optgroup label="${g}">${Object.entries(TIPOS_INFORME).filter(([, t]) => t.grupo === g).map(([k, t]) => `<option value="${k}" ${f.tipo === k ? 'selected' : ''}>${t.nombre}</option>`).join('')}</optgroup>`).join('')}
      </select></label>
      <label class="campo"><span>Empresa</span><select name="empresaId" id="fi-empresa">${empresas.map((e) => `<option value="${e.id}" ${f.empresaId === e.id ? 'selected' : ''}>${esc(e.razonSocial)}</option>`).join('')}</select></label>
      <div class="campo-ancho rejilla-form" id="fi-params"></div>
    </div>
    <div class="acciones"><button class="btn btn-pri" type="submit" id="fi-generar">${icono('informes')}Generar informe</button></div>
  </form>` : ''}
  <article class="panel">
    <header><h2>Registro de informes generados</h2><small>${registros.length} informe(s). Regenerar crea una versión nueva con los mismos parámetros y los datos actuales.</small></header>
    ${registros.length ? `<div class="tabla-envoltura"><table class="tabla tabla-compacta"><thead><tr><th>Código</th><th>Informe</th><th>Empresa</th><th>Objeto</th><th class="num">Versión</th><th>Fuente</th><th class="num">Págs.</th><th>Generado</th><th></th></tr></thead><tbody>
      ${registros.map((x) => `<tr><td class="mono">${esc(x.codigo)}${x.regeneradoDe ? `<small>de ${esc(x.regeneradoDe)}</small>` : ''}</td><td>${esc(x.nombre)}</td><td>${esc(x.empresaNombre)}${x.demo ? ' ' + pildora('DEMO', 'aviso') : ''}</td><td>${esc(x.objeto)}</td>
        <td class="num">${x.version}</td><td>${pildora(x.estadoFuente === 'aprobado' ? 'Aprobada' : 'Preliminar', x.estadoFuente === 'aprobado' ? 'ok' : 'aviso')}</td><td class="num">${x.paginas}</td>
        <td>${fecha(x.generadoEn, true)}<small>${esc(x.generadoPorNombre)}</small></td><td>${generar ? `<button class="btn btn-sec btn-peq" data-regen="${x.id}">Regenerar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="sub">Aún no se han generado informes.</p>'}
  </article>`;

  const form = v.querySelector('#f-inf');
  const params = v.querySelector('#fi-params');
  const pintarParams = async () => {
    const tipo = form.tipo.value; const empresaId = form.empresaId.value; const t = TIPOS_INFORME[tipo];
    f.tipo = tipo; f.empresaId = empresaId;
    if (!empresaId) { params.innerHTML = '<p class="sub">No hay empresas.</p>'; return; }
    if (tipo.startsWith('diagnostico_') || tipo === 'comparativo') {
      let dx = await listarDiagnosticos({ empresaId });
      if (t.campo) dx = dx.filter((d) => d.campos.includes(t.campo));
      const aprob = dx.filter((d) => ['aprobado', 'cerrado'].includes(d.estado) && d.resultados);
      const opt = (arr, sel) => arr.map((d, i) => `<option value="${d.id}" ${i === sel ? 'selected' : ''}>${esc(d.codigo)} · ${esc(ESTADOS_DX[d.estado])}${d.resultados?.promedioSimple != null ? ` · ${d.resultados.promedioSimple} %` : ''}</option>`).join('');
      if (tipo === 'comparativo') {
        params.innerHTML = aprob.length >= 2 ? `<label class="campo"><span>Evaluación anterior</span><select name="diagnosticoA" id="fi-dxa">${opt(aprob, 1)}</select></label><label class="campo"><span>Evaluación posterior</span><select name="diagnosticoB" id="fi-dxb">${opt(aprob, 0)}</select></label>`
          : '<p class="sub campo-ancho">El comparativo requiere al menos dos diagnósticos aprobados de la empresa.</p>';
      } else {
        params.innerHTML = dx.length ? `<label class="campo"><span>Diagnóstico</span><select name="diagnosticoId" id="fi-dx">${opt(dx, 0)}</select></label><p class="sub">Si el diagnóstico no está aprobado, el informe sale como preliminar con marca de agua.</p>`
          : '<p class="sub campo-ancho">La empresa no tiene diagnósticos para este informe.</p>';
      }
    } else {
      let c = null; try { c = await contextoPlan(empresaId); } catch { /* sin acceso */ }
      if (!c?.plan) { params.innerHTML = '<p class="sub campo-ancho">La empresa no tiene un plan de trabajo configurado.</p>'; return; }
      const hoy = new Date().toISOString().slice(0, 10);
      if (tipo === 'plan_mensual') params.innerHTML = `<label class="campo"><span>Mes</span><select name="mes" id="fi-mes">${c.meses.map((m) => `<option value="${m}" ${m === hoy.slice(0, 7) ? 'selected' : ''}>${esc(etiquetaMes(m))}</option>`).join('')}</select></label>`;
      else if (tipo === 'horas') params.innerHTML = `<label class="campo"><span>Desde</span><input type="date" name="desde" id="fi-desde" value="${c.meses[0]}-01"></label><label class="campo"><span>Hasta</span><input type="date" name="hasta" id="fi-hasta" value="${hoy}"></label>`;
      else params.innerHTML = `<p class="sub campo-ancho">Plan ${c.plan.estado === 'aprobado' ? `aprobado v${c.plan.version}` : 'en borrador (saldrá como preliminar)'} · ${c.actividades.length} actividades.</p>`;
    }
  };
  if (form) {
    form.addEventListener('change', (e) => { if (['tipo', 'empresaId'].includes(e.target.name)) pintarParams(); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const x = Object.fromEntries(new FormData(form)); const { tipo, ...p } = x;
      if (!TIPOS_INFORME[tipo].requiere.every((k) => p[k])) return avisar('Complete los parámetros del informe.', 'advertencia');
      const r = await generarYMostrar(tipo, p, v.querySelector('#fi-generar'));
      if (r) { avisar(`Informe ${r.registro.codigo} generado.`); vistaInformes(v); }
    });
    await pintarParams();
  }
  v.querySelectorAll('[data-regen]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try { const r = await regenerarInforme(b.dataset.regen); mostrarPDF(r); avisar(`Regenerado como ${r.registro.codigo}.`); vistaInformes(v); } catch (x) { avisar(x.message, 'error'); b.disabled = false; }
  });
  v.querySelector('#in-verificar').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const r = await verificarArchivo(file);
    modal({ titulo: 'Verificación del PDF', contenido: r.valido
      ? `<div class="banda banda-ok">${icono('ok')}<span>El archivo coincide exactamente con el informe <b>${esc(r.registro.codigo)}</b> (${esc(r.registro.nombre)}, ${esc(r.registro.empresaNombre)}), generado el ${fecha(r.registro.generadoEn, true)} por ${esc(r.registro.generadoPorNombre)}.</span></div>`
      : `<div class="banda banda-critica">${icono('alerta')}<span>El archivo no coincide con ningún informe registrado en este equipo. Puede haber sido modificado o generado en otra instalación.</span></div>`,
    acciones: [{ texto: 'Cerrar', valor: null }] });
    e.target.value = '';
  };
}

/** Listado de diagnósticos y creación de uno nuevo. */
import { esc, fecha } from '../core/utils.js';
import { icono, pildora, modal, avisar } from '../core/ui.js';
import { sesion } from '../core/session.js';
import { puede } from '../domain/permisos.js';
import { etiquetaGrupo } from '../domain/perfil.js';
import { grupoEstandaresMinimos } from '../domain/reglas-empresa.js';
import { CAMPOS } from '../data/catalogo-base.js';
import { listarDiagnosticos, crearDiagnostico, ESTADOS_DX, TONO_DX } from '../services/diagnosticos.service.js';
import { listarEmpresas } from '../services/empresas.service.js';
import { catalogoVigente } from '../services/catalogo.service.js';
import { ir } from '../core/router.js';

const f = { estado: '', empresaId: '' };

export async function vistaDiagnosticos(v, params = {}) {
  const u = sesion.usuario();
  const empresas = await listarEmpresas({ estado: 'vigentes' });
  const lista = await listarDiagnosticos(f);
  const vig = await catalogoVigente();
  v.innerHTML = `
  <div class="titulo-vista"><div><h1>Diagnósticos</h1><p>Evaluación integral por empresa con la versión ${esc(vig?.version || '—')} del catálogo normativo.</p></div>
    <div class="acciones">${puede(u, 'diagnosticos.crear') ? `<button class="btn btn-pri" id="btn-nuevo-dx">${icono('mas')}Nuevo diagnóstico</button>` : ''}</div></div>
  <form class="filtros" id="f-dx">
    <label class="campo"><span>Empresa</span><select name="empresaId" id="fd-empresa"><option value="">Todas</option>${empresas.map((e) => `<option value="${e.id}" ${f.empresaId === e.id ? 'selected' : ''}>${esc(e.razonSocial)}</option>`).join('')}</select></label>
    <label class="campo"><span>Estado</span><select name="estado" id="fd-estado"><option value="">Todos</option>${Object.entries(ESTADOS_DX).map(([k, t]) => `<option value="${k}" ${f.estado === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
  </form>
  ${lista.length ? `<div class="panel tabla-envoltura"><table class="tabla">
    <thead><tr><th>Código</th><th>Empresa</th><th>Campos</th><th>Catálogo</th><th>Inicio</th><th class="num">Cumplimiento</th><th>Estado</th><th></th></tr></thead>
    <tbody>${lista.map((d) => `<tr data-id="${d.id}">
      <td class="mono">${esc(d.codigo)}${d.version > 1 ? `<small>Revisión ${d.version}</small>` : ''}</td>
      <td><strong>${esc(d.empresa.razonSocial)}</strong>${d.empresa.demo ? ' ' + pildora('DEMO', 'aviso') : ''}</td>
      <td>${d.campos.map((c) => CAMPOS[c].sigla).join(' · ')}</td>
      <td class="mono">${esc(d.catalogoVersion)}</td><td>${fecha(d.fechaInicio + 'T12:00:00')}</td>
      <td class="num">${d.resultados?.promedioSimple != null ? `${d.resultados.promedioSimple} %` : '<span class="sub">En curso</span>'}</td>
      <td>${pildora(ESTADOS_DX[d.estado], TONO_DX[d.estado])}</td>
      <td><a class="btn btn-sec btn-peq" href="#/diagnosticos/${d.id}">Abrir</a></td></tr>`).join('')}</tbody></table></div>`
    : `<div class="panel vacio"><p>${f.estado || f.empresaId ? 'Ningún diagnóstico coincide con los filtros.' : 'Aún no hay diagnósticos.'}</p>${puede(u, 'diagnosticos.crear') && empresas.length ? '<button class="btn btn-pri" id="btn-nuevo-dx-2">Crear el primer diagnóstico</button>' : ''}</div>`}`;
  v.querySelector('#f-dx').addEventListener('change', (e) => { f[e.target.name] = e.target.value; vistaDiagnosticos(v); });
  v.querySelector('tbody')?.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr && !e.target.closest('a')) ir(`/diagnosticos/${tr.dataset.id}`); });
  const abrir = () => nuevo(empresas, params.empresa);
  v.querySelector('#btn-nuevo-dx')?.addEventListener('click', abrir);
  v.querySelector('#btn-nuevo-dx-2')?.addEventListener('click', abrir);
}

export async function nuevo(empresas, empresaId = '') {
  const activas = empresas.filter((e) => !['archivada', 'eliminada'].includes(e.estado));
  if (!activas.length) return avisar('No hay empresas vigentes para diagnosticar.', 'advertencia');
  const r = await modal({
    titulo: 'Nuevo diagnóstico', ancho: 'modal-ancho',
    contenido: `<form class="rejilla-form" onsubmit="return false">
      <label class="campo campo-ancho"><span>Empresa *</span><select name="empresaId" id="nd-empresa">${activas.map((e) => `<option value="${e.id}" ${empresaId === e.id ? 'selected' : ''}>${esc(e.razonSocial)} · NIT ${esc(e.nitFormato)}</option>`).join('')}</select></label>
      <div class="campo-ancho" id="nd-info"></div>
      <label class="campo campo-ancho"><span>Alcance *</span><textarea name="alcance" id="nd-alcance" rows="3" placeholder="Ej.: Diagnóstico inicial de cumplimiento legal, SST, calidad y ambiental de la sede principal, previo a la propuesta de asesoría."></textarea></label>
      <fieldset class="campo-ancho subpanel"><legend>Campos a evaluar</legend><span class="checks">${Object.entries(CAMPOS).map(([k, c]) => `<label><input type="checkbox" name="campo_${k}" checked> ${esc(c.largo)}</label>`).join('')}</span></fieldset>
      <fieldset class="campo-ancho subpanel" id="nd-sedes-f"><legend>Sedes evaluadas</legend><span class="checks" id="nd-sedes"></span></fieldset>
      <label class="campo"><span>Fecha de inicio</span><input type="date" name="fechaInicio" id="nd-fecha" value="${new Date().toISOString().slice(0, 10)}"></label>
    </form>`,
    acciones: [{ texto: 'Cancelar', valor: null }, { texto: 'Crear diagnóstico', clase: 'btn-pri', alPulsar: async (m) => {
      const x = Object.fromEntries(new FormData(m.querySelector('form')));
      const campos = Object.keys(CAMPOS).filter((k) => x[`campo_${k}`]);
      const sedes = [...m.querySelectorAll('[name^=sede_]:checked')].map((c) => c.value);
      const d = await crearDiagnostico({ empresaId: x.empresaId, alcance: x.alcance, campos, sedes, fechaInicio: x.fechaInicio });
      return d.id;
    } }],
    alAbrir: (m) => {
      const pintar = () => {
        const e = activas.find((x) => x.id === m.querySelector('#nd-empresa').value);
        const g = grupoEstandaresMinimos(e.trabajadores, e.claseRiesgo, e.agropecuaria);
        const sinDet = Object.values(e.perfil || {}).filter((v) => !v).length;
        m.querySelector('#nd-info').innerHTML = `<p class="sub">${e.trabajadores} trabajadores · riesgo ${e.claseRiesgo || 'sin clasificar'} · Estándares Mínimos: ${esc(g.aplica ? etiquetaGrupo(g.aplica) : 'sin determinar')}${sinDet ? ` · <span class="txt-alerta">${sinDet} condiciones del perfil sin determinar</span>` : ''}</p>`;
        const sedes = [{ id: 'principal', nombre: `Sede principal (${e.direccion || e.municipio})` }, ...(e.sedes || [])];
        m.querySelector('#nd-sedes').innerHTML = sedes.map((s) => `<label><input type="checkbox" name="sede_${s.id}" value="${esc(s.nombre)}" checked> ${esc(s.nombre)}</label>`).join('');
      };
      m.querySelector('#nd-empresa').addEventListener('change', pintar); pintar();
    },
  });
  if (r) { avisar('Diagnóstico creado.'); ir(`/diagnosticos/${r}`); }
}

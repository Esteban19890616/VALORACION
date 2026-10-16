/** Listado de empresas: búsqueda, filtros, orden, paginación y exportación CSV. */
import { esc } from '../core/utils.js';
import { icono, pildora, TONO_ESTADO, descargar, avisar } from '../core/ui.js';
import { ESTADOS_EMPRESA, SECTORES } from '../core/config.js';
import { sesion } from '../core/session.js';
import { puede } from '../domain/permisos.js';
import { listarEmpresas } from '../services/empresas.service.js';
import { listarUsuarios } from '../services/usuarios.service.js';
import { debounce } from '../core/utils.js';

const estadoUI = { texto: '', estado: 'vigentes', asesorId: '', sector: '', orden: 'razonSocial', asc: true, pagina: 1 };
const POR_PAGINA = 25;

export async function vistaEmpresas(v) {
  const u = sesion.usuario();
  const admin = u.rol === 'administrador';
  const usuarios = admin ? await listarUsuarios() : [];
  const nombreAsesor = new Map(usuarios.map((x) => [x.id, x.nombre]));
  const asesores = usuarios.filter((x) => x.rol === 'asesor' && x.estado === 'activo');

  v.innerHTML = `
  <div class="titulo-vista">
    <div><h1>Empresas</h1><p>${admin ? 'Expedientes digitales de clientes y prospectos.' : 'Empresas asignadas a su cuenta.'}</p></div>
    <div class="acciones">
      <button class="btn btn-sec" id="btn-csv">${icono('descargar')}Exportar CSV</button>
      ${puede(u, 'empresas.administrar') ? `<a class="btn btn-pri" href="#/empresas/nueva">${icono('mas')}Registrar empresa</a>` : ''}
    </div>
  </div>
  <form class="filtros" id="f-emp" role="search">
    <label class="campo campo-busqueda"><span>Buscar</span><span class="con-icono">${icono('buscar')}<input type="search" name="texto" id="fe-texto" placeholder="Razón social, NIT o código EMP-0000" value="${esc(estadoUI.texto)}"></span></label>
    <label class="campo"><span>Estado</span><select name="estado" id="fe-estado">
      <option value="vigentes">Vigentes</option>${Object.entries(ESTADOS_EMPRESA).filter(([k]) => admin || !['eliminada'].includes(k)).map(([k, t]) => `<option value="${k}" ${estadoUI.estado === k ? 'selected' : ''}>${t}</option>`).join('')}<option value="todas" ${estadoUI.estado === 'todas' ? 'selected' : ''}>Todas</option></select></label>
    <label class="campo"><span>Sector</span><select name="sector" id="fe-sector"><option value="">Todos</option>${SECTORES.map((s) => `<option ${estadoUI.sector === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    ${admin ? `<label class="campo"><span>Asesor</span><select name="asesorId" id="fe-asesor"><option value="">Todos</option>${asesores.map((a) => `<option value="${a.id}" ${estadoUI.asesorId === a.id ? 'selected' : ''}>${esc(a.nombre)}</option>`).join('')}</select></label>` : ''}
  </form>
  <div id="tabla-emp"></div>`;
  v.querySelector('#fe-estado').value = estadoUI.estado;

  let filas = [];
  const pintar = async () => {
    filas = await listarEmpresas(estadoUI);
    const k = estadoUI.orden; const dir = estadoUI.asc ? 1 : -1;
    filas.sort((a, b) => (typeof a[k] === 'number' ? (a[k] - b[k]) : String(a[k] ?? '').localeCompare(String(b[k] ?? ''), 'es')) * dir);
    const paginas = Math.max(1, Math.ceil(filas.length / POR_PAGINA));
    estadoUI.pagina = Math.min(estadoUI.pagina, paginas);
    const vis = filas.slice((estadoUI.pagina - 1) * POR_PAGINA, estadoUI.pagina * POR_PAGINA);
    const th = (c, t, num = false) => `<th scope="col" class="${num ? 'num' : ''}"><button class="orden ${estadoUI.orden === c ? (estadoUI.asc ? 'asc' : 'desc') : ''}" data-orden="${c}">${t}</button></th>`;
    v.querySelector('#tabla-emp').innerHTML = filas.length ? `
      <div class="tabla-envoltura"><table class="tabla">
        <thead><tr>${th('codigo', 'Código')}${th('razonSocial', 'Razón social')}${th('nit', 'NIT')}${th('municipio', 'Municipio')}${th('claseRiesgo', 'Riesgo')}${th('trabajadores', 'Trab.', true)}${admin ? '<th scope="col">Asesor</th>' : ''}${th('estado', 'Estado')}<th scope="col"><span class="sr">Acción</span></th></tr></thead>
        <tbody>${vis.map((e) => `<tr data-id="${e.id}">
          <td class="mono">${esc(e.codigo)}</td>
          <td><strong>${esc(e.razonSocial)}</strong>${e.nombreComercial ? `<small>${esc(e.nombreComercial)}</small>` : ''}${e.demo ? ' ' + pildora('DEMO', 'aviso') : ''}</td>
          <td class="mono">${esc(e.nitFormato)}</td><td>${esc(e.municipio)}</td><td>${e.claseRiesgo ? esc(e.claseRiesgo) : '—'}</td>
          <td class="num">${e.trabajadores}</td>
          ${admin ? `<td>${e.asesorId ? esc(nombreAsesor.get(e.asesorId) || '—') : '<span class="txt-alerta">Sin asignar</span>'}</td>` : ''}
          <td>${pildora(ESTADOS_EMPRESA[e.estado], TONO_ESTADO[e.estado])}</td>
          <td><a class="btn btn-sec btn-peq" href="#/empresas/${e.id}">Abrir</a></td></tr>`).join('')}</tbody>
      </table></div>
      <div class="paginacion"><span>${filas.length} empresa(s) · página ${estadoUI.pagina} de ${paginas}</span>
        <div><button class="btn btn-sec btn-peq" data-pag="-1" ${estadoUI.pagina <= 1 ? 'disabled' : ''}>Anterior</button><button class="btn btn-sec btn-peq" data-pag="1" ${estadoUI.pagina >= paginas ? 'disabled' : ''}>Siguiente</button></div></div>`
      : `<div class="vacio panel"><p>${estadoUI.texto || estadoUI.sector || estadoUI.asesorId ? 'Ninguna empresa coincide con los filtros.' : 'No hay empresas en este estado.'}</p></div>`;
  };

  v.querySelector('#f-emp').addEventListener('input', debounce((e) => { estadoUI[e.target.name] = e.target.value; estadoUI.pagina = 1; pintar(); }, 250));
  v.querySelector('#f-emp').addEventListener('submit', (e) => e.preventDefault());
  v.querySelector('#tabla-emp').addEventListener('click', (e) => {
    const o = e.target.closest('[data-orden]');
    if (o) { estadoUI.asc = estadoUI.orden === o.dataset.orden ? !estadoUI.asc : true; estadoUI.orden = o.dataset.orden; return pintar(); }
    const p = e.target.closest('[data-pag]');
    if (p) { estadoUI.pagina += Number(p.dataset.pag); return pintar(); }
    const tr = e.target.closest('tr[data-id]');
    if (tr && !e.target.closest('a')) location.hash = `/empresas/${tr.dataset.id}`;
  });
  v.querySelector('#btn-csv').onclick = () => {
    if (!filas.length) return avisar('No hay filas para exportar con los filtros actuales.', 'advertencia');
    const cols = ['codigo', 'razonSocial', 'nombreComercial', 'nitFormato', 'ciiu', 'sector', 'municipio', 'claseRiesgo', 'trabajadores', 'contratistas', 'estado', 'fechaVinculacion'];
    const csv = '﻿' + [cols.join(';'), ...filas.map((f) => cols.map((c) => `"${String(f[c] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\r\n');
    descargar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `empresas_${new Date().toISOString().slice(0, 10)}.csv`);
  };
  await pintar();
}

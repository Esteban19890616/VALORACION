/** Bitácora de auditoría. */
import { esc, fecha, debounce } from '../core/utils.js';
import { modal, descargar, avisar, icono } from '../core/ui.js';
import { ACCIONES } from '../core/audit.js';
import { consultarBitacora, verificarIntegridad } from '../services/auditoria.service.js';
import { sesion } from '../core/session.js';
import { puede } from '../domain/permisos.js';

const f = { texto: '', entidad: '', accion: '', desde: '', hasta: '' };
const ENTIDADES = { empresas: 'Empresas', usuarios: 'Usuarios', documentos: 'Documentos', diagnosticos: 'Diagnósticos', respuestas: 'Respuestas', evidencias: 'Evidencias', hallazgos: 'Hallazgos', planes: 'Planes', actividades: 'Actividades', horas: 'Horas', catalogos: 'Catálogos', requisitos: 'Requisitos', informes: 'Informes', parametros: 'Parámetros', sistema: 'Sistema' };

export async function vistaBitacora(v) {
  v.innerHTML = `
  <div class="titulo-vista"><div><h1>Bitácora</h1><p>Quién hizo qué, cuándo y por qué. Los registros no se pueden editar desde la aplicación.</p></div>
    <div class="acciones">${puede(sesion.usuario(), 'auditoria.global') ? `<button class="btn btn-sec" id="btn-verif">${icono('candado')}Verificar integridad</button>` : ''}<button class="btn btn-sec" id="btn-exp">${icono('descargar')}Exportar CSV</button></div></div>
  <form class="filtros" id="f-bit">
    <label class="campo campo-busqueda"><span>Buscar</span><input type="search" name="texto" id="fb-texto" placeholder="Usuario, motivo, empresa…" value="${esc(f.texto)}"></label>
    <label class="campo"><span>Registro</span><select name="entidad" id="fb-entidad"><option value="">Todos</option>${Object.entries(ENTIDADES).map(([k, t]) => `<option value="${k}" ${f.entidad === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="campo"><span>Acción</span><select name="accion" id="fb-accion"><option value="">Todas</option>${Object.entries(ACCIONES).map(([k, t]) => `<option value="${k}" ${f.accion === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="campo"><span>Desde</span><input type="date" name="desde" id="fb-desde" value="${f.desde}"></label>
    <label class="campo"><span>Hasta</span><input type="date" name="hasta" id="fb-hasta" value="${f.hasta}"></label>
  </form>
  <div id="t-bit"></div>`;
  let filas = [];
  const pintar = async () => {
    filas = await consultarBitacora(f);
    const vis = filas.slice(0, 200);
    const destino = v.querySelector('#t-bit');
    if (!destino) return; // el usuario navegó a otra sección mientras se consultaba
    destino.innerHTML = `<div class="panel tabla-envoltura"><table class="tabla tabla-compacta">
      <thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Registro</th><th>Resultado</th><th>Motivo</th><th></th></tr></thead>
      <tbody>${vis.map((a, i) => `<tr><td class="mono">${fecha(a.fecha, true)}</td><td>${esc(a.usuarioNombre)}</td><td>${esc(ACCIONES[a.accion] || a.accion)}</td>
        <td>${esc(ENTIDADES[a.entidad] || a.entidad)}${a.despues?.razonSocial || a.antes?.razonSocial ? `<small>${esc(a.despues?.razonSocial || a.antes?.razonSocial)}</small>` : ''}</td>
        <td>${a.resultado === 'exitoso' ? 'Exitoso' : `<span class="txt-alerta">${esc(a.resultado)}</span>`}</td><td>${esc(a.motivo || '—')}</td>
        <td>${a.cambios?.length ? `<button class="btn btn-sec btn-peq" data-i="${i}">Detalle</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7">Sin registros con estos filtros.</td></tr>'}</tbody>
    </table></div>${filas.length > 200 ? `<p class="nota">Se muestran los 200 más recientes de ${filas.length}. Use los filtros o exporte el CSV completo.</p>` : ''}`;
    v.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => {
      const a = vis[Number(b.dataset.i)];
      modal({ titulo: `${ACCIONES[a.accion] || a.accion} · ${fecha(a.fecha, true)}`, ancho: 'modal-ancho',
        contenido: `<div class="tabla-envoltura"><table class="tabla tabla-compacta"><thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead><tbody>
          ${a.cambios.map((c) => `<tr><td><code>${esc(c.campo)}</code></td><td>${esc(JSON.stringify(c.antes))}</td><td>${esc(JSON.stringify(c.despues))}</td></tr>`).join('')}</tbody></table></div>`,
        acciones: [{ texto: 'Cerrar', valor: null }] });
    });
  };
  v.querySelector('#f-bit').addEventListener('input', debounce((e) => { f[e.target.name] = e.target.value; pintar(); }, 250));
  v.querySelector('#btn-verif')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const r = await verificarIntegridad();
      await modal({ titulo: 'Integridad de la bitácora', ancho: 'modal-ancho', acciones: [{ texto: 'Cerrar', valor: null }],
        contenido: `${r.integra ? `<div class="banda banda-ok">${icono('ok')}<span><b>Cadena íntegra.</b> ${r.encadenadas} entrada(s) encadenadas verificadas, de la 1 a la ${r.ultimaSecuencia}. Ninguna fue modificada ni eliminada.</span></div>`
          : `<div class="banda banda-critica">${icono('alerta')}<div><b>Se detectaron ${r.problemas.length} problema(s) de integridad.</b><ul>${r.problemas.slice(0, 20).map((p) => `<li>Secuencia ${p.secuencia}: ${esc(p.detalle)}</li>`).join('')}</ul></div></div>`}
          ${r.sinEncadenar ? `<p class="sub">${r.sinEncadenar} entrada(s) son anteriores a la versión 1.0 y no están encadenadas.</p>` : ''}
          <p class="nota">Cada entrada guarda la huella SHA-256 de su contenido unida a la huella de la anterior. Cambiar o borrar una entrada rompe la cadena desde ese punto.</p>` });
      pintar();
    } catch (x) { avisar(x.message, 'error'); } finally { e.target.disabled = false; }
  });
  v.querySelector('#btn-exp').onclick = () => {
    if (!filas.length) return avisar('No hay registros para exportar.', 'advertencia');
    const cols = ['fecha', 'usuarioNombre', 'usuarioRol', 'accion', 'entidad', 'entidadId', 'resultado', 'motivo'];
    const csv = '﻿' + [cols.join(';'), ...filas.map((r) => cols.map((c) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\r\n');
    descargar(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `bitacora_${new Date().toISOString().slice(0, 10)}.csv`);
  };
  await pintar();
}

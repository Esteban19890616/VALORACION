/** Expediente digital de una empresa. */
import { esc, fecha, tamano } from '../core/utils.js';
import { icono, pildora, TONO_ESTADO, avisar, confirmar, modal, descargar } from '../core/ui.js';
import { ESTADOS_EMPRESA, APP } from '../core/config.js';
import { sesion } from '../core/session.js';
import { puede } from '../domain/permisos.js';
import { grupoEstandaresMinimos, instanciaParticipacion, coherenciaSedes } from '../domain/reglas-empresa.js';
import { ACCIONES } from '../core/audit.js';
import { obtenerEmpresa, dependencias, archivarEmpresa, eliminarEmpresa, restaurarEmpresa, historialEmpresa,
  listarDocumentos, adjuntarDocumento, descargarDocumento, retirarDocumento } from '../services/empresas.service.js';
import { listarUsuarios } from '../services/usuarios.service.js';
import { listarDiagnosticos, ESTADOS_DX, TONO_DX } from '../services/diagnosticos.service.js';
import { CONDICIONES } from '../domain/perfil.js';
import { CAMPOS } from '../data/catalogo-base.js';
import { pintarIndicadores } from './empresa-indicadores.js';
import { destruirGraficos } from './graficos.js';
import { listarInformes } from '../services/informes.service.js';

let pestanaActiva = 'resumen';

export async function vistaEmpresaDetalle(v, { id }) {
  const u = sesion.usuario();
  const admin = puede(u, 'empresas.administrar');
  const e = await obtenerEmpresa(id);
  const usuarios = admin ? await listarUsuarios() : [];
  const asesor = usuarios.find((x) => x.id === e.asesorId);
  const g = grupoEstandaresMinimos(e.trabajadores, e.claseRiesgo, e.agropecuaria);
  const c = instanciaParticipacion(e.trabajadores);
  const incoherencia = coherenciaSedes(e);
  const cerrada = ['archivada', 'eliminada'].includes(e.estado);

  v.innerHTML = `
  <div class="titulo-vista">
    <div>
      <p class="eyebrow mono">${esc(e.codigo)} · NIT ${esc(e.nitFormato)}</p>
      <h1>${esc(e.razonSocial)}</h1>
      <p>${e.nombreComercial ? `${esc(e.nombreComercial)} · ` : ''}${esc(e.municipio)}${e.departamento ? `, ${esc(e.departamento)}` : ''} ${pildora(ESTADOS_EMPRESA[e.estado], TONO_ESTADO[e.estado])} ${e.demo ? pildora('DATOS DE DEMOSTRACIÓN', 'aviso') : ''}</p>
    </div>
    <div class="acciones">
      ${admin && !cerrada ? `<a class="btn btn-pri" href="#/empresas/${id}/editar">Editar expediente</a>` : ''}
      ${admin ? `<button class="btn btn-sec" id="btn-mas">Más acciones</button>` : ''}
    </div>
  </div>
  ${e.estado === 'eliminada' ? `<div class="banda banda-critica">${icono('alerta')}<span>Empresa eliminada lógicamente el ${fecha(e.eliminadaEn, true)}. El expediente se conserva para trazabilidad y puede restaurarse.</span></div>` : ''}
  ${e.estado === 'archivada' ? `<div class="banda banda-aviso">${icono('alerta')}<span>Expediente archivado. Es de solo lectura hasta que se restaure.</span></div>` : ''}
  ${incoherencia ? `<div class="banda banda-aviso">${icono('alerta')}<span>${esc(incoherencia)}</span></div>` : ''}

  <div class="pestanas" role="tablist">
    ${[['resumen', 'Resumen'], ['indicadores', 'Indicadores'], ['diagnosticos', 'Diagnósticos y plan'], ['perfil', 'Perfil de aplicabilidad'], ['sedes', `Sedes (${e.sedes?.length || 0})`], ['documentos', 'Documentos'], ['historial', 'Historial']].map(([k, t]) =>
      `<button role="tab" id="tab-${k}" aria-selected="${pestanaActiva === k}" data-tab="${k}">${t}</button>`).join('')}
  </div>
  <div id="panel-tab" role="tabpanel"></div>`;

  const panel = v.querySelector('#panel-tab');
  const dato = (t, val) => `<dt>${t}</dt><dd>${val || '—'}</dd>`;

  const pestanas = {
    resumen: async () => {
      panel.innerHTML = `<div class="rejilla-2">
        <article class="panel"><header><h2>Datos generales</h2></header><dl class="ficha">
          ${dato('Tipo de persona', e.tipoPersona === 'natural' ? 'Persona natural' : 'Persona jurídica')}
          ${dato('Representante legal', esc(e.representanteLegal))}
          ${dato('Actividad económica', esc(e.actividadEconomica))}
          ${dato('CIIU', e.ciiu ? `<span class="mono">${esc(e.ciiu)}</span>` : '')}
          ${dato('Sector', esc(e.sector))}
          ${dato('Dirección', esc(e.direccion))}
          ${dato('Contacto', [e.contactoNombre, e.contactoCargo].filter(Boolean).map(esc).join(' · '))}
          ${dato('Correo', esc(e.email))}
          ${dato('Teléfono', esc(e.telefono))}
        </dl></article>
        <article class="panel"><header><h2>Perfil para requisitos legales</h2></header><dl class="ficha">
          ${dato('Trabajadores', String(e.trabajadores))}
          ${dato('Contratistas', e.contratistas == null ? '' : String(e.contratistas))}
          ${dato('Clase de riesgo', e.claseRiesgo ? `Clase ${e.claseRiesgo}` : '<span class="txt-alerta">Sin clasificar</span>')}
          ${dato('ARL', esc(e.arl))}
          ${dato('Estándares Mínimos', esc(g.texto))}
          ${dato('Participación en SST', esc(c.texto))}
          ${dato('Información relevante', esc(e.infoLegal))}
        </dl><p class="nota">Orientación preliminar; se valida con el catálogo normativo en la Fase 3.</p></article>
      </div>
      <div class="rejilla-2">
        <article class="panel"><header><h2>Relación comercial</h2></header><dl class="ficha">
          ${dato('Asesor responsable', admin ? (asesor ? esc(asesor.nombre) : '<span class="txt-alerta">Sin asignar</span>') : (u.rol === 'asesor' ? 'Usted' : 'Asignado'))}
          ${dato('Fecha de vinculación', e.fechaVinculacion ? fecha(e.fechaVinculacion + 'T12:00:00') : '')}
          ${dato('Horas contratadas / mes', String(e.horasContratadasMes || 0))}
          ${dato('Registrada', fecha(e.creadoEn, true))}
          ${dato('Última modificación', `${fecha(e.actualizadoEn, true)} · versión ${e.version}`)}
        </dl></article>
        <article class="panel"><header><h2>Observaciones</h2></header><p class="texto-largo">${esc(e.observaciones) || '<span class="sub">Sin observaciones.</span>'}</p>
          </article>
      </div>`;
    },
    sedes: async () => {
      panel.innerHTML = e.sedes?.length ? `<div class="tabla-envoltura panel"><table class="tabla"><thead><tr><th>Sede</th><th>Municipio</th><th>Dirección</th><th class="num">Trabajadores</th></tr></thead><tbody>
        ${e.sedes.map((s) => `<tr><td>${esc(s.nombre)}</td><td>${esc(s.municipio)}</td><td>${esc(s.direccion)}</td><td class="num">${s.trabajadores}</td></tr>`).join('')}
        </tbody></table></div>` : `<div class="vacio panel"><p>Sin sedes adicionales. Sede única: ${esc(e.direccion || 'dirección no registrada')}.</p></div>`;
    },
    documentos: async () => {
      const docs = await listarDocumentos(id);
      const subir = puede(u, 'empresas.documentos') && !cerrada;
      panel.innerHTML = `
        ${subir ? `<form class="panel form-doc" id="f-doc">
          <h2>Adjuntar documento</h2>
          <div class="rejilla-form">
            <label class="campo"><span>Archivo *</span><input type="file" name="archivo" id="doc-archivo" accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx" required><small class="ayuda">PDF, JPG, PNG, DOCX o XLSX · máximo ${APP.ARCHIVO_MAX_MB} MB.</small></label>
            <label class="campo"><span>Tipo documental *</span><input name="tipoDocumental" id="doc-tipo" list="tipos-doc" required></label>
            <label class="campo"><span>Fecha del documento</span><input type="date" name="fechaDocumento" id="doc-fecha"></label>
            <label class="campo"><span>Descripción</span><input name="descripcion" id="doc-desc"></label>
          </div>
          <datalist id="tipos-doc"><option>Certificado de existencia y representación legal</option><option>RUT</option><option>Contrato de prestación de servicios</option><option>Autorización de tratamiento de datos</option><option>Certificado de afiliación ARL</option><option>Otro</option></datalist>
          <button class="btn btn-pri" type="submit">${icono('cargar')}Adjuntar</button>
        </form>` : ''}
        <div class="panel">${docs.length ? `<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Documento</th><th>Tipo</th><th>Fecha doc.</th><th class="num">Tamaño</th><th>Cargado</th><th></th></tr></thead><tbody>
          ${docs.map((d) => `<tr><td>${icono('archivo')} ${esc(d.nombre)}${d.descripcion ? `<small>${esc(d.descripcion)}</small>` : ''}</td><td>${esc(d.tipoDocumental)}</td><td>${d.fechaDocumento ? fecha(d.fechaDocumento + 'T12:00:00') : '—'}</td><td class="num">${tamano(d.tamano)}</td><td>${fecha(d.creadoEn, true)}</td>
          <td><button class="btn btn-sec btn-peq" data-doc="${d.id}">Abrir</button></td></tr>`).join('')}</tbody></table></div>`
          : '<p class="sub">No hay documentos asociados.</p>'}</div>
        <p class="nota">Los archivos se guardan dentro de este navegador e ingresan al respaldo exportado. En producción se almacenarán en el servidor con control de acceso.</p>`;
      panel.querySelector('#f-doc')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const f = ev.target; const d = Object.fromEntries(new FormData(f));
        try { await adjuntarDocumento(id, f.archivo.files[0], d); avisar('Documento adjuntado.'); pestanas.documentos(); }
        catch (x) { avisar(x.message, 'error'); }
      });
      panel.querySelectorAll('[data-doc]').forEach((b) => b.onclick = () => abrirDocumento(b.dataset.doc, admin && !cerrada, pestanas.documentos));
    },
    diagnosticos: async () => {
      const lista = puede(u, 'diagnosticos.ver') ? await listarDiagnosticos({ empresaId: id }) : [];
      panel.innerHTML = `<div class="acciones">${puede(u, 'diagnosticos.crear') && !cerrada ? `<a class="btn btn-pri" href="#/diagnosticos" id="btn-dx-emp">Nuevo diagnóstico</a>` : ''}${puede(u, 'planes.ver') ? `<a class="btn btn-sec" href="#/planes/${id}">Abrir plan de trabajo y horas</a>` : ''}</div>
        ${lista.length ? `<div class="panel tabla-envoltura"><table class="tabla"><thead><tr><th>Código</th><th>Campos</th><th>Catálogo</th><th>Inicio</th><th class="num">Cumplimiento</th><th>Estado</th><th></th></tr></thead><tbody>
        ${lista.map((d) => `<tr><td class="mono">${esc(d.codigo)}</td><td>${d.campos.map((c) => CAMPOS[c].sigla).join(' · ')}</td><td class="mono">${esc(d.catalogoVersion)}</td><td>${fecha(d.fechaInicio + 'T12:00:00')}</td>
          <td class="num">${d.resultados?.promedioSimple != null ? `${d.resultados.promedioSimple} %` : '—'}</td><td>${pildora(ESTADOS_DX[d.estado], TONO_DX[d.estado])}</td><td><a class="btn btn-sec btn-peq" href="#/diagnosticos/${d.id}">Abrir</a></td></tr>`).join('')}</tbody></table></div>`
          : '<div class="panel vacio"><p>La empresa aún no tiene diagnósticos.</p></div>'}`;
      const infs = await listarInformes({ empresaId: id });
      if (infs.length) panel.insertAdjacentHTML('beforeend', `<article class="panel"><header><h2>Informes generados</h2><a class="btn btn-sec btn-peq" href="#/informes">Ir a informes</a></header><ul class="lista-simple">${infs.slice(0, 8).map((x) => `<li><b class="mono">${esc(x.codigo)}</b> · ${esc(x.nombre)} · ${esc(x.objeto)} · v${x.version} · ${fecha(x.generadoEn, true)}</li>`).join('')}</ul></article>`);
      panel.querySelector('#btn-dx-emp')?.addEventListener('click', async (ev) => { ev.preventDefault(); const m = await import('./diagnosticos.view.js'); m.nuevo([e], id); });
    },
    indicadores: async () => { await pintarIndicadores(panel, e); },
    perfil: async () => {
      const etiqueta = { si: ['Sí', 'ok'], no: ['No', 'neutro'], '': ['Sin determinar', 'aviso'] };
      panel.innerHTML = `<article class="panel"><header><h2>Perfil de aplicabilidad normativa</h2>${admin && !cerrada ? `<a class="btn btn-sec btn-peq" href="#/empresas/${id}/editar">Editar perfil</a>` : ''}</header>
        <p class="sub">Determina qué requisitos del catálogo aplican. Una condición sin determinar no excluye requisitos: los deja "por confirmar".</p>
        ${['Jurídico', 'SST', 'Ambiental', 'Calidad'].map((g) => `<div class="perfil-grupo"><h3>${g}</h3><div class="perfil-lista">${CONDICIONES.filter((c) => c.grupo === g).map((c) => { const [t, tono] = etiqueta[e.perfil?.[c.clave] || '']; return `<div class="perfil-fila"><span>${esc(c.texto)}</span>${pildora(t, tono)}</div>`; }).join('')}</div></div>`).join('')}</article>`;
    },
    historial: async () => {
      const h = await historialEmpresa(id);
      panel.innerHTML = `<div class="panel"><ol class="linea-tiempo">${h.map((a) => `<li>
        <div class="lt-cab"><strong>${esc(ACCIONES[a.accion] || a.accion)}</strong><span>${fecha(a.fecha, true)} · ${esc(a.usuarioNombre)}</span></div>
        ${a.motivo ? `<p class="lt-motivo">Motivo: ${esc(a.motivo)}</p>` : ''}
        ${a.cambios?.length && a.accion !== 'crear' ? `<ul class="cambios">${a.cambios.slice(0, 12).map((c) => `<li><code>${esc(c.campo)}</code>: <del>${esc(resumen(c.antes))}</del> → <ins>${esc(resumen(c.despues))}</ins></li>`).join('')}</ul>` : ''}
      </li>`).join('') || '<li>Sin registros.</li>'}</ol></div>`;
    },
  };

  const activar = async (k) => {
    destruirGraficos();
    pestanaActiva = k;
    v.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === k)));
    await pestanas[k]();
  };
  v.querySelector('.pestanas').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) activar(b.dataset.tab); });
  await activar(pestanas[pestanaActiva] ? pestanaActiva : 'resumen');

  v.querySelector('#btn-mas')?.addEventListener('click', () => masAcciones(e, () => vistaEmpresaDetalle(v, { id })));
}

const resumen = (x) => { const s = typeof x === 'object' && x !== null ? JSON.stringify(x) : String(x ?? '∅'); return s.length > 80 ? `${s.slice(0, 77)}…` : s; };

async function masAcciones(e, recargar) {
  const cerrada = ['archivada', 'eliminada'].includes(e.estado);
  const dep = await dependencias(e.id);
  const depTxt = dep.total
    ? `<p>Se conservarán los registros asociados: ${Object.entries(dep).filter(([k, n]) => k !== 'total' && n).map(([k, n]) => `${n} ${k}`).join(', ')}.</p>`
    : '<p>La empresa no tiene registros asociados.</p>';
  const op = await modal({
    titulo: 'Acciones sobre el expediente',
    contenido: cerrada
      ? '<p><b>Restaurar</b> devuelve la empresa a su estado anterior y la hace visible de nuevo para su asesor.</p>'
      : `<p><b>Archivar</b>: cliente inactivo; el expediente queda en solo lectura.</p>
         <p><b>Eliminar</b>: eliminación lógica; se oculta a asesores y clientes, no borra información y puede restaurarse.</p>${depTxt}`,
    acciones: cerrada
      ? [{ texto: 'Cancelar', valor: null }, { texto: 'Restaurar', clase: 'btn-pri', valor: 'restaurar' }]
      : [{ texto: 'Cancelar', valor: null }, { texto: 'Eliminar', clase: 'btn-peligro', valor: 'eliminar' }, { texto: 'Archivar', clase: 'btn-pri', valor: 'archivar' }],
  });
  if (!op) return;
  const t = {
    archivar: { titulo: 'Archivar empresa', accion: 'Archivar', msg: `<p>Se archivará <b>${esc(e.razonSocial)}</b> (${esc(e.codigo)}).</p>`, fn: archivarEmpresa, ok: 'Empresa archivada.' },
    eliminar: { titulo: 'Eliminar empresa', accion: 'Eliminar', peligro: true, msg: `<p>Se eliminará lógicamente <b>${esc(e.razonSocial)}</b> (${esc(e.codigo)}). Ningún dato se borra; un administrador puede restaurarla.</p>`, fn: eliminarEmpresa, ok: 'Empresa eliminada (lógica).' },
    restaurar: { titulo: 'Restaurar empresa', accion: 'Restaurar', msg: `<p>Se restaurará <b>${esc(e.razonSocial)}</b>.</p>`, fn: restaurarEmpresa, ok: 'Empresa restaurada.' },
  }[op];
  const r = await confirmar({ titulo: t.titulo, mensaje: t.msg, textoAccion: t.accion, peligro: t.peligro, pedirMotivo: true });
  if (!r?.ok) return;
  try { await t.fn(e.id, r.motivo); avisar(t.ok); recargar(); }
  catch (x) { avisar(x.message, 'error'); }
}

async function abrirDocumento(docId, puedeRetirar, recargar) {
  const d = await descargarDocumento(docId);
  const url = URL.createObjectURL(d.archivo);
  const vista = d.mime.startsWith('image/') ? `<img src="${url}" alt="${esc(d.nombre)}" class="previa">` : '<p class="sub">Vista previa no disponible para este formato. Descárguelo para abrirlo.</p>';
  const acciones = [{ texto: 'Cerrar', valor: null }];
  if (puedeRetirar) acciones.push({ texto: 'Retirar documento', clase: 'btn-peligro', alPulsar: async (m) => {
    const motivo = m.querySelector('#doc-motivo').value.trim();
    if (!motivo) throw new Error('Para retirar el documento escriba el motivo.');
    await retirarDocumento(docId, motivo); avisar('Documento retirado (eliminación lógica).'); return 'retirado';
  } });
  acciones.push({ texto: 'Descargar', clase: 'btn-pri', alPulsar: () => { descargar(d.archivo, d.nombre); return false; } });
  const r = await modal({
    titulo: d.nombre, ancho: 'modal-ancho',
    contenido: `<dl class="ficha"><dt>Tipo</dt><dd>${esc(d.tipoDocumental)}</dd><dt>Tamaño</dt><dd>${tamano(d.tamano)}</dd><dt>Cargado</dt><dd>${fecha(d.creadoEn, true)}</dd></dl>${vista}
      ${puedeRetirar ? '<label class="campo"><span>Motivo de retiro (solo si va a retirarlo)</span><input id="doc-motivo"></label>' : ''}`,
    acciones,
  });
  URL.revokeObjectURL(url);
  if (r === 'retirado') recargar();
}

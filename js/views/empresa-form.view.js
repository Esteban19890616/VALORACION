/** Formulario de empresa (crear / editar) con validación en vivo y borrador automático. */
import { esc, debounce, fecha, uid } from '../core/utils.js';
import { icono, avisar, marcarErrores, modal } from '../core/ui.js';
import { ESTADOS_EMPRESA, SECTORES, CLASES_RIESGO } from '../core/config.js';
import { analizarNIT } from '../domain/validadores.js';
import { grupoEstandaresMinimos, instanciaParticipacion } from '../domain/reglas-empresa.js';
import { CONDICIONES } from '../domain/perfil.js';
import { crearEmpresa, actualizarEmpresa, obtenerEmpresa } from '../services/empresas.service.js';
import { listarAsesoresActivos } from '../services/usuarios.service.js';
import { guardarBorrador, leerBorrador, descartarBorrador } from '../services/borradores.service.js';
import { ir } from '../core/router.js';

const VACIA = { tipoPersona: 'juridica', estado: 'activa', sedes: [], fechaVinculacion: new Date().toISOString().slice(0, 10) };

export async function vistaEmpresaForm(v, { id } = {}) {
  const edicion = !!id;
  const base = edicion ? await obtenerEmpresa(id) : { ...VACIA };
  const asesores = await listarAsesoresActivos();
  const claveBorrador = `empresa:${id || 'nueva'}`;
  let e = structuredClone(base);

  const borrador = await leerBorrador(claveBorrador);
  if (borrador && (!edicion || borrador.actualizado > base.actualizadoEn)) {
    const r = await modal({
      titulo: 'Recuperar borrador',
      contenido: `<p>Hay cambios sin guardar de este formulario del <b>${fecha(borrador.actualizado, true)}</b>. ¿Desea recuperarlos?</p>`,
      acciones: [{ texto: 'Descartar borrador', valor: 'no' }, { texto: 'Recuperar', clase: 'btn-pri', valor: 'si' }],
    });
    if (r === 'si') e = { ...e, ...borrador.contenido };
    else await descartarBorrador(claveBorrador);
  }

  const opt = (lista, val) => lista.map((x) => { const [k, t] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(k)}" ${String(val ?? '') === String(k) ? 'selected' : ''}>${esc(t)}</option>`; }).join('');
  const campo = (n, t, extra = '', tipo = 'text', ayuda = '') => `<label class="campo"><span>${t}</span><input name="${n}" id="emp-${n}" type="${tipo}" value="${esc(e[n] ?? '')}" ${extra}>${ayuda ? `<small class="ayuda">${ayuda}</small>` : ''}</label>`;

  v.innerHTML = `
  <div class="titulo-vista"><div><h1>${edicion ? `Editar ${esc(base.razonSocial)}` : 'Registrar empresa'}</h1>
    <p>${edicion ? `${esc(base.codigo)} · versión ${base.version}` : 'El código interno se asigna al guardar.'} Los campos con * son obligatorios.</p></div></div>
  <form id="f-empresa" class="form-empresa" novalidate>
    <div class="form-cols">
      <div class="form-principal">
        <fieldset class="panel"><legend>Identificación</legend>
          <div class="rejilla-form">
            ${campo('razonSocial', 'Razón social *', 'required autocomplete="organization"')}
            ${campo('nombreComercial', 'Nombre comercial')}
            <label class="campo"><span>NIT *</span><input name="nit" id="emp-nit" value="${esc(e.nitFormato || e.nit || '')}" inputmode="numeric" required placeholder="900123456-7"><small class="ayuda" id="nit-ayuda">Puede escribirlo con o sin dígito de verificación; el sistema lo calcula y lo comprueba.</small></label>
            <label class="campo"><span>Tipo de persona</span><select name="tipoPersona" id="emp-tipoPersona">${opt([['juridica', 'Persona jurídica'], ['natural', 'Persona natural']], e.tipoPersona)}</select></label>
            ${campo('representanteLegal', 'Representante legal')}
            <label class="campo"><span>Estado del cliente</span><select name="estado" id="emp-estado">${opt(Object.entries(ESTADOS_EMPRESA).filter(([k]) => !['archivada', 'eliminada'].includes(k)), e.estado)}</select></label>
          </div>
        </fieldset>
        <fieldset class="panel"><legend>Actividad y riesgo laboral</legend>
          <div class="rejilla-form">
            ${campo('actividadEconomica', 'Actividad económica')}
            ${campo('ciiu', 'Código CIIU', 'inputmode="numeric" maxlength="4"', 'text', 'CIIU Rev. 4 A.C., 4 dígitos, tal como figura en el RUT.')}
            <label class="campo"><span>Sector económico</span><select name="sector" id="emp-sector"><option value="">Seleccione…</option>${opt(SECTORES, e.sector)}</select></label>
            <label class="campo"><span>Clase de riesgo (ARL)</span><select name="claseRiesgo" id="emp-claseRiesgo"><option value="">Sin clasificar</option>${opt(CLASES_RIESGO.map((c) => [c, `Clase ${c}`]), e.claseRiesgo)}</select><small class="ayuda">La de mayor riesgo afiliada; verificar con la ARL.</small></label>
            ${campo('trabajadores', 'Número de trabajadores *', 'min="0" step="1" required', 'number')}
            ${campo('contratistas', 'Número de contratistas', 'min="0" step="1"', 'number')}
            ${campo('arl', 'ARL')}
            <label class="campo campo-check"><input type="checkbox" name="agropecuaria" id="emp-agropecuaria" ${e.agropecuaria ? 'checked' : ''}><span>Unidad de producción agropecuaria</span></label>
          </div>
        </fieldset>
        <fieldset class="panel"><legend>Perfil de aplicabilidad normativa</legend>
          <p class="sub">Define qué requisitos del catálogo aplican. Si no conoce la respuesta, déjela "Sin determinar": el requisito se evaluará como "por confirmar" y no se excluirá.</p>
          ${['Jurídico', 'SST', 'Ambiental', 'Calidad'].map((g) => `<div class="perfil-grupo"><h3>${g}</h3><div class="perfil-lista">
            ${CONDICIONES.filter((c) => c.grupo === g).map((c) => `<label class="perfil-fila"><span>${esc(c.texto)}</span>
              <select name="perfil.${c.clave}" id="perfil-${c.clave}">${[['', 'Sin determinar'], ['si', 'Sí'], ['no', 'No']].map(([k, t]) => `<option value="${k}" ${(e.perfil?.[c.clave] || '') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`).join('')}
          </div></div>`).join('')}
        </fieldset>
        <fieldset class="panel"><legend>Ubicación y contacto</legend>
          <div class="rejilla-form">
            ${campo('departamento', 'Departamento')}
            ${campo('municipio', 'Municipio *', 'required')}
            ${campo('direccion', 'Dirección principal', 'autocomplete="street-address"')}
            ${campo('contactoNombre', 'Persona de contacto')}
            ${campo('contactoCargo', 'Cargo del contacto')}
            ${campo('email', 'Correo electrónico', 'autocomplete="email"', 'email')}
            ${campo('telefono', 'Teléfono', 'autocomplete="tel"', 'tel')}
          </div>
        </fieldset>
        <fieldset class="panel"><legend>Sedes y centros de trabajo</legend>
          <div id="sedes"></div>
          <button type="button" class="btn btn-sec btn-peq" id="btn-sede">${icono('mas')}Agregar sede</button>
        </fieldset>
        <fieldset class="panel"><legend>Relación comercial</legend>
          <div class="rejilla-form">
            ${campo('fechaVinculacion', 'Fecha de vinculación', '', 'date')}
            <label class="campo"><span>Asesor responsable</span><select name="asesorId" id="emp-asesorId"><option value="">Sin asignar</option>${opt(asesores.map((a) => [a.id, a.nombre]), e.asesorId)}</select>${asesores.length ? '' : '<small class="ayuda">Aún no hay asesores. Créelos en Usuarios y roles.</small>'}</label>
            ${campo('horasContratadasMes', 'Horas de asesoría contratadas / mes', 'min="0" step="0.5"', 'number')}
          </div>
          <label class="campo"><span>Información relevante para requisitos legales</span><textarea name="infoLegal" id="emp-infoLegal" rows="3" placeholder="Ej.: maneja sustancias químicas, genera RESPEL, tiene vertimientos, trabajo en alturas, régimen tributario…">${esc(e.infoLegal || '')}</textarea></label>
          <label class="campo"><span>Observaciones</span><textarea name="observaciones" id="emp-observaciones" rows="3">${esc(e.observaciones || '')}</textarea></label>
          ${edicion ? `<label class="campo"><span>Motivo del cambio</span><input name="motivo" id="emp-motivo" placeholder="Obligatorio si cambia el NIT"><small class="ayuda">Queda en la bitácora.</small></label>` : ''}
        </fieldset>
      </div>
      <aside class="form-lateral">
        <div class="panel pegajoso">
          <h2>Orientación de aplicabilidad</h2>
          <div id="aplicabilidad"></div>
          <p class="nota">Orientación preliminar a partir del expediente. Se valida contra el catálogo normativo en la Fase 3; no constituye concepto jurídico.</p>
          <div class="form-acciones">
            <button type="submit" class="btn btn-pri btn-bloque">${edicion ? 'Guardar cambios' : 'Registrar empresa'}</button>
            <a href="#${edicion ? `/empresas/${id}` : '/empresas'}" class="btn btn-sec btn-bloque" id="btn-cancelar">Cancelar</a>
            <small class="estado-borrador" id="estado-borrador">Los cambios se guardan como borrador mientras escribe.</small>
          </div>
        </div>
      </aside>
    </div>
  </form>`;

  const f = v.querySelector('#f-empresa');
  const contSedes = v.querySelector('#sedes');
  const pintarSedes = () => {
    contSedes.innerHTML = e.sedes.length ? `<div class="tabla-envoltura"><table class="tabla tabla-form"><thead><tr><th>Nombre</th><th>Municipio</th><th>Dirección</th><th class="num">Trab.</th><th></th></tr></thead><tbody>
      ${e.sedes.map((s, i) => `<tr data-i="${i}"><td><input aria-label="Nombre de la sede" data-k="nombre" id="sede-${s.id}-n" value="${esc(s.nombre)}"></td><td><input aria-label="Municipio" data-k="municipio" id="sede-${s.id}-m" value="${esc(s.municipio)}"></td><td><input aria-label="Dirección" data-k="direccion" id="sede-${s.id}-d" value="${esc(s.direccion)}"></td><td><input aria-label="Trabajadores" type="number" min="0" data-k="trabajadores" id="sede-${s.id}-t" value="${esc(s.trabajadores)}"></td><td><button type="button" class="btn-icono" data-quitar="${i}" aria-label="Quitar sede">${icono('cerrar')}</button></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="sub">Sin sedes adicionales registradas. La dirección principal se toma como sede única.</p>';
  };
  pintarSedes();

  const leer = () => {
    const d = Object.fromEntries(new FormData(f));
    d.agropecuaria = f.querySelector('[name=agropecuaria]').checked;
    const perfil = {};
    for (const k of Object.keys(d)) if (k.startsWith('perfil.')) { perfil[k.slice(7)] = d[k]; delete d[k]; }
    return { ...e, ...d, perfil, sedes: e.sedes };
  };

  const aplic = v.querySelector('#aplicabilidad');
  const ayudaNit = v.querySelector('#nit-ayuda');
  const actualizarPanel = () => {
    const d = leer();
    const g = grupoEstandaresMinimos(d.trabajadores === '' ? NaN : d.trabajadores, d.claseRiesgo, d.agropecuaria);
    const c = instanciaParticipacion(d.trabajadores);
    aplic.innerHTML = `<dl class="ficha ficha-apilada">
      <dt>Estándares Mínimos SG-SST</dt><dd>${esc(g.texto)}</dd>
      <dt>Participación en SST</dt><dd>${esc(c.texto)}</dd>
      <dt>Comité de Convivencia Laboral</dt><dd>Resolución 3461 de 2025 (Mintrabajo), que derogó las Res. 652 y 1356 de 2012 — se verificará conformación en la Fase 3</dd></dl>`;
    const n = d.nit ? analizarNIT(d.nit) : null;
    ayudaNit.className = n ? (n.valido ? 'ayuda ayuda-ok' : 'ayuda ayuda-error') : 'ayuda';
    ayudaNit.textContent = !n ? 'Puede escribirlo con o sin dígito de verificación; el sistema lo calcula y lo comprueba.' : n.valido ? `NIT ${n.formato} (DV calculado ${n.dv}).` : n.error;
  };

  const estadoB = v.querySelector('#estado-borrador');
  let enviado = false; // evita que un borrador pendiente se grabe después de guardar
  const autoguardar = debounce(async () => {
    if (enviado || !document.body.contains(f)) return;
    try { await guardarBorrador(claveBorrador, leer()); estadoB.textContent = `Borrador guardado a las ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`; }
    catch { estadoB.textContent = 'No se pudo guardar el borrador.'; }
  }, 900);

  f.addEventListener('input', (ev) => {
    const tr = ev.target.closest('tr[data-i]');
    if (tr) e.sedes[Number(tr.dataset.i)][ev.target.dataset.k] = ev.target.value;
    actualizarPanel(); autoguardar();
  });
  f.addEventListener('change', actualizarPanel);
  v.querySelector('#btn-sede').onclick = () => { e = leer(); e.sedes.push({ id: uid(), nombre: '', municipio: e.municipio || '', direccion: '', trabajadores: 0 }); pintarSedes(); contSedes.querySelector('tr:last-child input')?.focus(); };
  contSedes.addEventListener('click', (ev) => { const q = ev.target.closest('[data-quitar]'); if (q) { e = leer(); e.sedes.splice(Number(q.dataset.quitar), 1); pintarSedes(); autoguardar(); } });
  v.querySelector('#btn-cancelar').addEventListener('click', () => descartarBorrador(claveBorrador));

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const b = f.querySelector('[type=submit]'); b.disabled = true;
    enviado = true;
    try {
      const d = leer();
      const r = edicion ? await actualizarEmpresa(id, d, d.motivo || '') : await crearEmpresa(d);
      await descartarBorrador(claveBorrador);
      avisar(edicion ? 'Cambios guardados.' : `Empresa registrada con el código ${r.empresa.codigo}.`);
      r.advertencias.forEach((a) => avisar(a, 'advertencia', 8000));
      ir(`/empresas/${r.empresa.id}`);
    } catch (x) {
      enviado = false;
      marcarErrores(f, x.campos || {});
      avisar(x.message, 'error');
      if (x.duplicadoId) modal({ titulo: 'NIT ya registrado', contenido: `<p>${esc(x.message)}</p>`, acciones: [{ texto: 'Cerrar', valor: null }, { texto: 'Abrir expediente existente', clase: 'btn-pri', alPulsar: () => ir(`/empresas/${x.duplicadoId}`) }] });
    } finally { b.disabled = false; }
  });
  actualizarPanel();
}

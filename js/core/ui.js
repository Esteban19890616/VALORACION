/** Componentes de interfaz reutilizables: avisos, modales, confirmaciones, iconos. */
import { esc } from './utils.js';
import { on } from './events.js';

/* ---------- Iconos (trazos SVG propios, 20×20) ---------- */
const P = {
  tablero: 'M3 3h6v8H3zM11 3h6v5h-6zM11 10h6v7h-6zM3 13h6v4H3z',
  empresas: 'M3 17V5l6-2v14M9 17V8l8 2v7M2 17h16M5 7h2M5 10h2M5 13h2M12 12h2M12 15h2',
  usuarios: 'M7 9a3 3 0 100-6 3 3 0 000 6zM1.5 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5M13.5 9a2.5 2.5 0 100-5M15 12c2 .5 3.5 2.3 3.5 5',
  diagnostico: 'M6 3h8v3H6zM4 5h2M14 5h2M4 5v12h12V5M7 10l2 2 4-4M7 14h6',
  catalogo: 'M4 3h9l3 3v11H4zM13 3v3h3M7 9h6M7 12h6M7 15h4',
  planes: 'M3 5h14v12H3zM3 9h14M7 3v4M13 3v4M6 12h3M6 14h5',
  informes: 'M5 3h7l4 4v10H5zM12 3v4h4M8 14v-3M11 14V9M14 14v-2',
  bitacora: 'M10 3a7 7 0 100 14 7 7 0 000-14zM10 6v4l3 2',
  respaldo: 'M10 3v9M6 8l4 4 4-4M3 14v3h14v-3',
  salir: 'M8 3H4v14h4M12 6l4 4-4 4M16 10H8',
  menu: 'M3 5h14M3 10h14M3 15h14',
  buscar: 'M9 3a6 6 0 100 12A6 6 0 009 3zM13.5 13.5L17 17',
  mas: 'M10 4v12M4 10h12',
  cerrar: 'M5 5l10 10M15 5L5 15',
  alerta: 'M10 3l8 14H2zM10 8v4M10 14.5v.5',
  ok: 'M4 10l4 4 8-8',
  archivo: 'M5 3h7l4 4v10H5zM12 3v4h4',
  descargar: 'M10 3v10M6 9l4 4 4-4M4 17h12',
  cargar: 'M10 13V3M6 7l4-4 4 4M4 17h12',
  candado: 'M5 9h10v8H5zM7 9V6a3 3 0 016 0v3',
};
export const icono = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${P[n] || ''}"/></svg>`;

/* ---------- Avisos (toasts) ---------- */
export function avisar(texto, tipo = 'exito', ms = 4500) {
  const zona = document.getElementById('avisos');
  if (!zona) return;
  const el = document.createElement('div');
  el.className = `aviso aviso-${tipo}`;
  el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icono(tipo === 'exito' ? 'ok' : 'alerta')}<span>${esc(texto)}</span><button class="aviso-x" aria-label="Cerrar aviso">${icono('cerrar')}</button>`;
  el.querySelector('.aviso-x').onclick = () => el.remove();
  zona.append(el);
  if (ms) setTimeout(() => el.remove(), tipo === 'error' ? ms * 2 : ms);
}
on('aviso', ({ tipo, texto }) => avisar(texto, tipo));

/* ---------- Modal genérico ---------- */
export function modal({ titulo, contenido, acciones = [], ancho = '', alAbrir = null }) {
  return new Promise((resolver) => {
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `<div class="modal ${ancho}" role="dialog" aria-modal="true" aria-labelledby="modal-t">
      <header class="modal-cab"><h2 id="modal-t">${esc(titulo)}</h2><button class="btn-icono" data-x aria-label="Cerrar">${icono('cerrar')}</button></header>
      <div class="modal-cuerpo">${contenido}</div>
      <footer class="modal-pie">${acciones.map((a, i) => `<button class="btn ${a.clase || 'btn-sec'}" data-i="${i}">${esc(a.texto)}</button>`).join('')}</footer>
    </div>`;
    const previo = document.activeElement;
    const cerrar = (v) => { fondo.remove(); document.removeEventListener('keydown', tecla); previo?.focus?.(); resolver(v); };
    const tecla = (e) => { if (e.key === 'Escape') cerrar(null); };
    document.addEventListener('keydown', tecla);
    fondo.addEventListener('click', async (e) => {
      if (e.target === fondo || e.target.closest('[data-x]')) return cerrar(null);
      const b = e.target.closest('[data-i]'); if (!b) return;
      const a = acciones[Number(b.dataset.i)];
      if (a.alPulsar) {
        b.disabled = true;
        try { const r = await a.alPulsar(fondo.querySelector('.modal')); if (r !== false) cerrar(r ?? a.valor); }
        catch (err) { mostrarErrorModal(fondo, err.message); }
        finally { b.disabled = false; }
      } else cerrar(a.valor);
    });
    document.body.append(fondo);
    try { alAbrir?.(fondo.querySelector('.modal')); } catch (e) { console.error(e); }
    (fondo.querySelector('input:not([readonly]),select,textarea') || fondo.querySelector('.modal-pie .btn'))?.focus();
  });
}

function mostrarErrorModal(fondo, msg) {
  let e = fondo.querySelector('.modal-error');
  if (!e) { e = document.createElement('p'); e.className = 'modal-error'; e.setAttribute('role', 'alert'); fondo.querySelector('.modal-cuerpo').append(e); }
  e.textContent = msg;
}

/** Confirmación de operaciones sensibles, con motivo obligatorio opcional. */
export function confirmar({ titulo, mensaje, textoAccion = 'Confirmar', peligro = false, pedirMotivo = false }) {
  const campo = pedirMotivo ? `<label class="campo"><span>Motivo (queda en la bitácora)</span><textarea id="conf-motivo" rows="3" required></textarea></label>` : '';
  return modal({
    titulo,
    contenido: `<div class="conf ${peligro ? 'conf-peligro' : ''}">${peligro ? icono('alerta', 'ico-grande') : ''}<div>${mensaje}</div></div>${campo}`,
    acciones: [
      { texto: 'Cancelar', valor: null },
      { texto: textoAccion, clase: peligro ? 'btn-peligro' : 'btn-pri', alPulsar: (m) => {
        if (!pedirMotivo) return { ok: true };
        const v = m.querySelector('#conf-motivo').value.trim();
        if (!v) throw new Error('El motivo es obligatorio.');
        return { ok: true, motivo: v };
      } },
    ],
  });
}

/** Descarga un Blob (en el visor de artefactos la descarga puede estar bloqueada). */
export function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Pinta errores de validación por campo en un formulario. */
export function marcarErrores(form, campos = {}) {
  form.querySelectorAll('.campo-error').forEach((e) => e.remove());
  form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
  for (const [nombre, msg] of Object.entries(campos)) {
    const input = form.querySelector(`[name="${nombre}"]`);
    if (!input) continue;
    input.setAttribute('aria-invalid', 'true');
    const p = document.createElement('small'); p.className = 'campo-error'; p.textContent = msg;
    input.closest('.campo')?.append(p);
  }
  form.querySelector('[aria-invalid]')?.focus();
}

export const pildora = (texto, tono = 'neutro') => `<span class="pildora p-${tono}">${esc(texto)}</span>`;

export const TONO_ESTADO = { activa: 'ok', prospecto: 'info', suspendida: 'aviso', finalizada: 'neutro', archivada: 'neutro', eliminada: 'critico', activo: 'ok', suspendido: 'critico' };

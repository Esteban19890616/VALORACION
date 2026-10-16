/** Enrutador por hash (#/ruta/:param). Funciona igual en local, en el artefacto y en Hostinger. */
const rutas = [];
let guardia = null;
let alCambiar = null;

export function ruta(patron, vista, opciones = {}) {
  const claves = [];
  const re = new RegExp(`^${patron.replace(/:(\w+)/g, (_, k) => { claves.push(k); return '([^/]+)'; })}$`);
  rutas.push({ patron, re, claves, vista, ...opciones });
}

export const configurarGuardia = (fn) => { guardia = fn; };
export const alNavegar = (fn) => { alCambiar = fn; };
export const ir = (h) => { if (location.hash === `#${h}`) resolver(); else location.hash = h; };
export const actual = () => location.hash.slice(1) || '/';

export async function resolver() {
  const h = actual();
  for (const r of rutas) {
    const m = h.match(r.re);
    if (!m) continue;
    const params = Object.fromEntries(r.claves.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    if (guardia) { const redir = await guardia(r, params); if (redir && redir !== h) return ir(redir); }
    return alCambiar?.(r, params);
  }
  ir('/tablero');
}

addEventListener('hashchange', resolver);

/** Bus de eventos mínimo (desacopla persistencia e interfaz). */
const oyentes = new Map();

export function on(evento, fn) {
  if (!oyentes.has(evento)) oyentes.set(evento, new Set());
  oyentes.get(evento).add(fn);
  return () => oyentes.get(evento)?.delete(fn);
}

export function emit(evento, carga) {
  for (const fn of oyentes.get(evento) || []) { try { fn(carga); } catch (e) { console.error(e); } }
}

export const emitirEstadoGuardado = (estado, error) => emit('guardado', { estado, error, fecha: new Date() });

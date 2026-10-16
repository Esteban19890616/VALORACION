/**
 * Motor de priorización y distribución de horas (lógica pura).
 *
 * Distingue dos decisiones:
 *  - PRIORIDAD DE ATENCIÓN (qué se atiende primero): depende del riesgo de cada hallazgo, no del campo.
 *    Un hallazgo "inmediato" se programa en el primer mes aunque su campo tenga un porcentaje bajo.
 *  - DISTRIBUCIÓN DEL TIEMPO (cuántas horas por campo): porcentajes que suman exactamente 100 %.
 *    Horas asignadas al campo = horas disponibles × porcentaje del campo.
 */
import { SEVERIDADES, PROBABILIDADES } from './calificacion.js';

export const CAMPOS_P = ['juridico', 'sst', 'calidad', 'ambiental'];
const FACTOR_TIPO = { incumplimiento: 1, cumplimiento_parcial: 0.6, pendiente_verificacion: 0.4 };
const FACTOR_NATURALEZA = { legal: 1, contractual: 0.85, voluntaria: 0.6, recomendacion: 0.45 };
const HORAS_BASE = { critica: 6, alta: 4, media: 3, baja: 2 };

export const PRIORIDADES = {
  inmediata: { etiqueta: 'Intervención inmediata', tono: 'critico', orden: 0 },
  alta: { etiqueta: 'Alta', tono: 'aviso', orden: 1 },
  media: { etiqueta: 'Media', tono: 'info', orden: 2 },
  baja: { etiqueta: 'Baja', tono: 'neutro', orden: 3 },
};

const r05 = (n) => Math.max(0.5, Math.round(n * 2) / 2);

/** Horas estimadas por defecto para atender un hallazgo (editable en la actividad). */
export function horasEstimadas(h) {
  const base = HORAS_BASE[h.severidad] || 3;
  if (h.tipo === 'pendiente_verificacion') return r05(Math.max(1, base * 0.3));
  if (h.tipo === 'cumplimiento_parcial') return r05(base * 0.6);
  return r05(base);
}

/** Puntaje 0–12 y prioridad de atención de un hallazgo, con su explicación. */
export function priorizarHallazgo(h) {
  const sev = SEVERIDADES[h.severidad] || 2; const prob = PROBABILIDADES[h.probabilidad] || 2;
  const ft = FACTOR_TIPO[h.tipo] ?? 1; const fn = FACTOR_NATURALEZA[h.naturaleza] ?? 0.6;
  const puntaje = Math.round(sev * prob * ft * fn * 10) / 10;
  let prioridad;
  if ((h.severidad === 'critica' && h.tipo === 'incumplimiento') || (sev * prob >= 9 && h.naturaleza === 'legal')) prioridad = 'inmediata';
  else if (puntaje >= 5) prioridad = 'alta';
  else if (puntaje >= 2.5) prioridad = 'media';
  else prioridad = 'baja';
  const motivo = `severidad ${h.severidad} (${sev}) × probabilidad ${h.probabilidad || 'media'} (${prob}) × tipo ${ft} × naturaleza ${fn}`;
  return { puntaje, prioridad, motivo };
}

export const compararPrioridad = (a, b) => (PRIORIDADES[a.prioridad].orden - PRIORIDADES[b.prioridad].orden) || (b.puntaje - a.puntaje) || String(a.codigo).localeCompare(String(b.codigo), 'es', { numeric: true });

/** Reparte un entero objetivo en proporción a los pesos (método del mayor residuo). */
export function enterosQueSuman(pesos, objetivo = 100) {
  const total = Object.values(pesos).reduce((a, b) => a + b, 0);
  if (total <= 0 || objetivo <= 0) return Object.fromEntries(Object.keys(pesos).map((k) => [k, 0]));
  const crudos = Object.entries(pesos).map(([k, v]) => [k, (v / total) * objetivo]);
  const base = Object.fromEntries(crudos.map(([k, v]) => [k, Math.floor(v)]));
  let resto = objetivo - Object.values(base).reduce((a, b) => a + b, 0);
  crudos.sort((a, b) => (b[1] % 1) - (a[1] % 1)).forEach(([k]) => { if (resto > 0) { base[k] += 1; resto -= 1; } });
  return base;
}
export const enterosQueSuman100 = (pesos) => enterosQueSuman(pesos, 100);

/**
 * Propuesta de distribución porcentual por campo, con explicación.
 * hallazgos: [{campo, severidad, probabilidad, tipo, naturaleza, horasEstimadas?}]
 */
export function proponerDistribucion(hallazgos, horasMes, campos = CAMPOS_P) {
  const det = Object.fromEntries(campos.map((c) => [c, { hallazgos: 0, inmediatos: 0, criticos: 0, incumplimientos: 0, horas: 0, horasInmediatas: 0, demanda: 0 }]));
  for (const h of hallazgos) {
    if (!det[h.campo]) continue;
    const p = priorizarHallazgo(h); const hrs = Number(h.horasEstimadas) || horasEstimadas(h);
    const d = det[h.campo];
    d.hallazgos++; d.horas += hrs; d.demanda += hrs * (1 + p.puntaje / 12);
    if (p.prioridad === 'inmediata') { d.inmediatos++; d.horasInmediatas += hrs; }
    if (h.severidad === 'critica') d.criticos++;
    if (h.tipo === 'incumplimiento') d.incumplimientos++;
  }
  let pct = enterosQueSuman100(Object.fromEntries(campos.map((c) => [c, det[c].demanda])));
  const alertas = [];
  // Piso: cada campo debe poder cubrir en el primer mes sus intervenciones inmediatas.
  if (horasMes > 0) {
    const minimos = Object.fromEntries(campos.map((c) => [c, Math.ceil((det[c].horasInmediatas / horasMes) * 100)]));
    const sumaMin = Object.values(minimos).reduce((a, b) => a + b, 0);
    if (sumaMin > 100) {
      pct = enterosQueSuman100(Object.fromEntries(campos.map((c) => [c, det[c].horasInmediatas])));
      alertas.push(`Las intervenciones inmediatas requieren ${campos.reduce((a, c) => a + det[c].horasInmediatas, 0)} h y la bolsa mensual es de ${horasMes} h. Amplíe la bolsa o programe horas adicionales.`);
    } else if (campos.some((c) => pct[c] < minimos[c])) {
      const fijos = new Set();
      for (let i = 0; i < campos.length; i++) {
        campos.forEach((c) => { if (pct[c] < minimos[c]) fijos.add(c); });
        const restante = 100 - [...fijos].reduce((a, c) => a + minimos[c], 0);
        const otros = campos.filter((c) => !fijos.has(c));
        const rep = enterosQueSuman(Object.fromEntries(otros.map((c) => [c, det[c].demanda])), restante);
        pct = Object.fromEntries(campos.map((c) => [c, fijos.has(c) ? minimos[c] : rep[c]]));
        if (!campos.some((c) => pct[c] < minimos[c])) break;
      }
      const suma = Object.values(pct).reduce((a, b) => a + b, 0);
      if (suma !== 100) { const mayor = campos.reduce((m, c) => (pct[c] > pct[m] ? c : m), campos[0]); pct[mayor] += 100 - suma; }
      alertas.push('Se elevó el porcentaje de algunos campos para cubrir en el primer mes sus intervenciones inmediatas.');
    }
  }
  if (!hallazgos.length) alertas.push('No hay hallazgos abiertos: la distribución debe definirse manualmente según el contrato.');
  const horas = horasPorCampo(horasMes, pct);
  const explicacion = campos.map((c) => {
    const d = det[c];
    if (!d.hallazgos) return { campo: c, porcentaje: pct[c], horas: horas[c], texto: 'Sin hallazgos abiertos en este campo.' };
    const partes = [`${d.hallazgos} hallazgo(s)`];
    if (d.incumplimientos) partes.push(`${d.incumplimientos} incumplimiento(s)`);
    if (d.criticos) partes.push(`${d.criticos} de severidad crítica`);
    if (d.inmediatos) partes.push(`${d.inmediatos} de intervención inmediata (${d.horasInmediatas} h)`);
    partes.push(`esfuerzo estimado ${d.horas} h`);
    return { campo: c, porcentaje: pct[c], horas: horas[c], texto: partes.join(' · ') };
  });
  return { distribucion: pct, horas, detalle: det, explicacion, alertas };
}

export function sumaDistribucion(d) { return Object.values(d || {}).reduce((a, b) => a + (Number(b) || 0), 0); }

export function validarDistribucion(d) {
  const s = Math.round(sumaDistribucion(d) * 100) / 100;
  if (Object.values(d).some((v) => Number(v) < 0)) return { valida: false, suma: s, mensaje: 'Ningún porcentaje puede ser negativo.' };
  if (s !== 100) return { valida: false, suma: s, mensaje: `La distribución suma ${s} %. Debe sumar exactamente 100 % antes de aprobar el plan.` };
  return { valida: true, suma: s };
}

/** Horas asignadas al campo = total de horas disponibles × porcentaje del campo. */
export function horasPorCampo(horasTotal, distribucion) {
  return Object.fromEntries(Object.entries(distribucion).map(([c, p]) => [c, Math.round(horasTotal * (Number(p) || 0)) / 100]));
}

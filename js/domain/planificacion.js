/**
 * Programación de actividades y consolidación de horas (lógica pura).
 *
 * - Cada actividad se programa una sola vez (un mes y una semana). Los planes semanal, mensual y anual
 *   son vistas calculadas sobre esa única programación: las horas nunca se copian entre planes.
 * - Las horas ejecutadas son registros independientes (fecha, horas); se suman por la fecha del registro.
 * - Horas estimadas ≠ programadas ≠ ejecutadas ≠ facturables.
 */
import { horasPorCampo, PRIORIDADES } from './priorizacion.js';

export const SEMANAS = [[1, 7], [8, 14], [15, 21], [22, 31]];
const pad = (n) => String(n).padStart(2, '0');
const ultimoDia = (anio, mes) => new Date(anio, mes, 0).getDate();
const redondear = (n) => Math.round(n * 100) / 100;

export function mesesDesde(mesInicio, n) {
  const [a, m] = mesInicio.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => { const d = new Date(a, m - 1 + i, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; });
}

export function rangoSemana(mes, semana) {
  const [a, m] = mes.split('-').map(Number);
  const [d1, d2] = SEMANAS[semana - 1];
  return { inicio: `${mes}-${pad(d1)}`, fin: `${mes}-${pad(Math.min(d2, ultimoDia(a, m)))}` };
}

export const etiquetaMes = (mes) => new Date(`${mes}-15T12:00:00`).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
export const semanaDeFecha = (iso) => { const d = Number(iso.slice(8, 10)); return d <= 7 ? 1 : d <= 14 ? 2 : d <= 21 ? 3 : 4; };

/**
 * Programa actividades pendientes. Las que ya tienen horas ejecutadas o están en curso conservan su programación
 * y consumen la capacidad.
 */
export function programar({ actividades, meses: mesesTodos, horasMes, distribucion, capacidadSemanal, hoy = new Date().toISOString().slice(0, 10) }) {
  // Solo semanas que aún no terminan: nunca se programa en el pasado.
  const semanasLibres = (m) => [1, 2, 3, 4].filter((s) => rangoSemana(m, s).fin >= hoy);
  const meses = mesesTodos.filter((m) => semanasLibres(m).length);
  const asignadas = horasPorCampo(horasMes, distribucion);
  const uso = Object.fromEntries(mesesTodos.map((m) => [m, { campos: {}, semanas: [0, 0, 0, 0], total: 0 }]));
  const alertas = [];
  const horasDe = (a) => Number(a.horasProgramadas) || Number(a.horasEstimadas) || 0;
  const consumir = (a) => {
    const u = uso[a.mesProgramado]; if (!u) return;
    const h = horasDe(a);
    u.campos[a.campo] = (u.campos[a.campo] || 0) + h; u.total += h;
    if (a.semanaProgramada) u.semanas[a.semanaProgramada - 1] += h;
  };
  const fijas = actividades.filter((a) => a.estado !== 'pendiente' || a.fijada);
  fijas.forEach(consumir);
  const pendientes = actividades.filter((a) => a.estado === 'pendiente' && !a.fijada)
    .sort((a, b) => (PRIORIDADES[a.prioridad].orden - PRIORIDADES[b.prioridad].orden) || (b.puntajePrioridad - a.puntajePrioridad));

  const resultado = [];
  for (const a of pendientes) {
    const h = horasDe(a);
    const tope = asignadas[a.campo] || 0;
    let mes = null; let excede = false;
    if (!meses.length) { resultado.push({ ...a, mesProgramado: null, semanaProgramada: null, horasProgramadas: h, sinProgramar: true }); continue; }
    if (a.prioridad === 'inmediata') {
      mes = meses[0];
      if ((uso[mes].campos[a.campo] || 0) + h > tope + 1e-9) excede = true;
    } else if (tope > 0) {
      mes = meses.find((m) => (uso[m].campos[a.campo] || 0) + h <= tope + 1e-9) || null;
      if (!mes) { mes = meses.find((m) => (uso[m].campos[a.campo] || 0) < tope) || null; excede = !!mes; }
    }
    if (!mes) { resultado.push({ ...a, mesProgramado: null, semanaProgramada: null, horasProgramadas: h, sinProgramar: true }); continue; }
    const u = uso[mes];
    const libres = semanasLibres(mes);
    let semana = libres.find((s) => u.semanas[s - 1] + h <= capacidadSemanal + 1e-9);
    let sobrecupo = false;
    if (!semana) { semana = libres.reduce((m, s) => (u.semanas[s - 1] < u.semanas[m - 1] ? s : m), libres[0]); sobrecupo = true; }
    const { inicio, fin } = rangoSemana(mes, semana);
    const prog = { ...a, mesProgramado: mes, semanaProgramada: semana, horasProgramadas: h, fechaInicio: inicio, fechaLimite: fin, excedeCampo: excede, sobrecupoSemana: sobrecupo, sinProgramar: false };
    consumir(prog); resultado.push(prog);
  }

  const sinProg = resultado.filter((a) => a.sinProgramar);
  if (sinProg.length) alertas.push({ tipo: 'critico', texto: `${sinProg.length} actividad(es) sin programar: su campo no tiene horas asignadas o no cabe en el horizonte del plan.` });
  for (const m of mesesTodos) {
    const u = uso[m];
    if (u.total > horasMes + 1e-9) alertas.push({ tipo: 'critico', texto: `${etiquetaMes(m)}: ${redondear(u.total)} h programadas superan la bolsa de ${horasMes} h.` });
    for (const [c, h] of Object.entries(u.campos)) if (h > (asignadas[c] || 0) + 1e-9) alertas.push({ tipo: 'aviso', texto: `${etiquetaMes(m)}: el campo ${c} tiene ${redondear(h)} h programadas y ${asignadas[c] || 0} h asignadas (prioridad inmediata o actividad que no se puede dividir).` });
    u.semanas.forEach((h, i) => { if (h > capacidadSemanal + 1e-9) alertas.push({ tipo: 'aviso', texto: `${etiquetaMes(m)}, semana ${i + 1}: ${redondear(h)} h programadas superan la capacidad semanal de ${capacidadSemanal} h.` }); });
  }
  return { actividades: [...fijas, ...resultado], alertas, asignadas };
}

/**
 * Consolidado sin duplicar horas: programadas por el mes de la actividad; ejecutadas por la fecha de cada registro.
 */
export function consolidar({ actividades, registros, meses, horasMes, distribucion, campos }) {
  const asignadas = horasPorCampo(horasMes, distribucion);
  const vacio = () => Object.fromEntries(campos.map((c) => [c, { asignadas: asignadas[c] || 0, programadas: 0, ejecutadas: 0, facturables: 0 }]));
  const porMes = Object.fromEntries(meses.map((m) => [m, vacio()]));
  const actPorId = new Map(actividades.map((a) => [a.id, a]));
  for (const a of actividades) {
    if (a.estado === 'cancelada' || !porMes[a.mesProgramado]) continue;
    porMes[a.mesProgramado][a.campo].programadas += Number(a.horasProgramadas) || 0;
  }
  const ejecPorAct = new Map();
  for (const r of registros) {
    const a = actPorId.get(r.actividadId); if (!a) continue;
    ejecPorAct.set(a.id, (ejecPorAct.get(a.id) || 0) + Number(r.horas));
    const m = r.fecha.slice(0, 7);
    if (!porMes[m]) continue;
    porMes[m][a.campo].ejecutadas += Number(r.horas);
    if (r.facturable) porMes[m][a.campo].facturables += Number(r.horas);
  }
  const anual = vacio();
  for (const c of campos) anual[c].asignadas = redondear((asignadas[c] || 0) * meses.length);
  for (const m of meses) for (const c of campos) for (const k of ['programadas', 'ejecutadas', 'facturables']) { porMes[m][c][k] = redondear(porMes[m][c][k]); anual[c][k] = redondear(anual[c][k] + porMes[m][c][k]); }
  const totalMes = (m) => campos.reduce((t, c) => ({ asignadas: t.asignadas + porMes[m][c].asignadas, programadas: t.programadas + porMes[m][c].programadas, ejecutadas: t.ejecutadas + porMes[m][c].ejecutadas, facturables: t.facturables + porMes[m][c].facturables }), { asignadas: 0, programadas: 0, ejecutadas: 0, facturables: 0 });
  const totalAnual = campos.reduce((t, c) => ({ asignadas: t.asignadas + anual[c].asignadas, programadas: t.programadas + anual[c].programadas, ejecutadas: t.ejecutadas + anual[c].ejecutadas, facturables: t.facturables + anual[c].facturables }), { asignadas: 0, programadas: 0, ejecutadas: 0, facturables: 0 });
  return { porMes, anual, totalMes, totalAnual, ejecutadasPorActividad: ejecPorAct };
}

/** Estado de vencimiento de una actividad. */
export function vencida(a, hoy = new Date().toISOString().slice(0, 10)) {
  return !!a.fechaLimite && a.fechaLimite < hoy && !['ejecutada', 'verificada', 'cancelada'].includes(a.estado);
}

/** Informes del plan de trabajo: mensual, anual, seguimiento de horas y avance. */
import { DocumentoPDF, fechaLarga } from './pdf-base.js';
import { barrasAgrupadas, dona } from './graficos-pdf.js';
import { CAMPOS } from '../data/catalogo-base.js';
import { CAMPOS_P, PRIORIDADES, horasPorCampo } from '../domain/priorizacion.js';
import { etiquetaMes, rangoSemana, vencida } from '../domain/planificacion.js';
import { ESTADOS_ACT } from '../services/planes.service.js';

const num = (v) => (Math.round((Number(v) || 0) * 10) / 10).toLocaleString('es-CO');
const marca = (c) => (c.e.demo ? 'DEMOSTRACIÓN - NO VÁLIDO' : c.plan?.estado !== 'aprobado' ? 'PLAN NO APROBADO' : null);
const estadoPlan = (c) => (c.plan?.estado === 'aprobado' ? { texto: `Plan aprobado (versión ${c.plan.version}) el ${fechaLarga(new Date(c.plan.aprobadoEn))}`, tono: 'ok' } : { texto: 'Plan en borrador - pendiente de aprobación', tono: 'aviso' });

async function base(c, o, titulo, subtitulo, datos) {
  if (!c.plan) throw new Error('La empresa no tiene un plan de trabajo configurado.');
  const pdf = await DocumentoPDF.crear({ titulo, subtitulo: `${c.e.razonSocial} · ${subtitulo}`, codigo: o.codigo, empresa: `${c.e.razonSocial} · NIT ${c.e.nitFormato}`, generadoPor: o.generadoPor, marcaAgua: marca(c) });
  pdf.portada({ lineas: [`NIT ${c.e.nitFormato}`], estado: estadoPlan(c), datos: [['Código del documento', o.codigo], ['Diagnóstico base', c.dx ? c.dx.codigo : 'Sin diagnóstico aprobado'], ['Bolsa mensual', `${num(c.plan.horasMes)} horas`], ['Capacidad semanal', `${num(c.plan.capacidadSemanal)} horas`], ['Horizonte', `${c.plan.meses} mes(es) desde ${etiquetaMes(c.plan.mesInicio)}`], ...datos, ['Fecha de generación', fechaLarga()]] });
  return pdf;
}

function tablaDistribucion(pdf, c) {
  const h = horasPorCampo(c.plan.horasMes, c.plan.distribucion);
  pdf.tabla([{ titulo: 'Campo' }, { titulo: 'Porcentaje', alinear: 'right' }, { titulo: 'Horas asignadas por mes', alinear: 'right' }], [...CAMPOS_P.map((k) => [CAMPOS[k].largo, `${c.plan.distribucion[k]} %`, num(h[k])]), ['Total', '100 %', num(c.plan.horasMes)]]);
}

const filaAct = (a, ejec) => [a.codigo, PRIORIDADES[a.prioridad].etiqueta, `${a.actividad}${a.requisitoCodigo ? ` [${a.requisitoCodigo}]` : ''}`, a.responsable || '—', a.fechaLimite || '—', num(a.horasProgramadas), num(ejec.get(a.id) || 0), ESTADOS_ACT[a.estado]];
const COLS_ACT = [{ titulo: 'Código', ancho: 15 }, { titulo: 'Prioridad', ancho: 22 }, { titulo: 'Actividad' }, { titulo: 'Responsable', ancho: 24 }, { titulo: 'Límite', ancho: 18 }, { titulo: 'Prog.', ancho: 11, alinear: 'right' }, { titulo: 'Ejec.', ancho: 11, alinear: 'right' }, { titulo: 'Estado', ancho: 19 }];

export async function informePlanMensual(c, o) {
  const mes = o.mes;
  const pdf = await base(c, o, 'Plan de trabajo mensual', etiquetaMes(mes), [['Mes', etiquetaMes(mes)]]);
  const k = c.consolidado; const pm = k.porMes[mes]; const t = k.totalMes(mes);
  pdf.titulo('Distribución de horas');
  tablaDistribucion(pdf, c);
  pdf.titulo(`Horas del mes de ${etiquetaMes(mes)}`);
  pdf.indicadores([{ etiqueta: 'Asignadas', valor: `${num(t.asignadas)} h` }, { etiqueta: 'Programadas', valor: `${num(t.programadas)} h`, tono: t.programadas > t.asignadas ? 'critico' : null, detalle: t.programadas > t.asignadas ? 'Supera la bolsa' : '' }, { etiqueta: 'Ejecutadas', valor: `${num(t.ejecutadas)} h` }, { etiqueta: 'Facturables', valor: `${num(t.facturables)} h` }]);
  pdf.imagen(barrasAgrupadas(CAMPOS_P.map((x) => CAMPOS[x].nombre), [{ nombre: 'Asignadas', valores: CAMPOS_P.map((x) => pm[x].asignadas) }, { nombre: 'Programadas', valores: CAMPOS_P.map((x) => pm[x].programadas) }, { nombre: 'Ejecutadas', valores: CAMPOS_P.map((x) => pm[x].ejecutadas) }]), { alto: 62, ancho: 150 });
  pdf.tabla([{ titulo: 'Campo' }, { titulo: 'Asignadas', alinear: 'right' }, { titulo: 'Programadas', alinear: 'right' }, { titulo: 'Ejecutadas', alinear: 'right' }, { titulo: 'Pendientes', alinear: 'right' }, { titulo: 'Facturables', alinear: 'right' }],
    [...CAMPOS_P.map((x) => [CAMPOS[x].largo, num(pm[x].asignadas), num(pm[x].programadas), num(pm[x].ejecutadas), num(Math.max(0, pm[x].programadas - pm[x].ejecutadas)), num(pm[x].facturables)]), ['Total', num(t.asignadas), num(t.programadas), num(t.ejecutadas), num(Math.max(0, t.programadas - t.ejecutadas)), num(t.facturables)]]);
  pdf.titulo('Actividades por semana');
  const acts = c.actividades.filter((a) => a.mesProgramado === mes && a.estado !== 'cancelada');
  for (const s of [1, 2, 3, 4]) {
    const r = rangoSemana(mes, s); const arr = acts.filter((a) => a.semanaProgramada === s);
    pdf.subtitulo(`Semana ${s} (${r.inicio.slice(8)} al ${r.fin.slice(8)}) · ${num(arr.reduce((x, a) => x + Number(a.horasProgramadas || 0), 0))} h de ${num(c.plan.capacidadSemanal)} h`);
    pdf.tabla(COLS_ACT, arr.map((a) => filaAct(a, k.ejecutadasPorActividad)), { tam: 7.2, vacio: 'Sin actividades programadas.' });
  }
  const alertas = (c.plan.alertasProgramacion || []).filter((a) => a.texto.includes(etiquetaMes(mes)) || !/\d{4}/.test(a.texto));
  if (alertas.length) { pdf.titulo('Alertas de capacidad'); pdf.vinetas(alertas.map((a) => a.texto)); }
  return pdf.finalizar();
}

export async function informePlanAnual(c, o) {
  const pdf = await base(c, o, 'Plan de trabajo anual', `${etiquetaMes(c.meses[0])} a ${etiquetaMes(c.meses.at(-1))}`, []);
  const k = c.consolidado;
  pdf.titulo('Distribución de horas');
  tablaDistribucion(pdf, c);
  if (c.plan.justificacion) pdf.nota(c.plan.justificacion);
  pdf.titulo('Consolidado del período');
  pdf.indicadores([{ etiqueta: 'Asignadas', valor: `${num(k.totalAnual.asignadas)} h` }, { etiqueta: 'Programadas', valor: `${num(k.totalAnual.programadas)} h` }, { etiqueta: 'Ejecutadas', valor: `${num(k.totalAnual.ejecutadas)} h` }, { etiqueta: 'Facturables', valor: `${num(k.totalAnual.facturables)} h` }]);
  pdf.imagen(barrasAgrupadas(c.meses.map((m) => etiquetaMes(m).replace(' de ', ' ')), [{ nombre: 'Asignadas', valores: c.meses.map((m) => k.totalMes(m).asignadas) }, { nombre: 'Programadas', valores: c.meses.map((m) => k.totalMes(m).programadas) }, { nombre: 'Ejecutadas', valores: c.meses.map((m) => k.totalMes(m).ejecutadas) }], { ancho: 1000, alto: 380 }), { alto: 62 });
  pdf.tabla([{ titulo: 'Mes' }, ...CAMPOS_P.map((x) => ({ titulo: `${CAMPOS[x].sigla} prog./ejec.`, alinear: 'right' })), { titulo: 'Total prog.', alinear: 'right' }, { titulo: 'Total ejec.', alinear: 'right' }],
    [...c.meses.map((m) => [etiquetaMes(m), ...CAMPOS_P.map((x) => `${num(k.porMes[m][x].programadas)} / ${num(k.porMes[m][x].ejecutadas)}`), num(k.totalMes(m).programadas), num(k.totalMes(m).ejecutadas)]),
      ['Total', ...CAMPOS_P.map((x) => `${num(k.anual[x].programadas)} / ${num(k.anual[x].ejecutadas)}`), num(k.totalAnual.programadas), num(k.totalAnual.ejecutadas)]], { tam: 7.6 });
  pdf.nota('Cada actividad se programa una sola vez y cada hora ejecutada se suma por la fecha de su registro: el consolidado no duplica horas entre la vista semanal, mensual y anual.');
  pdf.titulo('Actividades por mes');
  for (const m of c.meses) {
    const arr = c.actividades.filter((a) => a.mesProgramado === m && a.estado !== 'cancelada');
    if (!arr.length) continue;
    pdf.subtitulo(etiquetaMes(m));
    pdf.tabla(COLS_ACT, arr.map((a) => filaAct(a, k.ejecutadasPorActividad)), { tam: 7.2 });
  }
  const sinProg = c.actividades.filter((a) => !a.mesProgramado && a.estado !== 'cancelada');
  if (sinProg.length) { pdf.subtitulo('Sin programar'); pdf.tabla(COLS_ACT, sinProg.map((a) => filaAct(a, k.ejecutadasPorActividad)), { tam: 7.2 }); }
  return pdf.finalizar();
}

export async function informeHoras(c, o) {
  const { desde, hasta } = o;
  const pdf = await base(c, o, 'Seguimiento de horas', `${desde} a ${hasta}`, [['Período', `${desde} a ${hasta}`]]);
  const regs = c.registros.filter((r) => r.fecha >= desde && r.fecha <= hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const act = new Map(c.actividades.map((a) => [a.id, a]));
  const tot = regs.reduce((s, r) => s + r.horas, 0); const fact = regs.filter((r) => r.facturable).reduce((s, r) => s + r.horas, 0);
  pdf.titulo('Resumen');
  pdf.indicadores([{ etiqueta: 'Horas ejecutadas', valor: `${num(tot)} h` }, { etiqueta: 'Facturables', valor: `${num(fact)} h` }, { etiqueta: 'No facturables', valor: `${num(tot - fact)} h` }, { etiqueta: 'Registros', valor: String(regs.length) }]);
  pdf.titulo('Horas por campo');
  pdf.tabla([{ titulo: 'Campo' }, { titulo: 'Ejecutadas', alinear: 'right' }, { titulo: 'Facturables', alinear: 'right' }],
    CAMPOS_P.map((k) => { const rr = regs.filter((r) => act.get(r.actividadId)?.campo === k); return [CAMPOS[k].largo, num(rr.reduce((s, r) => s + r.horas, 0)), num(rr.filter((r) => r.facturable).reduce((s, r) => s + r.horas, 0))]; }));
  pdf.titulo('Horas por profesional');
  const prof = {}; regs.forEach((r) => { prof[r.usuarioNombre] = (prof[r.usuarioNombre] || 0) + r.horas; });
  pdf.tabla([{ titulo: 'Profesional' }, { titulo: 'Horas', alinear: 'right' }], Object.entries(prof).map(([n, h]) => [n, num(h)]));
  pdf.titulo('Detalle de registros');
  pdf.tabla([{ titulo: 'Fecha', ancho: 20 }, { titulo: 'Actividad', ancho: 18 }, { titulo: 'Campo', ancho: 20 }, { titulo: 'Trabajo realizado' }, { titulo: 'Profesional', ancho: 30 }, { titulo: 'Horas', ancho: 13, alinear: 'right' }, { titulo: 'Fact.', ancho: 11 }],
    regs.map((r) => { const a = act.get(r.actividadId); return [r.fecha, a?.codigo || '—', a ? CAMPOS[a.campo].nombre : '—', r.descripcion, r.usuarioNombre, num(r.horas), r.facturable ? 'Sí' : 'No']; }), { tam: 7.4, vacio: 'No hay horas registradas en el período.' });
  pdf.nota('Los registros anulados no se incluyen. Las horas se cuentan por la fecha de ejecución registrada.');
  return pdf.finalizar();
}

export async function informeAvance(c, o) {
  const pdf = await base(c, o, 'Informe de avance', `corte ${fechaLarga()}`, [['Fecha de corte', fechaLarga()]]);
  const acts = c.actividades.filter((a) => a.estado !== 'cancelada');
  const cuenta = (e) => acts.filter((a) => a.estado === e).length;
  const k = c.consolidado; const hoy = new Date().toISOString().slice(0, 10);
  const venc = acts.filter((a) => vencida(a, hoy));
  const hall = c.hallazgos; const cerrados = hall.filter((h) => h.estado === 'cerrado_verificado').length;
  const progHasta = acts.filter((a) => a.mesProgramado && a.mesProgramado <= hoy.slice(0, 7)).reduce((s, a) => s + Number(a.horasProgramadas || 0), 0);
  pdf.titulo('Estado general');
  pdf.indicadores([
    { etiqueta: 'Actividades verificadas', valor: `${cuenta('verificada')} de ${acts.length}`, detalle: `${acts.length ? Math.round((cuenta('verificada') / acts.length) * 100) : 0} % cerradas con evidencia`, tono: 'ok' },
    { etiqueta: 'Hallazgos cerrados', valor: `${cerrados} de ${hall.length}`, detalle: 'Cerrados con evidencia verificada' },
    { etiqueta: 'Actividades vencidas', valor: String(venc.length), tono: venc.length ? 'critico' : 'ok' },
    { etiqueta: 'Horas ejecutadas', valor: `${num(k.totalAnual.ejecutadas)} h`, detalle: `de ${num(progHasta)} h programadas a la fecha` },
  ]);
  const estados = ['pendiente', 'en_curso', 'ejecutada', 'verificada'];
  pdf.imagen(dona(estados.map((e) => ESTADOS_ACT[e]), estados.map(cuenta), ['#c3cdd8', '#4a7fb5', '#c08a1c', '#1e7a4f']), { alto: 50, ancho: 72 });
  pdf.titulo('Avance por campo');
  pdf.tabla([{ titulo: 'Campo' }, { titulo: 'Actividades', alinear: 'right' }, { titulo: 'Verificadas', alinear: 'right' }, { titulo: 'En curso / ejecutadas', alinear: 'right' }, { titulo: 'Vencidas', alinear: 'right' }, { titulo: 'Horas ejec.', alinear: 'right' }],
    CAMPOS_P.map((x) => { const a = acts.filter((y) => y.campo === x); return [CAMPOS[x].largo, a.length, a.filter((y) => y.estado === 'verificada').length, a.filter((y) => ['en_curso', 'ejecutada'].includes(y.estado)).length, a.filter((y) => vencida(y, hoy)).length, num(k.anual[x].ejecutadas)]; }));
  pdf.titulo('Actividades vencidas');
  pdf.tabla(COLS_ACT, venc.map((a) => filaAct(a, k.ejecutadasPorActividad)), { tam: 7.2, vacio: 'No hay actividades vencidas.' });
  pdf.titulo('Intervenciones inmediatas');
  pdf.tabla(COLS_ACT, acts.filter((a) => a.prioridad === 'inmediata').map((a) => filaAct(a, k.ejecutadasPorActividad)), { tam: 7.2, vacio: 'No hay intervenciones inmediatas.' });
  pdf.titulo('Próximas actividades (30 días)');
  const en30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  pdf.tabla(COLS_ACT, acts.filter((a) => a.fechaLimite && a.fechaLimite >= hoy && a.fechaLimite <= en30 && !['verificada'].includes(a.estado)).sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite)).map((a) => filaAct(a, k.ejecutadasPorActividad)), { tam: 7.2, vacio: 'Sin vencimientos en los próximos 30 días.' });
  pdf.nota('Una actividad solo se reporta como verificada cuando tiene evidencia adjunta y la validó un revisor. Este informe no da por cumplido ningún requisito sin esa validación.');
  return pdf.finalizar();
}

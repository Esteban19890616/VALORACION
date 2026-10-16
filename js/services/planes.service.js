/**
 * Priorización, distribución de horas, planes de trabajo y seguimiento de ejecución.
 */
import { APP } from '../core/config.js';
import { datos } from '../core/persistence/index.js';
import { sesion } from '../core/session.js';
import { registrar } from '../core/audit.js';
import { uid, ahora } from '../core/utils.js';
import { exigir, puede, puedeVerEmpresa, ErrorPermiso } from '../domain/permisos.js';
import { CAMPOS_P, priorizarHallazgo, horasEstimadas, proponerDistribucion, validarDistribucion, compararPrioridad } from '../domain/priorizacion.js';
import { programar, consolidar, mesesDesde, vencida } from '../domain/planificacion.js';

const yo = () => sesion.usuario();
export const ESTADOS_ACT = { pendiente: 'Pendiente', en_curso: 'En curso', ejecutada: 'Ejecutada', verificada: 'Verificada (cerrada)', cancelada: 'Cancelada' };
export const TONO_ACT = { pendiente: 'neutro', en_curso: 'info', ejecutada: 'aviso', verificada: 'ok', cancelada: 'neutro' };
export const ESPECIALISTA = { juridico: 'Abogado', sst: 'Profesional en SST con licencia', calidad: 'Auditor o profesional de calidad', ambiental: 'Profesional ambiental' };
const mesActual = () => new Date().toISOString().slice(0, 7);

async function empresaVisible(id) {
  const e = await datos.obtener('empresas', id);
  if (!e || !puedeVerEmpresa(yo(), e)) throw new ErrorPermiso('No tiene acceso a esta empresa.');
  return e;
}

async function planActual(empresaId) {
  return (await datos.porIndice('planes', 'empresaId', empresaId)).filter((p) => p.estado !== 'reemplazado').sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))[0] || null;
}

async function diagnosticoFuente(empresaId) {
  return (await datos.porIndice('diagnosticos', 'empresaId', empresaId)).filter((d) => ['aprobado', 'cerrado'].includes(d.estado)).sort((a, b) => (b.aprobadoEn || '').localeCompare(a.aprobadoEn || ''))[0] || null;
}

export async function resumenPlanes() {
  exigir(yo(), 'planes.ver');
  const empresas = (await datos.listar('empresas')).filter((e) => puedeVerEmpresa(yo(), e) && !['archivada', 'eliminada'].includes(e.estado));
  const out = [];
  for (const e of empresas) {
    const plan = await planActual(e.id);
    if (yo().rol === 'cliente' && plan?.estado !== 'aprobado') { out.push({ empresa: e, plan: null }); continue; }
    const dx = await diagnosticoFuente(e.id);
    const acts = plan ? await datos.porIndice('actividades', 'planId', plan.id) : [];
    const regs = await datos.porIndice('horas', 'empresaId', e.id);
    const m = mesActual();
    out.push({ empresa: e, plan, dx,
      abiertas: acts.filter((a) => !['verificada', 'cancelada'].includes(a.estado)).length,
      vencidas: acts.filter((a) => vencida(a)).length,
      programadasMes: acts.filter((a) => a.mesProgramado === m && a.estado !== 'cancelada').reduce((s, a) => s + (Number(a.horasProgramadas) || 0), 0),
      ejecutadasMes: regs.filter((r) => !r.anulado && r.fecha.startsWith(m)).reduce((s, r) => s + Number(r.horas), 0) });
  }
  return out;
}

export async function contextoPlan(empresaId) {
  exigir(yo(), 'planes.ver');
  const e = await empresaVisible(empresaId);
  const plan = await planActual(empresaId);
  if (yo().rol === 'cliente' && plan?.estado !== 'aprobado') throw new ErrorPermiso('El plan de trabajo aún no ha sido aprobado para consulta.');
  const dx = await diagnosticoFuente(empresaId);
  const hallazgos = dx ? (await datos.porIndice('hallazgos', 'diagnosticoId', dx.id)).map((h) => ({ ...h, ...priorizarHallazgo(h), horasEstimadas: horasEstimadas(h) })).sort(compararPrioridad) : [];
  const actividades = plan ? (await datos.porIndice('actividades', 'planId', plan.id)) : [];
  const registros = (await datos.porIndice('horas', 'empresaId', empresaId)).filter((r) => !r.anulado);
  const evidencias = (await datos.porIndice('evidencias', 'empresaId', empresaId)).filter((x) => x.actividadId && !x.eliminado).map(({ archivo, ...m }) => m);
  const config = plan || { horasMes: e.horasContratadasMes || 0, mesInicio: mesActual(), meses: 12, capacidadSemanal: Math.max(1, Math.round(((e.horasContratadasMes || 0) / 4) * 10) / 10), distribucion: { juridico: 25, sst: 25, calidad: 25, ambiental: 25 } };
  const meses = mesesDesde(config.mesInicio, config.meses);
  const consolidado = consolidar({ actividades, registros, meses, horasMes: config.horasMes, distribucion: config.distribucion, campos: CAMPOS_P });
  const propuesta = proponerDistribucion(hallazgos.filter((h) => h.estado !== 'cerrado_verificado'), config.horasMes);
  const editable = puede(yo(), 'planes.generar');
  return { e, plan, dx, hallazgos, actividades: actividades.sort(compararActividades), registros, evidencias, config, meses, consolidado, propuesta, editable };
}

export const compararActividades = (a, b) => (a.mesProgramado || '9999').localeCompare(b.mesProgramado || '9999') || ((a.semanaProgramada || 9) - (b.semanaProgramada || 9)) || compararPrioridad(a, b);

export async function guardarConfiguracion(empresaId, cfg, motivo = '') {
  exigir(yo(), 'planes.generar');
  const e = await empresaVisible(empresaId);
  const horasMes = Number(cfg.horasMes); const meses = Number(cfg.meses); const cap = Number(cfg.capacidadSemanal);
  if (!(horasMes > 0)) throw new Error('Indique las horas disponibles por mes (mayor que cero).');
  if (!(meses >= 1 && meses <= 12)) throw new Error('El horizonte del plan debe estar entre 1 y 12 meses.');
  if (!(cap > 0)) throw new Error('Indique la capacidad semanal del equipo asesor.');
  if (!/^\d{4}-\d{2}$/.test(cfg.mesInicio || '')) throw new Error('Indique el mes de inicio.');
  const distribucion = Object.fromEntries(CAMPOS_P.map((c) => [c, Number(cfg.distribucion?.[c]) || 0]));
  const antes = await planActual(empresaId);
  const base = antes || { id: uid(), empresaId, creadoEn: ahora(), creadoPor: yo().id, version: 1, historial: [] };
  const despues = { ...base, horasMes, meses, capacidadSemanal: cap, mesInicio: cfg.mesInicio, distribucion, justificacion: cfg.justificacion ?? base.justificacion ?? '',
    origenDistribucion: cfg.origenDistribucion || base.origenDistribucion || 'manual', estado: antes?.estado === 'aprobado' ? 'borrador' : (antes?.estado || 'borrador'),
    actualizadoEn: ahora(), actualizadoPor: yo().id };
  if (antes?.estado === 'aprobado') {
    if (!motivo.trim()) throw new Error('El plan está aprobado: indique el motivo del cambio. Deberá aprobarse de nuevo.');
    despues.historial = [...(antes.historial || []), { fecha: ahora(), usuario: yo().nombre, evento: 'Ajuste de configuración; vuelve a borrador', comentario: motivo }];
  }
  await datos.guardar('planes', despues);
  // Solo el administrador actualiza el expediente; el plan conserva su propia bolsa de horas.
  if (e.horasContratadasMes !== horasMes && puede(yo(), 'empresas.administrar')) await datos.guardar('empresas', { ...e, horasContratadasMes: horasMes, actualizadoEn: ahora(), version: (e.version || 1) + 1 });
  await registrar({ accion: antes ? 'modificar' : 'crear', entidad: 'planes', entidadId: despues.id, antes: antes && { horasMes: antes.horasMes, distribucion: antes.distribucion, meses: antes.meses }, despues: { horasMes, distribucion, meses }, motivo: motivo || 'Configuración del plan' });
  return despues;
}

/** Generador de códigos de actividad por plan (consecutivo atómico; salta códigos existentes). */
async function siguienteCodigoAct(planId) {
  const existentes = new Set((await datos.porIndice('actividades', 'planId', planId)).map((a) => a.codigo));
  return async () => {
    let c;
    do { c = `ACT-${String(await datos.siguiente(`consecutivoAct:${planId}`)).padStart(3, '0')}`; } while (existentes.has(c));
    existentes.add(c); return c;
  };
}

/** Genera actividades para los hallazgos que aún no tienen una y programa todo lo pendiente. */
export async function generarPlan(empresaId) {
  exigir(yo(), 'planes.generar');
  const c = await contextoPlan(empresaId);
  if (!c.plan) throw new Error('Guarde primero la configuración de horas y distribución.');
  if (!c.dx) throw new Error('La empresa no tiene un diagnóstico aprobado. El plan se genera a partir de hallazgos aprobados.');
  const conActividad = new Set(c.actividades.map((a) => a.hallazgoId).filter(Boolean));
  const nuevos = c.hallazgos.filter((h) => h.estado !== 'cerrado_verificado' && !conActividad.has(h.id));
  const codigo = await siguienteCodigoAct(c.plan.id);
  const creadas = [];
  for (const h of nuevos) {
    const req = await datos.obtener('requisitos', h.requisitoId);
    const verbo = h.tipo === 'incumplimiento' ? 'Implementar' : h.tipo === 'cumplimiento_parcial' ? 'Completar' : 'Verificar con evidencia';
    creadas.push({
      id: uid(), codigo: await codigo(), empresaId, planId: c.plan.id, hallazgoId: h.id, requisitoCodigo: h.codigo, campo: h.campo,
      actividad: `${verbo}: ${h.recomendacion || req?.pregunta || h.descripcion}`,
      objetivo: `Cerrar la brecha del requisito ${h.codigo}${h.norma ? ` (${h.norma})` : ''}.`,
      entregable: req?.evidencia || 'Evidencia documental verificable', responsable: h.responsable || '', especialista: ESPECIALISTA[h.campo],
      horasEstimadas: h.horasEstimadas, horasProgramadas: h.horasEstimadas, prioridad: h.prioridad, puntajePrioridad: h.puntaje, motivoPrioridad: h.motivo,
      estado: 'pendiente', indicador: 'Evidencia de cierre validada por el revisor', facturable: true, fijada: false,
      creadoEn: ahora(), creadoPor: yo().id, version: 1,
    });
  }
  const prog = programar({ actividades: [...c.actividades, ...creadas], meses: c.meses, horasMes: c.plan.horasMes, distribucion: c.plan.distribucion, capacidadSemanal: c.plan.capacidadSemanal });
  const plan = { ...c.plan, estado: c.plan.estado === 'aprobado' && !creadas.length ? 'aprobado' : 'borrador', alertasProgramacion: prog.alertas, generadoEn: ahora(), diagnosticoId: c.dx.id, diagnosticoCodigo: c.dx.codigo,
    historial: [...(c.plan.historial || []), { fecha: ahora(), usuario: yo().nombre, evento: `Generación: ${creadas.length} actividad(es) nueva(s) desde ${c.dx.codigo}; reprogramación de pendientes` }] };
  await datos.lote([{ tipo: 'guardar', store: 'planes', valor: plan }, ...prog.actividades.map((a) => ({ tipo: 'guardar', store: 'actividades', valor: a }))]);
  await registrar({ accion: 'crear', entidad: 'planes', entidadId: plan.id, motivo: `Plan de ${c.e.razonSocial}: ${creadas.length} actividades nuevas; ${prog.alertas.length} alerta(s) de capacidad` });
  return { creadas: creadas.length, alertas: prog.alertas };
}

export async function reprogramar(empresaId) {
  exigir(yo(), 'planes.generar');
  const c = await contextoPlan(empresaId);
  if (!c.plan) throw new Error('No hay plan para reprogramar.');
  const prog = programar({ actividades: c.actividades, meses: c.meses, horasMes: c.plan.horasMes, distribucion: c.plan.distribucion, capacidadSemanal: c.plan.capacidadSemanal });
  await datos.lote([{ tipo: 'guardar', store: 'planes', valor: { ...c.plan, alertasProgramacion: prog.alertas, actualizadoEn: ahora() } }, ...prog.actividades.map((a) => ({ tipo: 'guardar', store: 'actividades', valor: a }))]);
  await registrar({ accion: 'modificar', entidad: 'planes', entidadId: c.plan.id, motivo: 'Reprogramación de actividades pendientes' });
  return prog.alertas;
}

export async function aprobarPlan(empresaId, comentario = '') {
  exigir(yo(), 'planes.generar');
  const c = await contextoPlan(empresaId);
  if (!c.plan) throw new Error('No hay plan.');
  const v = validarDistribucion(c.plan.distribucion);
  if (!v.valida) throw new Error(v.mensaje);
  if (!c.actividades.length) throw new Error('El plan no tiene actividades.');
  const inmediatasSinProg = c.actividades.filter((a) => a.prioridad === 'inmediata' && !a.mesProgramado && a.estado !== 'cancelada');
  if (inmediatasSinProg.length) throw new Error(`Hay ${inmediatasSinProg.length} actividad(es) de intervención inmediata sin programar.`);
  const plan = { ...c.plan, estado: 'aprobado', version: (c.plan.version || 1) + (c.plan.aprobadoEn ? 1 : 0), aprobadoEn: ahora(), aprobadoPor: yo().id, aprobadoPorNombre: yo().nombre,
    historial: [...(c.plan.historial || []), { fecha: ahora(), usuario: yo().nombre, evento: 'Plan aprobado', comentario }] };
  await datos.guardar('planes', plan);
  await registrar({ accion: 'aprobar', entidad: 'planes', entidadId: plan.id, motivo: `Plan de ${c.e.razonSocial} versión ${plan.version}${comentario ? `: ${comentario}` : ''}` });
}

const CAMPOS_EDITABLES = ['actividad', 'objetivo', 'entregable', 'responsable', 'especialista', 'horasEstimadas', 'horasProgramadas', 'prioridad', 'mesProgramado', 'semanaProgramada', 'fechaInicio', 'fechaLimite', 'indicador', 'facturable'];

export async function actualizarActividad(id, cambios, motivo = '') {
  exigir(yo(), 'planes.generar');
  const antes = await datos.obtener('actividades', id);
  if (!antes) throw new Error('La actividad no existe.');
  await empresaVisible(antes.empresaId);
  if (['verificada', 'cancelada'].includes(antes.estado)) throw new Error('La actividad está cerrada y no admite cambios.');
  const limpio = Object.fromEntries(Object.entries(cambios).filter(([k]) => CAMPOS_EDITABLES.includes(k)));
  for (const k of ['horasEstimadas', 'horasProgramadas']) if (k in limpio) { limpio[k] = Number(limpio[k]); if (!(limpio[k] > 0)) throw new Error('Las horas deben ser mayores que cero.'); }
  if ('semanaProgramada' in limpio) limpio.semanaProgramada = limpio.semanaProgramada ? Number(limpio.semanaProgramada) : null;
  if (limpio.fechaInicio && limpio.fechaLimite && limpio.fechaLimite < limpio.fechaInicio) throw new Error('La fecha límite no puede ser anterior a la fecha de inicio.');
  const manual = ['mesProgramado', 'semanaProgramada'].some((k) => k in limpio && limpio[k] !== antes[k]);
  const despues = { ...antes, ...limpio, fijada: antes.fijada || manual, actualizadoEn: ahora(), actualizadoPor: yo().id, version: (antes.version || 1) + 1 };
  await datos.guardar('actividades', despues);
  await registrar({ accion: 'modificar', entidad: 'actividades', entidadId: id, antes, despues, motivo: motivo || `${antes.codigo}` });
  return despues;
}

export async function crearActividadManual(empresaId, d) {
  exigir(yo(), 'planes.generar');
  const plan = await planActual(empresaId);
  if (!plan) throw new Error('Configure primero el plan.');
  if (!d.actividad?.trim()) throw new Error('Describa la actividad.');
  if (!CAMPOS_P.includes(d.campo)) throw new Error('Seleccione el campo.');
  if (!(Number(d.horasEstimadas) > 0)) throw new Error('Indique las horas estimadas.');
  const codigo = await siguienteCodigoAct(plan.id);
  const a = { id: uid(), codigo: await codigo(), empresaId, planId: plan.id, hallazgoId: null, requisitoCodigo: null, campo: d.campo, actividad: d.actividad.trim(), objetivo: d.objetivo?.trim() || '',
    entregable: d.entregable?.trim() || '', responsable: d.responsable?.trim() || '', especialista: ESPECIALISTA[d.campo], horasEstimadas: Number(d.horasEstimadas), horasProgramadas: Number(d.horasEstimadas),
    prioridad: d.prioridad || 'media', puntajePrioridad: 0, motivoPrioridad: 'Actividad agregada manualmente', estado: 'pendiente', indicador: d.indicador?.trim() || '', facturable: true, fijada: false, creadoEn: ahora(), creadoPor: yo().id, version: 1 };
  await datos.guardar('actividades', a);
  await registrar({ accion: 'crear', entidad: 'actividades', entidadId: a.id, despues: a, motivo: 'Actividad manual' });
  return a;
}

export async function registrarHoras(actividadId, { fecha, horas, facturable = true, descripcion = '' }) {
  exigir(yo(), 'horas.registrar');
  const a = await datos.obtener('actividades', actividadId);
  if (!a) throw new Error('La actividad no existe.');
  await empresaVisible(a.empresaId);
  if (['verificada', 'cancelada'].includes(a.estado)) throw new Error('La actividad está cerrada.');
  const h = Number(horas);
  if (!(h > 0 && h <= 12)) throw new Error('Registre entre 0,25 y 12 horas por registro.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) throw new Error('Indique la fecha en que se ejecutaron las horas.');
  if (fecha > new Date().toISOString().slice(0, 10)) throw new Error('No se pueden registrar horas en fechas futuras.');
  if (!descripcion.trim()) throw new Error('Describa brevemente el trabajo realizado.');
  const r = { id: uid(), empresaId: a.empresaId, actividadId, usuarioId: yo().id, usuarioNombre: yo().nombre, fecha, horas: h, facturable: !!facturable, descripcion: descripcion.trim(), anulado: false, creadoEn: ahora() };
  await datos.guardar('horas', r);
  if (a.estado === 'pendiente') await datos.guardar('actividades', { ...a, estado: 'en_curso', fijada: true, actualizadoEn: ahora() });
  await registrar({ accion: 'registrar_horas', entidad: 'horas', entidadId: r.id, despues: r, motivo: `${a.codigo}: ${h} h` });
  return r;
}

export async function anularRegistroHoras(id, motivo) {
  exigir(yo(), 'horas.registrar');
  const r = await datos.obtener('horas', id);
  await empresaVisible(r.empresaId);
  if (!motivo?.trim()) throw new Error('Indique el motivo de la anulación.');
  if (r.usuarioId !== yo().id && yo().rol !== 'administrador') throw new ErrorPermiso('Solo quien registró las horas o un administrador puede anularlas.');
  await datos.guardar('horas', { ...r, anulado: true, anuladoEn: ahora(), anuladoPor: yo().id, motivoAnulacion: motivo });
  await registrar({ accion: 'eliminar_logico', entidad: 'horas', entidadId: id, motivo });
}

export async function adjuntarEvidenciaActividad(actividadId, archivo, { fechaEvidencia, descripcion }) {
  exigir(yo(), 'evidencias.adjuntar');
  const a = await datos.obtener('actividades', actividadId);
  await empresaVisible(a.empresaId);
  if (!archivo) throw new Error('Seleccione un archivo.');
  if (archivo.size > APP.ARCHIVO_MAX_MB * 1048576) throw new Error(`El archivo supera ${APP.ARCHIVO_MAX_MB} MB.`);
  if (!APP.ARCHIVO_TIPOS.includes(archivo.type)) throw new Error('Formato no admitido. Use PDF, JPG, PNG, DOCX o XLSX.');
  const ev = { id: uid(), empresaId: a.empresaId, diagnosticoId: null, actividadId, requisitoCodigo: a.requisitoCodigo, nombre: archivo.name, mime: archivo.type, tamano: archivo.size, archivo,
    fechaEvidencia: fechaEvidencia || '', descripcion: descripcion?.trim() || '', eliminado: false, creadoEn: ahora(), creadoPor: yo().id };
  await datos.guardar('evidencias', ev);
  await registrar({ accion: 'adjuntar', entidad: 'evidencias', entidadId: ev.id, despues: ev, motivo: `${a.codigo}` });
}

/**
 * Transiciones: pendiente → en_curso → ejecutada → verificada. Cancelada desde cualquier estado abierto.
 * "Ejecutada" exige horas registradas; "Verificada" exige evidencia y la valida un administrador.
 */
export async function cambiarEstadoActividad(id, nuevo, motivo = '') {
  const a = await datos.obtener('actividades', id);
  await empresaVisible(a.empresaId);
  const regs = (await datos.porIndice('horas', 'actividadId', id)).filter((r) => !r.anulado);
  const evs = (await datos.porIndice('evidencias', 'actividadId', id)).filter((x) => !x.eliminado);
  if (nuevo === 'ejecutada') { exigir(yo(), 'planes.generar'); if (!regs.length) throw new Error('Registre las horas ejecutadas antes de marcar la actividad como ejecutada.'); }
  if (nuevo === 'verificada') {
    if (!puede(yo(), 'diagnosticos.aprobar')) throw new ErrorPermiso('La verificación de cierre la realiza un administrador o revisor.');
    if (a.estado !== 'ejecutada') throw new Error('Solo se verifican actividades ejecutadas.');
    if (!evs.length) throw new Error('No se puede cerrar sin evidencia: adjunte al menos un soporte.');
  }
  if (nuevo === 'cancelada') { exigir(yo(), 'planes.generar'); if (!motivo.trim()) throw new Error('Indique el motivo de la cancelación.'); }
  if (nuevo === 'en_curso' || nuevo === 'pendiente') exigir(yo(), 'planes.generar');
  const despues = { ...a, estado: nuevo, actualizadoEn: ahora(), actualizadoPor: yo().id, ...(nuevo === 'verificada' ? { verificadaPor: yo().id, verificadaEn: ahora() } : {}) };
  await datos.guardar('actividades', despues);
  await registrar({ accion: nuevo === 'verificada' ? 'aprobar' : nuevo === 'cancelada' ? 'eliminar_logico' : 'modificar', entidad: 'actividades', entidadId: id, antes: { estado: a.estado }, despues: { estado: nuevo }, motivo: `${a.codigo}${motivo ? `: ${motivo}` : ''}` });
  if (nuevo === 'verificada' && a.hallazgoId) {
    const hermanas = (await datos.porIndice('actividades', 'hallazgoId', a.hallazgoId)).map((x) => (x.id === id ? despues : x));
    if (hermanas.every((x) => ['verificada', 'cancelada'].includes(x.estado)) && hermanas.some((x) => x.estado === 'verificada')) {
      const h = await datos.obtener('hallazgos', a.hallazgoId);
      await datos.guardar('hallazgos', { ...h, estado: 'cerrado_verificado', cerradoPor: yo().id, cerradoEn: ahora() });
      await registrar({ accion: 'cerrar', entidad: 'hallazgos', entidadId: h.id, motivo: `${h.codigo}: cerrado con evidencia verificada (${a.codigo})` });
    }
  }
}

export { vencida };

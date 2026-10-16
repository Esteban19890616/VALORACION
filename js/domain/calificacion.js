/**
 * Motor de calificación del cumplimiento (lógica pura, sin interfaz ni persistencia).
 *
 * Separa cinco dimensiones que no deben confundirse:
 *   1. Porcentaje de cumplimiento  → calcularCampo()
 *   2. Nivel de riesgo             → nivelRiesgo(severidad, probabilidad), por hallazgo
 *   3. Criticidad del hallazgo     → severidad definida en el catálogo
 *   4. Prioridad de intervención   → motor de priorización (js/domain/priorizacion.js)
 *   5. Nivel de madurez            → calificación cualitativa del asesor (1 a 5), no se deriva del porcentaje
 *
 * Fórmula (por campo):
 *   cumplimiento = Σ(peso × puntaje) / Σ(peso de requisitos aplicables y evaluables)
 *   Evaluables: cumple, parcial, no_cumple.
 *   No aplica: se excluye del denominador SOLO si está justificado y validado por el revisor;
 *              si no está validado se reporta como pendiente.
 *   Pendiente de verificación: no suma ni resta; se reporta aparte y reduce la cobertura.
 *   Sin requisitos evaluables: "Sin datos suficientes" (null), nunca 0 % ni 100 %.
 */

export const PARAMETROS_DEFECTO = Object.freeze({
  puntajes: { cumple: 100, parcial: 50, no_cumple: 0 },
  // Rangos visuales internos (criterio de diagnóstico de Ser Integral, no categoría legal)
  rangos: [
    { desde: 0, hasta: 59.99, etiqueta: 'Bajo', tono: 'critico' },
    { desde: 60, hasta: 84.99, etiqueta: 'Medio', tono: 'aviso' },
    { desde: 85, hasta: 100, etiqueta: 'Alto', tono: 'ok' },
  ],
});

export const RESPUESTAS = {
  cumple: 'Cumple', parcial: 'Cumple parcialmente', no_cumple: 'No cumple', no_aplica: 'No aplica', pendiente: 'Pendiente de verificación',
};

const redondear = (n) => Math.round(n * 10) / 10;

/** ¿Una respuesta "no aplica" está validada para excluirse? */
export const naValidado = (r) => r?.respuesta === 'no_aplica' && !!r.justificacionNA?.trim() && r.naEstado === 'aprobada';

/** Estado efectivo para el cálculo. */
export function estadoEfectivo(r) {
  const v = r?.respuesta || 'pendiente';
  if (v === 'no_aplica') return naValidado(r) ? 'na_validado' : 'na_por_validar';
  return v;
}

/**
 * items: [{ requisito, respuesta }] de UN campo, solo requisitos que aplican (o por confirmar).
 */
export function calcularCampo(items, parametros = PARAMETROS_DEFECTO) {
  const c = { cumple: 0, parcial: 0, no_cumple: 0, na_validado: 0, na_por_validar: 0, pendiente: 0 };
  let pesoEvaluado = 0, puntos = 0, pesoAplicable = 0;
  for (const { requisito, respuesta } of items) {
    const e = estadoEfectivo(respuesta);
    c[e] = (c[e] || 0) + 1;
    const w = Number(requisito.peso) || 0;
    if (e === 'na_validado') continue;
    pesoAplicable += w;
    if (e in parametros.puntajes) { pesoEvaluado += w; puntos += w * parametros.puntajes[e]; }
  }
  const total = items.length;
  const porcentaje = pesoEvaluado > 0 ? redondear(puntos / pesoEvaluado) : null;
  const cobertura = pesoAplicable > 0 ? redondear((pesoEvaluado / pesoAplicable) * 100) : null;
  return {
    total, conteos: c, pesoAplicable: redondear(pesoAplicable), pesoEvaluado: redondear(pesoEvaluado),
    porcentaje, cobertura, sinDatos: porcentaje === null,
    incompleto: (c.pendiente + c.na_por_validar) > 0,
    rango: porcentaje === null ? null : rangoDe(porcentaje, parametros),
  };
}

export function rangoDe(p, parametros = PARAMETROS_DEFECTO) {
  return parametros.rangos.find((r) => p >= r.desde && p <= r.hasta) || parametros.rangos[parametros.rangos.length - 1];
}

/** Calcula todos los campos, el promedio simple entre campos y las alertas críticas. */
export function calcularDiagnostico({ items, campos, parametros = PARAMETROS_DEFECTO }) {
  const porCampo = {};
  for (const campo of campos) porCampo[campo] = calcularCampo(items.filter((i) => i.requisito.campo === campo), parametros);
  const conDatos = Object.values(porCampo).filter((x) => x.porcentaje !== null);
  const promedioSimple = conDatos.length ? redondear(conDatos.reduce((a, x) => a + x.porcentaje, 0) / conDatos.length) : null;
  const totalPend = items.filter((i) => ['pendiente', 'na_por_validar'].includes(estadoEfectivo(i.respuesta))).length;
  const respondidos = items.filter((i) => estadoEfectivo(i.respuesta) !== 'pendiente').length;
  return {
    porCampo, promedioSimple, camposConDatos: conDatos.length,
    progreso: items.length ? Math.round((respondidos / items.length) * 100) : 0,
    respondidos, total: items.length, pendientes: totalPend,
    alertas: alertasCriticas(items),
  };
}

/** Requisitos críticos incumplidos, parciales o sin verificar. Nunca se ocultan por un promedio alto. */
export function alertasCriticas(items) {
  return items.filter((i) => i.requisito.severidad === 'critica')
    .map((i) => ({ ...i, estado: estadoEfectivo(i.respuesta) }))
    .filter((i) => ['no_cumple', 'parcial', 'pendiente', 'na_por_validar'].includes(i.estado))
    .map((i) => ({ codigo: i.requisito.codigo, campo: i.requisito.campo, pregunta: i.requisito.pregunta, estado: i.estado, bloqueaAprobacion: ['pendiente', 'na_por_validar'].includes(i.estado) }));
}

/**
 * Calificación de la autoevaluación según la Resolución 0312 de 2019 (solo campo SST, ítems con ref0312 numérica).
 * - Solo "Cumple" suma el valor del ítem; "Cumple parcialmente" se trata como "No cumple" (la resolución no admite parciales).
 * - "No aplica" justificado y validado suma el valor del ítem (regla de la tabla de valores; pendiente de cotejo literal del art. 27).
 * - Valoración del art. 28: < 60 % crítico; 60 % a 85 % moderadamente aceptable; > 85 % aceptable.
 * - Para los grupos de 7 y 21 estándares se informa el cumplimiento sobre la suma de valores de sus ítems.
 */
export function calificacion0312(items, grupo) {
  const sst = items.filter((i) => i.requisito.ref0312 && /^\d/.test(i.requisito.ref0312));
  if (!sst.length) return null;
  let total = 0, obtenido = 0, pendientes = 0;
  for (const { requisito, respuesta } of sst) {
    const v = Number(requisito.peso) || 0; total += v;
    const e = estadoEfectivo(respuesta);
    if (e === 'cumple' || e === 'na_validado') obtenido += v;
    if (e === 'pendiente' || e === 'na_por_validar') pendientes++;
  }
  const porcentaje = total ? redondear((obtenido / total) * 100) : null;
  const valoracion = porcentaje === null ? null : porcentaje < 60 ? { etiqueta: 'Crítico', tono: 'critico', accion: 'Plan de mejoramiento inmediato y avance a la ARL en máximo 3 meses (art. 28).' }
    : porcentaje <= 85 ? { etiqueta: 'Moderadamente aceptable', tono: 'aviso', accion: 'Plan de mejoramiento y avance a la ARL en máximo 6 meses (art. 28).' }
      : { etiqueta: 'Aceptable', tono: 'ok', accion: 'Mantener la calificación e incluir mejoras en el plan anual (art. 28).' };
  return { grupo, itemsEvaluados: sst.length, valorTotal: redondear(total), valorObtenido: redondear(obtenido), porcentaje, valoracion, provisional: pendientes > 0, pendientes };
}

/* ---------------- Nivel de riesgo (dimensión 2) ---------------- */
export const SEVERIDADES = { baja: 1, media: 2, alta: 3, critica: 4 };
export const PROBABILIDADES = { baja: 1, media: 2, alta: 3 };

export function nivelRiesgo(severidad, probabilidad = 'media') {
  const v = (SEVERIDADES[severidad] || 2) * (PROBABILIDADES[probabilidad] || 2);
  if (v >= 9) return { valor: v, etiqueta: 'Muy alto', tono: 'critico' };
  if (v >= 6) return { valor: v, etiqueta: 'Alto', tono: 'critico' };
  if (v >= 3) return { valor: v, etiqueta: 'Medio', tono: 'aviso' };
  return { valor: v, etiqueta: 'Bajo', tono: 'ok' };
}

/* ---------------- Madurez (dimensión 5) ---------------- */
export const MADUREZ = [
  { nivel: 1, nombre: 'Inicial', descripcion: 'Prácticas informales o inexistentes; dependen de personas.' },
  { nivel: 2, nombre: 'En desarrollo', descripcion: 'Existen algunos documentos o prácticas, sin aplicación sistemática.' },
  { nivel: 3, nombre: 'Definido', descripcion: 'Procesos documentados, implementados y con registros.' },
  { nivel: 4, nombre: 'Gestionado', descripcion: 'Se mide, se analiza y se toman acciones con base en indicadores.' },
  { nivel: 5, nombre: 'Optimizado', descripcion: 'Mejora continua demostrada y resultados sostenidos.' },
];

/* ---------------- Hallazgos derivados ---------------- */
export function derivarHallazgos(items) {
  return items.map(({ requisito, respuesta }) => ({ requisito, respuesta, estado: estadoEfectivo(respuesta) }))
    .filter((x) => ['no_cumple', 'parcial', 'pendiente'].includes(x.estado))
    .map(({ requisito, respuesta, estado }) => ({
      codigo: requisito.codigo, requisitoId: requisito.id, campo: requisito.campo, categoria: requisito.categoria,
      tipo: estado === 'no_cumple' ? 'incumplimiento' : estado === 'parcial' ? 'cumplimiento_parcial' : 'pendiente_verificacion',
      descripcion: respuesta?.observaciones?.trim() || requisito.pregunta,
      severidad: requisito.severidad, probabilidad: respuesta?.probabilidad || 'media',
      riesgo: nivelRiesgo(requisito.severidad, respuesta?.probabilidad || 'media'),
      naturaleza: requisito.naturaleza, recomendacion: respuesta?.recomendacion || requisito.recomendacion,
      responsable: respuesta?.responsable || requisito.responsable, norma: [requisito.norma, requisito.disposicion].filter(Boolean).join(', '),
    }));
}

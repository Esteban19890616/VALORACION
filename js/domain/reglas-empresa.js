/**
 * Reglas orientativas de aplicabilidad derivadas del expediente de la empresa.
 * ESTADO NORMATIVO: pendiente de validación contra el texto oficial vigente
 * en la Fase 3 (catálogo legal vivo). Se muestran al asesor como orientación,
 * nunca como conclusión jurídica automática.
 */

const FUENTE_0312 = 'Resolución 0312 de 2019 (Ministerio del Trabajo)';

/**
 * Grupo de Estándares Mínimos del SG-SST según número de trabajadores y clase de riesgo.
 *  - Art. 3: hasta 10 trabajadores, riesgo I, II o III → 7 estándares.
 *  - Art. 9: 11 a 50 trabajadores, riesgo I, II o III → 21 estándares.
 *  - Art. 16: más de 50 trabajadores (cualquier riesgo) o hasta 50 con riesgo IV o V → 60 estándares.
 * Unidades de producción agropecuaria con hasta 10 trabajadores permanentes
 * (riesgo I–III) tienen un régimen propio en el Capítulo I, art. 7; con riesgo
 * IV o V se remiten al Capítulo III (art. 8). El asesor debe revisarlo aparte.
 * Texto consultado (15-oct-2026): https://normograma.supersalud.gov.co/compilacion/docs/resolucion_mtra_0312_2019.htm
 */
export function grupoEstandaresMinimos(trabajadores, claseRiesgo, agropecuaria = false) {
  const n = Number(trabajadores);
  if (!Number.isFinite(n) || n < 0 || !claseRiesgo) return { aplica: null, texto: 'Sin datos suficientes (registre trabajadores y clase de riesgo).' };
  const alto = ['IV', 'V'].includes(claseRiesgo);
  if (n > 50 || alto) return { aplica: 'art16', estandares: 60, texto: `60 estándares — ${FUENTE_0312}, Capítulo III, art. 16${agropecuaria && alto && n <= 10 ? ' (remisión del art. 8)' : ''}`, fuente: FUENTE_0312 };
  if (agropecuaria && n <= 10) return { aplica: 'art7', estandares: null, texto: `Régimen de unidades de producción agropecuaria — ${FUENTE_0312}, Capítulo I, art. 7`, fuente: FUENTE_0312 };
  if (n >= 11) return { aplica: 'art9', estandares: 21, texto: `21 estándares — ${FUENTE_0312}, Capítulo II, art. 9`, fuente: FUENTE_0312 };
  return { aplica: 'art3', estandares: 7, texto: `7 estándares — ${FUENTE_0312}, Capítulo I, art. 3`, fuente: FUENTE_0312 };
}

/**
 * Instancia de participación en SST: COPASST (10 o más trabajadores) o Vigía de SST (menos de 10).
 * Base: Resolución 2013 de 1986, art. 1 (comité con 10 o más trabajadores); Decreto 1295 de 1994,
 * art. 63 (denominación del comité) y art. 35, parágrafo (vigía). Soportes: Decreto 1072 de 2015,
 * art. 2.2.4.6.12, num. 10. Art. 63 pendiente de cotejo con el texto oficial vigente (Fase 3).
 */
export function instanciaParticipacion(trabajadores) {
  const n = Number(trabajadores);
  if (!Number.isFinite(n) || n < 1) return { texto: 'Sin datos suficientes.' };
  return n >= 10
    ? { tipo: 'copasst', texto: 'COPASST (10 o más trabajadores) — Res. 2013 de 1986, art. 1; D. 1295 de 1994, art. 63' }
    : { tipo: 'vigia', texto: 'Vigía de SST (menos de 10 trabajadores) — D. 1295 de 1994, art. 35, parágrafo' };
}

/** Total de trabajadores declarados en sedes vs. total de la empresa (control de coherencia). */
export function coherenciaSedes(empresa) {
  const sum = (empresa.sedes || []).reduce((a, s) => a + (Number(s.trabajadores) || 0), 0);
  if (!empresa.sedes?.length) return null;
  if (sum !== Number(empresa.trabajadores)) return `La suma de trabajadores por sede (${sum}) no coincide con el total registrado (${empresa.trabajadores}).`;
  return null;
}

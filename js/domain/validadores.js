/**
 * Validadores puros (probados en tests/run-tests.mjs).
 */

/**
 * Dígito de verificación del NIT. Algoritmo de módulo 11 con los pesos
 * primos que aplica la DIAN (3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71),
 * aplicados de derecha a izquierda. Si el residuo es 0 o 1 el DV es el residuo;
 * en otro caso, 11 − residuo.
 */
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function calcularDV(base) {
  const d = String(base).replace(/\D/g, '');
  if (!d || d.length > 15) return null;
  let s = 0;
  [...d].reverse().forEach((c, i) => { s += Number(c) * PESOS[i]; });
  const r = s % 11;
  return r > 1 ? 11 - r : r;
}

/** Acepta "900.123.456-7", "900123456 7", "9001234567" (si se indica conDV). Devuelve {base, dv, valido, formato}. */
export function analizarNIT(entrada) {
  const limpio = String(entrada ?? '').trim().replace(/[.\s]/g, '');
  if (!limpio) return { valido: false, error: 'Ingrese el NIT.' };
  let base, dv;
  if (limpio.includes('-')) { [base, dv] = limpio.split('-'); }
  else { base = limpio; dv = null; }
  if (!/^\d{6,15}$/.test(base)) return { valido: false, error: 'El NIT debe tener entre 6 y 15 dígitos, sin letras.' };
  const calculado = calcularDV(base);
  if (dv !== null && dv !== '') {
    if (!/^\d$/.test(dv)) return { valido: false, error: 'El dígito de verificación debe ser un único número.' };
    if (Number(dv) !== calculado) return { valido: false, base, dv: Number(dv), calculado, error: `El dígito de verificación no corresponde. Para ${base} el DV calculado es ${calculado}.` };
  }
  return { valido: true, base, dv: calculado, formato: `${Number(base).toLocaleString('es-CO').replace(/,/g, '.')}-${calculado}` };
}

export const validarEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v ?? '').trim());
export const validarTelefono = (v) => /^\+?\d{7,13}$/.test(String(v ?? '').replace(/[\s()-]/g, ''));
/** CIIU Rev. 4 A.C. (Colombia): código de 4 dígitos. */
export const validarCIIU = (v) => /^\d{4}$/.test(String(v ?? '').trim());
export const enteroNoNegativo = (v) => Number.isInteger(Number(v)) && Number(v) >= 0 && String(v).trim() !== '';

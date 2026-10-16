/**
 * Integridad de la bitácora: cadena de huellas SHA-256 (lógica pura, probada en tests/seguridad.test.mjs).
 *   huella_n = SHA-256( huellaAnterior_n + "|" + JSON canónico de la entrada sin campos de cadena )
 * Detecta entradas modificadas, eliminadas (saltos de secuencia) o insertadas fuera de la cadena.
 * No impide la manipulación: la hace evidente. En el servidor la cadena la calcula PHP.
 */
export const CAMPOS_CADENA = ['secuencia', 'huella', 'huellaAnterior'];
export const GENESIS = '0'.repeat(64);

/** JSON con claves ordenadas, determinístico. */
export function canonico(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonico).join(',')}]`;
  return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`;
}

export function contenidoEncadenable(entrada) {
  const c = { ...entrada };
  for (const k of CAMPOS_CADENA) delete c[k];
  return canonico(c);
}

/** sha256: async (texto) => hex */
export async function calcularHuella(huellaAnterior, entrada, sha256) {
  return sha256(`${huellaAnterior}|${contenidoEncadenable(entrada)}`);
}

/**
 * Verifica la cadena completa.
 * @returns {{ total, encadenadas, sinEncadenar, ultimaSecuencia, problemas: [{secuencia, id, tipo, detalle}], integra }}
 */
export async function verificarCadena(entradas, sha256) {
  const enc = entradas.filter((e) => Number.isInteger(e.secuencia)).sort((a, b) => a.secuencia - b.secuencia);
  const problemas = [];
  let anterior = GENESIS; let esperado = 1;
  for (const e of enc) {
    if (e.secuencia !== esperado) {
      problemas.push({ secuencia: esperado, id: null, tipo: e.secuencia > esperado ? 'faltante' : 'duplicada', detalle: e.secuencia > esperado ? `Faltan las entradas ${esperado} a ${e.secuencia - 1}: pudieron ser eliminadas.` : `Secuencia ${e.secuencia} repetida.` });
      if (e.secuencia < esperado) continue;
      esperado = e.secuencia;
    }
    if (e.huellaAnterior !== anterior) problemas.push({ secuencia: e.secuencia, id: e.id, tipo: 'enlace', detalle: 'La huella anterior no coincide con la entrada previa.' });
    const h = await calcularHuella(e.huellaAnterior ?? '', e, sha256);
    if (h !== e.huella) problemas.push({ secuencia: e.secuencia, id: e.id, tipo: 'modificada', detalle: 'El contenido no coincide con su huella: la entrada fue modificada.' });
    anterior = e.huella; esperado += 1;
  }
  return { total: entradas.length, encadenadas: enc.length, sinEncadenar: entradas.length - enc.length, ultimaSecuencia: enc.at(-1)?.secuencia ?? 0, problemas, integra: problemas.length === 0 };
}

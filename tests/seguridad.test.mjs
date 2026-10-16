// Pruebas de integridad de la bitácora (cadena de huellas).  node tests/seguridad.test.mjs
import { createHash } from 'node:crypto';
import { verificarCadena, calcularHuella, canonico, GENESIS } from '../js/domain/integridad.js';

let ok = 0, fallos = 0;
const prueba = (n, c) => { if (c) { ok++; console.log(`  ✔ ${n}`); } else { fallos++; console.log(`  ✘ ${n}`); } };
const sha256 = async (t) => createHash('sha256').update(t, 'utf8').digest('hex');

async function cadena(n) {
  const out = []; let ant = GENESIS;
  for (let i = 1; i <= n; i++) {
    const e = { id: `a${i}`, fecha: `2026-10-16T10:00:0${i % 10}Z`, accion: 'crear', entidad: 'empresas', motivo: `Entrada ${i}`, cambios: [{ campo: 'x', antes: null, despues: i }] };
    e.secuencia = i; e.huellaAnterior = ant; e.huella = await calcularHuella(ant, e, sha256); ant = e.huella; out.push(e);
  }
  return out;
}

console.log('JSON canónico');
prueba('El orden de las claves no altera el resultado', canonico({ b: 1, a: { d: 2, c: 3 } }) === canonico({ a: { c: 3, d: 2 }, b: 1 }));
prueba('Las claves indefinidas se omiten', canonico({ a: 1, b: undefined }) === '{"a":1}');

console.log('Cadena de huellas de la bitácora');
let c = await cadena(6);
let r = await verificarCadena(c, sha256);
prueba('Cadena íntegra de 6 entradas', r.integra && r.encadenadas === 6 && r.ultimaSecuencia === 6);
c = await cadena(6); c[2].motivo = 'Motivo alterado';
r = await verificarCadena(c, sha256);
prueba('Detecta una entrada modificada (secuencia 3)', !r.integra && r.problemas.some((p) => p.secuencia === 3 && p.tipo === 'modificada'));
c = await cadena(6); c.splice(3, 1);
r = await verificarCadena(c, sha256);
prueba('Detecta una entrada eliminada (falta la 4)', !r.integra && r.problemas.some((p) => p.tipo === 'faltante'));
c = await cadena(6); c[4].huella = await calcularHuella(c[4].huellaAnterior, { ...c[4], motivo: 'x' }, sha256); c[4].motivo = 'x';
r = await verificarCadena(c, sha256);
prueba('Recalcular la huella de una entrada rompe el enlace con la siguiente', !r.integra && r.problemas.some((p) => p.secuencia === 6 && p.tipo === 'enlace'));
c = await cadena(3); c.push({ id: 'vieja', fecha: '2026-01-01', accion: 'crear' });
r = await verificarCadena(c, sha256);
prueba('Entradas antiguas sin cadena se informan aparte', r.integra && r.sinEncadenar === 1);

console.log(`\n${ok} pruebas superadas, ${fallos} fallidas.`);
process.exitCode = fallos ? 1 : 0;

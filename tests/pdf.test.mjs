// Pruebas de utilidades del motor PDF (sin navegador).  node tests/pdf.test.mjs
import { S } from '../js/reports/pdf-base.js';
let ok = 0, fallos = 0;
const prueba = (n, c) => { if (c) { ok++; console.log(`  ✔ ${n}`); } else { fallos++; console.log(`  ✘ ${n}`); } };
console.log('Texto seguro para PDF (Latin-1)');
prueba('Conserva tildes, eñe y signos de apertura', S('¿Señalización de áreas? ¡Sí!') === '¿Señalización de áreas? ¡Sí!');
prueba('Convierte rayas y comillas tipográficas', S('Ley 2466 — art. 7 “debido proceso”') === 'Ley 2466 - art. 7 "debido proceso"');
prueba('Convierte símbolos no soportados', S('≥ 50 → ✓') === '>= 50 -> Si');
prueba('Todo el resultado queda en Latin-1', /^[\x00-\xff]*$/.test(S('Calidad ★ 9001 — “ok” • ✔ ≤ ≠ €')));
prueba('Nulos e indefinidos producen texto vacío', S(null) === '' && S(undefined) === '');
console.log(`\n${ok} pruebas superadas, ${fallos} fallidas.`);
process.exitCode = fallos ? 1 : 0;

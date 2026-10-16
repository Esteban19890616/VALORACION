// Pruebas del motor de priorización, distribución de horas y programación.  node tests/planes.test.mjs
import { proponerDistribucion, validarDistribucion, horasPorCampo, priorizarHallazgo, enterosQueSuman100, horasEstimadas } from '../js/domain/priorizacion.js';
import { programar, consolidar, mesesDesde } from '../js/domain/planificacion.js';

let ok = 0, fallos = 0;
const prueba = (n, c) => { if (c) { ok++; console.log(`  ✔ ${n}`); } else { fallos++; console.log(`  ✘ ${n}`); } };
const CAMPOS = ['juridico', 'sst', 'calidad', 'ambiental'];

console.log('Distribución de horas');
const ej = { juridico: 40, sst: 25, calidad: 15, ambiental: 20 };
const hrs = horasPorCampo(40, ej);
prueba('Ejemplo del documento: 40 h → 16 / 10 / 6 / 8', hrs.juridico === 16 && hrs.sst === 10 && hrs.calidad === 6 && hrs.ambiental === 8);
prueba('Distribución que suma 100 es válida', validarDistribucion(ej).valida);
prueba('Distribución que suma 95 se rechaza', !validarDistribucion({ ...ej, sst: 20 }).valida);
prueba('Recalcula al cambiar la bolsa: 60 h → jurídico 24 h', horasPorCampo(60, ej).juridico === 24);
const e = enterosQueSuman100({ a: 1, b: 1, c: 1 });
prueba('Redondeo por mayor residuo suma exactamente 100', e.a + e.b + e.c === 100);

console.log('Priorización');
const crit = { campo: 'sst', severidad: 'critica', probabilidad: 'media', tipo: 'incumplimiento', naturaleza: 'legal' };
prueba('Crítico incumplido → intervención inmediata', priorizarHallazgo(crit).prioridad === 'inmediata');
prueba('Baja parcial voluntaria → prioridad baja', priorizarHallazgo({ severidad: 'baja', probabilidad: 'baja', tipo: 'cumplimiento_parcial', naturaleza: 'voluntaria' }).prioridad === 'baja');
prueba('Horas estimadas: crítica 6 h, parcial media 2 h, pendiente ≥ 1 h', horasEstimadas(crit) === 6 && horasEstimadas({ severidad: 'media', tipo: 'cumplimiento_parcial' }) === 2 && horasEstimadas({ severidad: 'baja', tipo: 'pendiente_verificacion' }) >= 1);
const hs = [
  ...Array.from({ length: 8 }, () => ({ campo: 'juridico', severidad: 'media', probabilidad: 'media', tipo: 'incumplimiento', naturaleza: 'legal' })),
  { campo: 'ambiental', severidad: 'critica', probabilidad: 'alta', tipo: 'incumplimiento', naturaleza: 'legal' },
];
const p = proponerDistribucion(hs, 20);
prueba('La propuesta suma exactamente 100 %', Object.values(p.distribucion).reduce((a, b) => a + b, 0) === 100);
prueba('Campo con crítico recibe al menos las horas de su intervención inmediata (6 h de 20 h → ≥ 30 %)', p.distribucion.ambiental >= 30);
prueba('La propuesta explica cada campo', p.explicacion.length === 4 && p.explicacion.find((x) => x.campo === 'ambiental').texto.includes('inmediata'));
prueba('Sin hallazgos: alerta para definir manualmente', proponerDistribucion([], 40).alertas.length === 1);

console.log('Programación y consolidación');
const meses = mesesDesde('2026-11', 3);
prueba('Meses consecutivos con cambio de año', meses.join(',') === '2026-11,2026-12,2027-01');
const act = (id, campo, h, prioridad = 'media', extra = {}) => ({ id, campo, horasEstimadas: h, prioridad, puntajePrioridad: 1, estado: 'pendiente', ...extra });
const r = programar({ actividades: [act('a', 'juridico', 10), act('b', 'juridico', 10), act('c', 'sst', 6, 'inmediata'), act('d', 'calidad', 3)], meses, horasMes: 20, distribucion: { juridico: 50, sst: 10, calidad: 40, ambiental: 0 }, capacidadSemanal: 10, hoy: '2026-11-01' });
const byId = Object.fromEntries(r.actividades.map((x) => [x.id, x]));
prueba('Respeta la bolsa del campo: segunda actividad de 10 h pasa al mes siguiente', byId.a.mesProgramado === '2026-11' && byId.b.mesProgramado === '2026-12');
prueba('Intervención inmediata va al primer mes aunque exceda su campo (2 h asignadas)', byId.c.mesProgramado === '2026-11' && byId.c.excedeCampo);
prueba('Se alerta el exceso del campo', r.alertas.some((x) => x.texto.includes('campo sst')));
prueba('Capacidad semanal: actividades en semanas distintas', byId.a.semanaProgramada !== byId.c.semanaProgramada);
const r2 = programar({ actividades: [act('z', 'ambiental', 2)], meses, horasMes: 20, distribucion: ej, capacidadSemanal: 10, hoy: '2026-11-01' });
prueba('Campo con horas asignadas programa la actividad', !r2.actividades[0].sinProgramar);
const r3 = programar({ actividades: [act('z', 'ambiental', 2)], meses, horasMes: 20, distribucion: { juridico: 100, sst: 0, calidad: 0, ambiental: 0 }, capacidadSemanal: 10, hoy: '2026-11-01' });
prueba('Campo con 0 % deja la actividad sin programar y alerta', r3.actividades[0].sinProgramar && r3.alertas.length > 0);
const regs = [{ actividadId: 'a', fecha: '2026-11-05', horas: 4, facturable: true }, { actividadId: 'a', fecha: '2026-12-02', horas: 3, facturable: false }];
const k = consolidar({ actividades: r.actividades, registros: regs, meses, horasMes: 20, distribucion: { juridico: 50, sst: 10, calidad: 40, ambiental: 0 }, campos: CAMPOS });
prueba('Ejecutadas se cuentan por la fecha del registro (nov 4 h, dic 3 h)', k.porMes['2026-11'].juridico.ejecutadas === 4 && k.porMes['2026-12'].juridico.ejecutadas === 3);
prueba('Anual = suma de meses, sin duplicar (7 h ejecutadas, 4 facturables)', k.anual.juridico.ejecutadas === 7 && k.anual.juridico.facturables === 4);
prueba('Programadas anuales = suma de actividades (29 h)', k.totalAnual.programadas === 29);
prueba('Asignadas anuales = mensual × meses (60 h)', k.totalAnual.asignadas === 60);

const r4 = programar({ actividades: [act('p', 'juridico', 2, 'inmediata')], meses: mesesDesde('2026-10', 2), horasMes: 20, distribucion: ej, capacidadSemanal: 10, hoy: '2026-10-15' });
prueba('Nunca programa en semanas pasadas (15-oct → semana 3 de octubre)', r4.actividades[0].mesProgramado === '2026-10' && r4.actividades[0].semanaProgramada === 3);
const r5 = programar({ actividades: [act('q', 'juridico', 2)], meses: mesesDesde('2026-09', 2), horasMes: 20, distribucion: ej, capacidadSemanal: 10, hoy: '2026-10-15' });
prueba('Un mes ya terminado no recibe actividades', r5.actividades[0].mesProgramado === '2026-10');
console.log(`\n${ok} pruebas superadas, ${fallos} fallidas.`);
process.exitCode = fallos ? 1 : 0;

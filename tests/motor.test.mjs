// Pruebas del motor de calificación, aplicabilidad y catálogo.  node tests/motor.test.mjs
import { calcularCampo, calcularDiagnostico, calificacion0312, alertasCriticas, nivelRiesgo, derivarHallazgos } from '../js/domain/calificacion.js';
import { evaluarAplicabilidad } from '../js/domain/perfil.js';
import { REQUISITOS_BASE } from '../js/data/catalogo-base.js';

let ok = 0, fallos = 0;
export const prueba = (n, c) => { if (c) { ok++; console.log(`  ✔ ${n}`); } else { fallos++; console.log(`  ✘ ${n}`); } };
const R = (codigo, peso, extra = {}) => ({ id: codigo, codigo, campo: 'juridico', peso, severidad: 'media', ...extra });
const A = (respuesta, extra = {}) => ({ respuesta, ...extra });

console.log('Motor de calificación');
let c = calcularCampo([{ requisito: R('a', 2), respuesta: A('cumple') }, { requisito: R('b', 1), respuesta: A('parcial') }, { requisito: R('c', 1), respuesta: A('no_cumple') }]);
prueba('Ponderado: (2×100 + 1×50 + 1×0)/4 = 62,5 %', c.porcentaje === 62.5);
prueba('Cobertura 100 % sin pendientes', c.cobertura === 100 && !c.incompleto);
c = calcularCampo([{ requisito: R('a', 1), respuesta: A('cumple') }, { requisito: R('b', 3), respuesta: A('pendiente') }]);
prueba('Pendiente no cuenta como cumplimiento ni en el denominador evaluado', c.porcentaje === 100);
prueba('Pendiente reduce la cobertura (25 %) y marca resultado incompleto', c.cobertura === 25 && c.incompleto);
c = calcularCampo([{ requisito: R('a', 1), respuesta: A('cumple') }, { requisito: R('b', 1), respuesta: A('no_aplica', { justificacionNA: 'No tiene sedes', naEstado: 'aprobada' }) }]);
prueba('No aplica validado se excluye del denominador', c.porcentaje === 100 && c.cobertura === 100 && c.conteos.na_validado === 1);
c = calcularCampo([{ requisito: R('a', 1), respuesta: A('cumple') }, { requisito: R('b', 1), respuesta: A('no_aplica', { justificacionNA: 'x', naEstado: 'pendiente' }) }]);
prueba('No aplica sin validar no se excluye: reduce cobertura y marca incompleto', c.cobertura === 50 && c.incompleto && c.conteos.na_por_validar === 1);
c = calcularCampo([{ requisito: R('a', 1), respuesta: A('no_aplica', { justificacionNA: '', naEstado: 'aprobada' }) }]);
prueba('No aplica sin justificación no se valida', c.conteos.na_validado === 0);
c = calcularCampo([{ requisito: R('a', 1), respuesta: null }, { requisito: R('b', 1), respuesta: A('pendiente') }]);
prueba('Sin requisitos evaluables → Sin datos suficientes (null, no 0 % ni 100 %)', c.porcentaje === null && c.sinDatos);
c = calcularCampo([]);
prueba('Campo vacío → sin datos', c.porcentaje === null);

console.log('Alertas críticas');
const crit = R('k', 3, { severidad: 'critica' });
let al = alertasCriticas([{ requisito: crit, respuesta: A('no_cumple') }, ...Array.from({ length: 20 }, (_, i) => ({ requisito: R(`z${i}`, 5), respuesta: A('cumple') }))]);
prueba('Crítico incumplido genera alerta aunque el promedio sea alto', al.length === 1 && !al[0].bloqueaAprobacion);
al = alertasCriticas([{ requisito: crit, respuesta: null }]);
prueba('Crítico pendiente bloquea la aprobación', al[0].bloqueaAprobacion === true);
const dx = calcularDiagnostico({ items: [{ requisito: crit, respuesta: A('no_cumple') }, { requisito: R('m', 50), respuesta: A('cumple') }], campos: ['juridico', 'sst'] });
prueba('Promedio simple usa solo campos con datos', dx.promedioSimple === dx.porCampo.juridico.porcentaje && dx.porCampo.sst.sinDatos);

console.log('Calificación Resolución 0312 de 2019');
const sst = REQUISITOS_BASE.filter((r) => r.ref0312 && /^\d/.test(r.ref0312));
prueba('60 ítems del art. 16 suman 100', sst.length === 60 && Math.abs(sst.reduce((a, r) => a + r.peso, 0) - 100) < 1e-9);
let items = sst.map((r) => ({ requisito: r, respuesta: A(r.ref0312.startsWith('5') ? 'no_cumple' : 'cumple') }));
let q = calificacion0312(items, 'art16');
prueba('Sin plan de emergencias ni brigada: 90 % → Aceptable', q.porcentaje === 90 && q.valoracion.etiqueta === 'Aceptable');
items = sst.map((r) => ({ requisito: r, respuesta: A(r.ref0312.startsWith('4') ? 'parcial' : 'cumple') }));
q = calificacion0312(items, 'art16');
prueba('Parcial cuenta como no cumple en la 0312 (70 % → Moderadamente aceptable)', q.porcentaje === 70 && q.valoracion.etiqueta === 'Moderadamente aceptable');
items = sst.map((r) => ({ requisito: r, respuesta: A(r.ref0312.startsWith('1') ? 'cumple' : 'no_cumple') }));
prueba('10 % → Crítico', calificacion0312(items, 'art16').valoracion.etiqueta === 'Crítico');
items = sst.map((r) => ({ requisito: r, respuesta: A(r.ref0312 === '1.1.5' ? 'no_aplica' : 'cumple', { justificacionNA: 'Sin alto riesgo', naEstado: 'aprobada' }) }));
prueba('No aplica validado recibe el valor del ítem (100 %)', calificacion0312(items, 'art16').porcentaje === 100);

console.log('Aplicabilidad');
const emp = (o = {}) => ({ trabajadores: 25, contratistas: 0, claseRiesgo: 'II', tipoPersona: 'juridica', perfil: {}, ...o });
const r19 = REQUISITOS_BASE.find((r) => r.codigo === 'SST-1.1.5');
prueba('Ítem 1.1.5 no aplica al grupo de 21 estándares', evaluarAplicabilidad(r19.aplicabilidad, { empresa: emp(), grupo0312: 'art9' }).aplica === false);
prueba('Ítem 1.1.5 aplica al grupo de 60 estándares', evaluarAplicabilidad(r19.aplicabilidad, { empresa: emp(), grupo0312: 'art16' }).aplica === true);
const amb9 = REQUISITOS_BASE.find((r) => r.codigo === 'AMB-09');
prueba('Permiso de vertimientos: condición sin determinar → por confirmar (null), no se excluye', evaluarAplicabilidad(amb9.aplicabilidad, { empresa: emp(), grupo0312: 'art9' }).aplica === null);
prueba('Permiso de vertimientos: perfil "no" → no aplica', evaluarAplicabilidad(amb9.aplicabilidad, { empresa: emp({ perfil: { vierteCuerpoAguaSuelo: 'no' } }), grupo0312: 'art9' }).aplica === false);
const jur7 = REQUISITOS_BASE.find((r) => r.codigo === 'JUR-07');
prueba('Reglamento interno: 5 trabajadores → no aplica', evaluarAplicabilidad(jur7.aplicabilidad, { empresa: emp({ trabajadores: 5 }) }).aplica === false);
const jur17 = REQUISITOS_BASE.find((r) => r.codigo === 'JUR-17');
prueba('RNBD aplica si es entidad pública aunque activos sea "no"', evaluarAplicabilidad(jur17.aplicabilidad, { empresa: emp({ perfil: { activosMayor100kUVT: 'no', entidadPublica: 'si' } }) }).aplica === true);
prueba('RNBD no aplica si ambas condiciones son "no"', evaluarAplicabilidad(jur17.aplicabilidad, { empresa: emp({ perfil: { activosMayor100kUVT: 'no', entidadPublica: 'no' } }) }).aplica === false);

console.log('Riesgo y hallazgos');
prueba('Crítica × alta = Muy alto', nivelRiesgo('critica', 'alta').etiqueta === 'Muy alto');
prueba('Baja × baja = Bajo', nivelRiesgo('baja', 'baja').etiqueta === 'Bajo');
const h = derivarHallazgos([{ requisito: R('a', 1), respuesta: A('no_cumple') }, { requisito: R('b', 1), respuesta: A('cumple') }, { requisito: R('c', 1), respuesta: null }]);
prueba('Hallazgos: incumplimiento y pendiente; no incluye cumplidos', h.length === 2 && h[0].tipo === 'incumplimiento' && h[1].tipo === 'pendiente_verificacion');

console.log('Catálogo');
const cods = new Set(REQUISITOS_BASE.map((r) => r.codigo));
prueba('Códigos únicos', cods.size === REQUISITOS_BASE.length);
prueba('Toda obligación legal cita una norma', REQUISITOS_BASE.filter((r) => r.naturaleza === 'legal').every((r) => r.norma));
prueba('Todo requisito "verificado" tiene enlace o nota', REQUISITOS_BASE.filter((r) => r.vigencia === 'verificada').every((r) => r.enlace || r.notaVerificacion));
prueba('ISO 9001 se clasifica como estándar voluntario', REQUISITOS_BASE.filter((r) => r.campo === 'calidad').every((r) => r.naturaleza === 'voluntaria'));

console.log(`\n${ok} pruebas superadas, ${fallos} fallidas.`);
process.exitCode = fallos ? 1 : 0;

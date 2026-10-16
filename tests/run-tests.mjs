// Pruebas unitarias de la lógica de dominio (sin navegador).  Ejecutar:  node tests/run-tests.mjs
import { calcularDV, analizarNIT, validarEmail, validarCIIU } from '../js/domain/validadores.js';
import { grupoEstandaresMinimos, instanciaParticipacion, coherenciaSedes } from '../js/domain/reglas-empresa.js';
import { puede, puedeVerEmpresa } from '../js/domain/permisos.js';

let ok = 0, fallos = 0;
const prueba = (nombre, cond) => { if (cond) { ok++; console.log(`  ✔ ${nombre}`); } else { fallos++; console.log(`  ✘ ${nombre}`); } };

console.log('NIT y dígito de verificación (NIT públicos conocidos)');
prueba('Bancolombia 890903938 → DV 8', calcularDV('890903938') === 8);
prueba('DIAN 800197268 → DV 4', calcularDV('800197268') === 4);
prueba('Ecopetrol 899999068 → DV 1', calcularDV('899999068') === 1);
prueba('Acepta formato con puntos y guion', analizarNIT('890.903.938-8').valido === true);
prueba('Rechaza DV incorrecto', analizarNIT('890903938-3').valido === false);
prueba('Sin DV: lo calcula', analizarNIT('890903938').dv === 8);
prueba('Rechaza letras', analizarNIT('89A903938').valido === false);
prueba('Rechaza vacío', analizarNIT('').valido === false);

console.log('Validadores de contacto');
prueba('Correo válido', validarEmail('gerencia@empresa.com.co'));
prueba('Correo inválido', !validarEmail('gerencia@empresa'));
prueba('CIIU 4 dígitos', validarCIIU('4111') && !validarCIIU('411'));

console.log('Resolución 0312 de 2019 — grupo de estándares');
prueba('5 trab. riesgo I → art. 3 (7)', grupoEstandaresMinimos(5, 'I').estandares === 7);
prueba('10 trab. riesgo III → art. 3', grupoEstandaresMinimos(10, 'III').aplica === 'art3');
prueba('11 trab. riesgo II → art. 9 (21)', grupoEstandaresMinimos(11, 'II').estandares === 21);
prueba('50 trab. riesgo III → art. 9', grupoEstandaresMinimos(50, 'III').aplica === 'art9');
prueba('51 trab. riesgo I → art. 16 (60)', grupoEstandaresMinimos(51, 'I').estandares === 60);
prueba('3 trab. riesgo IV → art. 16', grupoEstandaresMinimos(3, 'IV').aplica === 'art16');
prueba('Agropecuaria 8 trab. riesgo I → art. 7', grupoEstandaresMinimos(8, 'I', true).aplica === 'art7');
prueba('Agropecuaria 8 trab. riesgo V → art. 16', grupoEstandaresMinimos(8, 'V', true).aplica === 'art16');
prueba('Sin clase de riesgo → sin datos suficientes (no asume)', grupoEstandaresMinimos(20, '').aplica === null);

console.log('Participación en SST');
prueba('9 trabajadores → Vigía', instanciaParticipacion(9).tipo === 'vigia');
prueba('10 trabajadores → COPASST', instanciaParticipacion(10).tipo === 'copasst');
prueba('Sedes incoherentes generan advertencia', coherenciaSedes({ trabajadores: 10, sedes: [{ trabajadores: 4 }, { trabajadores: 3 }] }) !== null);
prueba('Sedes coherentes sin advertencia', coherenciaSedes({ trabajadores: 7, sedes: [{ trabajadores: 4 }, { trabajadores: 3 }] }) === null);

console.log('Permisos y aislamiento entre empresas');
const admin = { id: 'a', rol: 'administrador', estado: 'activo' };
const asesor = { id: 's', rol: 'asesor', estado: 'activo' };
const cliente = { id: 'c', rol: 'cliente', estado: 'activo', empresaId: 'e1' };
const e1 = { id: 'e1', asesorId: 's', estado: 'activa' }, e2 = { id: 'e2', asesorId: 'x', estado: 'activa' };
prueba('Administrador administra empresas', puede(admin, 'empresas.administrar'));
prueba('Asesor NO administra empresas', !puede(asesor, 'empresas.administrar'));
prueba('Asesor NO administra usuarios', !puede(asesor, 'usuarios.administrar'));
prueba('Asesor ve su empresa asignada', puedeVerEmpresa(asesor, e1));
prueba('Asesor NO ve empresa de otro asesor', !puedeVerEmpresa(asesor, e2));
prueba('Cliente ve solo su empresa', puedeVerEmpresa(cliente, e1) && !puedeVerEmpresa(cliente, e2));
prueba('Asesor NO ve empresa eliminada', !puedeVerEmpresa(asesor, { ...e1, estado: 'eliminada' }));
prueba('Usuario suspendido sin permisos', !puede({ ...admin, estado: 'suspendido' }, 'dashboard.ver'));

console.log(`\n${ok} pruebas superadas, ${fallos} fallidas.`);
process.exit(fallos ? 1 : 0);

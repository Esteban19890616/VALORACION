/**
 * Catálogo normativo vivo: versiones publicadas e inmutables, borradores editables por el administrador.
 * Cada diagnóstico guarda el identificador de la versión que usó; publicar una versión nueva NO altera
 * diagnósticos anteriores (se ofrece análisis de impacto y nueva revisión).
 */
import { datos } from '../core/persistence/index.js';
import { sesion } from '../core/session.js';
import { registrar } from '../core/audit.js';
import { uid, ahora, normalizarTexto } from '../core/utils.js';
import { exigir } from '../domain/permisos.js';
import { REQUISITOS_BASE, VERSION_BASE, FECHA_CORTE, CAMPOS } from '../data/catalogo-base.js';
import { PARAMETROS_DEFECTO } from '../domain/calificacion.js';

const yo = () => sesion.usuario();
const idReq = (catalogoId, codigo) => `${catalogoId}:${codigo}`;
export const CAMPOS_CATALOGO = CAMPOS;
export const VIGENCIAS = { verificada: 'Verificada', pendiente_validacion: 'Pendiente de validación normativa', sin_norma: 'Sin norma (buena práctica)', derogada: 'Derogada' };
export const NATURALEZAS = { legal: 'Obligación legal', contractual: 'Obligación contractual', voluntaria: 'Estándar voluntario', recomendacion: 'Recomendación profesional' };
export const SEVERIDADES_TXT = { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja' };

/** Primer arranque: instala el catálogo base como versión publicada. Idempotente. */
export async function asegurarCatalogo() {
  const existentes = await datos.listar('catalogos');
  if (existentes.length) return existentes.find((c) => c.estado === 'publicado') || null;
  const cat = { id: uid(), version: VERSION_BASE, estado: 'publicado', fechaCorte: FECHA_CORTE, publicadoEn: ahora(), publicadoPor: 'sistema',
    notas: 'Catálogo base de Ser Integral. Requisitos marcados como "pendiente de validación" deben cotejarse con el texto oficial.', base: true, creadoEn: ahora() };
  await datos.lote([{ tipo: 'guardar', store: 'catalogos', valor: cat },
    ...REQUISITOS_BASE.map((r) => ({ tipo: 'guardar', store: 'requisitos', valor: { ...r, id: idReq(cat.id, r.codigo), catalogoId: cat.id, catalogoVersion: cat.version } }))]);
  await registrar({ accion: 'crear', entidad: 'catalogos', entidadId: cat.id, motivo: `Instalación del catálogo base ${VERSION_BASE} (${REQUISITOS_BASE.length} requisitos)`, usuario: yo() || { id: 'sistema', nombre: 'Sistema', rol: '—' } });
  return cat;
}

export async function listarCatalogos() { return (await datos.listar('catalogos')).sort((a, b) => (b.creadoEn || '').localeCompare(a.creadoEn || '')); }
export async function catalogoVigente() { return (await datos.listar('catalogos')).find((c) => c.estado === 'publicado') || null; }
export async function borradorActual() { return (await datos.listar('catalogos')).find((c) => c.estado === 'borrador') || null; }
export async function obtenerCatalogo(id) { return datos.obtener('catalogos', id); }

export async function listarRequisitos(catalogoId, { campo = '', categoria = '', vigencia = '', texto = '', incluirRetirados = false } = {}) {
  const q = normalizarTexto(texto);
  return (await datos.porIndice('requisitos', 'catalogoId', catalogoId))
    .filter((r) => incluirRetirados || r.estado !== 'retirado')
    .filter((r) => !campo || r.campo === campo)
    .filter((r) => !categoria || r.categoria === categoria)
    .filter((r) => !vigencia || r.vigencia === vigencia)
    .filter((r) => !q || normalizarTexto(`${r.codigo} ${r.pregunta} ${r.norma} ${r.disposicion} ${r.categoria}`).includes(q))
    .sort(ordenRequisitos);
}

const ORDEN_CAMPO = { juridico: 1, sst: 2, calidad: 3, ambiental: 4 };
export function ordenRequisitos(a, b) {
  return (ORDEN_CAMPO[a.campo] - ORDEN_CAMPO[b.campo]) || a.codigo.localeCompare(b.codigo, 'es', { numeric: true });
}

export async function crearBorrador({ version, notas }) {
  exigir(yo(), 'catalogo.administrar');
  if (await borradorActual()) throw new Error('Ya existe un borrador. Publíquelo o descártelo antes de crear otro.');
  const base = await catalogoVigente();
  if (!base) throw new Error('No hay catálogo publicado.');
  if (!version?.trim()) throw new Error('Indique el número de la nueva versión (por ejemplo, 2026.11).');
  if ((await datos.listar('catalogos')).some((c) => c.version === version.trim())) throw new Error('Ese número de versión ya existe.');
  const cat = { id: uid(), version: version.trim(), estado: 'borrador', fechaCorte: new Date().toISOString().slice(0, 10), basadoEn: base.id, notas: notas?.trim() || '', creadoEn: ahora(), creadoPor: yo().id };
  const reqs = await datos.porIndice('requisitos', 'catalogoId', base.id);
  await datos.lote([{ tipo: 'guardar', store: 'catalogos', valor: cat },
    ...reqs.map((r) => ({ tipo: 'guardar', store: 'requisitos', valor: { ...r, id: idReq(cat.id, r.codigo), catalogoId: cat.id, catalogoVersion: cat.version } }))]);
  await registrar({ accion: 'crear', entidad: 'catalogos', entidadId: cat.id, motivo: `Borrador ${cat.version} basado en ${base.version}` });
  return cat;
}

export function validarRequisito(r) {
  const e = {};
  if (!/^[A-Z]{2,4}-[A-Za-z0-9.]+$/.test(r.codigo || '')) e.codigo = 'Código con el formato CAMPO-número (ej. SST-C07, JUR-25).';
  if (!CAMPOS[r.campo]) e.campo = 'Seleccione el campo.';
  if (!r.categoria?.trim()) e.categoria = 'Indique la categoría.';
  if (!r.pregunta?.trim()) e.pregunta = 'Escriba la pregunta verificable.';
  if (!(Number(r.peso) > 0)) e.peso = 'El peso debe ser mayor que cero.';
  if (!SEVERIDADES_TXT[r.severidad]) e.severidad = 'Seleccione la severidad.';
  if (!NATURALEZAS[r.naturaleza]) e.naturaleza = 'Seleccione la naturaleza.';
  if (!VIGENCIAS[r.vigencia]) e.vigencia = 'Seleccione el estado de verificación.';
  if (r.naturaleza === 'legal' && !r.norma?.trim()) e.norma = 'Una obligación legal debe citar la norma.';
  if (r.vigencia === 'verificada' && r.naturaleza !== 'recomendacion' && !r.enlace?.trim() && !r.notaVerificacion?.trim()) e.enlace = 'Para marcarla como verificada, registre el enlace a la fuente o la nota de verificación.';
  if (r.enlace && !/^https?:\/\//.test(r.enlace)) e.enlace = 'El enlace debe iniciar con http:// o https://';
  return e;
}

export async function guardarRequisito(catalogoId, datosReq, codigoOriginal = null) {
  exigir(yo(), 'catalogo.administrar');
  const cat = await obtenerCatalogo(catalogoId);
  if (cat?.estado !== 'borrador') throw new Error('Solo se pueden editar requisitos de un borrador. Cree un borrador primero.');
  const r = { ...datosReq, codigo: datosReq.codigo?.trim().toUpperCase(), peso: Number(datosReq.peso), fechaRevision: datosReq.fechaRevision || new Date().toISOString().slice(0, 10) };
  const errores = validarRequisito(r);
  if (Object.keys(errores).length) { const x = new Error('Revise los campos marcados.'); x.campos = errores; throw x; }
  if (codigoOriginal && codigoOriginal !== r.codigo) throw new Error('El código no se puede cambiar; retire el requisito y cree uno nuevo.');
  const id = idReq(catalogoId, r.codigo);
  const antes = await datos.obtener('requisitos', id);
  if (!codigoOriginal && antes) { const x = new Error('Ya existe un requisito con ese código en el borrador.'); x.campos = { codigo: 'Código repetido.' }; throw x; }
  const despues = { ...(antes || {}), ...r, id, catalogoId, catalogoVersion: cat.version, estado: antes?.estado || 'vigente', actualizadoEn: ahora(), actualizadoPor: yo().id };
  await datos.guardar('requisitos', despues);
  await registrar({ accion: antes ? 'modificar' : 'crear', entidad: 'requisitos', entidadId: id, antes, despues, motivo: `Borrador ${cat.version}` });
  return despues;
}

export async function cambiarEstadoRequisito(catalogoId, codigo, estado, motivo) {
  exigir(yo(), 'catalogo.administrar');
  const cat = await obtenerCatalogo(catalogoId);
  if (cat?.estado !== 'borrador') throw new Error('Solo se modifican requisitos de un borrador.');
  if (!motivo?.trim()) throw new Error('Indique el motivo.');
  const antes = await datos.obtener('requisitos', idReq(catalogoId, codigo));
  const despues = { ...antes, estado, actualizadoEn: ahora(), actualizadoPor: yo().id };
  await datos.guardar('requisitos', despues);
  await registrar({ accion: estado === 'retirado' ? 'eliminar_logico' : 'restaurar', entidad: 'requisitos', entidadId: antes.id, antes, despues, motivo });
}

export async function publicarBorrador(motivo) {
  exigir(yo(), 'catalogo.administrar');
  const b = await borradorActual();
  if (!b) throw new Error('No hay borrador para publicar.');
  if (!motivo?.trim()) throw new Error('Describa los cambios de esta versión.');
  const reqs = await datos.porIndice('requisitos', 'catalogoId', b.id);
  const invalidos = reqs.filter((r) => r.estado !== 'retirado' && Object.keys(validarRequisito(r)).length);
  if (invalidos.length) throw new Error(`Hay ${invalidos.length} requisito(s) incompletos: ${invalidos.slice(0, 5).map((r) => r.codigo).join(', ')}.`);
  const actual = await catalogoVigente();
  const ops = [{ tipo: 'guardar', store: 'catalogos', valor: { ...b, estado: 'publicado', publicadoEn: ahora(), publicadoPor: yo().id, notasPublicacion: motivo } }];
  if (actual) ops.push({ tipo: 'guardar', store: 'catalogos', valor: { ...actual, estado: 'reemplazado', reemplazadoPor: b.id, reemplazadoEn: ahora() } });
  await datos.lote(ops);
  await registrar({ accion: 'modificar', entidad: 'catalogos', entidadId: b.id, motivo: `Publicación de la versión ${b.version}: ${motivo}` });
}

export async function descartarBorrador(motivo) {
  exigir(yo(), 'catalogo.administrar');
  const b = await borradorActual();
  if (!b) return;
  if (!motivo?.trim()) throw new Error('Indique el motivo.');
  const reqs = await datos.porIndice('requisitos', 'catalogoId', b.id);
  await datos.lote([{ tipo: 'eliminar', store: 'catalogos', id: b.id }, ...reqs.map((r) => ({ tipo: 'eliminar', store: 'requisitos', id: r.id }))]);
  await registrar({ accion: 'eliminar_logico', entidad: 'catalogos', entidadId: b.id, motivo: `Borrador ${b.version} descartado: ${motivo}` });
}

/* ---------- Comparación de versiones (análisis de impacto) ---------- */
const CAMPOS_SUSTANCIALES = ['pregunta', 'criterio', 'naturaleza', 'norma', 'disposicion', 'peso', 'severidad', 'aplicabilidad', 'vigencia', 'estado'];
const huella = (r) => JSON.stringify(CAMPOS_SUSTANCIALES.map((k) => r[k] ?? null));

export async function compararCatalogos(origenId, destinoId) {
  const a = new Map((await datos.porIndice('requisitos', 'catalogoId', origenId)).map((r) => [r.codigo, r]));
  const b = new Map((await datos.porIndice('requisitos', 'catalogoId', destinoId)).map((r) => [r.codigo, r]));
  const modificados = [], nuevos = [], retirados = [];
  for (const [cod, rb] of b) {
    const ra = a.get(cod);
    if (!ra) { if (rb.estado !== 'retirado') nuevos.push(rb); }
    else if (rb.estado === 'retirado' && ra.estado !== 'retirado') retirados.push(ra);
    else if (huella(ra) !== huella(rb)) modificados.push({ antes: ra, despues: rb, campos: CAMPOS_SUSTANCIALES.filter((k) => JSON.stringify(ra[k] ?? null) !== JSON.stringify(rb[k] ?? null)) });
  }
  for (const [cod, ra] of a) if (!b.has(cod)) retirados.push(ra);
  return { modificados, nuevos, retirados, sinCambios: !modificados.length && !nuevos.length && !retirados.length };
}

/* ---------- Parámetros de calificación ---------- */
export async function obtenerParametros() {
  return (await datos.obtener('meta', 'parametrosCalificacion'))?.valor || structuredClone(PARAMETROS_DEFECTO);
}

export async function guardarParametros(p, motivo) {
  exigir(yo(), 'catalogo.administrar');
  const { cumple, parcial, no_cumple: no } = p.puntajes;
  if (!(cumple === 100 && no === 0 && parcial > 0 && parcial < 100)) throw new Error('Cumple debe valer 100, No cumple 0 y Parcial un valor entre 1 y 99.');
  const r = [...p.rangos].sort((x, y) => x.desde - y.desde);
  if (r[0].desde !== 0 || r[r.length - 1].hasta < 100) throw new Error('Los rangos deben cubrir de 0 a 100.');
  for (let i = 1; i < r.length; i++) if (Math.abs(r[i].desde - r[i - 1].hasta) > 0.011) throw new Error('Los rangos no pueden tener vacíos ni traslapes.');
  if (!motivo?.trim()) throw new Error('Indique el motivo del cambio.');
  const antes = await obtenerParametros();
  await datos.guardar('meta', { clave: 'parametrosCalificacion', valor: { puntajes: p.puntajes, rangos: r } });
  await registrar({ accion: 'modificar', entidad: 'parametros', entidadId: 'parametrosCalificacion', antes, despues: { puntajes: p.puntajes, rangos: r }, motivo });
}

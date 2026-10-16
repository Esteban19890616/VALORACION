/**
 * Diagnóstico empresarial integral: creación, lista de chequeo, evidencias, flujo de revisión y aprobación.
 * Toda regla de negocio vive aquí o en js/domain/; las vistas solo llaman a estas funciones.
 */
import { APP } from '../core/config.js';
import { datos } from '../core/persistence/index.js';
import { sesion } from '../core/session.js';
import { registrar } from '../core/audit.js';
import { uid, ahora } from '../core/utils.js';
import { exigir, puede, puedeVerEmpresa, ErrorPermiso } from '../domain/permisos.js';
import { grupoEstandaresMinimos } from '../domain/reglas-empresa.js';
import { evaluarAplicabilidad } from '../domain/perfil.js';
import { calcularDiagnostico, calificacion0312, derivarHallazgos, estadoEfectivo, nivelRiesgo } from '../domain/calificacion.js';
import { catalogoVigente, obtenerCatalogo, compararCatalogos, obtenerParametros, ordenRequisitos } from './catalogo.service.js';

const yo = () => sesion.usuario();
export const ESTADOS_DX = {
  borrador: 'Borrador', en_ejecucion: 'En ejecución', pendiente_revision: 'Pendiente de revisión',
  devuelto: 'Devuelto para ajustes', aprobado: 'Aprobado', cerrado: 'Cerrado',
};
export const TONO_DX = { borrador: 'neutro', en_ejecucion: 'info', pendiente_revision: 'aviso', devuelto: 'critico', aprobado: 'ok', cerrado: 'neutro' };
const EDITABLES = ['borrador', 'en_ejecucion', 'devuelto'];
export const CAMPOS_ORDEN = ['juridico', 'sst', 'calidad', 'ambiental'];

async function empresaVisible(empresaId) {
  const e = await datos.obtener('empresas', empresaId);
  if (!e || !puedeVerEmpresa(yo(), e)) throw new ErrorPermiso('No tiene acceso a esta empresa.');
  return e;
}

async function diagnosticoVisible(id) {
  const d = await datos.obtener('diagnosticos', id);
  if (!d) throw new Error('El diagnóstico no existe.');
  const e = await empresaVisible(d.empresaId);
  if (yo().rol === 'cliente' && !['aprobado', 'cerrado'].includes(d.estado)) throw new ErrorPermiso('El diagnóstico aún no ha sido aprobado para consulta.');
  return { d, e };
}

export const puedeEditar = (d) => EDITABLES.includes(d.estado) && puede(yo(), 'diagnosticos.diligenciar');

export async function listarDiagnosticos({ empresaId = '', estado = '' } = {}) {
  exigir(yo(), 'diagnosticos.ver');
  const empresas = new Map((await datos.listar('empresas')).filter((e) => puedeVerEmpresa(yo(), e)).map((e) => [e.id, e]));
  return (await datos.listar('diagnosticos'))
    .filter((d) => empresas.has(d.empresaId))
    .filter((d) => yo().rol !== 'cliente' || ['aprobado', 'cerrado'].includes(d.estado))
    .filter((d) => !empresaId || d.empresaId === empresaId)
    .filter((d) => !estado || d.estado === estado)
    .map((d) => ({ ...d, empresa: empresas.get(d.empresaId) }))
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

async function siguienteCodigo() {
  const anio = new Date().getFullYear();
  return `DX-${anio}-${String(await datos.siguiente(`consecutivoDx${anio}`)).padStart(4, '0')}`;
}

export async function crearDiagnostico({ empresaId, alcance, campos, sedes = [], fechaInicio }) {
  exigir(yo(), 'diagnosticos.crear');
  const e = await empresaVisible(empresaId);
  if (['archivada', 'eliminada'].includes(e.estado)) throw new Error('No se pueden crear diagnósticos para empresas archivadas o eliminadas.');
  if (!campos?.length) throw new Error('Seleccione al menos un campo a evaluar.');
  if (!alcance?.trim()) throw new Error('Describa el alcance del diagnóstico.');
  const cat = await catalogoVigente();
  if (!cat) throw new Error('No hay un catálogo normativo publicado.');
  const g = grupoEstandaresMinimos(e.trabajadores, e.claseRiesgo, e.agropecuaria);
  const d = {
    id: uid(), codigo: await siguienteCodigo(), empresaId, asesorId: e.asesorId || yo().id, creadoPor: yo().id,
    catalogoId: cat.id, catalogoVersion: cat.version, fechaCorteNormativo: cat.fechaCorte,
    perfil: { trabajadores: e.trabajadores, contratistas: e.contratistas, claseRiesgo: e.claseRiesgo, tipoPersona: e.tipoPersona, agropecuaria: !!e.agropecuaria, perfil: { ...(e.perfil || {}) } },
    grupo0312: g.aplica, campos: CAMPOS_ORDEN.filter((c) => campos.includes(c)), alcance: alcance.trim(), sedes,
    fechaInicio: fechaInicio || new Date().toISOString().slice(0, 10), fechaCierre: null,
    estado: 'borrador', version: 1, revisionDe: null, inclusionesManuales: [], madurez: {}, conclusiones: {},
    historial: [{ fecha: ahora(), usuario: yo().nombre, de: null, a: 'borrador', comentario: 'Creación' }],
    creadoEn: ahora(), actualizadoEn: ahora(),
  };
  await datos.guardar('diagnosticos', d);
  await registrar({ accion: 'crear', entidad: 'diagnosticos', entidadId: d.id, despues: d, motivo: `${d.codigo} — ${e.razonSocial}` });
  return d;
}

/** Contexto completo para la vista y los cálculos. */
export async function contextoDiagnostico(id) {
  const { d, e } = await diagnosticoVisible(id);
  const catalogo = await obtenerCatalogo(d.catalogoId);
  const reqs = (await datos.porIndice('requisitos', 'catalogoId', d.catalogoId))
    .filter((r) => r.estado !== 'retirado' && d.campos.includes(r.campo)).sort(ordenRequisitos);
  const ctx = { empresa: d.perfil, grupo0312: d.grupo0312 };
  const aplicables = []; const excluidos = [];
  for (const r of reqs) {
    const a = evaluarAplicabilidad(r.aplicabilidad, ctx);
    const forzado = d.inclusionesManuales?.includes(r.codigo);
    if (a.aplica === false && !forzado) excluidos.push({ requisito: r, motivos: a.motivos });
    else aplicables.push({ requisito: r, aplicabilidad: forzado ? { aplica: true, motivos: ['Incluido manualmente por el asesor'] } : a });
  }
  const respuestas = new Map((await datos.porIndice('respuestas', 'diagnosticoId', id)).map((r) => [r.requisitoId, r]));
  const evid = (await datos.porIndice('evidencias', 'diagnosticoId', id)).filter((x) => !x.eliminado);
  const evidencias = new Map();
  for (const x of evid) { if (!evidencias.has(x.requisitoId)) evidencias.set(x.requisitoId, []); evidencias.get(x.requisitoId).push((({ archivo, ...m }) => m)(x)); }
  const parametros = d.resultados?.parametros || await obtenerParametros();
  const items = aplicables.map((a) => ({ ...a, respuesta: respuestas.get(a.requisito.id) || null }));
  const resultados = calcularDiagnostico({ items, campos: d.campos, parametros });
  const res0312 = d.campos.includes('sst') ? calificacion0312(items.filter((i) => i.requisito.campo === 'sst'), d.grupo0312) : null;
  return { d, e, catalogo, items, excluidos, evidencias, parametros, resultados, res0312, hallazgos: derivarHallazgos(items), editable: puedeEditar(d) };
}

export async function guardarRespuesta(diagId, requisitoId, cambios) {
  exigir(yo(), 'diagnosticos.diligenciar');
  const { d } = await diagnosticoVisible(diagId);
  if (!puedeEditar(d)) throw new Error(`El diagnóstico está ${ESTADOS_DX[d.estado].toLowerCase()} y no admite cambios.`);
  const req = await datos.obtener('requisitos', requisitoId);
  if (!req || req.catalogoId !== d.catalogoId) throw new Error('El requisito no pertenece a la versión de catálogo de este diagnóstico.');
  const id = `${diagId}:${requisitoId}`;
  const antes = await datos.obtener('respuestas', id);
  const r = { id, diagnosticoId: diagId, requisitoId, codigo: req.codigo, respuesta: 'pendiente', ...(antes || {}), ...cambios, actualizadoEn: ahora(), actualizadoPor: yo().id };
  if (cambios.respuesta && cambios.respuesta !== antes?.respuesta) {
    if (cambios.respuesta === 'no_aplica') r.naEstado = 'pendiente';
    else { delete r.naEstado; }
  }
  if (r.respuesta === 'no_aplica' && 'justificacionNA' in cambios && cambios.justificacionNA !== antes?.justificacionNA && r.naEstado !== 'pendiente') r.naEstado = 'pendiente';
  await datos.guardar('respuestas', r);
  if (cambios.respuesta && cambios.respuesta !== antes?.respuesta) {
    await registrar({ accion: 'modificar', entidad: 'respuestas', entidadId: id, antes: antes && { respuesta: antes.respuesta }, despues: { respuesta: r.respuesta }, motivo: `${d.codigo} · ${req.codigo}` });
  }
  if (d.estado === 'borrador') await cambiarEstado(d, 'en_ejecucion', 'Inicio de diligenciamiento');
  return r;
}

async function cambiarEstado(d, nuevo, comentario = '', extra = {}) {
  const antes = { ...d };
  const despues = { ...d, ...extra, estado: nuevo, actualizadoEn: ahora(), historial: [...(d.historial || []), { fecha: ahora(), usuario: yo().nombre, de: d.estado, a: nuevo, comentario }] };
  await datos.guardar('diagnosticos', despues);
  await registrar({ accion: nuevo === 'aprobado' ? 'aprobar' : nuevo === 'cerrado' ? 'cerrar' : 'modificar', entidad: 'diagnosticos', entidadId: d.id, antes: { estado: antes.estado }, despues: { estado: nuevo }, motivo: `${d.codigo}: ${comentario}` });
  return despues;
}

export async function guardarCierre(diagId, { madurez, conclusiones }) {
  exigir(yo(), 'diagnosticos.diligenciar');
  const { d } = await diagnosticoVisible(diagId);
  if (!puedeEditar(d)) throw new Error('El diagnóstico no admite cambios en su estado actual.');
  const nuevo = { ...d, madurez: { ...d.madurez, ...(madurez || {}) }, conclusiones: { ...d.conclusiones, ...(conclusiones || {}) }, actualizadoEn: ahora() };
  await datos.guardar('diagnosticos', nuevo);
  return nuevo;
}

export async function incluirManualmente(diagId, codigo, motivo) {
  exigir(yo(), 'diagnosticos.diligenciar');
  const { d } = await diagnosticoVisible(diagId);
  if (!puedeEditar(d)) throw new Error('El diagnóstico no admite cambios.');
  if (!motivo?.trim()) throw new Error('Indique por qué se incluye un requisito que el perfil excluye.');
  const nuevo = { ...d, inclusionesManuales: [...new Set([...(d.inclusionesManuales || []), codigo])], actualizadoEn: ahora() };
  await datos.guardar('diagnosticos', nuevo);
  await registrar({ accion: 'modificar', entidad: 'diagnosticos', entidadId: d.id, motivo: `${d.codigo}: inclusión manual de ${codigo} — ${motivo}` });
}

/** Actualiza el perfil de aplicabilidad con los datos actuales de la empresa (solo en estados editables). */
export async function actualizarPerfil(diagId) {
  const { d, e } = await diagnosticoVisible(diagId);
  if (!puedeEditar(d)) throw new Error('El diagnóstico no admite cambios.');
  const g = grupoEstandaresMinimos(e.trabajadores, e.claseRiesgo, e.agropecuaria);
  const nuevo = { ...d, grupo0312: g.aplica, perfil: { trabajadores: e.trabajadores, contratistas: e.contratistas, claseRiesgo: e.claseRiesgo, tipoPersona: e.tipoPersona, agropecuaria: !!e.agropecuaria, perfil: { ...(e.perfil || {}) } }, actualizadoEn: ahora() };
  await datos.guardar('diagnosticos', nuevo);
  await registrar({ accion: 'modificar', entidad: 'diagnosticos', entidadId: d.id, antes: { perfil: d.perfil, grupo0312: d.grupo0312 }, despues: { perfil: nuevo.perfil, grupo0312: nuevo.grupo0312 }, motivo: `${d.codigo}: perfil de aplicabilidad actualizado` });
}

/* ------------------------- Evidencias ------------------------- */
export async function adjuntarEvidencia(diagId, requisitoId, archivo, { fechaEvidencia, descripcion }) {
  exigir(yo(), 'evidencias.adjuntar');
  const { d } = await diagnosticoVisible(diagId);
  if (!puedeEditar(d)) throw new Error('El diagnóstico no admite nuevas evidencias en su estado actual.');
  if (!archivo) throw new Error('Seleccione un archivo.');
  if (archivo.size > APP.ARCHIVO_MAX_MB * 1048576) throw new Error(`El archivo pesa ${(archivo.size / 1048576).toFixed(1)} MB; el límite es ${APP.ARCHIVO_MAX_MB} MB.`);
  if (!APP.ARCHIVO_TIPOS.includes(archivo.type)) throw new Error('Formato no admitido. Use PDF, JPG, PNG, DOCX o XLSX.');
  const req = await datos.obtener('requisitos', requisitoId);
  const ev = { id: uid(), empresaId: d.empresaId, diagnosticoId: diagId, respuestaId: `${diagId}:${requisitoId}`, requisitoId, requisitoCodigo: req.codigo,
    nombre: archivo.name, mime: archivo.type, tamano: archivo.size, archivo, fechaEvidencia: fechaEvidencia || '', descripcion: descripcion?.trim() || '',
    eliminado: false, creadoEn: ahora(), creadoPor: yo().id };
  await datos.guardar('evidencias', ev);
  await registrar({ accion: 'adjuntar', entidad: 'evidencias', entidadId: ev.id, despues: ev, motivo: `${d.codigo} · ${req.codigo}` });
  return ev;
}

export async function obtenerEvidencia(id) {
  const x = await datos.obtener('evidencias', id);
  if (!x) throw new Error('La evidencia no existe.');
  await empresaVisible(x.empresaId);
  return x;
}

export async function retirarEvidencia(id, motivo) {
  const x = await obtenerEvidencia(id);
  if (x.diagnosticoId) {
    const d = await datos.obtener('diagnosticos', x.diagnosticoId);
    if (!puedeEditar(d)) throw new Error('El diagnóstico no admite cambios.');
  }
  if (!motivo?.trim()) throw new Error('Indique el motivo.');
  const despues = { ...x, eliminado: true, eliminadoEn: ahora(), eliminadoPor: yo().id };
  await datos.guardar('evidencias', despues);
  await registrar({ accion: 'eliminar_logico', entidad: 'evidencias', entidadId: id, motivo });
}

/* ------------------------- Flujo de revisión ------------------------- */
export async function enviarARevision(diagId, comentario = '') {
  exigir(yo(), 'diagnosticos.diligenciar');
  const c = await contextoDiagnostico(diagId);
  if (!puedeEditar(c.d)) throw new Error('El diagnóstico no está en un estado que permita enviarlo a revisión.');
  const criticosPendientes = c.resultados.alertas.filter((a) => a.estado === 'pendiente');
  if (criticosPendientes.length) throw new Error(`Hay ${criticosPendientes.length} requisito(s) crítico(s) sin verificar: ${criticosPendientes.slice(0, 5).map((a) => a.codigo).join(', ')}.`);
  const sinJustificar = c.items.filter((i) => i.respuesta?.respuesta === 'no_aplica' && !i.respuesta.justificacionNA?.trim());
  if (sinJustificar.length) throw new Error(`Justifique los "No aplica": ${sinJustificar.slice(0, 5).map((i) => i.requisito.codigo).join(', ')}.`);
  return cambiarEstado(c.d, 'pendiente_revision', comentario || 'Enviado a revisión');
}

export async function resolverNoAplica(diagId, requisitoId, decision, comentario) {
  exigir(yo(), 'diagnosticos.aprobar');
  const { d } = await diagnosticoVisible(diagId);
  if (['aprobado', 'cerrado'].includes(d.estado)) throw new Error('El diagnóstico ya fue aprobado.');
  if (decision === 'rechazada' && !comentario?.trim()) throw new Error('Explique por qué rechaza la exclusión.');
  const id = `${diagId}:${requisitoId}`;
  const antes = await datos.obtener('respuestas', id);
  if (antes?.respuesta !== 'no_aplica') throw new Error('Ese requisito no está marcado como "No aplica".');
  const despues = { ...antes, naEstado: decision, naRevisadoPor: yo().id, naRevisadoEn: ahora(), comentarioRevision: comentario?.trim() || antes.comentarioRevision || '' };
  if (decision === 'rechazada') despues.respuesta = 'pendiente';
  await datos.guardar('respuestas', despues);
  await registrar({ accion: decision === 'aprobada' ? 'aprobar' : 'devolver', entidad: 'respuestas', entidadId: id, antes: { respuesta: antes.respuesta, naEstado: antes.naEstado }, despues: { respuesta: despues.respuesta, naEstado: decision }, motivo: `${d.codigo} · ${antes.codigo}: No aplica ${decision}${comentario ? ` — ${comentario}` : ''}` });
}

export async function devolver(diagId, comentario) {
  exigir(yo(), 'diagnosticos.aprobar');
  const { d } = await diagnosticoVisible(diagId);
  if (d.estado !== 'pendiente_revision') throw new Error('Solo se devuelven diagnósticos pendientes de revisión.');
  if (!comentario?.trim()) throw new Error('Indique los ajustes requeridos.');
  return cambiarEstado(d, 'devuelto', comentario);
}

export async function aprobar(diagId, comentario = '') {
  exigir(yo(), 'diagnosticos.aprobar');
  const c = await contextoDiagnostico(diagId);
  if (c.d.estado !== 'pendiente_revision') throw new Error('Solo se aprueban diagnósticos pendientes de revisión.');
  const bloqueos = c.resultados.alertas.filter((a) => a.bloqueaAprobacion);
  if (bloqueos.length) throw new Error(`No se puede aprobar: ${bloqueos.length} requisito(s) crítico(s) pendiente(s) de verificación o de validación de "No aplica" (${bloqueos.slice(0, 5).map((a) => a.codigo).join(', ')}).`);
  const naPend = c.items.filter((i) => i.respuesta?.respuesta === 'no_aplica' && i.respuesta.naEstado !== 'aprobada');
  if (naPend.length) throw new Error(`Valide o rechace los "No aplica" pendientes: ${naPend.slice(0, 5).map((i) => i.requisito.codigo).join(', ')}.`);
  const snapshot = { calculadoEn: ahora(), parametros: c.parametros, porCampo: c.resultados.porCampo, promedioSimple: c.resultados.promedioSimple,
    alertas: c.resultados.alertas, res0312: c.res0312, total: c.resultados.total, pendientes: c.resultados.pendientes };
  const hall = c.hallazgos.map((h) => ({
    id: uid(), empresaId: c.d.empresaId, diagnosticoId: c.d.id, diagnosticoCodigo: c.d.codigo, requisitoId: h.requisitoId, codigo: h.codigo, campo: h.campo, categoria: h.categoria,
    tipo: h.tipo, descripcion: h.descripcion, severidad: h.severidad, probabilidad: h.probabilidad, riesgo: nivelRiesgo(h.severidad, h.probabilidad),
    naturaleza: h.naturaleza, recomendacion: h.recomendacion, responsable: h.responsable, norma: h.norma, estado: 'abierto', creadoEn: ahora(),
  }));
  await datos.lote(hall.map((h) => ({ tipo: 'guardar', store: 'hallazgos', valor: h })));
  return cambiarEstado(c.d, 'aprobado', comentario || 'Aprobado', { resultados: snapshot, aprobadoPor: yo().id, aprobadoPorNombre: yo().nombre, aprobadoEn: ahora(), fechaCierre: new Date().toISOString().slice(0, 10) });
}

export async function cerrar(diagId, comentario) {
  exigir(yo(), 'diagnosticos.aprobar');
  const { d } = await diagnosticoVisible(diagId);
  if (d.estado !== 'aprobado') throw new Error('Solo se cierran diagnósticos aprobados.');
  return cambiarEstado(d, 'cerrado', comentario || 'Cierre');
}

/** Impacto de cambios normativos: compara la versión usada con la vigente. */
export async function analisisImpacto(diagId) {
  const { d } = await diagnosticoVisible(diagId);
  const vig = await catalogoVigente();
  if (!vig || vig.id === d.catalogoId) return { mismaVersion: true, vigente: vig };
  const cmp = await compararCatalogos(d.catalogoId, vig.id);
  const filtra = (arr, f) => arr.filter((x) => d.campos.includes(f(x).campo));
  return { mismaVersion: false, vigente: vig, modificados: filtra(cmp.modificados, (x) => x.despues), nuevos: filtra(cmp.nuevos, (x) => x), retirados: filtra(cmp.retirados, (x) => x) };
}

/** Nueva revisión con el catálogo vigente. Conserva respuestas de requisitos sin cambios sustanciales. */
export async function crearRevision(diagId, motivo) {
  exigir(yo(), 'diagnosticos.crear');
  const { d } = await diagnosticoVisible(diagId);
  if (!['aprobado', 'cerrado'].includes(d.estado)) throw new Error('Solo se crean revisiones de diagnósticos aprobados o cerrados.');
  if (!motivo?.trim()) throw new Error('Indique el motivo de la nueva revisión.');
  const vig = await catalogoVigente();
  const cmp = await compararCatalogos(d.catalogoId, vig.id);
  const cambiados = new Set([...cmp.modificados.map((m) => m.despues.codigo), ...cmp.retirados.map((r) => r.codigo)]);
  const nuevo = { ...d, id: uid(), codigo: await siguienteCodigo(), version: (d.version || 1) + 1, revisionDe: d.id, catalogoId: vig.id, catalogoVersion: vig.version,
    fechaCorteNormativo: vig.fechaCorte, estado: 'borrador', resultados: null, aprobadoPor: null, aprobadoPorNombre: null, aprobadoEn: null, fechaCierre: null,
    fechaInicio: new Date().toISOString().slice(0, 10), creadoPor: yo().id, creadoEn: ahora(), actualizadoEn: ahora(),
    historial: [{ fecha: ahora(), usuario: yo().nombre, de: null, a: 'borrador', comentario: `Revisión ${(d.version || 1) + 1} de ${d.codigo}: ${motivo}` }] };
  const previas = await datos.porIndice('respuestas', 'diagnosticoId', d.id);
  const ops = [{ tipo: 'guardar', store: 'diagnosticos', valor: nuevo }];
  let copiadas = 0;
  for (const r of previas) {
    if (cambiados.has(r.codigo)) continue;
    const reqId = `${vig.id}:${r.codigo}`;
    ops.push({ tipo: 'guardar', store: 'respuestas', valor: { ...r, id: `${nuevo.id}:${reqId}`, diagnosticoId: nuevo.id, requisitoId: reqId, copiadaDe: r.id, actualizadoEn: ahora() } });
    copiadas++;
  }
  await datos.lote(ops);
  await registrar({ accion: 'crear', entidad: 'diagnosticos', entidadId: nuevo.id, motivo: `${nuevo.codigo}: revisión de ${d.codigo} con catálogo ${vig.version}; ${copiadas} respuestas conservadas, ${cambiados.size} requisitos a reevaluar. ${motivo}` });
  return nuevo;
}

export { estadoEfectivo };

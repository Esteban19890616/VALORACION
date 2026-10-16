/** Expediente digital de empresas: reglas de negocio, permisos y trazabilidad. */
import { datos } from '../core/persistence/index.js';
import { sesion } from '../core/session.js';
import { registrar } from '../core/audit.js';
import { uid, ahora, normalizarTexto } from '../core/utils.js';
import { APP, DEPENDENCIAS_EMPRESA, ESTADOS_EMPRESA, CLASES_RIESGO } from '../core/config.js';
import { analizarNIT, validarEmail, validarTelefono, validarCIIU, enteroNoNegativo } from '../domain/validadores.js';
import { exigir, puedeVerEmpresa, ErrorPermiso } from '../domain/permisos.js';
import { coherenciaSedes } from '../domain/reglas-empresa.js';
import { CONDICIONES } from '../domain/perfil.js';

const yo = () => sesion.usuario();

export async function listarEmpresas({ texto = '', estado = 'vigentes', asesorId = '', sector = '', municipio = '' } = {}) {
  exigir(yo(), 'empresas.ver');
  const q = normalizarTexto(texto);
  const qNit = String(texto).replace(/\D/g, '');
  return (await datos.listar('empresas'))
    .filter((e) => puedeVerEmpresa(yo(), e))
    .filter((e) => {
      if (estado === 'vigentes') return !['archivada', 'eliminada'].includes(e.estado);
      if (estado && estado !== 'todas') return e.estado === estado;
      return true;
    })
    .filter((e) => !asesorId || e.asesorId === asesorId)
    .filter((e) => !sector || e.sector === sector)
    .filter((e) => !municipio || normalizarTexto(e.municipio) === normalizarTexto(municipio))
    .filter((e) => !q || normalizarTexto(e.razonSocial).includes(q) || normalizarTexto(e.nombreComercial).includes(q)
      || normalizarTexto(e.codigo).includes(q) || (qNit.length >= 3 && e.nit.includes(qNit)))
    .sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es'));
}

export async function obtenerEmpresa(id) {
  const e = await datos.obtener('empresas', id);
  if (!e) throw new Error('La empresa no existe.');
  if (!puedeVerEmpresa(yo(), e)) throw new ErrorPermiso('No tiene acceso a esta empresa.');
  return e;
}

/** Valida y normaliza. Devuelve {empresa, errores, advertencias}. */
export function validarEmpresa(d) {
  const errores = {}; const advertencias = [];
  if (!d.razonSocial?.trim()) errores.razonSocial = 'La razón social es obligatoria.';
  const nit = analizarNIT(d.nit);
  if (!nit.valido) errores.nit = nit.error;
  if (d.ciiu && !validarCIIU(d.ciiu)) errores.ciiu = 'El código CIIU debe tener 4 dígitos (CIIU Rev. 4 A.C.).';
  if (!enteroNoNegativo(d.trabajadores)) errores.trabajadores = 'Ingrese el número de trabajadores (entero, 0 o más).';
  if (d.contratistas !== '' && d.contratistas != null && !enteroNoNegativo(d.contratistas)) errores.contratistas = 'Debe ser un número entero.';
  if (d.claseRiesgo && !CLASES_RIESGO.includes(d.claseRiesgo)) errores.claseRiesgo = 'Clase de riesgo no válida.';
  if (d.email && !validarEmail(d.email)) errores.email = 'Correo no válido.';
  if (d.telefono && !validarTelefono(d.telefono)) errores.telefono = 'El teléfono debe tener entre 7 y 13 dígitos.';
  if (!d.municipio?.trim()) errores.municipio = 'Indique el municipio.';
  if (d.estado && !ESTADOS_EMPRESA[d.estado]) errores.estado = 'Estado no válido.';
  const empresa = {
    razonSocial: d.razonSocial?.trim() || '', nombreComercial: d.nombreComercial?.trim() || '',
    nit: nit.base || String(d.nit || '').replace(/\D/g, ''), dv: nit.dv ?? null, nitFormato: nit.formato || '',
    tipoPersona: d.tipoPersona || 'juridica', actividadEconomica: d.actividadEconomica?.trim() || '', ciiu: d.ciiu?.trim() || '',
    sector: d.sector || '', representanteLegal: d.representanteLegal?.trim() || '',
    trabajadores: Number(d.trabajadores) || 0, contratistas: d.contratistas === '' || d.contratistas == null ? null : Number(d.contratistas),
    claseRiesgo: d.claseRiesgo || '', arl: d.arl?.trim() || '', agropecuaria: !!d.agropecuaria,
    departamento: d.departamento?.trim() || '', municipio: d.municipio?.trim() || '', direccion: d.direccion?.trim() || '',
    contactoNombre: d.contactoNombre?.trim() || '', contactoCargo: d.contactoCargo?.trim() || '',
    email: d.email?.trim().toLowerCase() || '', telefono: d.telefono?.trim() || '',
    sedes: (d.sedes || []).filter((s) => s.nombre?.trim()).map((s) => ({ id: s.id || uid(), nombre: s.nombre.trim(), municipio: s.municipio?.trim() || '', direccion: s.direccion?.trim() || '', trabajadores: Number(s.trabajadores) || 0 })),
    infoLegal: d.infoLegal?.trim() || '', fechaVinculacion: d.fechaVinculacion || '', estado: d.estado || 'activa',
    asesorId: d.asesorId || null, observaciones: d.observaciones?.trim() || '', horasContratadasMes: Number(d.horasContratadasMes) || 0,
    perfil: Object.fromEntries(CONDICIONES.map((c) => [c.clave, ['si', 'no'].includes(d.perfil?.[c.clave]) ? d.perfil[c.clave] : ''])),
  };
  const c = coherenciaSedes(empresa); if (c) advertencias.push(c);
  if (empresa.estado === 'activa' && !empresa.asesorId) advertencias.push('La empresa está activa y no tiene asesor responsable asignado.');
  if (empresa.trabajadores > 0 && !empresa.claseRiesgo) advertencias.push('Sin clase de riesgo no es posible orientar el grupo de Estándares Mínimos del SG-SST.');
  const sinDeterminar = Object.values(empresa.perfil).filter((v) => !v).length;
  if (sinDeterminar) advertencias.push(`Perfil de aplicabilidad: ${sinDeterminar} condición(es) sin determinar. Los requisitos asociados se evaluarán como "por confirmar".`);
  return { empresa, errores, advertencias };
}

async function nitEnUso(nit, exceptoId = null) {
  return (await datos.porIndice('empresas', 'nit', nit)).find((e) => e.id !== exceptoId) || null;
}

/** Código interno consecutivo (atómico). Salta códigos ya usados, por ejemplo tras restaurar un respaldo. */
async function siguienteCodigo() {
  for (let i = 0; i < 1000; i++) {
    const codigo = `EMP-${String(await datos.siguiente('consecutivoEmpresa')).padStart(4, '0')}`;
    if (!(await datos.porIndice('empresas', 'codigo', codigo)).length) return codigo;
  }
  throw new Error('No fue posible asignar un código interno.');
}

export async function crearEmpresa(d, { demo = false } = {}) {
  exigir(yo(), 'empresas.administrar');
  const { empresa, errores, advertencias } = validarEmpresa(d);
  if (Object.keys(errores).length) { const e = new Error('Revise los campos marcados.'); e.campos = errores; throw e; }
  const dup = await nitEnUso(empresa.nit);
  if (dup) {
    const e = new Error(dup.estado === 'eliminada'
      ? `El NIT ${dup.nitFormato} pertenece a una empresa eliminada (${dup.codigo}). Restáurela en lugar de crear un duplicado.`
      : `Ya existe una empresa con el NIT ${dup.nitFormato}: ${dup.razonSocial} (${dup.codigo}).`);
    e.campos = { nit: 'NIT duplicado.' }; e.duplicadoId = dup.id; throw e;
  }
  const reg = { id: uid(), codigo: await siguienteCodigo(), ...empresa, demo, creadoEn: ahora(), creadoPor: yo().id, actualizadoEn: ahora(), actualizadoPor: yo().id, version: 1 };
  await datos.guardar('empresas', reg);
  await registrar({ accion: demo ? 'demo_cargar' : 'crear', entidad: 'empresas', entidadId: reg.id, despues: reg });
  return { empresa: reg, advertencias };
}

export async function actualizarEmpresa(id, d, motivo = '') {
  exigir(yo(), 'empresas.administrar');
  const antes = await obtenerEmpresa(id);
  if (antes.estado === 'eliminada') throw new Error('Restaure la empresa antes de editarla.');
  const { empresa, errores, advertencias } = validarEmpresa({ ...antes, ...d });
  if (Object.keys(errores).length) { const e = new Error('Revise los campos marcados.'); e.campos = errores; throw e; }
  const dup = await nitEnUso(empresa.nit, id);
  if (dup) { const e = new Error(`El NIT ya está registrado para ${dup.razonSocial} (${dup.codigo}).`); e.campos = { nit: 'NIT duplicado.' }; throw e; }
  if (antes.nit !== empresa.nit && !motivo.trim()) { const e = new Error('Cambiar el NIT requiere indicar el motivo.'); e.campos = { motivo: 'Obligatorio al cambiar el NIT.' }; throw e; }
  const despues = { ...antes, ...empresa, actualizadoEn: ahora(), actualizadoPor: yo().id, version: (antes.version || 1) + 1 };
  await datos.guardar('empresas', despues);
  await registrar({ accion: antes.asesorId !== despues.asesorId ? 'asignar' : 'modificar', entidad: 'empresas', entidadId: id, antes, despues, motivo });
  return { empresa: despues, advertencias };
}

/** Cuenta registros relacionados en cada almacén dependiente. */
export async function dependencias(id) {
  const out = {};
  for (const s of DEPENDENCIAS_EMPRESA) out[s] = await datos.contarPorIndice(s, 'empresaId', id);
  out.usuariosCliente = (await datos.porIndice('usuarios', 'rol', 'cliente')).filter((u) => u.empresaId === id).length;
  out.total = Object.values(out).reduce((a, b) => a + b, 0);
  return out;
}

async function cambiarEstado(id, nuevo, accion, motivo) {
  exigir(yo(), 'empresas.administrar');
  if (!motivo?.trim()) throw new Error('Indique el motivo; queda registrado en la bitácora.');
  const antes = await datos.obtener('empresas', id);
  if (!antes) throw new Error('La empresa no existe.');
  const despues = { ...antes, estado: nuevo, estadoAnterior: antes.estado, actualizadoEn: ahora(), actualizadoPor: yo().id, version: (antes.version || 1) + 1 };
  if (nuevo === 'eliminada') { despues.eliminadaEn = ahora(); despues.eliminadaPor = yo().id; }
  if (nuevo === 'archivada') { despues.archivadaEn = ahora(); }
  await datos.guardar('empresas', despues);
  await registrar({ accion, entidad: 'empresas', entidadId: id, antes, despues, motivo });
  return despues;
}

export const archivarEmpresa = (id, motivo) => cambiarEstado(id, 'archivada', 'archivar', motivo);

/**
 * Eliminación SIEMPRE lógica: el expediente y sus registros relacionados se conservan
 * y pueden restaurarse. La depuración física solo se hará en servidor, conforme a la
 * política de retención documental que defina la consultora.
 */
export const eliminarEmpresa = (id, motivo) => cambiarEstado(id, 'eliminada', 'eliminar_logico', motivo);

export async function restaurarEmpresa(id, motivo) {
  const e = await datos.obtener('empresas', id);
  const destino = e?.estadoAnterior && !['archivada', 'eliminada'].includes(e.estadoAnterior) ? e.estadoAnterior : 'activa';
  const dup = (await datos.porIndice('empresas', 'nit', e.nit)).find((x) => x.id !== id && x.estado !== 'eliminada');
  if (dup) throw new Error(`No se puede restaurar: el NIT está en uso por ${dup.razonSocial} (${dup.codigo}).`);
  return cambiarEstado(id, destino, 'restaurar', motivo);
}

export async function historialEmpresa(id) {
  await obtenerEmpresa(id);
  return (await datos.porIndice('auditoria', 'entidad', 'empresas')).filter((a) => a.entidadId === id).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/* ---------- Documentos asociados ---------- */

export async function listarDocumentos(empresaId) {
  await obtenerEmpresa(empresaId);
  return (await datos.porIndice('documentos', 'empresaId', empresaId)).filter((d) => !d.eliminado).map(({ archivo, ...m }) => m)
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

export async function adjuntarDocumento(empresaId, archivo, { tipoDocumental, fechaDocumento, descripcion }) {
  exigir(yo(), 'empresas.documentos');
  await obtenerEmpresa(empresaId);
  if (!archivo) throw new Error('Seleccione un archivo.');
  if (archivo.size > APP.ARCHIVO_MAX_MB * 1048576) throw new Error(`El archivo pesa ${(archivo.size / 1048576).toFixed(1)} MB. El límite del prototipo local es ${APP.ARCHIVO_MAX_MB} MB.`);
  if (!APP.ARCHIVO_TIPOS.includes(archivo.type)) throw new Error('Formato no admitido. Use PDF, JPG, PNG, DOCX o XLSX.');
  if (!tipoDocumental?.trim()) throw new Error('Indique el tipo documental (por ejemplo, Certificado de existencia y representación legal).');
  const doc = { id: uid(), empresaId, nombre: archivo.name, mime: archivo.type, tamano: archivo.size, tipoDocumental: tipoDocumental.trim(),
    fechaDocumento: fechaDocumento || '', descripcion: descripcion?.trim() || '', archivo, eliminado: false, creadoEn: ahora(), creadoPor: yo().id };
  await datos.guardar('documentos', doc);
  await registrar({ accion: 'adjuntar', entidad: 'documentos', entidadId: doc.id, despues: doc, motivo: `Empresa ${empresaId}` });
  return doc;
}

export async function descargarDocumento(id) {
  const d = await datos.obtener('documentos', id);
  await obtenerEmpresa(d.empresaId);
  return d;
}

export async function retirarDocumento(id, motivo) {
  exigir(yo(), 'empresas.administrar');
  if (!motivo?.trim()) throw new Error('Indique el motivo.');
  const antes = await datos.obtener('documentos', id);
  const despues = { ...antes, eliminado: true, eliminadoEn: ahora(), eliminadoPor: yo().id };
  await datos.guardar('documentos', despues);
  await registrar({ accion: 'eliminar_logico', entidad: 'documentos', entidadId: id, antes, despues, motivo });
}

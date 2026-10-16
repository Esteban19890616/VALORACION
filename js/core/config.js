/**
 * SER INTEGRAL 360 — Configuración central.
 * La persistencia la define js/entorno.js (local: IndexedDB) o api/entorno.php (servidor: PHP + MySQL).
 */
const ENTORNO = globalThis.SI360_ENTORNO || null;
export const ENTORNO_VALIDO = !!ENTORNO && ['indexeddb', 'api'].includes(ENTORNO.persistencia);

export const APP = Object.freeze({
  nombre: 'SER INTEGRAL 360',
  propietario: 'Ser Integral Consultora S.A.S.',
  version: '1.0.0',
  fase: ENTORNO?.persistencia === 'api' ? 'Servidor PHP + MySQL' : 'Prototipo local (navegador)',
  PERSISTENCIA: ENTORNO?.persistencia || 'indexeddb', // 'indexeddb' | 'api'
  API_BASE: ENTORNO?.apiBase || 'api/v1',
  DB_NOMBRE: 'serintegral360',
  DB_VERSION: 3,
  SESION_INACTIVIDAD_MIN: 30,
  INTENTOS_MAX: 5,
  BLOQUEO_MIN: 5,
  ARCHIVO_MAX_MB: 5,
  ARCHIVO_TIPOS: ['application/pdf', 'image/jpeg', 'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
});

/**
 * Definición de almacenes (tablas). Se crean todas desde la versión 1
 * para no forzar migraciones del navegador al avanzar de fase.
 * Cada almacén corresponde a una tabla MySQL en database/schema.sql.
 */
export const STORES = Object.freeze({
  usuarios:     { keyPath: 'id', indexes: [['email', 'email', { unique: true }], ['rol', 'rol']] },
  empresas:     { keyPath: 'id', indexes: [['nit', 'nit'], ['codigo', 'codigo', { unique: true }], ['estado', 'estado'], ['asesorId', 'asesorId']] },
  documentos:   { keyPath: 'id', indexes: [['empresaId', 'empresaId']] },
  requisitos:   { keyPath: 'id', indexes: [['codigo', 'codigo'], ['campo', 'campo'], ['catalogoVersion', 'catalogoVersion'], ['catalogoId', 'catalogoId']] },
  catalogos:    { keyPath: 'id', indexes: [['estado', 'estado']] },
  diagnosticos: { keyPath: 'id', indexes: [['empresaId', 'empresaId'], ['estado', 'estado'], ['asesorId', 'asesorId']] },
  respuestas:   { keyPath: 'id', indexes: [['diagnosticoId', 'diagnosticoId']] },
  evidencias:   { keyPath: 'id', indexes: [['empresaId', 'empresaId'], ['diagnosticoId', 'diagnosticoId'], ['respuestaId', 'respuestaId'], ['actividadId', 'actividadId']] },
  hallazgos:    { keyPath: 'id', indexes: [['empresaId', 'empresaId'], ['diagnosticoId', 'diagnosticoId'], ['estado', 'estado']] },
  planes:       { keyPath: 'id', indexes: [['empresaId', 'empresaId'], ['estado', 'estado']] },
  actividades:  { keyPath: 'id', indexes: [['empresaId', 'empresaId'], ['planId', 'planId'], ['hallazgoId', 'hallazgoId']] },
  horas:        { keyPath: 'id', indexes: [['empresaId', 'empresaId'], ['actividadId', 'actividadId'], ['usuarioId', 'usuarioId']] },
  informes:     { keyPath: 'id', indexes: [['empresaId', 'empresaId'], ['tipo', 'tipo']] },
  borradores:   { keyPath: 'clave' },
  auditoria:    { keyPath: 'id', indexes: [['fecha', 'fecha'], ['entidad', 'entidad'], ['usuarioId', 'usuarioId']] },
  meta:         { keyPath: 'clave' },
});

/** Almacenes que dependen de una empresa (para verificar antes de eliminar). */
export const DEPENDENCIAS_EMPRESA = ['documentos', 'diagnosticos', 'evidencias', 'hallazgos', 'planes', 'actividades', 'horas'];

export const ROLES = Object.freeze({
  administrador: 'Administrador',
  asesor: 'Asesor',
  cliente: 'Cliente de consulta',
});

export const ESTADOS_EMPRESA = Object.freeze({
  prospecto: 'Prospecto',
  activa: 'Activa',
  suspendida: 'Suspendida',
  finalizada: 'Contrato finalizado',
  archivada: 'Archivada',
  eliminada: 'Eliminada (lógica)',
});

export const SECTORES = ['Agropecuario', 'Comercio', 'Construcción', 'Educación', 'Energía y minas', 'Financiero',
  'Industria manufacturera', 'Salud', 'Sector público', 'Servicios', 'Tecnología', 'Transporte y logística', 'Otro'];

export const CLASES_RIESGO = ['I', 'II', 'III', 'IV', 'V'];

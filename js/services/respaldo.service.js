/**
 * Exportación e importación de respaldos.
 * Formato documentado en docs/MODELO_DATOS.md (sección "Formato de respaldo").
 * La importación valida TODO antes de tocar los datos y reemplaza en una sola
 * transacción: si algo falla, la información existente queda intacta.
 */
import { APP, STORES } from '../core/config.js';
import { datos } from '../core/persistence/index.js';
import { sesion } from '../core/session.js';
import { registrar } from '../core/audit.js';
import { ahora, sha256, blobABase64, base64ABlob } from '../core/utils.js';
import { exigir } from '../domain/permisos.js';

export const FORMATO = 'SI360-RESPALDO';
export const VERSION_FORMATO = 1;
const EXCLUIR = ['borradores']; // borradores son temporales del navegador
const CON_ARCHIVO = ['documentos', 'evidencias']; // los adjuntos (Blob) se guardan en base64

export async function generarRespaldo() {
  exigir(sesion.usuario(), 'respaldos.administrar');
  if (APP.PERSISTENCIA === 'api') {
    const blob = await datos.exportarRespaldo();
    await registrar({ accion: 'exportar', entidad: 'sistema', motivo: 'Respaldo completo descargado desde el servidor' });
    return blob;
  }
  const contenido = {};
  for (const s of Object.keys(STORES)) {
    if (EXCLUIR.includes(s)) continue;
    let filas = await datos.listar(s);
    if (CON_ARCHIVO.includes(s)) {
      filas = await Promise.all(filas.map(async (d) => ({ ...d, archivo: d.archivo instanceof Blob ? { base64: await blobABase64(d.archivo), mime: d.mime || d.archivo.type } : null })));
    }
    contenido[s] = filas;
  }
  const cuerpo = JSON.stringify(contenido);
  const paquete = {
    formato: FORMATO, versionFormato: VERSION_FORMATO, app: APP.nombre, versionApp: APP.version,
    generado: ahora(), generadoPor: { id: sesion.usuario().id, nombre: sesion.usuario().nombre },
    conteos: Object.fromEntries(Object.entries(contenido).map(([k, v]) => [k, v.length])),
    integridad: { algoritmo: 'SHA-256', hash: await sha256(cuerpo) },
    advertencia: 'Contiene datos personales y hashes de contraseñas. Custódielo conforme a la Ley 1581 de 2012.',
    datos: contenido,
  };
  await registrar({ accion: 'exportar', entidad: 'sistema', motivo: `Respaldo completo (${Object.values(paquete.conteos).reduce((a, b) => a + b, 0)} registros)` });
  return new Blob([JSON.stringify(paquete)], { type: 'application/json' });
}

/** Analiza el archivo sin modificar nada. Devuelve {valido, errores, advertencias, conteos, paquete}. */
export async function analizarRespaldo(archivo) {
  exigir(sesion.usuario(), 'respaldos.administrar');
  const errores = []; const advertencias = [];
  let paquete;
  try { paquete = JSON.parse(await archivo.text()); } catch { return { valido: false, errores: ['El archivo no es un JSON válido o está dañado.'] }; }
  if (paquete?.formato !== FORMATO) errores.push('El archivo no es un respaldo de SER INTEGRAL 360.');
  if (paquete?.versionFormato > VERSION_FORMATO) errores.push(`El respaldo usa una versión de formato más reciente (${paquete.versionFormato}). Actualice la aplicación.`);
  if (!paquete?.datos || typeof paquete.datos !== 'object') errores.push('El respaldo no contiene la sección de datos.');
  if (errores.length) return { valido: false, errores };

  const hash = await sha256(JSON.stringify(paquete.datos));
  if (hash !== paquete.integridad?.hash) errores.push('La huella de integridad no coincide: el archivo fue modificado o está incompleto.');

  for (const [s, filas] of Object.entries(paquete.datos)) {
    if (!STORES[s]) { advertencias.push(`Se ignorará la sección desconocida "${s}".`); continue; }
    if (!Array.isArray(filas)) { errores.push(`La sección "${s}" no es una lista.`); continue; }
    const clave = STORES[s].keyPath; const vistos = new Set();
    filas.forEach((f, i) => {
      if (!f || f[clave] == null) errores.push(`${s}[${i}] no tiene identificador.`);
      else if (vistos.has(f[clave])) errores.push(`${s}: identificador repetido ${f[clave]}.`);
      else vistos.add(f[clave]);
    });
  }
  const usuarios = paquete.datos.usuarios || []; const empresas = paquete.datos.empresas || [];
  if (!usuarios.some((u) => u.rol === 'administrador' && u.estado === 'activo')) errores.push('El respaldo no tiene un administrador activo; restaurarlo le impediría ingresar.');
  const idsU = new Set(usuarios.map((u) => u.id)); const idsE = new Set(empresas.map((e) => e.id));
  const nits = new Map();
  empresas.forEach((e) => {
    if (e.asesorId && !idsU.has(e.asesorId)) advertencias.push(`La empresa ${e.codigo} referencia un asesor inexistente.`);
    if (e.estado !== 'eliminada') { if (nits.has(e.nit)) errores.push(`NIT duplicado en el respaldo: ${e.nit}.`); nits.set(e.nit, true); }
  });
  for (const s of ['documentos', 'diagnosticos', 'planes', 'actividades']) {
    (paquete.datos[s] || []).forEach((r) => { if (r.empresaId && !idsE.has(r.empresaId)) errores.push(`${s} ${r.id} referencia una empresa inexistente.`); });
  }
  return { valido: errores.length === 0, errores: errores.slice(0, 30), totalErrores: errores.length, advertencias, conteos: paquete.conteos, generado: paquete.generado, generadoPor: paquete.generadoPor?.nombre, paquete };
}

/** Reemplaza todo el contenido en UNA transacción. Requiere análisis válido previo. */
export async function restaurarRespaldo(analisis, motivo) {
  exigir(sesion.usuario(), 'respaldos.administrar');
  if (!analisis?.valido) throw new Error('El respaldo no superó la validación; no se modificó ningún dato.');
  if (!motivo?.trim()) throw new Error('Indique el motivo de la restauración.');
  if (APP.PERSISTENCIA === 'api') { await datos.importarRespaldo(analisis.paquete, motivo); return; }
  const ops = [];
  for (const s of Object.keys(STORES)) {
    if (EXCLUIR.includes(s) || !analisis.paquete.datos[s]) continue;
    ops.push({ tipo: 'limpiar', store: s });
    for (let f of analisis.paquete.datos[s]) {
      if (CON_ARCHIVO.includes(s)) f = { ...f, archivo: f.archivo?.base64 ? base64ABlob(f.archivo.base64, f.archivo.mime) : null };
      ops.push({ tipo: 'guardar', store: s, valor: f });
    }
  }
  await datos.lote(ops);
  await registrar({ accion: 'importar', entidad: 'sistema', motivo: `${motivo} — respaldo generado ${analisis.generado} por ${analisis.generadoPor || '—'}` });
}

/** Consulta de la bitácora (administrador: global; asesor: sus propias acciones). */
import { datos } from '../core/persistence/index.js';
import { sesion } from '../core/session.js';
import { puede, ErrorPermiso } from '../domain/permisos.js';
import { normalizarTexto, sha256 } from '../core/utils.js';
import { APP } from '../core/config.js';
import { verificarCadena } from '../domain/integridad.js';
import { registrar } from '../core/audit.js';

export async function consultarBitacora({ texto = '', entidad = '', accion = '', desde = '', hasta = '' } = {}) {
  const u = sesion.usuario();
  let filas;
  if (puede(u, 'auditoria.global')) filas = await datos.listar('auditoria');
  else if (puede(u, 'auditoria.propia')) filas = await datos.porIndice('auditoria', 'usuarioId', u.id);
  else throw new ErrorPermiso();
  const q = normalizarTexto(texto);
  return filas
    .filter((f) => !entidad || f.entidad === entidad)
    .filter((f) => !accion || f.accion === accion)
    .filter((f) => !desde || f.fecha >= desde)
    .filter((f) => !hasta || f.fecha <= `${hasta}T23:59:59.999Z`)
    .filter((f) => !q || normalizarTexto(`${f.usuarioNombre} ${f.motivo} ${f.entidadId} ${f.despues?.razonSocial || ''} ${f.antes?.razonSocial || ''}`).includes(q))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Verifica la cadena de huellas de la bitácora (administrador). */
export async function verificarIntegridad() {
  const u = sesion.usuario();
  if (!puede(u, 'auditoria.global')) throw new ErrorPermiso();
  const r = APP.PERSISTENCIA === 'api' ? await datos.verificarBitacora() : await verificarCadena(await datos.listar('auditoria'), sha256);
  await registrar({ accion: 'verificar', entidad: 'sistema', motivo: `Verificación de integridad de la bitácora: ${r.integra ? 'íntegra' : `${r.problemas.length} problema(s)`} · ${r.encadenadas} entradas encadenadas` , resultado: r.integra ? 'exitoso' : 'alerta' });
  return r;
}

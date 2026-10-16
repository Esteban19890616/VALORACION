/**
 * Bitácora de auditoría. Cada operación relevante deja: usuario, fecha,
 * acción, entidad, identificador, valores anteriores/nuevos, motivo y resultado.
 * Local: cada entrada se encadena con huellas SHA-256 (js/domain/integridad.js), lo que hace
 * evidente cualquier modificación o eliminación. Servidor: la API sella la identidad, la fecha
 * y la cadena; la tabla es de solo inserción.
 */
import { APP } from './config.js';
import { datos } from './persistence/index.js';
import { sesion } from './session.js';
import { uid, ahora, diferencias, sha256 } from './utils.js';
import { calcularHuella, GENESIS } from '../domain/integridad.js';

export const ACCIONES = {
  crear: 'Creación', modificar: 'Modificación', archivar: 'Archivo', restaurar: 'Restauración',
  eliminar_logico: 'Eliminación lógica', suspender: 'Suspensión', activar: 'Activación',
  ingreso: 'Inicio de sesión', ingreso_fallido: 'Intento de acceso fallido', salida: 'Cierre de sesión',
  exportar: 'Exportación', importar: 'Importación', asignar: 'Asignación', adjuntar: 'Adjunto de documento',
  demo_cargar: 'Carga de datos de demostración', demo_retirar: 'Retiro de datos de demostración',
  aprobar: 'Aprobación', devolver: 'Devolución', cerrar: 'Cierre', registrar_horas: 'Registro de horas',
  verificar: 'Verificación de integridad', cambio_contrasena: 'Cambio de contraseña',
};

export async function registrar({ accion, entidad, entidadId = null, antes = null, despues = null, motivo = '', resultado = 'exitoso', usuario = null }) {
  const u = usuario || sesion.usuario();
  const entrada = {
    id: uid(), fecha: ahora(), usuarioId: u?.id ?? 'sistema', usuarioNombre: u?.nombre ?? 'Sistema',
    usuarioRol: u?.rol ?? '—', accion, entidad, entidadId,
    cambios: diferencias(limpiar(antes), limpiar(despues)),
    antes: limpiar(antes), despues: limpiar(despues), motivo, resultado,
  };
  try {
    if (APP.PERSISTENCIA === 'api') await datos.guardar('auditoria', entrada);
    else await encadenarYGuardar(entrada);
  } catch (e) { console.error('No se pudo registrar en bitácora', e); }
  return entrada;
}

/* Serializa la escritura de la cadena: Web Locks (entre pestañas) o cola en memoria. */
let cola = Promise.resolve();
function exclusivo(fn) {
  if (globalThis.navigator?.locks?.request) return navigator.locks.request('si360-bitacora', fn);
  const p = cola.then(fn, fn); cola = p.catch(() => {}); return p;
}

async function encadenarYGuardar(entrada) {
  return exclusivo(async () => {
    const cab = (await datos.obtener('meta', 'cadenaBitacora'))?.valor || { secuencia: 0, huella: GENESIS };
    entrada.secuencia = cab.secuencia + 1;
    entrada.huellaAnterior = cab.huella;
    entrada.huella = await calcularHuella(cab.huella, entrada, sha256);
    await datos.lote([
      { tipo: 'guardar', store: 'auditoria', valor: entrada },
      { tipo: 'guardar', store: 'meta', valor: { clave: 'cadenaBitacora', valor: { secuencia: entrada.secuencia, huella: entrada.huella } } },
    ]);
  });
}

/** Nunca registrar hashes de contraseña ni binarios en la bitácora. */
function limpiar(o) {
  if (!o || typeof o !== 'object') return o;
  const { credencial, archivo, ...resto } = o;
  return resto;
}

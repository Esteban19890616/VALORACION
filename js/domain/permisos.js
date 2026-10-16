/**
 * Matriz de permisos por rol (principio de mínimo privilegio).
 * Los servicios verifican estos permisos ANTES de leer o escribir; la interfaz
 * solo oculta botones como ayuda visual. En producción, el backend PHP aplica
 * esta misma matriz y es la única barrera confiable.
 */
export const PERMISOS = Object.freeze({
  administrador: ['*'],
  asesor: [
    'dashboard.ver', 'empresas.ver', 'empresas.documentos', 'catalogo.ver',
    'diagnosticos.ver', 'diagnosticos.crear', 'diagnosticos.diligenciar', 'evidencias.adjuntar',
    'planes.ver', 'planes.generar', 'horas.registrar', 'informes.generar', 'auditoria.propia',
  ],
  cliente: ['dashboard.ver', 'empresas.ver', 'diagnosticos.ver', 'diagnosticos.ver_aprobados', 'planes.ver', 'planes.ver_aprobados', 'informes.descargar_autorizados'],
});

export function puede(usuario, permiso) {
  if (!usuario || usuario.estado !== 'activo') return false;
  const p = PERMISOS[usuario.rol] || [];
  return p.includes('*') || p.includes(permiso);
}

/** Alcance de datos: qué empresas puede ver cada usuario. */
export function puedeVerEmpresa(usuario, empresa) {
  if (!usuario || !empresa) return false;
  if (usuario.rol === 'administrador') return true;
  if (empresa.estado === 'eliminada') return false;
  if (usuario.rol === 'asesor') return empresa.asesorId === usuario.id;
  if (usuario.rol === 'cliente') return empresa.id === usuario.empresaId;
  return false;
}

export class ErrorPermiso extends Error {
  constructor(msg = 'No tiene permiso para realizar esta operación.') { super(msg); this.name = 'ErrorPermiso'; }
}

export function exigir(usuario, permiso) { if (!puede(usuario, permiso)) throw new ErrorPermiso(); }

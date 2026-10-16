/**
 * Generación de informes PDF con registro de trazabilidad: código, tipo, parámetros, versión,
 * fecha, autor, número de páginas y huella SHA-256 del archivo generado.
 * Los informes se pueden regenerar con los mismos parámetros (queda como una versión nueva).
 */
import { datos } from '../core/persistence/index.js';
import { sesion } from '../core/session.js';
import { registrar } from '../core/audit.js';
import { uid, ahora } from '../core/utils.js';
import { puede, puedeVerEmpresa, ErrorPermiso } from '../domain/permisos.js';
import { contextoDiagnostico } from './diagnosticos.service.js';
import { contextoPlan } from './planes.service.js';
import { informeDiagnostico } from '../reports/informe-diagnostico.js';
import { informePlanMensual, informePlanAnual, informeHoras, informeAvance } from '../reports/informe-plan.js';
import { informeComparativo } from '../reports/informe-comparativo.js';
import { etiquetaMes } from '../domain/planificacion.js';

const yo = () => sesion.usuario();

export const TIPOS_INFORME = {
  diagnostico_integral: { nombre: 'Diagnóstico integral', grupo: 'Diagnóstico', requiere: ['diagnosticoId'], sigla: 'DXI' },
  diagnostico_juridico: { nombre: 'Diagnóstico jurídico', grupo: 'Diagnóstico', requiere: ['diagnosticoId'], campo: 'juridico', sigla: 'DXJ' },
  diagnostico_sst: { nombre: 'Diagnóstico SST', grupo: 'Diagnóstico', requiere: ['diagnosticoId'], campo: 'sst', sigla: 'DXS' },
  diagnostico_calidad: { nombre: 'Diagnóstico de calidad', grupo: 'Diagnóstico', requiere: ['diagnosticoId'], campo: 'calidad', sigla: 'DXC' },
  diagnostico_ambiental: { nombre: 'Diagnóstico ambiental', grupo: 'Diagnóstico', requiere: ['diagnosticoId'], campo: 'ambiental', sigla: 'DXA' },
  plan_mensual: { nombre: 'Plan de trabajo mensual', grupo: 'Plan', requiere: ['empresaId', 'mes'], sigla: 'PLM' },
  plan_anual: { nombre: 'Plan anual', grupo: 'Plan', requiere: ['empresaId'], sigla: 'PLA' },
  horas: { nombre: 'Seguimiento de horas', grupo: 'Plan', requiere: ['empresaId', 'desde', 'hasta'], sigla: 'HRS' },
  avance: { nombre: 'Informe de avance', grupo: 'Plan', requiere: ['empresaId'], sigla: 'AVN' },
  comparativo: { nombre: 'Comparativo entre evaluaciones', grupo: 'Diagnóstico', requiere: ['diagnosticoA', 'diagnosticoB'], sigla: 'CMP' },
};

async function siguienteCodigo(sigla) {
  const anio = new Date().getFullYear();
  return `SI360-${sigla}-${anio}-${String(await datos.siguiente(`consecutivoInf${anio}`)).padStart(4, '0')}`;
}

async function huella(blob) {
  const buf = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const aDataURL = (blob) => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => fail(r.error); r.readAsDataURL(blob); });

function exigirPermiso(estadoFuenteAprobada) {
  const u = yo();
  if (puede(u, 'informes.generar')) return;
  if (puede(u, 'informes.descargar_autorizados') && estadoFuenteAprobada) return;
  throw new ErrorPermiso('Su rol solo permite descargar informes de diagnósticos y planes aprobados.');
}

async function datosAsesor(id) {
  const u = id ? await datos.obtener('usuarios', id) : null;
  return u ? { nombre: u.nombre, cargo: u.cargo, email: u.email } : null;
}

async function planOpcional(empresaId) { try { return await contextoPlan(empresaId); } catch { return null; } }

/** Construye el PDF. Devuelve { blob, empresa, objetoId, estadoFuente, nombre }. */
async function construir(tipo, p, codigo) {
  const t = TIPOS_INFORME[tipo];
  if (!t) throw new Error('Tipo de informe no válido.');
  for (const r of t.requiere) if (!p[r]) throw new Error('Faltan parámetros para generar el informe.');
  const generadoPor = yo().nombre;
  if (tipo.startsWith('diagnostico_')) {
    const c = await contextoDiagnostico(p.diagnosticoId);
    const aprobado = ['aprobado', 'cerrado'].includes(c.d.estado);
    exigirPermiso(aprobado);
    if (t.campo && !c.d.campos.includes(t.campo)) throw new Error(`El diagnóstico ${c.d.codigo} no evaluó el campo seleccionado.`);
    const imagenes = [];
    for (const [reqId, arr] of c.evidencias) for (const x of arr) {
      if (!/^image\/(png|jpeg)$/.test(x.mime) || imagenes.length >= 4) continue;
      const req = c.items.find((i) => i.requisito.id === reqId)?.requisito;
      if (t.campo && req?.campo !== t.campo) continue;
      const full = await datos.obtener('evidencias', x.id);
      imagenes.push({ nombre: x.nombre, requisito: req?.codigo || '', dataURL: await aDataURL(full.archivo) });
    }
    const r = await informeDiagnostico(c, { campo: t.campo || null, codigo, generadoPor, plan: await planOpcional(c.e.id), asesor: await datosAsesor(c.d.asesorId), imagenes });
    return { ...r, empresa: c.e, objetoId: c.d.id, objeto: c.d.codigo, estadoFuente: aprobado ? 'aprobado' : 'preliminar' };
  }
  if (tipo === 'comparativo') {
    if (p.diagnosticoA === p.diagnosticoB) throw new Error('Seleccione dos diagnósticos distintos.');
    let a = await contextoDiagnostico(p.diagnosticoA); let b = await contextoDiagnostico(p.diagnosticoB);
    if (a.e.id !== b.e.id) throw new Error('Los diagnósticos deben ser de la misma empresa.');
    if (![a, b].every((x) => ['aprobado', 'cerrado'].includes(x.d.estado) && x.d.resultados)) throw new Error('El comparativo solo usa diagnósticos aprobados.');
    exigirPermiso(true);
    if (a.d.aprobadoEn > b.d.aprobadoEn) [a, b] = [b, a];
    const historial = (await datos.porIndice('diagnosticos', 'empresaId', a.e.id)).filter((d) => d.resultados && ['aprobado', 'cerrado'].includes(d.estado)).sort((x, y) => x.aprobadoEn.localeCompare(y.aprobadoEn))
      .map((d) => ({ codigo: d.codigo, aprobadoEn: d.aprobadoEn, promedio: d.resultados.promedioSimple, porCampo: d.resultados.porCampo }));
    const r = await informeComparativo(a, b, { codigo, generadoPor, historial });
    return { ...r, empresa: b.e, objetoId: `${a.d.id}|${b.d.id}`, objeto: `${a.d.codigo} vs ${b.d.codigo}`, estadoFuente: 'aprobado' };
  }
  const c = await contextoPlan(p.empresaId);
  const aprobado = c.plan?.estado === 'aprobado';
  exigirPermiso(aprobado);
  const o = { codigo, generadoPor, ...p };
  const r = tipo === 'plan_mensual' ? await informePlanMensual(c, o) : tipo === 'plan_anual' ? await informePlanAnual(c, o) : tipo === 'horas' ? await informeHoras(c, o) : await informeAvance(c, o);
  const objeto = tipo === 'plan_mensual' ? etiquetaMes(p.mes) : tipo === 'horas' ? `${p.desde} a ${p.hasta}` : `Plan v${c.plan.version}`;
  return { ...r, empresa: c.e, objetoId: `${c.plan.id}${p.mes ? `|${p.mes}` : ''}${p.desde ? `|${p.desde}|${p.hasta}` : ''}`, objeto, estadoFuente: aprobado ? 'aprobado' : 'preliminar' };
}

export async function generarInforme(tipo, parametros, { regeneradoDe = null } = {}) {
  const t = TIPOS_INFORME[tipo];
  const codigo = await siguienteCodigo(t?.sigla || 'INF');
  const r = await construir(tipo, parametros, codigo);
  const previos = (await datos.porIndice('informes', 'tipo', tipo)).filter((x) => x.objetoId === r.objetoId);
  const registro = {
    id: uid(), codigo, tipo, nombre: t.nombre, empresaId: r.empresa.id, empresaNombre: r.empresa.razonSocial, objetoId: r.objetoId, objeto: r.objeto,
    parametros, version: previos.length + 1, regeneradoDe, estadoFuente: r.estadoFuente, demo: !!r.empresa.demo,
    paginas: r.paginas, tamano: r.blob.size, sha256: await huella(r.blob), generadoEn: ahora(), generadoPor: yo().id, generadoPorNombre: yo().nombre,
  };
  await datos.guardar('informes', registro);
  await registrar({ accion: 'exportar', entidad: 'informes', entidadId: registro.id, despues: registro, motivo: `${codigo} · ${t.nombre} · ${r.empresa.razonSocial} · ${r.objeto} (v${registro.version})` });
  const archivo = `${codigo}_${t.nombre.replace(/[^A-Za-z0-9áéíóúñÁÉÍÓÚÑ]+/g, '_')}.pdf`;
  return { blob: r.blob, archivo, registro };
}

export async function regenerarInforme(id) {
  const x = await datos.obtener('informes', id);
  if (!x) throw new Error('El registro del informe no existe.');
  const e = await datos.obtener('empresas', x.empresaId);
  if (!puedeVerEmpresa(yo(), e)) throw new ErrorPermiso();
  return generarInforme(x.tipo, x.parametros, { regeneradoDe: x.codigo });
}

export async function listarInformes({ empresaId = '' } = {}) {
  const empresas = new Map((await datos.listar('empresas')).filter((e) => puedeVerEmpresa(yo(), e)).map((e) => [e.id, e]));
  return (await datos.listar('informes')).filter((x) => empresas.has(x.empresaId) && (!empresaId || x.empresaId === empresaId))
    .filter((x) => yo().rol !== 'cliente' || x.estadoFuente === 'aprobado')
    .sort((a, b) => b.generadoEn.localeCompare(a.generadoEn));
}

/** Verifica un PDF descargado contra la huella registrada. */
export async function verificarArchivo(file) {
  const h = await huella(file);
  const x = (await datos.listar('informes')).find((r) => r.sha256 === h);
  return x ? { valido: true, registro: x } : { valido: false };
}

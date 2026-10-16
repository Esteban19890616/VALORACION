/**
 * Indicadores del tablero general, calculados con datos reales.
 * - Cumplimiento: se usa el ÚLTIMO diagnóstico aprobado o cerrado de cada empresa.
 * - Promedio simple: cada empresa pesa igual. Promedio ponderado: cada empresa pesa según su número de
 *   trabajadores (exposición). Se muestran ambos y rotulados para no inducir conclusiones equivocadas.
 */
import { datos } from '../core/persistence/index.js';
import { sesion } from '../core/session.js';
import { listarEmpresas } from './empresas.service.js';
import { vencida } from '../domain/planificacion.js';
import { CAMPOS_P } from '../domain/priorizacion.js';

const contar = (arr, fn) => arr.reduce((m, x) => { const k = fn(x) || 'Sin dato'; m[k] = (m[k] || 0) + 1; return m; }, {});
const r1 = (n) => Math.round(n * 10) / 10;

export async function indicadoresGenerales(filtros = {}) {
  const empresas = await listarEmpresas({ ...filtros, estado: 'vigentes' });
  const ids = new Set(empresas.map((e) => e.id));
  const emp = new Map(empresas.map((e) => [e.id, e]));
  const diags = (await datos.listar('diagnosticos')).filter((d) => ids.has(d.empresaId));
  const aprobados = diags.filter((d) => ['aprobado', 'cerrado'].includes(d.estado) && d.resultados)
    .filter((d) => (!filtros.desde || d.aprobadoEn >= filtros.desde) && (!filtros.hasta || d.aprobadoEn <= `${filtros.hasta}T23:59:59`));
  const ultimo = new Map();
  for (const d of aprobados.sort((a, b) => a.aprobadoEn.localeCompare(b.aprobadoEn))) ultimo.set(d.empresaId, d);
  const ult = [...ultimo.values()].filter((d) => d.resultados.promedioSimple != null);

  const promedioSimple = ult.length ? r1(ult.reduce((a, d) => a + d.resultados.promedioSimple, 0) / ult.length) : null;
  const pesoTotal = ult.reduce((a, d) => a + Math.max(1, emp.get(d.empresaId).trabajadores || 0), 0);
  const promedioPonderado = ult.length ? r1(ult.reduce((a, d) => a + d.resultados.promedioSimple * Math.max(1, emp.get(d.empresaId).trabajadores || 0), 0) / pesoTotal) : null;
  const porCampo = Object.fromEntries(CAMPOS_P.map((c) => {
    const vals = ult.map((d) => d.resultados.porCampo?.[c]?.porcentaje).filter((v) => v != null);
    return [c, vals.length ? { promedio: r1(vals.reduce((a, b) => a + b, 0) / vals.length), n: vals.length } : null];
  }));

  const usuarios = sesion.usuario().rol === 'administrador' ? await datos.listar('usuarios') : [];
  const asesores = new Map(usuarios.filter((u) => u.rol === 'asesor').map((u) => [u.id, u.nombre]));
  const planes = (await datos.listar('planes')).filter((p) => ids.has(p.empresaId) && p.estado !== 'reemplazado');
  const planIds = new Set(planes.map((p) => p.id));
  const actividades = (await datos.listar('actividades')).filter((a) => planIds.has(a.planId));
  const registros = (await datos.listar('horas')).filter((r) => ids.has(r.empresaId) && !r.anulado);
  const mes = new Date().toISOString().slice(0, 7);
  const hoy = new Date().toISOString().slice(0, 10);
  const en14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const programadasMes = actividades.filter((a) => a.mesProgramado === mes && a.estado !== 'cancelada').reduce((s, a) => s + (Number(a.horasProgramadas) || 0), 0);
  const ejecutadasMes = registros.filter((r) => r.fecha.startsWith(mes)).reduce((s, r) => s + r.horas, 0);

  // Evolución: promedio mensual de los diagnósticos aprobados en cada mes
  const porMes = {};
  for (const d of aprobados) { const m = d.aprobadoEn.slice(0, 7); (porMes[m] ||= []).push(d.resultados.promedioSimple); }
  const evolucion = Object.keys(porMes).sort().map((m) => ({ mes: m, promedio: r1(porMes[m].filter((v) => v != null).reduce((a, b) => a + b, 0) / (porMes[m].filter((v) => v != null).length || 1)), n: porMes[m].length }));

  return {
    totalEmpresas: empresas.length,
    activas: empresas.filter((e) => e.estado === 'activa').length,
    sinAsesor: empresas.filter((e) => e.estado === 'activa' && !e.asesorId).length,
    trabajadoresCubiertos: empresas.reduce((a, e) => a + (e.trabajadores || 0), 0),
    horasContratadasMes: empresas.filter((e) => e.estado === 'activa').reduce((a, e) => a + (e.horasContratadasMes || 0), 0),
    demo: empresas.filter((e) => e.demo).length,
    porSector: contar(empresas, (e) => e.sector),
    porRiesgo: contar(empresas, (e) => e.claseRiesgo && `Clase ${e.claseRiesgo}`),
    porMunicipio: contar(empresas, (e) => e.municipio),
    porAsesor: contar(empresas, (e) => (e.asesorId ? asesores.get(e.asesorId) || 'Asesor no disponible' : 'Sin asignar')),
    recientes: [...empresas].sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)).slice(0, 5),
    evaluadas: ultimo.size,
    evaluacionesEnCurso: diags.filter((d) => ['borrador', 'en_ejecucion', 'devuelto'].includes(d.estado)).length,
    pendientesAprobacion: diags.filter((d) => d.estado === 'pendiente_revision').length,
    empresasConCriticos: ult.filter((d) => (d.resultados.alertas || []).some((a) => ['no_cumple', 'parcial'].includes(a.estado))).length,
    promedioSimple, promedioPonderado, porCampo,
    comparacion: ult.map((d) => ({ empresa: emp.get(d.empresaId).razonSocial, codigo: d.codigo, promedio: d.resultados.promedioSimple, porCampo: d.resultados.porCampo })).sort((a, b) => a.promedio - b.promedio),
    evolucion,
    accionesPendientes: actividades.filter((a) => ['pendiente', 'en_curso', 'ejecutada'].includes(a.estado)).length,
    accionesVencidas: actividades.filter((a) => vencida(a, hoy)).length,
    horasProgramadasMes: r1(programadasMes), horasEjecutadasMes: r1(ejecutadasMes), horasPendientesMes: r1(Math.max(0, programadasMes - ejecutadasMes)),
    proximas: actividades.filter((a) => a.fechaLimite && a.fechaLimite >= hoy && a.fechaLimite <= en14 && !['verificada', 'cancelada'].includes(a.estado))
      .sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite)).slice(0, 8).map((a) => ({ ...a, empresa: emp.get(a.empresaId)?.razonSocial })),
  };
}

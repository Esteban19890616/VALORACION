/**
 * Informe ejecutivo de diagnóstico (integral o por campo). Estructura de 21 secciones:
 * portada, identificación, fecha y alcance, asesor, metodología, resumen ejecutivo, indicadores, gráfico,
 * resultados detallados, hallazgos críticos, matriz de incumplimientos, referencias normativas, evidencias,
 * recomendaciones, priorización, distribución de horas, plan de trabajo, cronograma, limitaciones,
 * fecha de corte normativo y responsable de revisión y aprobación.
 */
import { DocumentoPDF, fechaLarga } from './pdf-base.js';
import { barrasPorcentaje, radar } from './graficos-pdf.js';
import { CAMPOS } from '../data/catalogo-base.js';
import { RESPUESTAS, MADUREZ, calcularDiagnostico, calificacion0312, estadoEfectivo } from '../domain/calificacion.js';
import { etiquetaGrupo } from '../domain/perfil.js';
import { PRIORIDADES, priorizarHallazgo, horasEstimadas, horasPorCampo, proponerDistribucion, compararPrioridad } from '../domain/priorizacion.js';
import { etiquetaMes } from '../domain/planificacion.js';
import { NATURALEZAS, VIGENCIAS, SEVERIDADES_TXT } from '../services/catalogo.service.js';
import { ESTADOS_DX } from '../services/diagnosticos.service.js';
import { ESTADOS_ACT } from '../services/planes.service.js';

const TIPO = { incumplimiento: 'Incumplimiento', cumplimiento_parcial: 'Cumplimiento parcial', pendiente_verificacion: 'Pendiente de verificación' };
const pct = (v) => (v == null ? 'Sin datos suficientes' : `${String(v).replace('.', ',')} %`);
const num = (v) => (Math.round((Number(v) || 0) * 10) / 10).toLocaleString('es-CO');
const tonoSev = (s) => ({ critica: 'critico', alta: 'aviso', media: 'info', baja: 'neutro' })[s];
const COLORES_SEV = { critica: [179, 38, 30], alta: [138, 90, 0], media: [31, 90, 150], baja: [111, 125, 140] };

/**
 * @param c   contexto de contextoDiagnostico()
 * @param o   { campo, codigo, generadoPor, plan (contextoPlan o null), asesor (usuario o null), imagenes: [{nombre, requisito, dataURL}] }
 */
export async function informeDiagnostico(c, o) {
  const { d, e } = c;
  const campos = o.campo ? [o.campo] : d.campos;
  const aprobado = ['aprobado', 'cerrado'].includes(d.estado);
  const items = c.items.filter((i) => campos.includes(i.requisito.campo));
  const vivo = calcularDiagnostico({ items, campos, parametros: c.parametros });
  const porCampo = aprobado && d.resultados ? Object.fromEntries(campos.map((k) => [k, d.resultados.porCampo[k]])) : vivo.porCampo;
  const conDatos = campos.filter((k) => porCampo[k]?.porcentaje != null);
  const promedio = conDatos.length ? Math.round((conDatos.reduce((a, k) => a + porCampo[k].porcentaje, 0) / conDatos.length) * 10) / 10 : null;
  const alertas = (aprobado && d.resultados ? d.resultados.alertas : vivo.alertas).filter((a) => campos.includes(a.campo));
  const res0312 = campos.includes('sst') ? (aprobado && d.resultados?.res0312) || calificacion0312(items.filter((i) => i.requisito.campo === 'sst'), d.grupo0312) : null;
  const hallazgos = c.hallazgos.filter((h) => campos.includes(h.campo)).map((h) => ({ ...h, ...priorizarHallazgo(h), horas: horasEstimadas(h) })).sort(compararPrioridad);
  const nombreInf = o.campo ? `Diagnóstico ${CAMPOS[o.campo].largo.toLowerCase()}` : 'Diagnóstico empresarial integral';
  const marca = e.demo ? 'DEMOSTRACIÓN - NO VÁLIDO' : !aprobado ? 'BORRADOR - NO APROBADO' : null;

  const pdf = await DocumentoPDF.crear({ titulo: `Informe de ${nombreInf.charAt(0).toLowerCase()}${nombreInf.slice(1)}`, subtitulo: e.razonSocial, codigo: o.codigo, empresa: `${e.razonSocial} · NIT ${e.nitFormato}`, generadoPor: o.generadoPor, marcaAgua: marca });

  /* 1. Portada */
  pdf.portada({
    lineas: [`NIT ${e.nitFormato} · ${e.municipio}${e.departamento ? `, ${e.departamento}` : ''}`],
    estado: aprobado ? { texto: `${ESTADOS_DX[d.estado]} el ${fechaLarga(new Date(d.aprobadoEn))}`, tono: 'ok' } : { texto: `${ESTADOS_DX[d.estado]} - informe preliminar`, tono: 'aviso' },
    datos: [['Código del documento', o.codigo], ['Diagnóstico', `${d.codigo}${d.version > 1 ? ` (revisión ${d.version})` : ''}`], ['Campos evaluados', campos.map((k) => CAMPOS[k].largo).join(' · ')],
      ['Fecha de inicio', fechaLarga(new Date(`${d.fechaInicio}T12:00:00`))], ['Fecha de cierre', d.fechaCierre ? fechaLarga(new Date(`${d.fechaCierre}T12:00:00`)) : 'En curso'],
      ['Catálogo normativo', `Versión ${d.catalogoVersion} · corte ${fechaLarga(new Date(`${d.fechaCorteNormativo}T12:00:00`))}`], ['Fecha de generación', fechaLarga()]],
  });

  /* 2. Identificación de la empresa */
  pdf.titulo('Identificación de la empresa');
  pdf.tablaPares([['Razón social', e.razonSocial], ['Nombre comercial', e.nombreComercial], ['NIT', e.nitFormato], ['Representante legal', e.representanteLegal],
    ['Actividad económica', [e.actividadEconomica, e.ciiu && `CIIU ${e.ciiu}`].filter(Boolean).join(' · ')], ['Sector', e.sector], ['Ubicación', [e.direccion, e.municipio, e.departamento].filter(Boolean).join(', ')],
    ['Trabajadores / contratistas', `${d.perfil.trabajadores} / ${d.perfil.contratistas ?? 'no registrado'}`], ['Clase de riesgo (ARL)', d.perfil.claseRiesgo ? `Clase ${d.perfil.claseRiesgo}${e.arl ? ` · ${e.arl}` : ''}` : 'Sin clasificar'],
    ['Grupo de Estándares Mínimos', etiquetaGrupo(d.grupo0312)], ['Contacto', [e.contactoNombre, e.contactoCargo, e.email, e.telefono].filter(Boolean).join(' · ')]]);

  /* 3. Fecha y alcance */
  pdf.titulo('Fecha y alcance de la evaluación');
  pdf.parrafo(d.alcance);
  pdf.tablaPares([['Período', `${fechaLarga(new Date(`${d.fechaInicio}T12:00:00`))} a ${d.fechaCierre ? fechaLarga(new Date(`${d.fechaCierre}T12:00:00`)) : 'la fecha (en curso)'}`],
    ['Sedes evaluadas', (d.sedes || []).join('; ') || 'Sede principal'], ['Requisitos evaluados', `${items.length} aplicables · ${c.excluidos.filter((x) => campos.includes(x.requisito.campo)).length} excluidos por perfil`]]);

  /* 4. Asesor */
  pdf.titulo('Identificación del asesor');
  pdf.tablaPares([['Asesor responsable', o.asesor?.nombre || 'No registrado'], ['Cargo', o.asesor?.cargo], ['Correo', o.asesor?.email], ['Firma consultora', 'Ser Integral Consultora S.A.S.']]);

  /* 5. Metodología */
  pdf.titulo('Metodología');
  pdf.parrafo(`Se verificó cada requisito aplicable del catálogo normativo versión ${d.catalogoVersion} mediante revisión documental, entrevista e inspección, según el método indicado en cada requisito. La aplicabilidad se determinó con el perfil de la empresa (número de trabajadores, clase de riesgo, grupo de Estándares Mínimos y condiciones de actividad).`);
  pdf.vinetas([
    `Escala: Cumple ${c.parametros.puntajes.cumple} puntos; Cumple parcialmente ${c.parametros.puntajes.parcial}; No cumple ${c.parametros.puntajes.no_cumple}.`,
    'Cumplimiento del campo = suma de (peso x puntaje) / suma de pesos de los requisitos evaluados.',
    '"No aplica" se excluye solo si está justificado y validado por el revisor. "Pendiente de verificación" no se cuenta como cumplimiento y se informa como menor cobertura.',
    'Se distinguen cinco dimensiones: porcentaje de cumplimiento, nivel de riesgo (severidad x probabilidad), criticidad del hallazgo, prioridad de intervención y nivel de madurez (valoración cualitativa del asesor).',
    'Los rangos de color (bajo, medio, alto) son criterios internos de diagnóstico, no categorías legales. La única valoración normativa es la de la Resolución 0312 de 2019, art. 28, para el campo SST.',
    'Cada requisito indica si es obligación legal, contractual, estándar voluntario (por ejemplo ISO 9001) o recomendación profesional.',
  ]);

  /* 6. Resumen ejecutivo */
  pdf.titulo('Resumen ejecutivo');
  const nCrit = hallazgos.filter((h) => h.severidad === 'critica' && h.tipo !== 'pendiente_verificacion').length;
  const inmediatos = hallazgos.filter((h) => h.prioridad === 'inmediata');
  const mejor = conDatos.length ? conDatos.reduce((a, k) => (porCampo[k].porcentaje > porCampo[a].porcentaje ? k : a)) : null;
  const peor = conDatos.length ? conDatos.reduce((a, k) => (porCampo[k].porcentaje < porCampo[a].porcentaje ? k : a)) : null;
  const resumen = [];
  resumen.push(promedio == null ? 'No hay requisitos evaluados suficientes para calcular el cumplimiento.' : `El cumplimiento ${campos.length > 1 ? 'promedio de los campos evaluados' : `del campo ${CAMPOS[campos[0]].largo}`} es ${pct(promedio)}.${campos.length > 1 && mejor !== peor ? ` El campo con mejor resultado es ${CAMPOS[mejor].largo} (${pct(porCampo[mejor].porcentaje)}) y el de mayor brecha es ${CAMPOS[peor].largo} (${pct(porCampo[peor].porcentaje)}).` : ''}`);
  resumen.push(`Se identificaron ${hallazgos.length} hallazgo(s): ${hallazgos.filter((h) => h.tipo === 'incumplimiento').length} incumplimiento(s), ${hallazgos.filter((h) => h.tipo === 'cumplimiento_parcial').length} cumplimiento(s) parcial(es) y ${hallazgos.filter((h) => h.tipo === 'pendiente_verificacion').length} requisito(s) pendiente(s) de verificación.`);
  if (nCrit || alertas.length) resumen.push(`Hay ${alertas.length} alerta(s) crítica(s) que requieren atención aunque el promedio sea favorable; ${inmediatos.length} hallazgo(s) se clasifican como de intervención inmediata.`);
  if (res0312) resumen.push(`La autoevaluación de Estándares Mínimos (Resolución 0312 de 2019) arroja ${pct(res0312.porcentaje)}: ${res0312.valoracion?.etiqueta || 'sin valoración'}${res0312.provisional ? ' (provisional por ítems pendientes)' : ''}. ${res0312.valoracion?.accion || ''}`);
  pdf.parrafo(resumen.join('\n'));
  if (d.conclusiones?.general) { pdf.subtitulo('Conclusión del asesor'); pdf.parrafo(d.conclusiones.general); }

  /* 7. Indicadores generales */
  pdf.titulo('Indicadores generales');
  pdf.indicadores([
    { etiqueta: campos.length > 1 ? 'Cumplimiento promedio' : 'Cumplimiento', valor: pct(promedio), detalle: campos.length > 1 ? 'Promedio simple entre campos' : '' },
    { etiqueta: 'Hallazgos', valor: String(hallazgos.length), detalle: `${nCrit} de severidad crítica` },
    { etiqueta: 'Alertas críticas', valor: String(alertas.length), tono: alertas.length ? 'critico' : 'ok', detalle: 'Independientes del promedio' },
    ...(res0312 ? [{ etiqueta: 'Res. 0312 de 2019', valor: pct(res0312.porcentaje), tono: res0312.valoracion?.tono, detalle: res0312.valoracion?.etiqueta }] : [{ etiqueta: 'Cobertura', valor: pct(campos.reduce((a, k) => a + (porCampo[k]?.cobertura || 0), 0) / campos.length), detalle: 'Peso evaluado / peso aplicable' }]),
  ]);

  /* 8. Gráfico de cumplimiento por campo */
  pdf.titulo('Cumplimiento por campo');
  if (campos.length > 1) {
    const b = barrasPorcentaje(campos.map((k) => CAMPOS[k].nombre), campos.map((k) => porCampo[k]?.porcentaje ?? null), { ancho: 560, alto: 420 });
    const r = conDatos.length >= 3 ? radar(conDatos.map((k) => CAMPOS[k].nombre), [{ nombre: d.codigo, valores: conDatos.map((k) => porCampo[k].porcentaje) }]) : null;
    if (r) pdf.imagenesPar(b, r, { alto: 66 }); else pdf.imagen(b, { alto: 70, ancho: 120 });
  } else {
    const porCat = {};
    for (const i of items) { (porCat[i.requisito.categoria] ||= []).push(i); }
    const cats = Object.keys(porCat);
    const vals = cats.map((k) => calcularDiagnostico({ items: porCat[k], campos, parametros: c.parametros }).porCampo[campos[0]].porcentaje);
    pdf.imagen(barrasPorcentaje(cats.map((x) => (x.length > 42 ? `${x.slice(0, 40)}…` : x)), vals, { horizontal: true, ancho: 900, alto: Math.max(260, cats.length * 34) }), { alto: Math.min(190, Math.max(60, cats.length * 7.2)) });
    pdf.nota('Cumplimiento por categoría del campo (cálculo con los mismos parámetros).');
  }

  /* 9. Resultados detallados */
  pdf.titulo('Resultados detallados');
  pdf.tabla([{ titulo: 'Campo', ancho: 40 }, { titulo: 'Cumplimiento', alinear: 'right' }, { titulo: 'Cobertura', alinear: 'right' }, { titulo: 'Cumple', alinear: 'right' }, { titulo: 'Parcial', alinear: 'right' }, { titulo: 'No cumple', alinear: 'right' }, { titulo: 'No aplica', alinear: 'right' }, { titulo: 'Pend.', alinear: 'right' }, { titulo: 'Madurez', ancho: 26 }],
    campos.map((k) => { const x = porCampo[k]; const m = MADUREZ.find((mm) => mm.nivel === Number(d.madurez?.[k])); return [CAMPOS[k].largo, pct(x.porcentaje), pct(x.cobertura), x.conteos.cumple, x.conteos.parcial, x.conteos.no_cumple, x.conteos.na_validado, x.conteos.pendiente + x.conteos.na_por_validar, m ? `${m.nivel}. ${m.nombre}` : 'Sin calificar']; }));
  for (const k of campos) if (d.conclusiones?.[k]) { pdf.subtitulo(`Conclusión — ${CAMPOS[k].largo}`); pdf.parrafo(d.conclusiones[k]); }
  if (res0312) {
    pdf.subtitulo('Autoevaluación de Estándares Mínimos — Resolución 0312 de 2019');
    pdf.tablaPares([['Grupo', etiquetaGrupo(res0312.grupo)], ['Puntaje', `${num(res0312.valorObtenido)} de ${num(res0312.valorTotal)} puntos (${pct(res0312.porcentaje)})`], ['Valoración (art. 28)', res0312.valoracion?.etiqueta], ['Acción requerida', res0312.valoracion?.accion], ['Estado', res0312.provisional ? `Provisional: ${res0312.pendientes} ítem(s) sin respuesta definitiva` : 'Completa']]);
    pdf.nota('Solo "Cumple" suma el valor del ítem; "Cumple parcialmente" se trata como no cumplido; "No aplica" validado recibe el valor del ítem. Valores de la tabla del art. 27.');
  }

  /* 10. Hallazgos críticos */
  pdf.titulo('Hallazgos críticos');
  pdf.tabla([{ titulo: 'Requisito', ancho: 22 }, { titulo: 'Pregunta verificada' }, { titulo: 'Estado', ancho: 32 }, { titulo: 'Bloquea aprobación', ancho: 24 }],
    alertas.map((a) => [a.codigo, a.pregunta, RESPUESTAS[a.estado] || 'No aplica sin validar', a.bloqueaAprobacion ? 'Sí' : 'No']), { vacio: 'No hay requisitos críticos incumplidos, parciales ni pendientes.' });

  /* 11. Matriz de incumplimientos */
  pdf.titulo('Matriz de incumplimientos');
  pdf.tabla([{ titulo: 'Requisito', ancho: 20 }, { titulo: 'Hallazgo' }, { titulo: 'Tipo', ancho: 24 }, { titulo: 'Severidad', ancho: 17 }, { titulo: 'Riesgo', ancho: 16 }, { titulo: 'Naturaleza', ancho: 24 }, { titulo: 'Norma', ancho: 38 }],
    hallazgos.map((h) => [h.codigo, h.descripcion, TIPO[h.tipo], SEVERIDADES_TXT[h.severidad], h.riesgo.etiqueta, NATURALEZAS[h.naturaleza], h.norma || '—']),
    { tam: 7.4, vacio: 'Sin incumplimientos.', colorearColumna: (h) => { if (h.column.index === 3) { const s = hallazgos[h.row.index]?.severidad; if (s) h.cell.styles.textColor = COLORES_SEV[s]; } } });

  /* 12. Referencias normativas y enlaces */
  pdf.titulo('Referencias normativas y enlaces');
  const normas = new Map();
  for (const i of items) { const r = i.requisito; if (!r.norma) continue; const k = r.norma; if (!normas.has(k)) normas.set(k, { norma: r.norma, enlace: r.enlace, disp: new Set(), vig: r.vigencia, codigos: [] }); const n = normas.get(k); n.codigos.push(r.codigo); if (r.vigencia !== 'verificada') n.vig = r.vigencia; }
  pdf.tabla([{ titulo: 'Norma', ancho: 62 }, { titulo: 'Requisitos', ancho: 20, alinear: 'right' }, { titulo: 'Estado de verificación', ancho: 32 }, { titulo: 'Fuente' }],
    [...normas.values()].sort((a, b) => a.norma.localeCompare(b.norma, 'es')).map((n) => [n.norma, n.codigos.length, VIGENCIAS[n.vig], n.enlace || 'Por registrar']), { tam: 7.4 });
  pdf.nota('"Pendiente de validación normativa": la cita debe cotejarse con el texto oficial vigente antes de soportar una decisión jurídica.');

  /* 13. Evidencias seleccionadas */
  pdf.titulo('Evidencias seleccionadas');
  const evs = [...c.evidencias.entries()].flatMap(([reqId, arr]) => arr.map((x) => ({ ...x, req: items.find((i) => i.requisito.id === reqId)?.requisito }))).filter((x) => x.req);
  pdf.tabla([{ titulo: 'Requisito', ancho: 22 }, { titulo: 'Documento' }, { titulo: 'Fecha', ancho: 22 }, { titulo: 'Descripción', ancho: 60 }], evs.map((x) => [x.req.codigo, x.nombre, x.fechaEvidencia || '—', x.descripcion || '—']), { vacio: 'No se adjuntaron evidencias en el sistema.' });
  for (const img of (o.imagenes || []).slice(0, 4)) { pdf.subtitulo(`${img.requisito} · ${img.nombre}`); pdf.imagen(img.dataURL, { alto: 55, ancho: 80 }); }

  /* 14. Recomendaciones */
  pdf.titulo('Recomendaciones');
  for (const k of campos) {
    const hs = hallazgos.filter((h) => h.campo === k && h.tipo !== 'pendiente_verificacion');
    if (!hs.length) continue;
    pdf.subtitulo(CAMPOS[k].largo);
    pdf.vinetas(hs.slice(0, 15).map((h) => `${h.codigo}: ${h.recomendacion || h.descripcion}${h.responsable ? ` (Responsable: ${h.responsable})` : ''}`), { tam: 8.8 });
  }
  if (!hallazgos.length) pdf.parrafo('No se formulan recomendaciones: no hay brechas.');

  /* 15. Priorización */
  pdf.titulo('Priorización de la intervención');
  pdf.parrafo('La prioridad de atención se calcula para cada hallazgo con su severidad, la probabilidad de materialización, el tipo de hallazgo y la naturaleza del requisito. Es independiente del porcentaje de horas asignado a cada campo: un hallazgo de intervención inmediata se atiende en el primer mes.');
  pdf.tabla([{ titulo: 'Prioridad', ancho: 30 }, { titulo: 'Requisito', ancho: 20 }, { titulo: 'Campo', ancho: 20 }, { titulo: 'Puntaje', ancho: 16, alinear: 'right' }, { titulo: 'Horas est.', ancho: 16, alinear: 'right' }, { titulo: 'Motivo' }],
    hallazgos.slice(0, 40).map((h) => [PRIORIDADES[h.prioridad].etiqueta, h.codigo, CAMPOS[h.campo].nombre, num(h.puntaje), num(h.horas), h.motivo]), { tam: 7.2, vacio: 'Sin hallazgos que priorizar.' });

  /* 16. Distribución de horas */
  pdf.titulo('Distribución propuesta de horas');
  const plan = o.plan?.plan;
  if (plan) {
    const h = horasPorCampo(plan.horasMes, plan.distribucion);
    pdf.parrafo(`Bolsa de ${num(plan.horasMes)} horas por mes, horizonte de ${plan.meses} mes(es) desde ${etiquetaMes(plan.mesInicio)}. Estado del plan: ${plan.estado === 'aprobado' ? `aprobado (versión ${plan.version})` : 'borrador, pendiente de aprobación'}.`);
    pdf.tabla([{ titulo: 'Campo' }, { titulo: 'Porcentaje', alinear: 'right' }, { titulo: 'Horas por mes', alinear: 'right' }], [...d.campos.map((k) => [CAMPOS[k].largo, `${plan.distribucion[k]} %`, num(h[k])]), ['Total', '100 %', num(plan.horasMes)]]);
    if (plan.justificacion) pdf.nota(plan.justificacion);
  } else {
    const p = proponerDistribucion(hallazgos, Number(e.horasContratadasMes) || 0);
    pdf.aviso('No hay un plan configurado. Se presenta la propuesta del asistente de priorización, que debe ser revisada y aprobada por el asesor.');
    pdf.tabla([{ titulo: 'Campo', ancho: 30 }, { titulo: '%', alinear: 'right', ancho: 14 }, { titulo: 'Horas/mes', alinear: 'right', ancho: 18 }, { titulo: 'Justificación' }], p.explicacion.map((x) => [CAMPOS[x.campo].nombre, `${x.porcentaje} %`, num(x.horas), x.texto]));
  }

  /* 17. Plan de trabajo */
  pdf.titulo('Plan de trabajo');
  const acts = (o.plan?.actividades || []).filter((a) => campos.includes(a.campo) && a.estado !== 'cancelada');
  pdf.tabla([{ titulo: 'Código', ancho: 16 }, { titulo: 'Actividad' }, { titulo: 'Entregable', ancho: 40 }, { titulo: 'Responsable', ancho: 26 }, { titulo: 'Horas', ancho: 13, alinear: 'right' }, { titulo: 'Estado', ancho: 20 }],
    acts.map((a) => [a.codigo, a.actividad, a.entregable, a.responsable || '—', num(a.horasProgramadas), ESTADOS_ACT[a.estado]]), { tam: 7.2, vacio: 'El plan de trabajo aún no se ha generado.' });

  /* 18. Cronograma */
  pdf.titulo('Cronograma');
  if (acts.length && o.plan?.meses) {
    const meses = o.plan.meses.filter((m) => acts.some((a) => a.mesProgramado === m));
    pdf.tabla([{ titulo: 'Mes' }, ...d.campos.filter((k) => campos.includes(k)).map((k) => ({ titulo: CAMPOS[k].nombre, alinear: 'right' })), { titulo: 'Total h', alinear: 'right' }, { titulo: 'Actividades' }],
      meses.map((m) => { const am = acts.filter((a) => a.mesProgramado === m); return [etiquetaMes(m), ...d.campos.filter((k) => campos.includes(k)).map((k) => num(am.filter((a) => a.campo === k).reduce((s, a) => s + Number(a.horasProgramadas || 0), 0))), num(am.reduce((s, a) => s + Number(a.horasProgramadas || 0), 0)), am.map((a) => a.codigo).join(', ')]; }), { tam: 7.4 });
    const sinProg = acts.filter((a) => !a.mesProgramado);
    if (sinProg.length) pdf.aviso(`${sinProg.length} actividad(es) sin programar por falta de capacidad u horas asignadas: ${sinProg.map((a) => a.codigo).join(', ')}.`, 'critico');
  } else pdf.nota('El cronograma se construye al generar el plan de trabajo.');

  /* 19. Limitaciones */
  pdf.titulo('Limitaciones del diagnóstico');
  const lim = [];
  const pend = items.filter((i) => ['pendiente', 'na_por_validar'].includes(estadoEfectivo(i.respuesta))).length;
  if (pend) lim.push(`${pend} requisito(s) quedaron pendientes de verificación o con "No aplica" sin validar; el resultado puede ser incompleto.`);
  const normasPend = new Set(items.filter((i) => i.requisito.vigencia === 'pendiente_validacion').map((i) => i.requisito.norma));
  if (normasPend.size) lim.push(`${normasPend.size} norma(s) citadas en los requisitos están pendientes de validación normativa contra su texto oficial.`);
  const porConf = items.filter((i) => i.aplicabilidad?.aplica === null).length;
  if (porConf) lim.push(`${porConf} requisito(s) se evaluaron con aplicabilidad "por confirmar" porque el perfil de la empresa tiene condiciones sin determinar.`);
  lim.push('El diagnóstico se basa en la información y los documentos suministrados por la empresa y verificados en las fechas indicadas. Cambios posteriores en la empresa o en la normativa pueden modificar las conclusiones.');
  if (!aprobado) lim.push('Este informe es preliminar: el diagnóstico no ha sido aprobado por el revisor.');
  if (e.demo) lim.push('La empresa y sus respuestas son datos de demostración ficticios. Este documento no tiene validez.');
  pdf.vinetas(lim);

  /* 20. Fecha de corte normativo */
  pdf.titulo('Fecha de corte normativo');
  pdf.parrafo(`Los requisitos se evaluaron con el catálogo normativo versión ${d.catalogoVersion}, con fecha de corte del ${fechaLarga(new Date(`${d.fechaCorteNormativo}T12:00:00`))}. Las normas expedidas o modificadas después de esa fecha no están reflejadas en este informe.`);

  /* 21. Responsable de revisión y aprobación */
  pdf.titulo('Responsable de revisión y aprobación');
  pdf.tablaPares([['Elaboró (asesor)', o.asesor?.nombre || '—'], ['Revisó y aprobó', aprobado ? d.aprobadoPorNombre : 'Pendiente de aprobación'], ['Fecha de aprobación', aprobado ? fechaLarga(new Date(d.aprobadoEn)) : '—'], ['Registro', aprobado ? `Aprobación registrada en la bitácora de SER INTEGRAL 360 (${d.codigo})` : '—']]);
  pdf.nota('Este documento no incorpora firmas manuscritas ni certificados de firma digital. La aprobación consta en el registro de auditoría del sistema.');

  return pdf.finalizar();
}

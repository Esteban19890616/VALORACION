/** Comparativo entre dos diagnósticos aprobados de la misma empresa. */
import { DocumentoPDF, fechaLarga } from './pdf-base.js';
import { barrasAgrupadas, linea } from './graficos-pdf.js';
import { CAMPOS } from '../data/catalogo-base.js';
import { CAMPOS_P } from '../domain/priorizacion.js';
import { SEVERIDADES_TXT } from '../services/catalogo.service.js';

const pct = (v) => (v == null ? 'Sin datos' : `${String(v).replace('.', ',')} %`);
const delta = (a, b) => (a == null || b == null ? '—' : `${b - a > 0 ? '+' : ''}${String(Math.round((b - a) * 10) / 10).replace('.', ',')} pp`);

/** a: contexto anterior, b: contexto posterior. historial: [{codigo, aprobadoEn, promedio, porCampo}] de todos los aprobados. */
export async function informeComparativo(a, b, o) {
  const e = b.e;
  const pdf = await DocumentoPDF.crear({ titulo: 'Comparativo entre evaluaciones', subtitulo: `${e.razonSocial} · ${a.d.codigo} frente a ${b.d.codigo}`, codigo: o.codigo, empresa: `${e.razonSocial} · NIT ${e.nitFormato}`, generadoPor: o.generadoPor, marcaAgua: e.demo ? 'DEMOSTRACIÓN - NO VÁLIDO' : null });
  pdf.portada({ lineas: [`NIT ${e.nitFormato}`], estado: { texto: 'Comparativo de diagnósticos aprobados', tono: 'info' },
    datos: [['Código del documento', o.codigo], ['Evaluación anterior', `${a.d.codigo} · aprobada ${fechaLarga(new Date(a.d.aprobadoEn))} · catálogo ${a.d.catalogoVersion}`], ['Evaluación posterior', `${b.d.codigo} · aprobada ${fechaLarga(new Date(b.d.aprobadoEn))} · catálogo ${b.d.catalogoVersion}`], ['Fecha de generación', fechaLarga()]] });
  const ra = a.d.resultados; const rb = b.d.resultados;
  const campos = CAMPOS_P.filter((k) => a.d.campos.includes(k) || b.d.campos.includes(k));

  pdf.titulo('Resultados por campo');
  pdf.tabla([{ titulo: 'Campo' }, { titulo: a.d.codigo, alinear: 'right' }, { titulo: b.d.codigo, alinear: 'right' }, { titulo: 'Variación', alinear: 'right' }, { titulo: 'Cobertura posterior', alinear: 'right' }],
    [...campos.map((k) => [CAMPOS[k].largo, pct(ra.porCampo[k]?.porcentaje), pct(rb.porCampo[k]?.porcentaje), delta(ra.porCampo[k]?.porcentaje, rb.porCampo[k]?.porcentaje), pct(rb.porCampo[k]?.cobertura)]),
      ['Promedio simple', pct(ra.promedioSimple), pct(rb.promedioSimple), delta(ra.promedioSimple, rb.promedioSimple), '']]);
  pdf.imagen(barrasAgrupadas(campos.map((k) => CAMPOS[k].nombre), [{ nombre: a.d.codigo, valores: campos.map((k) => ra.porCampo[k]?.porcentaje ?? 0) }, { nombre: b.d.codigo, valores: campos.map((k) => rb.porCampo[k]?.porcentaje ?? 0) }], { sufijo: ' %', max: 100 }), { alto: 62, ancho: 150 });
  if (a.d.catalogoVersion !== b.d.catalogoVersion) pdf.aviso(`Las evaluaciones usaron versiones distintas del catálogo (${a.d.catalogoVersion} y ${b.d.catalogoVersion}). Parte de la variación puede deberse a cambios normativos o de requisitos y no solo a la gestión de la empresa.`);
  if (ra.res0312 && rb.res0312) {
    pdf.titulo('Estándares Mínimos — Resolución 0312 de 2019');
    pdf.tabla([{ titulo: 'Evaluación' }, { titulo: 'Puntaje', alinear: 'right' }, { titulo: 'Valoración' }], [[a.d.codigo, pct(ra.res0312.porcentaje), ra.res0312.valoracion?.etiqueta || '—'], [b.d.codigo, pct(rb.res0312.porcentaje), rb.res0312.valoracion?.etiqueta || '—']]);
  }
  if ((o.historial || []).length > 2) {
    pdf.titulo('Evolución histórica');
    pdf.imagen(linea(o.historial.map((h) => h.codigo), [{ nombre: 'Promedio', valores: o.historial.map((h) => h.promedio) }, ...campos.map((k) => ({ nombre: CAMPOS[k].nombre, valores: o.historial.map((h) => h.porCampo?.[k]?.porcentaje ?? null) }))]), { alto: 60 });
  }
  const ca = new Map(a.hallazgos.filter((h) => h.tipo !== 'pendiente_verificacion').map((h) => [h.codigo, h]));
  const cb = new Map(b.hallazgos.filter((h) => h.tipo !== 'pendiente_verificacion').map((h) => [h.codigo, h]));
  const resueltos = [...ca.values()].filter((h) => !cb.has(h.codigo));
  const nuevos = [...cb.values()].filter((h) => !ca.has(h.codigo));
  const persistentes = [...cb.values()].filter((h) => ca.has(h.codigo));
  pdf.titulo('Hallazgos');
  pdf.indicadores([{ etiqueta: 'Resueltos', valor: String(resueltos.length), tono: 'ok' }, { etiqueta: 'Persistentes', valor: String(persistentes.length), tono: persistentes.length ? 'aviso' : null }, { etiqueta: 'Nuevos', valor: String(nuevos.length), tono: nuevos.length ? 'critico' : null }, { etiqueta: 'Críticos persistentes', valor: String(persistentes.filter((h) => h.severidad === 'critica').length), tono: 'critico' }]);
  const cols = [{ titulo: 'Requisito', ancho: 22 }, { titulo: 'Campo', ancho: 20 }, { titulo: 'Severidad', ancho: 18 }, { titulo: 'Hallazgo' }];
  const fila = (h) => [h.codigo, CAMPOS[h.campo].nombre, SEVERIDADES_TXT[h.severidad], h.descripcion];
  pdf.subtitulo('Persistentes'); pdf.tabla(cols, persistentes.map(fila), { tam: 7.4, vacio: 'Ninguno.' });
  pdf.subtitulo('Nuevos'); pdf.tabla(cols, nuevos.map(fila), { tam: 7.4, vacio: 'Ninguno.' });
  pdf.subtitulo('Resueltos'); pdf.tabla(cols, resueltos.map(fila), { tam: 7.4, vacio: 'Ninguno.' });
  pdf.nota('Se comparan hallazgos por código de requisito. Los requisitos pendientes de verificación no se cuentan como hallazgos resueltos ni nuevos.');
  return pdf.finalizar();
}

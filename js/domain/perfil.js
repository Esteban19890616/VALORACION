/**
 * Perfil de aplicabilidad de la empresa. Cada condición es tri-estado: 'si' | 'no' | '' (sin determinar).
 * Una condición sin determinar NUNCA excluye un requisito: lo deja "por confirmar" y se evalúa.
 */
export const CONDICIONES = [
  { clave: 'sociedadComercial', texto: 'Es sociedad comercial o comerciante inscrito en el registro mercantil', grupo: 'Jurídico' },
  { clave: 'activosMayor100kUVT', texto: 'Activos totales superiores a 100.000 UVT (Registro Nacional de Bases de Datos)', grupo: 'Jurídico' },
  { clave: 'entidadPublica', texto: 'Es persona jurídica de naturaleza pública', grupo: 'Jurídico' },
  { clave: 'vendeConsumidorFinal', texto: 'Vende bienes o presta servicios a consumidores finales', grupo: 'Jurídico' },
  { clave: 'contrataElectronicamente', texto: 'Celebra contratos o firma documentos por medios electrónicos', grupo: 'Jurídico' },
  { clave: 'trabajoAlturas', texto: 'Realiza trabajo en alturas (1,5 m o más)', grupo: 'SST' },
  { clave: 'sustanciasQuimicas', texto: 'Almacena o manipula sustancias químicas peligrosas', grupo: 'SST' },
  { clave: 'riesgoDesastre', texto: 'Su actividad puede generar riesgo de desastre para terceros (Decreto 2157 de 2017)', grupo: 'SST' },
  { clave: 'generaRespel', texto: 'Genera residuos o desechos peligrosos (RESPEL)', grupo: 'Ambiental' },
  { clave: 'respel10kg', texto: 'Genera 10 kg/mes o más de RESPEL', grupo: 'Ambiental' },
  { clave: 'vierteCuerpoAguaSuelo', texto: 'Vierte aguas residuales a un cuerpo de agua o al suelo', grupo: 'Ambiental' },
  { clave: 'vierteAlcantarillado', texto: 'Vierte aguas residuales no domésticas al alcantarillado', grupo: 'Ambiental' },
  { clave: 'captaAgua', texto: 'Capta agua directamente de una fuente (río, pozo, quebrada)', grupo: 'Ambiental' },
  { clave: 'emisionesFuentesFijas', texto: 'Tiene fuentes fijas de emisión atmosférica (calderas, hornos, chimeneas)', grupo: 'Ambiental' },
  { clave: 'ruidoExterior', texto: 'Genera ruido perceptible fuera de sus instalaciones', grupo: 'Ambiental' },
  { clave: 'actividadIndustrial', texto: 'Es empresa de actividad industrial (Departamento de Gestión Ambiental)', grupo: 'Ambiental' },
  { clave: 'productorEnvases', texto: 'Pone en el mercado productos con envases o empaques (responsabilidad extendida)', grupo: 'Ambiental' },
  { clave: 'requiereLicenciaAmbiental', texto: 'Su proyecto, obra o actividad está listado como sujeto a licencia ambiental', grupo: 'Ambiental' },
  { clave: 'adoptaIso9001', texto: 'Tiene o desea implementar un sistema de gestión de calidad ISO 9001', grupo: 'Calidad' },
];

export const perfilVacio = () => Object.fromEntries(CONDICIONES.map((c) => [c.clave, '']));

/**
 * Evalúa la aplicabilidad de un requisito para un perfil de empresa.
 * regla: { grupos0312?: string[], minTrabajadores?: n, maxTrabajadores?: n, minContratistas?: n,
 *          condiciones?: string[] (todas deben ser 'si'), tiposPersona?: string[] }
 * Devuelve { aplica: true | false | null, motivos: string[] }   (null = por confirmar)
 */
export function evaluarAplicabilidad(regla = {}, ctx) {
  const motivos = []; let porConfirmar = false;
  const { empresa, grupo0312 } = ctx;
  const perfil = empresa.perfil || {};
  if (regla.grupos0312?.length) {
    if (!grupo0312) { porConfirmar = true; motivos.push('Grupo de Estándares Mínimos sin determinar (falta clase de riesgo o número de trabajadores)'); }
    else if (!regla.grupos0312.includes(grupo0312)) return { aplica: false, motivos: [`No hace parte del grupo de estándares de la empresa (${etiquetaGrupo(grupo0312)})`] };
  }
  if (regla.minTrabajadores != null && Number(empresa.trabajadores) < regla.minTrabajadores) return { aplica: false, motivos: [`Aplica desde ${regla.minTrabajadores} trabajadores; la empresa registra ${empresa.trabajadores}`] };
  if (regla.maxTrabajadores != null && Number(empresa.trabajadores) > regla.maxTrabajadores) return { aplica: false, motivos: [`Aplica hasta ${regla.maxTrabajadores} trabajadores`] };
  if (regla.minContratistas != null && !(Number(empresa.contratistas) >= regla.minContratistas)) {
    if (empresa.contratistas == null) { porConfirmar = true; motivos.push('Número de contratistas sin registrar'); }
    else return { aplica: false, motivos: ['La empresa no registra contratistas'] };
  }
  if (regla.tiposPersona?.length && !regla.tiposPersona.includes(empresa.tipoPersona)) return { aplica: false, motivos: ['No aplica al tipo de persona de la empresa'] };
  for (const c of regla.condiciones || []) {
    const v = perfil[c];
    if (v === 'no') return { aplica: false, motivos: [`Perfil: no cumple la condición "${textoCondicion(c)}"`] };
    if (v !== 'si') { porConfirmar = true; motivos.push(`Condición sin determinar: ${textoCondicion(c)}`); }
  }
  if (regla.algunaCondicion?.length) {
    const vals = regla.algunaCondicion.map((c) => perfil[c]);
    if (vals.every((v) => v === 'no')) return { aplica: false, motivos: ['Perfil: no cumple ninguna de las condiciones que activan el requisito'] };
    if (!vals.includes('si')) { porConfirmar = true; motivos.push(`Condiciones sin determinar: ${regla.algunaCondicion.map(textoCondicion).join(' / ')}`); }
  }
  return { aplica: porConfirmar ? null : true, motivos };
}

export const textoCondicion = (c) => CONDICIONES.find((x) => x.clave === c)?.texto || c;
export const etiquetaGrupo = (g) => ({ art3: '7 estándares, art. 3', art7: 'agropecuaria, art. 7', art9: '21 estándares, art. 9', art16: '60 estándares, art. 16' })[g] || 'sin determinar';

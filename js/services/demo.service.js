/**
 * Datos de demostración. Todos los registros llevan demo:true y el prefijo [DEMO]
 * en la razón social. Los NIT se generan con dígito de verificación válido pero
 * son ficticios. No se crean usuarios ni credenciales de demostración.
 */
import { datos } from '../core/persistence/index.js';
import { registrar } from '../core/audit.js';
import { sesion } from '../core/session.js';
import { exigir } from '../domain/permisos.js';
import { crearEmpresa } from './empresas.service.js';
import { crearDiagnostico, contextoDiagnostico, guardarRespuesta } from './diagnosticos.service.js';

const EMPRESAS = [
  { razonSocial: '[DEMO] Metalmecánica Ficticia Andina S.A.S.', nit: '999000101', perfil: { sociedadComercial: 'si', activosMayor100kUVT: 'no', entidadPublica: 'no', vendeConsumidorFinal: 'no', contrataElectronicamente: 'si', trabajoAlturas: 'si', sustanciasQuimicas: 'si', riesgoDesastre: 'si', generaRespel: 'si', respel10kg: 'si', vierteCuerpoAguaSuelo: 'no', vierteAlcantarillado: 'si', captaAgua: 'no', emisionesFuentesFijas: 'si', ruidoExterior: 'si', actividadIndustrial: 'si', productorEnvases: 'no', requiereLicenciaAmbiental: 'no', adoptaIso9001: 'si' }, sector: 'Industria manufacturera', ciiu: '2592', actividadEconomica: 'Tratamiento y revestimiento de metales; mecanizado', trabajadores: 64, contratistas: 6, claseRiesgo: 'IV', municipio: 'Itagüí', departamento: 'Antioquia', horasContratadasMes: 40, estado: 'activa' },
  { razonSocial: '[DEMO] Comercializadora Ficticia del Valle S.A.S.', nit: '999000102', perfil: { sociedadComercial: 'si', activosMayor100kUVT: 'no', entidadPublica: 'no', vendeConsumidorFinal: 'si', trabajoAlturas: 'no', sustanciasQuimicas: 'no', generaRespel: 'no', vierteCuerpoAguaSuelo: 'no', vierteAlcantarillado: 'no', emisionesFuentesFijas: 'no', actividadIndustrial: 'no', productorEnvases: 'si', requiereLicenciaAmbiental: 'no' }, sector: 'Comercio', ciiu: '4719', actividadEconomica: 'Comercio al por menor en establecimientos no especializados', trabajadores: 18, contratistas: 2, claseRiesgo: 'I', municipio: 'Envigado', departamento: 'Antioquia', horasContratadasMes: 20, estado: 'activa' },
  { razonSocial: '[DEMO] Constructora Ficticia Occidente S.A.S.', nit: '999000103', perfil: { sociedadComercial: 'si', trabajoAlturas: 'si', sustanciasQuimicas: 'si', generaRespel: 'si', respel10kg: 'no', vierteCuerpoAguaSuelo: 'no', emisionesFuentesFijas: 'no', requiereLicenciaAmbiental: 'no' }, sector: 'Construcción', ciiu: '4111', actividadEconomica: 'Construcción de edificios residenciales', trabajadores: 9, contratistas: 25, claseRiesgo: 'V', municipio: 'Santa Fe de Antioquia', departamento: 'Antioquia', horasContratadasMes: 32, estado: 'activa' },
  { razonSocial: '[DEMO] Servicios Contables Ficticios Ltda.', nit: '999000104', perfil: { sociedadComercial: 'si', vendeConsumidorFinal: 'no', trabajoAlturas: 'no', sustanciasQuimicas: 'no', generaRespel: 'no', vierteCuerpoAguaSuelo: 'no', vierteAlcantarillado: 'no', emisionesFuentesFijas: 'no', actividadIndustrial: 'no', productorEnvases: 'no', requiereLicenciaAmbiental: 'no', adoptaIso9001: 'no' }, sector: 'Servicios', ciiu: '6920', actividadEconomica: 'Actividades de contabilidad y auditoría', trabajadores: 7, contratistas: 0, claseRiesgo: 'I', municipio: 'Medellín', departamento: 'Antioquia', horasContratadasMes: 8, estado: 'prospecto' },
];

export async function cargarDemo() {
  exigir(sesion.usuario(), 'demo.administrar');
  const creadas = [];
  for (const e of EMPRESAS) {
    if ((await datos.porIndice('empresas', 'nit', e.nit)).length) continue;
    const { empresa } = await crearEmpresa({ ...e, representanteLegal: 'Representante legal ficticio', observaciones: 'REGISTRO DE DEMOSTRACIÓN — datos ficticios, no usar en informes.', fechaVinculacion: new Date().toISOString().slice(0, 10) }, { demo: true });
    creadas.push(empresa);
  }
  // Diagnóstico de demostración en ejecución para la primera empresa (respuestas ficticias y deterministas).
  const metal = creadas.find((e) => e.nit === '999000101');
  if (metal) {
    const d = await crearDiagnostico({ empresaId: metal.id, alcance: '[DEMO] Diagnóstico integral de demostración con respuestas ficticias.', campos: ['juridico', 'sst', 'calidad', 'ambiental'], sedes: ['Sede principal'] });
    const c = await contextoDiagnostico(d.id);
    for (const [i, it] of c.items.entries()) {
      if (i % 13 === 0) continue; // queda pendiente
      const respuesta = i % 7 === 0 ? 'no_cumple' : i % 5 === 0 ? 'parcial' : 'cumple';
      await guardarRespuesta(d.id, it.requisito.id, { respuesta, observaciones: '[DEMO] Respuesta ficticia de demostración.', probabilidad: i % 3 === 0 ? 'alta' : 'media' });
    }
  }
  return creadas.length;
}

/** Los registros demo sí se depuran físicamente: nunca fueron información real. */
export async function retirarDemo() {
  exigir(sesion.usuario(), 'demo.administrar');
  const demo = (await datos.listar('empresas')).filter((e) => e.demo === true);
  const ids = new Set(demo.map((e) => e.id));
  const ops = demo.map((e) => ({ tipo: 'eliminar', store: 'empresas', id: e.id }));
  const dx = (await datos.listar('diagnosticos')).filter((d) => ids.has(d.empresaId));
  const dxIds = new Set(dx.map((d) => d.id));
  ops.push(...dx.map((d) => ({ tipo: 'eliminar', store: 'diagnosticos', id: d.id })));
  for (const st of ['respuestas']) ops.push(...(await datos.listar(st)).filter((r) => dxIds.has(r.diagnosticoId)).map((r) => ({ tipo: 'eliminar', store: st, id: r.id })));
  for (const st of ['evidencias', 'hallazgos', 'planes', 'actividades', 'horas', 'documentos', 'informes']) ops.push(...(await datos.listar(st)).filter((r) => ids.has(r.empresaId)).map((r) => ({ tipo: 'eliminar', store: st, id: r.id })));
  await datos.lote(ops);
  await registrar({ accion: 'demo_retirar', entidad: 'empresas', motivo: `${demo.length} empresas de demostración retiradas` });
  return demo.length;
}

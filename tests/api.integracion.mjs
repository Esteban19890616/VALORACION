/**
 * Pruebas de integración de la API PHP + MySQL (requiere una base VACÍA y el servidor en marcha):
 *   php backend/cli/instalar.php --solo-esquema
 *   php -S 127.0.0.1:8080 backend/dev-router.php &
 *   SI360_API=http://127.0.0.1:8080/api/v1 node tests/api.integracion.mjs
 * Opcional: SI360_MYSQL="mysql -uroot si360_test" habilita la prueba de manipulación directa de la bitácora.
 */
import { pbkdf2Sync, randomBytes, createHash } from 'node:crypto';
import { execSync } from 'node:child_process';

const BASE = process.env.SI360_API || 'http://127.0.0.1:8080/api/v1';
const ORIGEN = new URL(BASE).origin;
let ok = 0, fallas = 0;
const prueba = async (n, fn) => { try { await fn(); ok++; console.log(`  ✓ ${n}`); } catch (e) { fallas++; console.log(`  ✗ ${n}\n      ${e.message}`); } };
const igual = (a, b, m = '') => { if (a !== b) throw new Error(`${m} esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)}`); };
const uid = () => randomBytes(16).toString('hex').replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-');

class Cliente {
  constructor() { this.cookie = ''; this.csrf = null; }
  async pedir(metodo, ruta, cuerpo, { csrf = true, crudo = false } = {}) {
    const h = { Accept: 'application/json', Origin: ORIGEN };
    if (cuerpo !== undefined) h['Content-Type'] = 'application/json';
    if (this.cookie) h.Cookie = this.cookie;
    if (csrf && this.csrf && metodo !== 'GET') h['X-CSRF-Token'] = this.csrf;
    const r = await fetch(BASE + ruta, { method: metodo, headers: h, body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined });
    const sc = r.headers.getSetCookie?.() || [];
    for (const c of sc) if (c.startsWith('SI360SESS=')) this.cookie = c.split(';')[0].includes('deleted') ? '' : c.split(';')[0];
    if (crudo) return { estado: r.status, buf: Buffer.from(await r.arrayBuffer()), tipo: r.headers.get('content-type') };
    const texto = await r.text();
    let j = null; try { j = texto ? JSON.parse(texto) : null; } catch { j = { texto }; }
    if (j?.csrf) this.csrf = j.csrf;
    return { estado: r.status, j, texto };
  }
  get = (r) => this.pedir('GET', r);
  put = (s, o) => this.pedir('PUT', `/${s}/${encodeURIComponent(o.id ?? o.clave)}`, o);
  post = (r, c = {}) => this.pedir('POST', r, c);
  del = (r) => this.pedir('DELETE', r);
  async ingresar(email, contrasena) { const r = await this.post('/sesion', { email, contrasena }); igual(r.estado, 200, `ingreso ${email}: ${r.j?.error}`); return r.j.usuario; }
}

const credencial = (c) => { const sal = randomBytes(16); return { algoritmo: 'PBKDF2-SHA256', iteraciones: 210000, sal: sal.toString('base64'), hash: pbkdf2Sync(c, sal, 210000, 32, 'sha256').toString('base64') }; };
const dv = (nit) => { const p = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]; let s = 0; [...nit].reverse().forEach((d, i) => { s += Number(d) * p[i]; }); const m = s % 11; return m > 1 ? 11 - m : m; };
const ahora = () => new Date().toISOString();

const admin = new Cliente(), asesor = new Cliente(), cliente = new Cliente(), anonimo = new Cliente();
const ids = { asesor: uid(), cliente: uid(), e1: uid(), e2: uid(), cat: uid(), dx: uid(), plan: uid(), act: uid() };
const CLAVE_ADMIN = 'AdminPrueba2026', CLAVE_ASESOR = 'AsesorTemporal1', CLAVE_ASESOR2 = 'AsesorDefinitiva2';

console.log(`API: ${BASE}`);
await prueba('estado público sin administrador', async () => { const r = await anonimo.get('/estado'); igual(r.j.app, 'SI360'); igual(r.j.administradorConfigurado, false); });
await prueba('sin sesión: 401', async () => { igual((await anonimo.get('/empresas')).estado, 401); });
await prueba('instalación crea el administrador y abre sesión', async () => {
  const r = await admin.post('/instalacion', { nombre: 'Administrador Integración', email: 'admin@integracion.co', contrasena: CLAVE_ADMIN });
  igual(r.estado, 201, r.j?.error); igual(r.j.usuario.rol, 'administrador'); igual(r.j.usuario.credencial, undefined, 'no expone credencial');
});
await prueba('segunda instalación rechazada', async () => { igual((await anonimo.post('/instalacion', { nombre: 'X', email: 'x@x.co', contrasena: 'OtraClave2026' })).estado, 409); });
await prueba('escritura sin token CSRF: 403', async () => { igual((await admin.pedir('PUT', '/meta/x', { clave: 'x', valor: 1 }, { csrf: false })).estado, 403); });
await prueba('origen ajeno rechazado', async () => {
  const r = await fetch(BASE + '/meta/x', { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf, Origin: 'https://atacante.example' }, body: '{"clave":"x","valor":1}' });
  igual(r.status, 403);
});
await prueba('meta del servidor protegida (cadenaBitacora, consecutivos)', async () => {
  igual((await admin.put('meta', { clave: 'cadenaBitacora', valor: { secuencia: 0 } })).estado, 403);
  igual((await admin.put('meta', { clave: 'consecutivoEmpresa', valor: 0 })).estado, 403);
});
await prueba('crear usuarios (credencial PBKDF2 del cliente) sin exponer hashes', async () => {
  igual((await admin.put('usuarios', { id: ids.asesor, nombre: 'Asesor Integración', email: 'Asesor@Integracion.co', rol: 'asesor', estado: 'activo', credencial: credencial(CLAVE_ASESOR), version: 1 })).estado, 204);
  const u = (await admin.get(`/usuarios/${ids.asesor}`)).j;
  igual(u.email, 'asesor@integracion.co'); igual(u.credencial, undefined); igual(u.debeCambiarContrasena, true);
  igual((await admin.put('usuarios', { id: uid(), nombre: 'Dup', email: 'asesor@integracion.co', rol: 'asesor', estado: 'activo', credencial: credencial(CLAVE_ASESOR), version: 1 })).estado, 409);
});
await prueba('consecutivo atómico y clave no reconocida', async () => {
  const a = (await admin.post('/consecutivos/consecutivoEmpresa')).j.valor, b = (await admin.post('/consecutivos/consecutivoEmpresa')).j.valor;
  igual(b, a + 1); igual((await admin.post('/consecutivos/otraCosa')).estado, 400);
});
const empresa = (id, nit, asesorId, codigo) => ({ id, codigo, nit, dv: dv(nit), razonSocial: `Empresa ${codigo}`, estado: 'activa', asesorId, horasContratadasMes: 20, version: 1, perfil: {}, sedes: [] });
await prueba('empresas: DV, NIT único y versión', async () => {
  igual((await admin.put('empresas', { ...empresa(uid(), '900123456', null, 'X1'), dv: 0 })).estado, 422, 'DV incorrecto');
  igual((await admin.put('empresas', empresa(ids.e1, '900123456', ids.asesor, 'SI-0001'))).estado, 204);
  igual((await admin.put('empresas', empresa(ids.e2, '800765432', null, 'SI-0002'))).estado, 204);
  igual((await admin.put('empresas', empresa(uid(), '900123456', null, 'SI-0003'))).estado, 409, 'NIT duplicado');
  igual((await admin.put('empresas', { ...empresa(ids.e1, '900123456', ids.asesor, 'SI-0001'), version: 5 })).estado, 409, 'versión desfasada');
  igual((await admin.put('empresas', { ...empresa(ids.e1, '900123456', ids.asesor, 'SI-0001'), version: 2 })).estado, 204);
});
await prueba('usuario cliente vinculado a la empresa 1', async () => {
  igual((await admin.put('usuarios', { id: ids.cliente, nombre: 'Cliente Integración', email: 'cliente@integracion.co', rol: 'cliente', estado: 'activo', empresaId: ids.e1, credencial: credencial(CLAVE_ASESOR), version: 1 })).estado, 204);
});
await prueba('el administrador no puede suspenderse a sí mismo', async () => {
  const yo = (await admin.get('/sesion')).j.usuario;
  igual((await admin.put('usuarios', { ...yo, estado: 'suspendido', version: 2 })).estado, 403);
});
await prueba('clave temporal: bloquea escrituras hasta cambiarla', async () => {
  const u = await asesor.ingresar('asesor@integracion.co', CLAVE_ASESOR);
  igual(u.debeCambiarContrasena, true);
  igual((await asesor.put('horas', { id: uid() })).estado, 403);
  igual((await asesor.post('/cuenta/contrasena', { actual: 'incorrecta1', nueva: CLAVE_ASESOR2 })).estado, 422);
  const r = await asesor.post('/cuenta/contrasena', { actual: CLAVE_ASESOR, nueva: CLAVE_ASESOR2 });
  igual(r.estado, 200, r.j?.error); igual(r.j.usuario.debeCambiarContrasena, false);
});
await prueba('alcance del asesor: solo sus empresas', async () => {
  const l = (await asesor.get('/empresas')).j; igual(l.length, 1); igual(l[0].id, ids.e1);
  igual((await asesor.get(`/empresas/${ids.e2}`)).estado, 404);
  igual((await asesor.put('empresas', { ...empresa(ids.e1, '900123456', ids.asesor, 'SI-0001'), version: 3 })).estado, 403, 'asesor no edita empresas');
  const us = (await asesor.get('/usuarios')).j; igual(us.filter((u) => u.id !== ids.asesor).every((u) => u.credencial === undefined && u.debeCambiarContrasena === undefined), true, 'proyección pública');
});
await prueba('catálogo: publicado inmutable', async () => {
  const r = await admin.post('/lote', { ops: [{ tipo: 'guardar', store: 'catalogos', valor: { id: ids.cat, version: '1.0', estado: 'publicado', nombre: 'Catálogo de prueba' } },
    { tipo: 'guardar', store: 'requisitos', valor: { id: 'REQ-T1', catalogoId: ids.cat, codigo: 'T-001', campo: 'sst', catalogoVersion: '1.0' } }] });
  igual(r.estado, 204, r.j?.error);
  igual((await admin.put('requisitos', { id: 'REQ-T2', catalogoId: ids.cat, codigo: 'T-002', campo: 'sst', catalogoVersion: '1.0' })).estado, 409, 'requisito nuevo en versión publicada');
  igual((await admin.put('catalogos', { id: ids.cat, version: '1.0', estado: 'borrador', nombre: 'x' })).estado, 409);
});
const dxBase = () => ({ id: ids.dx, codigo: 'DX-2026-0001', empresaId: ids.e1, asesorId: ids.asesor, estado: 'borrador', campos: ['sst'], historial: [] });
await prueba('diagnóstico: el asesor no aprueba', async () => {
  igual((await asesor.put('diagnosticos', { ...dxBase(), estado: 'aprobado' })).estado, 409, 'nuevo debe ser borrador');
  igual((await asesor.put('diagnosticos', dxBase())).estado, 204);
  igual((await asesor.put('respuestas', { id: `${ids.dx}:REQ-T1`, diagnosticoId: ids.dx, requisitoId: 'REQ-T1', respuesta: 'no_aplica', naEstado: 'aprobada', justificacionNA: 'x' })).estado, 403, 'NA aprobada por asesor');
  igual((await asesor.put('respuestas', { id: `${ids.dx}:REQ-T1`, diagnosticoId: ids.dx, requisitoId: 'REQ-T1', respuesta: 'cumple' })).estado, 204);
  igual((await asesor.put('diagnosticos', { ...dxBase(), estado: 'aprobado' })).estado, 403);
  igual((await asesor.put('diagnosticos', { ...dxBase(), estado: 'pendiente_revision' })).estado, 204);
  igual((await asesor.put('respuestas', { id: `${ids.dx}:REQ-T1`, diagnosticoId: ids.dx, requisitoId: 'REQ-T1', respuesta: 'no_cumple' })).estado, 403, 'en revisión solo el revisor');
});
await prueba('cliente no ve diagnósticos sin aprobar', async () => {
  await cliente.ingresar('cliente@integracion.co', CLAVE_ASESOR);
  igual((await cliente.get('/diagnosticos')).j.length, 0); igual((await cliente.get(`/diagnosticos/${ids.dx}`)).estado, 404);
  igual((await cliente.get('/empresas')).j.length, 1); igual((await cliente.get('/auditoria')).j.length, 0);
});
await prueba('aprobación congela: respuestas y diagnóstico inmutables', async () => {
  const r = await admin.put('diagnosticos', { ...dxBase(), estado: 'aprobado', resultados: { global: { porcentaje: 100 } } });
  igual(r.estado, 204, r.j?.error);
  const d = (await admin.get(`/diagnosticos/${ids.dx}`)).j; igual(d.aprobadoPor !== undefined, true, 'sellado por el servidor');
  igual((await admin.put('respuestas', { id: `${ids.dx}:REQ-T1`, diagnosticoId: ids.dx, requisitoId: 'REQ-T1', respuesta: 'no_cumple' })).estado, 409);
  igual((await admin.put('diagnosticos', { ...d, alcance: 'cambiado' })).estado, 409);
  igual((await cliente.get('/diagnosticos')).j.length, 1, 'el cliente ahora lo ve');
});
await prueba('plan, actividad y horas de solo registro', async () => {
  igual((await asesor.put('planes', { id: ids.plan, empresaId: ids.e1, estado: 'aprobado', horasMes: 20, distribucion: { juridico: 50, sst: 50 } })).estado, 204);
  igual((await asesor.put('actividades', { id: ids.act, planId: ids.plan, empresaId: ids.e1, estado: 'pendiente', codigo: 'A-1' })).estado, 204);
  igual((await asesor.put('actividades', { id: ids.act, planId: ids.plan, empresaId: ids.e1, estado: 'ejecutada', codigo: 'A-1' })).estado, 409, 'ejecutada sin horas');
  igual((await asesor.put('horas', { id: uid(), empresaId: ids.e1, actividadId: ids.act, horas: 13, fecha: ahora().slice(0, 10) })).estado, 422);
  const h = { id: uid(), empresaId: ids.e1, actividadId: ids.act, horas: 2, fecha: ahora().slice(0, 10), usuarioId: 'falso', usuarioNombre: 'Suplantado' };
  igual((await asesor.put('horas', h)).estado, 204);
  const g = (await asesor.get(`/horas/${h.id}`)).j; igual(g.usuarioId, ids.asesor, 'autor sellado');
  igual((await asesor.put('horas', { ...g, horas: 5 })).estado, 409);
  igual((await asesor.put('actividades', { id: ids.act, planId: ids.plan, empresaId: ids.e1, estado: 'ejecutada', codigo: 'A-1' })).estado, 204);
  igual((await admin.put('actividades', { id: ids.act, planId: ids.plan, empresaId: ids.e1, estado: 'verificada', codigo: 'A-1' })).estado, 409, 'sin evidencia');
});
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
await prueba('evidencias: tipo real, huella, inmutables', async () => {
  const id = uid();
  igual((await asesor.put('evidencias', { id, empresaId: ids.e1, actividadId: ids.act, nombre: 'falso.pdf', archivo: { base64: Buffer.from('texto plano').toString('base64'), mime: 'application/pdf' } })).estado, 415);
  igual((await asesor.put('evidencias', { id, empresaId: ids.e1, actividadId: ids.act, nombre: 'acta.pdf', archivo: { base64: PDF.toString('base64'), mime: 'application/pdf' } })).estado, 204);
  const ev = (await asesor.get(`/evidencias/${id}`)).j; igual(ev.archivo.sha256, createHash('sha256').update(PDF).digest('hex'));
  const f = await asesor.pedir('GET', `/archivos/evidencias/${id}`, undefined, { crudo: true }); igual(f.estado, 200); igual(Buffer.compare(f.buf, PDF), 0, 'contenido idéntico');
  igual((await asesor.put('evidencias', { ...ev, nombre: 'otro.pdf' })).estado, 409);
  igual((await admin.put('actividades', { id: ids.act, planId: ids.plan, empresaId: ids.e1, estado: 'verificada', codigo: 'A-1' })).estado, 204);
  igual((await asesor.put('actividades', { id: ids.act, planId: ids.plan, empresaId: ids.e1, estado: 'pendiente', codigo: 'A-1' })).estado, 409, 'cerrada inmutable');
});
await prueba('eliminación física no permitida (se usa eliminación lógica)', async () => {
  igual((await admin.del(`/empresas/${ids.e2}`)).estado, 403);
  igual((await admin.del('/auditoria/x')).estado, 403);
});
await prueba('lote atómico: si una operación falla no se aplica ninguna', async () => {
  const idOk = uid();
  const r = await admin.post('/lote', { ops: [{ tipo: 'guardar', store: 'hallazgos', valor: { id: idOk, empresaId: ids.e1, diagnosticoId: ids.dx, estado: 'abierto' } }, { tipo: 'limpiar', store: 'empresas' }] });
  igual(r.estado, 422); igual((await admin.get(`/hallazgos/${idOk}`)).estado, 404);
});
await prueba('bitácora sellada por el servidor y de solo inserción', async () => {
  const id = uid();
  igual((await asesor.put('auditoria', { id, accion: 'crear', entidad: 'empresas', usuarioId: 'otro', usuarioNombre: 'Suplantado', fecha: '2000-01-01T00:00:00.000Z' })).estado, 204);
  const e = (await asesor.get('/auditoria')).j.find((x) => x.id === id);
  igual(e.usuarioId, ids.asesor); igual(e.usuarioNombre, 'Asesor Integración'); igual(e.fecha.startsWith('2000'), false);
  igual((await asesor.put('auditoria', { id, accion: 'eliminar_logico' })).estado, 409);
  igual((await asesor.get('/auditoria/verificar')).estado, 403);
  const v = (await admin.get('/auditoria/verificar')).j; igual(v.integra, true, JSON.stringify(v.problemas));
});
await prueba('bloqueo por intentos fallidos', async () => {
  const x = new Cliente();
  for (let i = 0; i < 5; i++) igual((await x.post('/sesion', { email: 'cliente@integracion.co', contrasena: 'incorrecta' + i })).estado, 401);
  const r = await x.post('/sesion', { email: 'cliente@integracion.co', contrasena: CLAVE_ASESOR }); igual(r.estado, 423, r.j?.error);
});
await prueba('respaldo del servidor: huella compatible con el navegador; importación protegida', async () => {
  const r = await admin.pedir('GET', '/respaldo', undefined, { crudo: true }); igual(r.estado, 200);
  const p = JSON.parse(r.buf.toString('utf8'));
  igual(p.formato, 'SI360-RESPALDO');
  igual(createHash('sha256').update(JSON.stringify(p.datos)).digest('hex'), p.integridad.hash, 'huella');
  igual(p.datos.evidencias[0].archivo.base64, PDF.toString('base64'), 'incluye el archivo');
  igual(typeof p.datos.usuarios[0].credencial, 'string');
  igual((await admin.post('/respaldo', { paquete: p, motivo: 'prueba' })).estado, 409, 'instalación con datos');
});
await prueba('cerrar sesión invalida la cookie', async () => {
  const c = asesor.cookie; await asesor.del('/sesion');
  const r = await fetch(BASE + '/empresas', { headers: { Cookie: c } }); igual(r.status, 401);
});
if (process.env.SI360_MYSQL) {
  await prueba('manipulación directa en MySQL detectada por la verificación', async () => {
    execSync(`${process.env.SI360_MYSQL} -e "UPDATE auditoria SET datos = JSON_SET(datos, '$.motivo', 'alterado') WHERE secuencia = 2"`);
    const v = (await admin.get('/auditoria/verificar')).j; igual(v.integra, false); igual(v.problemas[0].tipo, 'modificada');
  });
}
console.log(`\n${ok} correctas, ${fallas} fallidas`);
process.exit(fallas ? 1 : 0);

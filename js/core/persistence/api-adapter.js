/**
 * Adaptador de persistencia contra la API REST de SER INTEGRAL 360 (PHP + MySQL).
 * Implementa el mismo contrato que IndexedDBAdapter, de modo que las vistas y los servicios no cambian.
 * La seguridad real la impone el servidor: sesión por cookie HttpOnly, token CSRF en cada escritura,
 * permisos por rol, alcance por empresa, reglas de inmutabilidad y bitácora encadenada.
 */
import { STORES } from '../config.js';
import { emit, emitirEstadoGuardado } from '../events.js';

const CON_ARCHIVO = new Set(['documentos', 'evidencias']);

function blobABase64(blob) {
  return new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = () => fail(r.error); r.readAsDataURL(blob); });
}

export class ApiAdapter {
  constructor(base) { this.base = base.replace(/\/$/, ''); this.csrf = null; this.persistente = true; }

  async _pedir(metodo, ruta, cuerpo, { comoBlob = false, silencioso401 = false } = {}) {
    const headers = { Accept: 'application/json', 'X-Requested-With': 'SI360' };
    if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
    if (metodo !== 'GET' && this.csrf) headers['X-CSRF-Token'] = this.csrf;
    let r;
    try {
      r = await fetch(`${this.base}${ruta}`, { method: metodo, credentials: 'same-origin', cache: 'no-store', headers, body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined });
    } catch {
      throw new Error('No hay conexión con el servidor. Verifique su conexión a Internet e intente de nuevo; no se guardó ningún cambio.');
    }
    if (r.status === 401) {
      const j = await r.json().catch(() => ({}));
      if (!silencioso401) emit('sesion-expirada');
      throw Object.assign(new Error(silencioso401 && j.error ? j.error : 'Su sesión expiró o no ha iniciado sesión.'), { estado: 401 });
    }
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const e = new Error(j.error || `El servidor respondió con un error (${r.status}).`);
      e.estado = r.status; if (j.campos) e.campos = j.campos;
      throw e;
    }
    if (r.status === 204) return null;
    return comoBlob ? r.blob() : r.json();
  }

  _ruta(store, id) { return `/${encodeURIComponent(store)}${id !== undefined ? `/${encodeURIComponent(id)}` : ''}`; }

  async _serializar(store, obj) {
    if (!CON_ARCHIVO.has(store) || !(obj?.archivo instanceof Blob)) return obj;
    return { ...obj, archivo: { base64: await blobABase64(obj.archivo), mime: obj.archivo.type || obj.mime } };
  }

  async _hidratar(store, obj) {
    if (!obj || !CON_ARCHIVO.has(store) || !obj.archivo?.ref) return obj;
    const blob = await this._pedir('GET', `/archivos/${encodeURIComponent(store)}/${encodeURIComponent(obj.id)}`, undefined, { comoBlob: true });
    return { ...obj, archivo: blob };
  }

  async _escribir(fn) {
    emitirEstadoGuardado('guardando');
    try { const r = await fn(); emitirEstadoGuardado('guardado'); return r; }
    catch (e) { emitirEstadoGuardado('error', e); throw e; }
  }

  /* ---------- Sistema y sesión ---------- */
  async abrir() {
    const e = await this.estado();
    if (e?.app !== 'SI360') throw new Error('El servidor no respondió como SER INTEGRAL 360. Revise la instalación de la API.');
    return true;
  }
  estado() { return this._pedir('GET', '/estado', undefined, { silencioso401: true }); }
  async instalar(d) { const r = await this._pedir('POST', '/instalacion', d); this.csrf = r.csrf; return r.usuario; }
  async iniciarSesion(email, contrasena) { const r = await this._pedir('POST', '/sesion', { email, contrasena }, { silencioso401: true }); this.csrf = r.csrf; return r.usuario; }
  async sesionActual() {
    const r = await this._pedir('GET', '/sesion', undefined, { silencioso401: true });
    this.csrf = r?.csrf || null;
    return r?.usuario || null;
  }
  async cerrarSesion() { await this._pedir('DELETE', '/sesion', undefined, { silencioso401: true }); this.csrf = null; }
  async cambiarContrasena(actual, nueva) { const r = await this._pedir('POST', '/cuenta/contrasena', { actual, nueva }); return r.usuario; }
  restablecerContrasena(id, temporal) { return this._pedir('POST', `/usuarios/${encodeURIComponent(id)}/contrasena`, { temporal }); }
  verificarBitacora() { return this._pedir('GET', '/auditoria/verificar'); }
  exportarRespaldo() { return this._pedir('GET', '/respaldo', undefined, { comoBlob: true }); }
  importarRespaldo(paquete, motivo) { return this._escribir(() => this._pedir('POST', '/respaldo', { paquete, motivo })); }

  /* ---------- Contrato DataStore ---------- */
  async obtener(store, id) {
    return this._hidratar(store, await this._pedir('GET', `${this._ruta(store, id)}?opcional=1`));
  }
  listar(store) { return this._pedir('GET', this._ruta(store)); }
  porIndice(store, indice, valor) { return this._pedir('GET', `${this._ruta(store)}?${new URLSearchParams({ indice, valor: valor ?? '' })}`); }
  async contarPorIndice(store, indice, valor) {
    const r = await this._pedir('GET', `${this._ruta(store)}?${new URLSearchParams({ indice, valor: valor ?? '', contar: '1' })}`);
    return r.total;
  }
  guardar(store, obj) {
    return this._escribir(async () => {
      const id = obj[STORES[store]?.keyPath || 'id'];
      await this._pedir('PUT', this._ruta(store, id), await this._serializar(store, obj));
      return obj;
    });
  }
  eliminar(store, id) { return this._escribir(() => this._pedir('DELETE', this._ruta(store, id))); }
  lote(ops) {
    if (!ops.length) return Promise.resolve();
    return this._escribir(async () => {
      const cuerpo = [];
      for (const o of ops) cuerpo.push(o.tipo === 'guardar' ? { ...o, valor: await this._serializar(o.store, o.valor) } : o);
      await this._pedir('POST', '/lote', { ops: cuerpo });
    });
  }
  async siguiente(clave) { return (await this._pedir('POST', `/consecutivos/${encodeURIComponent(clave)}`, {})).valor; }
  async estimarUso() { return null; }
}

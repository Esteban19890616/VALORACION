/**
 * Adaptador de persistencia sobre IndexedDB.
 * Implementa el contrato DataStore (ver ./contract.js). La interfaz y los
 * servicios nunca usan IndexedDB directamente: solo llaman a estos métodos,
 * de modo que puedan sustituirse por ApiAdapter (PHP + MySQL) sin cambios.
 */
import { emitirEstadoGuardado } from '../events.js';

const req = (r) => new Promise((ok, fail) => { r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });
const fin = (tx) => new Promise((ok, fail) => {
  tx.oncomplete = () => ok();
  tx.onerror = () => fail(tx.error);
  tx.onabort = () => fail(tx.error || new Error('Transacción abortada'));
});

export class IndexedDBAdapter {
  constructor(nombre, version, stores) {
    this.nombre = nombre; this.version = version; this.stores = stores; this.db = null;
  }

  async abrir() {
    if (this.db) return this.db;
    if (!('indexedDB' in globalThis)) throw new Error('Este navegador no permite almacenamiento local (IndexedDB). Use Chrome, Edge o Firefox actualizados y no utilice ventanas privadas.');
    const r = indexedDB.open(this.nombre, this.version);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const [nombre, def] of Object.entries(this.stores)) {
        const os = db.objectStoreNames.contains(nombre) ? r.transaction.objectStore(nombre) : db.createObjectStore(nombre, { keyPath: def.keyPath });
        for (const [idx, ruta, opts] of def.indexes || []) if (!os.indexNames.contains(idx)) os.createIndex(idx, ruta, opts || {});
      }
    };
    r.onblocked = () => console.warn('Base local bloqueada: cierre otras pestañas de SER INTEGRAL 360.');
    this.db = await req(r);
    this.db.onversionchange = () => { this.db.close(); this.db = null; };
    // Solicita almacenamiento persistente (el navegador puede negarlo).
    try { if (navigator.storage?.persist) this.persistente = await navigator.storage.persist(); } catch { this.persistente = false; }
    return this.db;
  }

  async _store(nombre, modo = 'readonly') {
    const db = await this.abrir();
    const tx = db.transaction(nombre, modo);
    return { tx, os: tx.objectStore(nombre) };
  }

  async obtener(store, id) { const { os } = await this._store(store); return (await req(os.get(id))) ?? null; }
  async listar(store) { const { os } = await this._store(store); return req(os.getAll()); }
  async porIndice(store, indice, valor) { const { os } = await this._store(store); return req(os.index(indice).getAll(valor)); }
  async contarPorIndice(store, indice, valor) { const { os } = await this._store(store); return req(os.index(indice).count(valor)); }

  async guardar(store, obj) {
    emitirEstadoGuardado('guardando');
    try {
      const { tx, os } = await this._store(store, 'readwrite');
      os.put(obj); await fin(tx);
      emitirEstadoGuardado('guardado');
      return obj;
    } catch (e) { emitirEstadoGuardado('error', e); throw traducirError(e); }
  }

  async eliminar(store, id) {
    emitirEstadoGuardado('guardando');
    try {
      const { tx, os } = await this._store(store, 'readwrite');
      os.delete(id); await fin(tx);
      emitirEstadoGuardado('guardado');
    } catch (e) { emitirEstadoGuardado('error', e); throw traducirError(e); }
  }

  /**
   * Ejecuta varias escrituras en UNA transacción: si cualquiera falla,
   * ninguna se aplica (usado por la importación de respaldos).
   * ops: [{ tipo: 'limpiar'|'guardar'|'eliminar', store, valor?, id? }]
   */
  async lote(ops) {
    if (!ops.length) return;
    emitirEstadoGuardado('guardando');
    try {
      const db = await this.abrir();
      const nombres = [...new Set(ops.map((o) => o.store))];
      const tx = db.transaction(nombres, 'readwrite');
      for (const o of ops) {
        const os = tx.objectStore(o.store);
        if (o.tipo === 'limpiar') os.clear();
        else if (o.tipo === 'guardar') os.put(o.valor);
        else if (o.tipo === 'eliminar') os.delete(o.id);
      }
      await fin(tx);
      emitirEstadoGuardado('guardado');
    } catch (e) { emitirEstadoGuardado('error', e); throw traducirError(e); }
  }

  /**
   * Consecutivo atómico: lee e incrementa en una sola transacción (seguro entre pestañas).
   * Devuelve el nuevo valor. El contador vive en el almacén "meta".
   */
  async siguiente(clave) {
    const db = await this.abrir();
    return new Promise((ok, fail) => {
      const tx = db.transaction('meta', 'readwrite'); const os = tx.objectStore('meta');
      let valor = 0;
      const r = os.get(clave);
      r.onsuccess = () => { valor = (Number(r.result?.valor) || 0) + 1; os.put({ clave, valor }); };
      tx.oncomplete = () => ok(valor);
      tx.onerror = () => fail(traducirError(tx.error));
      tx.onabort = () => fail(traducirError(tx.error || new Error('Transacción abortada')));
    });
  }

  async estimarUso() {
    try { const e = await navigator.storage?.estimate?.(); return e ? { usado: e.usage, cuota: e.quota } : null; } catch { return null; }
  }
}

function traducirError(e) {
  if (e?.name === 'QuotaExceededError') return new Error('El navegador no tiene espacio disponible. Exporte un respaldo y libere archivos adjuntos grandes.');
  if (e?.name === 'ConstraintError') return new Error('El registro viola una restricción de unicidad (por ejemplo, correo o código duplicado).');
  return e instanceof Error ? e : new Error(String(e));
}

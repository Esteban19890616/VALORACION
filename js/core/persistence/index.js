/**
 * Punto único de acceso a datos. Contrato DataStore:
 *   abrir(), obtener(store,id), listar(store), porIndice(store,indice,valor),
 *   contarPorIndice(store,indice,valor), guardar(store,obj), eliminar(store,id),
 *   lote(ops), siguiente(clave) [consecutivo atómico], estimarUso()
 */
import { APP, STORES } from '../config.js';
import { IndexedDBAdapter } from './indexeddb-adapter.js';
import { ApiAdapter } from './api-adapter.js';

export const datos = APP.PERSISTENCIA === 'api'
  ? new ApiAdapter(APP.API_BASE)
  : new IndexedDBAdapter(APP.DB_NOMBRE, APP.DB_VERSION, STORES);

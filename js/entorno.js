/*
 * Entorno de ejecución de SER INTEGRAL 360 (script clásico, se carga antes que la aplicación).
 * - En el equipo local (iniciar.bat) se usa este archivo: datos en el navegador (IndexedDB).
 * - En el servidor (Hostinger) el archivo .htaccess entrega en su lugar api/entorno.php,
 *   que indica persistencia 'api' (PHP + MySQL). No edite este archivo para producción.
 */
window.SI360_ENTORNO = { persistencia: 'indexeddb', apiBase: 'api/v1', origen: 'archivo-local' };

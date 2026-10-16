<?php
/**
 * En el servidor, .htaccess sirve este archivo en lugar de js/entorno.js:
 * el navegador queda en modo API (MySQL) y no puede caer silenciosamente al modo local.
 */
header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
echo "window.SI360_ENTORNO = Object.freeze({ persistencia: 'api', apiBase: 'api/v1' });\n";

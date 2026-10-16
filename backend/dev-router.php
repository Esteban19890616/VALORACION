<?php
/**
 * Servidor de desarrollo local que imita el .htaccess de Hostinger:
 *   php -S 127.0.0.1:8080 backend/dev-router.php
 * (requiere backend/config.local.php o la variable SI360_CONFIG)
 */
$ruta = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/';
$raiz = dirname(__DIR__);
if ($ruta === '/js/entorno.js') { require $raiz . '/api/entorno.php'; return true; }
if (preg_match('#^/api/v1(?:/(.*))?$#', $ruta, $m)) {
    $_GET['ruta'] = $m[1] ?? '';
    require $raiz . '/api/index.php';
    return true;
}
if (preg_match('#^/(backend|database|docs|tests|tools|api)(/|$)|/\.#', $ruta)) { http_response_code(403); echo 'Prohibido'; return true; }
if ($ruta === '/') $ruta = '/index.html';
$f = realpath($raiz . $ruta);
if ($f && str_starts_with($f, $raiz) && is_file($f)) {
    $tipos = ['html' => 'text/html; charset=utf-8', 'js' => 'application/javascript; charset=utf-8', 'mjs' => 'application/javascript', 'css' => 'text/css; charset=utf-8', 'svg' => 'image/svg+xml', 'png' => 'image/png', 'json' => 'application/json', 'woff2' => 'font/woff2', 'ico' => 'image/x-icon'];
    header('Content-Type: ' . ($tipos[pathinfo($f, PATHINFO_EXTENSION)] ?? 'application/octet-stream'));
    header('X-Content-Type-Options: nosniff');
    readfile($f);
    return true;
}
http_response_code(404); echo 'No encontrado';
return true;

<?php
declare(strict_types=1);
/** Punto de entrada de la API de SER INTEGRAL 360. Todo el código vive en backend/. */
require dirname(__DIR__) . '/backend/bootstrap.php';

try {
    $cfg = si360_iniciar();
} catch (\Throwable $e) {
    error_log('[SI360] Arranque: ' . $e->getMessage());
    \SI360\Http::cabecerasSeguridad();
    \SI360\Http::error(503, 'El servidor no está configurado correctamente: ' . ($e instanceof \PDOException ? 'no fue posible conectar con la base de datos.' : $e->getMessage()));
}
$ruta = trim((string) ($_GET['ruta'] ?? ''), '/');
$seg = $ruta === '' ? [] : array_map('rawurldecode', explode('/', $ruta));
(new \SI360\Api($cfg))->atender($_SERVER['REQUEST_METHOD'] ?? 'GET', $seg);

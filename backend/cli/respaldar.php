<?php
/**
 * Respaldo automático (para cron en Hostinger: hPanel → Avanzado → Cron Jobs):
 *   /usr/bin/php /home/uXXXX/domains/su-dominio/public_html/backend/cli/respaldar.php
 * Escribe si360-AAAAMMDD-HHMMSS.json.gz en la carpeta privada de respaldos, verifica que se pueda
 * leer y que su huella coincida, y conserva los últimos N (retener_respaldos).
 * Copie periódicamente los respaldos FUERA del servidor (otra nube o un disco): un respaldo
 * guardado solo en el mismo servidor no protege ante la pérdida de la cuenta.
 */
require __DIR__ . '/comun.php';
try {
    $cfg = si360_iniciar();
    $dir = opcion($argv, 'destino', $cfg['respaldos_dir']);
    if (!is_dir($dir) && !mkdir($dir, 0700, true)) salir("No se pudo crear $dir");
    $p = SI360\Respaldo::exportar(null, SI360_VERSION);
    $json = SI360\Json::codificar($p);
    $f = $dir . '/si360-' . gmdate('Ymd-His') . '.json.gz';
    if (file_put_contents($f, gzencode($json, 9)) === false) salir("No se pudo escribir $f");
    chmod($f, 0600);
    // Verificación: releer, descomprimir y comprobar la huella.
    $v = SI360\Json::decodificar((string) gzdecode((string) file_get_contents($f)));
    [$err] = SI360\Respaldo::analizar($v);
    if ($err) { @unlink($f); salir('El respaldo generado no superó la verificación: ' . implode(' ', $err)); }
    $todos = glob($dir . '/si360-*.json.gz'); sort($todos);
    $sobran = array_slice($todos, 0, max(0, count($todos) - (int) $cfg['retener_respaldos']));
    foreach ($sobran as $x) unlink($x);
    SI360\Auditoria::evento('exportar', 'sistema', null, 'Respaldo automático ' . basename($f) . ' (' . array_sum($p['conteos']) . ' registros)', null);
    echo 'Respaldo verificado: ' . $f . ' (' . round(filesize($f) / 1024) . " KB). Eliminados por rotación: " . count($sobran) . "\n";
} catch (Throwable $e) { error_log('[SI360] respaldo: ' . $e->getMessage()); salir('Error: ' . $e->getMessage()); }

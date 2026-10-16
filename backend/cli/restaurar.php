<?php
/**
 * Restaura un respaldo REEMPLAZANDO toda la información del servidor.
 *   php backend/cli/restaurar.php archivo.json[.gz] --motivo="..." --confirmar
 * Antes de restaurar se genera automáticamente un respaldo de seguridad del estado actual.
 */
require __DIR__ . '/comun.php';
try {
    $cfg = si360_iniciar();
    $arch = $argv[1] ?? '';
    if (!is_file($arch)) salir('Uso: php restaurar.php archivo.json[.gz] --motivo="..." --confirmar');
    $raw = (string) file_get_contents($arch);
    if (str_ends_with($arch, '.gz')) $raw = (string) gzdecode($raw);
    $p = SI360\Json::decodificar($raw);
    [$err, $adv] = SI360\Respaldo::analizar($p);
    if ($err) salir("Respaldo no válido:\n - " . implode("\n - ", $err));
    echo "Respaldo generado {$p['generado']} por " . ($p['generadoPor']['nombre'] ?? '—') . "\n";
    foreach ($p['conteos'] ?? [] as $k => $n) echo "  $k: $n\n";
    foreach ($adv as $a) echo "  Advertencia: $a\n";
    $motivo = opcion($argv, 'motivo');
    if (!$motivo) salir('Indique --motivo="..."');
    if (!opcion($argv, 'confirmar')) salir("Validación correcta. Para REEMPLAZAR todos los datos agregue --confirmar.", 0);
    if (!is_dir($cfg['respaldos_dir'])) mkdir($cfg['respaldos_dir'], 0700, true);
    $seg = $cfg['respaldos_dir'] . '/antes-de-restaurar-' . gmdate('Ymd-His') . '.json.gz';
    file_put_contents($seg, gzencode(SI360\Json::codificar(SI360\Respaldo::exportar(null, SI360_VERSION)), 9));
    echo "Respaldo de seguridad del estado actual: $seg\n";
    $r = SI360\Respaldo::restaurar($p, $motivo . ' (línea de comandos)', null);
    foreach ($r['advertencias'] as $a) echo "  Advertencia: $a\n";
    echo "Restauración completada. Las sesiones abiertas deben ingresar de nuevo.\n";
} catch (Throwable $e) { salir('Error: ' . $e->getMessage()); }

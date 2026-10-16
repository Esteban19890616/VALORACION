<?php
/** Diagnóstico del servidor: PHP, extensiones, conexión, esquema, carpetas privadas y cadena de la bitácora. */
require __DIR__ . '/comun.php';
$ok = true;
$v = function (bool $c, string $m) use (&$ok): void { echo ($c ? '[OK]    ' : '[FALLA] ') . $m . PHP_EOL; if (!$c) $ok = false; };
$v(PHP_VERSION_ID >= 80200, 'PHP ' . PHP_VERSION . ' (se requiere 8.2 o superior)');
foreach (['pdo_mysql', 'mbstring', 'fileinfo', 'json', 'zlib'] as $x) $v(extension_loaded($x), "Extensión $x");
$v(defined('PASSWORD_ARGON2ID'), 'Argon2id disponible (si no, se usa bcrypt)');
try {
    $cfg = si360_iniciar();
    $v(true, 'Conexión a la base de datos');
    $r = SI360\Db::uno('SELECT VERSION() v')['v']; echo "        Servidor: $r\n";
    $v(SI360\Esquema::instalado(), 'Esquema instalado');
    foreach (['archivos_dir', 'sesiones_dir', 'respaldos_dir'] as $k) {
        $d = $cfg[$k]; if (!is_dir($d)) @mkdir($d, 0700, true);
        $v(is_dir($d) && is_writable($d), "Carpeta $k escribible ($d)");
        $raiz = dirname(__DIR__, 2);
        $v(!str_starts_with(realpath($d) ?: $d, $raiz . DIRECTORY_SEPARATOR) && !preg_match('#[/\\\\](public_html|www|htdocs)([/\\\\]|$)#i', realpath($d) ?: $d), "$k fuera del despliegue y de public_html");
    }
    $v(empty($cfg['permitir_instalacion_web']) || !SI360\Db::uno('SELECT 1 FROM `usuarios` LIMIT 1'), 'Instalación web desactivada tras la instalación');
    if (SI360\Esquema::instalado()) {
        $b = SI360\Auditoria::verificar();
        $v($b['integra'], "Cadena de la bitácora íntegra ({$b['encadenadas']} entradas)");
        foreach (array_slice($b['problemas'], 0, 10) as $p) echo "        #{$p['secuencia']} {$p['tipo']}: {$p['detalle']}\n";
    }
} catch (Throwable $e) { $v(false, $e->getMessage()); }
exit($ok ? 0 : 1);

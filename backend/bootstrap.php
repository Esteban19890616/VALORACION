<?php
declare(strict_types=1);

/**
 * Arranque común de la API y de las herramientas de línea de comandos.
 * La configuración (credenciales de MySQL, carpetas privadas) vive FUERA de la carpeta pública:
 *   /home/uXXXX/domains/su-dominio/si360-privado/config.php   (Hostinger)
 * Un despliegue con Git sobrescribe public_html: nada privado debe quedar allí.
 */

spl_autoload_register(function (string $c): void {
    if (str_starts_with($c, 'SI360\\')) {
        $f = __DIR__ . '/src/' . str_replace('\\', '/', substr($c, 6)) . '.php';
        if (is_file($f)) require $f;
    }
});

const SI360_VERSION = '1.0.0';

function si360_config(): array
{
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $raiz = rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), '/\\');
    $candidatos = array_filter([
        getenv('SI360_CONFIG') ?: null,
        $raiz !== '' ? dirname($raiz) . '/si360-privado/config.php' : null,
        dirname(__DIR__, 2) . '/si360-privado/config.php',
        dirname(__DIR__) . '/si360-privado/config.php',
        __DIR__ . '/config.local.php', // solo desarrollo local (ignorado por Git)
    ]);
    foreach ($candidatos as $f) {
        if (!is_file($f)) continue;
        $real = realpath($f);
        $esLocal = __DIR__ . '/config.local.php' === $f;
        if (!$esLocal && $raiz !== '' && PHP_SAPI !== 'cli' && str_starts_with($real, realpath($raiz) . DIRECTORY_SEPARATOR) && !\SI360\Http::esLocal()) {
            throw new \RuntimeException('El archivo de configuración está dentro de la carpeta pública. Muévalo a si360-privado/ fuera de public_html.');
        }
        if ($esLocal && PHP_SAPI !== 'cli' && !\SI360\Http::esLocal()) continue;
        $c = require $f;
        if (!is_array($c) || empty($c['db']['dsn'])) throw new \RuntimeException("Configuración incompleta en $f.");
        $privado = dirname($real);
        $c += ['archivos_dir' => $privado . '/archivos', 'sesiones_dir' => $privado . '/sesiones', 'respaldos_dir' => $privado . '/respaldos', 'registro' => $privado . '/registro/errores.log'];
        $c += ['permitir_instalacion_web' => true, 'sesion_inactividad_min' => 30, 'sesion_maxima_horas' => 12, 'max_cuerpo_mb' => 16, 'max_respaldo_mb' => 96, 'retener_respaldos' => 30, 'depuracion' => false];
        return $cfg = $c;
    }
    throw new \RuntimeException('No se encontró la configuración del servidor (si360-privado/config.php). Consulte docs/DESPLIEGUE_HOSTINGER.md.');
}

function si360_iniciar(): array
{
    $cfg = si360_config();
    date_default_timezone_set('UTC');
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
    if (!is_dir(dirname($cfg['registro']))) @mkdir(dirname($cfg['registro']), 0700, true);
    ini_set('error_log', $cfg['registro']);
    \SI360\Db::conectar($cfg['db']);
    \SI360\Archivos::configurar($cfg['archivos_dir']);
    return $cfg;
}

<?php
declare(strict_types=1);

namespace SI360;

/**
 * Sesión del servidor: cookie HttpOnly + SameSite=Strict (+ Secure en HTTPS), id regenerado al ingresar,
 * cierre por inactividad y duración máxima, token CSRF exigido en toda escritura.
 */
final class Sesion
{
    private static array $cfg = [];

    public static function iniciar(array $cfg): void
    {
        self::$cfg = $cfg;
        if (session_status() === PHP_SESSION_ACTIVE) return;
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.sid_length', '48');
        ini_set('session.sid_bits_per_character', '6');
        if (!empty($cfg['sesiones_dir'])) {
            if (!is_dir($cfg['sesiones_dir'])) @mkdir($cfg['sesiones_dir'], 0700, true);
            session_save_path($cfg['sesiones_dir']);
        }
        session_name('SI360SESS');
        session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => Http::esHttps(), 'httponly' => true, 'samesite' => 'Strict']);
        session_start();
        $min = (int) ($cfg['sesion_inactividad_min'] ?? 30);
        $max = (int) ($cfg['sesion_maxima_horas'] ?? 12) * 3600;
        if (isset($_SESSION['usuario_id'])) {
            $ahora = time();
            if ($ahora - ($_SESSION['ultimo_uso'] ?? 0) > $min * 60 || $ahora - ($_SESSION['inicio'] ?? 0) > $max) {
                self::destruir();
                return;
            }
            $_SESSION['ultimo_uso'] = $ahora;
        }
    }

    public static function usuarioId(): ?string { return $_SESSION['usuario_id'] ?? null; }

    public static function abrir(string $usuarioId): string
    {
        session_regenerate_id(true);
        $_SESSION = ['usuario_id' => $usuarioId, 'inicio' => time(), 'ultimo_uso' => time(), 'csrf' => bin2hex(random_bytes(32))];
        return $_SESSION['csrf'];
    }

    public static function csrf(): ?string { return $_SESSION['csrf'] ?? null; }

    public static function exigirCsrf(): void
    {
        $t = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!self::csrf() || !is_string($t) || !hash_equals(self::csrf(), $t)) throw new ErrorHttp(403, 'Solicitud rechazada por seguridad (token CSRF inválido). Recargue la página.');
        // Defensa adicional: si el navegador envía Origin, debe ser el mismo sitio.
        $origen = $_SERVER['HTTP_ORIGIN'] ?? '';
        if ($origen !== '' && parse_url($origen, PHP_URL_HOST) !== explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]) throw new ErrorHttp(403, 'Origen de la solicitud no permitido.');
    }

    public static function destruir(): void
    {
        $_SESSION = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => 'Strict']);
            session_destroy();
        }
    }
}

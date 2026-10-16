<?php
declare(strict_types=1);

namespace SI360;

/** Respuestas HTTP y utilidades de la solicitud. */
final class Http
{
    public static function cabecerasSeguridad(): void
    {
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: same-origin');
        header('Cache-Control: no-store, max-age=0');
        header('Cross-Origin-Resource-Policy: same-origin');
        header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
        if (self::esHttps()) header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    }

    public static function esHttps(): bool
    {
        return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
            || (($_SERVER['SERVER_PORT'] ?? '') === '443');
    }

    public static function esLocal(): bool
    {
        $h = strtolower(explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]);
        return in_array($h, ['localhost', '127.0.0.1', '::1'], true);
    }

    public static function json($datos, int $estado = 200): never
    {
        http_response_code($estado);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function vacio(): never
    {
        http_response_code(204);
        exit;
    }

    public static function error(int $estado, string $mensaje, ?array $campos = null): never
    {
        $r = ['error' => $mensaje];
        if ($campos) $r['campos'] = $campos;
        self::json($r, $estado);
    }

    /** Cuerpo JSON de la solicitud (máximo configurable). */
    public static function cuerpo(int $maxBytes): array
    {
        $len = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
        if ($len > $maxBytes) throw new ErrorHttp(413, 'La solicitud es demasiado grande.');
        $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
        if ($raw === false || $raw === '') return [];
        if (strlen($raw) > $maxBytes) throw new ErrorHttp(413, 'La solicitud es demasiado grande.');
        try { $d = Json::decodificar($raw); } catch (\JsonException) { throw new ErrorHttp(400, 'El cuerpo de la solicitud no es JSON válido.'); }
        return $d;
    }

    public static function ip(): string
    {
        return substr((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
    }
}

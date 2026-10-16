<?php
declare(strict_types=1);

namespace SI360;

/**
 * Contraseñas: Argon2id (o bcrypt si el servidor no lo soporta) con password_hash().
 * Acepta credenciales PBKDF2-SHA256 del prototipo local (importación o usuarios creados en el navegador)
 * y las convierte a Argon2id/bcrypt en el primer ingreso exitoso.
 */
final class Credenciales
{
    public static function algoritmo(): string|int
    {
        return defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_BCRYPT;
    }

    public static function hash(string $clave): string
    {
        return password_hash($clave, self::algoritmo());
    }

    /** Política: mínimo 10 caracteres, letras y números. Devuelve faltantes. */
    public static function politica(string $c): array
    {
        $e = [];
        if (mb_strlen($c) < 10) $e[] = 'mínimo 10 caracteres';
        if (!preg_match('/\p{L}/u', $c)) $e[] = 'al menos una letra';
        if (!preg_match('/\d/', $c)) $e[] = 'al menos un número';
        if (mb_strlen($c) > 200) $e[] = 'máximo 200 caracteres';
        return $e;
    }

    public static function exigirPolitica(string $c, string $etiqueta = 'La contraseña'): void
    {
        $e = self::politica($c);
        if ($e) throw new ErrorHttp(422, "$etiqueta necesita " . implode(', ', $e) . '.');
    }

    /** Credencial del prototipo {algoritmo:'PBKDF2-SHA256', iteraciones, sal, hash} → formato heredado. */
    public static function desdePrototipo($c): ?string
    {
        if (!is_array($c) || ($c['algoritmo'] ?? '') !== 'PBKDF2-SHA256') return null;
        $it = (int) ($c['iteraciones'] ?? 0);
        if ($it < 100000 || $it > 2000000 || !is_string($c['sal'] ?? null) || !is_string($c['hash'] ?? null)) return null;
        if (base64_decode($c['sal'], true) === false || strlen((string) base64_decode($c['hash'], true)) !== 32) return null;
        return "pbkdf2_sha256\${$it}\${$c['sal']}\${$c['hash']}";
    }

    public static function verificar(string $clave, string $guardado): bool
    {
        if (str_starts_with($guardado, 'pbkdf2_sha256$')) {
            [, $it, $sal, $hash] = explode('$', $guardado, 4) + [null, null, null, null];
            $calc = hash_pbkdf2('sha256', $clave, (string) base64_decode((string) $sal), (int) $it, 32, true);
            return hash_equals((string) base64_decode((string) $hash), $calc);
        }
        return password_verify($clave, $guardado);
    }

    public static function requiereRehash(string $guardado): bool
    {
        return str_starts_with($guardado, 'pbkdf2_sha256$') || password_needs_rehash($guardado, self::algoritmo());
    }
}

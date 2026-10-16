<?php
declare(strict_types=1);

namespace SI360;

/**
 * Respaldos en el mismo formato que el prototipo (SI360-RESPALDO v1), de modo que un respaldo
 * del navegador puede migrarse al servidor y uno del servidor puede validarse en el navegador.
 * Integridad: SHA-256 de JSON.stringify(datos), equivalente a Json::codificar(datos).
 */
final class Respaldo
{
    public const FORMATO = 'SI360-RESPALDO';
    public const VERSION_FORMATO = 1;
    private const EXCLUIR = ['borradores'];

    /** Almacenes en orden de restauración (padres antes que hijos). */
    private static function almacenes(): array
    {
        return array_values(array_filter(array_keys(Almacenes::DEF), fn ($s) => !in_array($s, self::EXCLUIR, true)));
    }

    public static function exportar(?array $usuario, string $version): array
    {
        $datos = [];
        foreach (self::almacenes() as $s) {
            $orden = $s === 'auditoria' ? ' ORDER BY secuencia IS NULL, secuencia' : '';
            $filas = [];
            foreach (Db::todos('SELECT * FROM ' . Db::id($s) . $orden) as $f) {
                $d = Json::decodificar($f['datos']);
                if ($s === 'meta' && $f['clave'] === 'cadenaBitacora') continue; // se reconstruye al restaurar
                if ($s === 'usuarios') {
                    $d['credencial'] = $f['credencial']; $d['debeCambiarContrasena'] = (bool) $f['debe_cambiar'];
                    $d['ultimoIngreso'] = $f['ultimo_ingreso']; $d['intentosFallidos'] = (int) $f['intentos']; $d['bloqueadoHasta'] = $f['bloqueado_hasta'];
                }
                if (in_array($s, Almacenes::CON_ARCHIVO, true) && is_array($d['archivo'] ?? null) && !empty($d['archivo']['ref'])) {
                    $d['archivo'] = Archivos::existe($s, (string) $d['id'])
                        ? ['base64' => base64_encode(Archivos::leer($s, (string) $d['id'])), 'mime' => $d['archivo']['mime'] ?? ($d['mime'] ?? '')]
                        : null;
                }
                $filas[] = Json::comoJs($d);
            }
            $datos[$s] = $filas;
        }
        $cuerpo = Json::codificar($datos);
        return [
            'formato' => self::FORMATO, 'versionFormato' => self::VERSION_FORMATO, 'app' => 'SER INTEGRAL 360', 'versionApp' => $version,
            'origen' => 'servidor', 'generado' => Auditoria::ahora(),
            'generadoPor' => ['id' => $usuario['id'] ?? 'sistema', 'nombre' => $usuario['nombre'] ?? 'Tarea programada'],
            'conteos' => array_map('count', $datos),
            'integridad' => ['algoritmo' => 'SHA-256', 'hash' => hash('sha256', $cuerpo)],
            'advertencia' => 'Contiene datos personales y hashes de contraseñas. Custódielo conforme a la Ley 1581 de 2012.',
            'datos' => $datos,
        ];
    }

    /** Valida sin modificar nada. Devuelve [errores, advertencias]. */
    public static function analizar($p): array
    {
        $err = []; $adv = [];
        if (!is_array($p) || ($p['formato'] ?? '') !== self::FORMATO) return [['El archivo no es un respaldo de SER INTEGRAL 360.'], []];
        if ((int) ($p['versionFormato'] ?? 0) > self::VERSION_FORMATO) $err[] = 'El respaldo usa una versión de formato más reciente.';
        if (!is_array($p['datos'] ?? null)) return [['El respaldo no contiene la sección de datos.'], []];
        if (hash('sha256', Json::codificar($p['datos'])) !== ($p['integridad']['hash'] ?? '')) $err[] = 'La huella de integridad no coincide: el archivo fue modificado o está incompleto.';
        foreach ($p['datos'] as $s => $filas) {
            if (!Almacenes::existe((string) $s) || in_array($s, self::EXCLUIR, true)) { $adv[] = "Se ignorará la sección \"$s\"."; continue; }
            if (!is_array($filas) || ($filas && !array_is_list($filas))) { $err[] = "La sección \"$s\" no es una lista."; continue; }
            $k = Almacenes::clave($s); $vistos = [];
            foreach ($filas as $i => $f) {
                $id = is_array($f) ? ($f[$k] ?? null) : null;
                if (!is_string($id) || $id === '') $err[] = "{$s}[$i] no tiene identificador.";
                elseif (isset($vistos[$id])) $err[] = "$s: identificador repetido $id.";
                else $vistos[$id] = true;
            }
        }
        $us = $p['datos']['usuarios'] ?? [];
        if (!array_filter($us, fn ($u) => ($u['rol'] ?? '') === 'administrador' && ($u['estado'] ?? '') === 'activo')) $err[] = 'El respaldo no tiene un administrador activo.';
        foreach ($us as $u) if (!self::credencial($u['credencial'] ?? null)) $adv[] = 'El usuario ' . ($u['email'] ?? '?') . ' no tiene una credencial utilizable: deberá restablecérsele la contraseña.';
        $nits = [];
        foreach ($p['datos']['empresas'] ?? [] as $e) {
            if (($e['estado'] ?? '') === 'eliminada') continue;
            if (isset($nits[$e['nit'] ?? ''])) $err[] = 'NIT duplicado en el respaldo: ' . ($e['nit'] ?? '');
            $nits[$e['nit'] ?? ''] = true;
        }
        return [array_slice($err, 0, 30), $adv];
    }

    private static function credencial($c): ?string
    {
        if (is_string($c) && (str_starts_with($c, '$argon2') || str_starts_with($c, '$2y$') || str_starts_with($c, 'pbkdf2_sha256$'))) return $c;
        return Credenciales::desdePrototipo($c);
    }

    /** ¿Instalación sin información de negocio? (solo el administrador inicial y, si ya ingresó, el catálogo base) */
    public static function instalacionVacia(): bool
    {
        foreach (['empresas', 'diagnosticos', 'planes', 'horas'] as $s) if (Db::uno('SELECT 1 FROM ' . Db::id($s) . ' LIMIT 1')) return false;
        return (int) Db::uno('SELECT COUNT(*) c FROM `usuarios`')['c'] <= 1;
    }

    /** Reemplaza TODO el contenido en una transacción. Los archivos se escriben antes y se limpian si falla. */
    public static function restaurar(array $p, string $motivo, ?array $usuario): array
    {
        [$err, $adv] = self::analizar($p);
        if ($err) throw new ErrorHttp(422, 'El respaldo no superó la validación: ' . implode(' ', $err));
        $d = $p['datos'];
        $escritos = [];
        try {
            Db::transaccion(function () use ($d, &$escritos, &$adv) {
                foreach (array_reverse(array_keys(Almacenes::DEF)) as $s) Db::ejecutar('DELETE FROM ' . Db::id($s));
                $dxEmpresa = [];
                foreach ($d['diagnosticos'] ?? [] as $x) $dxEmpresa[$x['id']] = $x['empresaId'] ?? null;
                foreach (self::almacenes() as $s) {
                    if ($s === 'auditoria') continue;
                    foreach ($d[$s] ?? [] as $f) {
                        if ($s === 'meta' && ($f['clave'] ?? '') === 'cadenaBitacora') continue;
                        $id = (string) $f[Almacenes::clave($s)];
                        $auth = null;
                        if ($s === 'usuarios') {
                            $auth = [self::credencial($f['credencial'] ?? null), !empty($f['debeCambiarContrasena']) ? 1 : 0, $f['ultimoIngreso'] ?? null];
                            if (!$auth[0]) $auth[1] = 1;
                            foreach (Repositorio::CAMPOS_AUTH as $k) unset($f[$k]);
                            $f['email'] = mb_strtolower((string) ($f['email'] ?? ''));
                        }
                        if (in_array($s, Almacenes::CON_ARCHIVO, true)) {
                            if (is_array($f['archivo'] ?? null) && !empty($f['archivo']['base64'])) {
                                try { $f['archivo'] = Archivos::guardar($s, $id, $f['archivo']); $escritos[] = [$s, $id]; }
                                catch (ErrorHttp $ex) { $f['archivo'] = null; $adv[] = "$s $id: archivo no restaurado ({$ex->getMessage()})."; }
                            } else {
                                if (!empty($f['archivo'])) $adv[] = "$s $id: el respaldo no contenía el archivo adjunto.";
                                $f['archivo'] = null;
                            }
                        }
                        $cols = Almacenes::valores($s, $f);
                        if (in_array($s, Almacenes::CON_EMPRESA, true) && $s !== 'empresas') $cols['empresa_id'] = $s === 'respuestas' ? ($dxEmpresa[$f['diagnosticoId'] ?? ''] ?? null) : ($f['empresaId'] ?? null);
                        Repositorio::escribir($s, $id, $f, $cols, false);
                        if ($auth) Db::ejecutar('UPDATE `usuarios` SET credencial = ?, debe_cambiar = ?, ultimo_ingreso = ? WHERE id = ?', [$auth[0], $auth[1], $auth[2], $id]);
                    }
                }
                $aud = $d['auditoria'] ?? [];
                usort($aud, fn ($a, $b) => [$a['secuencia'] ?? PHP_INT_MAX, $a['fecha'] ?? ''] <=> [$b['secuencia'] ?? PHP_INT_MAX, $b['fecha'] ?? '']);
                foreach ($aud as $e) Auditoria::importar($e);
            });
        } catch (\Throwable $ex) {
            foreach ($escritos as [$s, $id]) Archivos::borrar($s, $id);
            throw $ex;
        }
        Auditoria::evento('importar', 'sistema', null, $motivo . ' — respaldo generado ' . ($p['generado'] ?? '?') . ' por ' . ($p['generadoPor']['nombre'] ?? '—') . ' (' . ($p['origen'] ?? 'prototipo') . ')', $usuario);
        return ['conteos' => array_map(fn ($x) => is_array($x) ? count($x) : 0, $d), 'advertencias' => $adv];
    }
}

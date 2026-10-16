<?php
declare(strict_types=1);

namespace SI360;

/**
 * Bitácora de solo inserción con cadena de huellas SHA-256 calculada en el servidor:
 *   huella_n = SHA-256(huella_{n-1} + "|" + JSON canónico de la entrada sin campos de cadena)
 * La identidad, el rol, la IP y la fecha los sella el servidor; el cliente no puede falsearlos.
 */
final class Auditoria
{
    public const GENESIS = '0000000000000000000000000000000000000000000000000000000000000000';
    private const CAMPOS_CADENA = ['secuencia', 'huella', 'huellaAnterior'];

    public static function ahora(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format('Y-m-d\TH:i:s.v\Z');
    }

    public static function contenido(array $e): string
    {
        foreach (self::CAMPOS_CADENA as $k) unset($e[$k]);
        return Json::canonico($e);
    }

    /** Inserta una entrada encadenada. $usuario: fila pública del usuario (o null para "Sistema"). */
    public static function registrar(array $entrada, ?array $usuario): array
    {
        return Db::transaccion(function () use ($entrada, $usuario) {
            $id = is_string($entrada['id'] ?? null) && preg_match('/^[\w:.-]{8,100}$/', $entrada['id']) ? $entrada['id'] : self::uuid();
            if (Db::uno('SELECT id FROM `auditoria` WHERE id = ?', [$id])) throw new ErrorHttp(409, 'La bitácora es de solo inserción: la entrada ya existe.');
            $e = $entrada;
            foreach (self::CAMPOS_CADENA as $k) unset($e[$k]);
            foreach (['antes', 'despues'] as $k) if (is_array($e[$k] ?? null)) { foreach (array_merge(Repositorio::CAMPOS_AUTH, ['archivo']) as $x) unset($e[$k][$x]); }
            if (strlen(Json::codificar($e)) > 262144) throw new ErrorHttp(413, 'La entrada de bitácora es demasiado grande.');
            $e['id'] = $id;
            if (isset($e['fecha']) && is_string($e['fecha'])) $e['fechaCliente'] = $e['fecha'];
            $e['fecha'] = self::ahora();
            $e['usuarioId'] = $usuario['id'] ?? 'sistema';
            $e['usuarioNombre'] = $usuario['nombre'] ?? 'Sistema';
            $e['usuarioRol'] = $usuario['rol'] ?? '—';
            $e['ip'] = PHP_SAPI === 'cli' ? 'cli' : Http::ip();
            foreach (['accion', 'entidad', 'motivo', 'resultado'] as $k) if (isset($e[$k]) && is_string($e[$k])) $e[$k] = mb_substr($e[$k], 0, $k === 'motivo' ? 2000 : 60);
            $cab = Db::uno("SELECT datos FROM `meta` WHERE clave = 'cadenaBitacora' FOR UPDATE");
            $c = $cab ? Json::decodificar($cab['datos'])['valor'] : ['secuencia' => 0, 'huella' => self::GENESIS];
            $e['secuencia'] = (int) $c['secuencia'] + 1;
            $e['huellaAnterior'] = $c['huella'];
            $e['huella'] = hash('sha256', $c['huella'] . '|' . self::contenido($e));
            Db::ejecutar('INSERT INTO `auditoria` (id, datos, fecha, entidad, usuario_id, secuencia, huella) VALUES (?,?,?,?,?,?,?)',
                [$id, Json::codificar($e), $e['fecha'], mb_substr((string) ($e['entidad'] ?? ''), 0, 60), $e['usuarioId'], $e['secuencia'], $e['huella']]);
            $v = Json::codificar(['clave' => 'cadenaBitacora', 'valor' => ['secuencia' => $e['secuencia'], 'huella' => $e['huella']]]);
            Db::ejecutar('INSERT INTO `meta` (clave, datos) VALUES (?, ?) ON DUPLICATE KEY UPDATE datos = VALUES(datos)', ['cadenaBitacora', $v]);
            return $e;
        });
    }

    /** Importación de respaldos: conserva autor y fecha originales, se re-encadena y se marca como importada. */
    public static function importar(array $entrada): void
    {
        Db::transaccion(function () use ($entrada) {
            $e = $entrada;
            foreach (self::CAMPOS_CADENA as $k) unset($e[$k]);
            $e['importada'] = true;
            $id = (string) ($e['id'] ?? self::uuid());
            $cab = Db::uno("SELECT datos FROM `meta` WHERE clave = 'cadenaBitacora' FOR UPDATE");
            $c = $cab ? Json::decodificar($cab['datos'])['valor'] : ['secuencia' => 0, 'huella' => self::GENESIS];
            $e['secuencia'] = (int) $c['secuencia'] + 1;
            $e['huellaAnterior'] = $c['huella'];
            $e['huella'] = hash('sha256', $c['huella'] . '|' . self::contenido($e));
            Db::ejecutar('INSERT INTO `auditoria` (id, datos, fecha, entidad, usuario_id, secuencia, huella) VALUES (?,?,?,?,?,?,?)',
                [$id, Json::codificar($e), mb_substr((string) ($e['fecha'] ?? ''), 0, 40), mb_substr((string) ($e['entidad'] ?? ''), 0, 60), (string) ($e['usuarioId'] ?? 'sistema'), $e['secuencia'], $e['huella']]);
            Db::ejecutar('INSERT INTO `meta` (clave, datos) VALUES (?, ?) ON DUPLICATE KEY UPDATE datos = VALUES(datos)', ['cadenaBitacora', Json::codificar(['clave' => 'cadenaBitacora', 'valor' => ['secuencia' => $e['secuencia'], 'huella' => $e['huella']]])]);
        });
    }

    public static function evento(string $accion, string $entidad, ?string $entidadId, string $motivo, ?array $usuario, string $resultado = 'exitoso'): void
    {
        self::registrar(['accion' => $accion, 'entidad' => $entidad, 'entidadId' => $entidadId, 'motivo' => $motivo, 'resultado' => $resultado, 'cambios' => []], $usuario);
    }

    /** Verifica toda la cadena. Misma forma de respuesta que js/domain/integridad.js. */
    public static function verificar(): array
    {
        $filas = Db::todos('SELECT datos FROM `auditoria` ORDER BY secuencia IS NULL, secuencia');
        $problemas = []; $anterior = self::GENESIS; $esperado = 1; $enc = 0; $ultima = 0; $total = count($filas);
        foreach ($filas as $f) {
            $e = Json::decodificar($f['datos']);
            if (!isset($e['secuencia'])) continue;
            $enc++;
            $s = (int) $e['secuencia'];
            if ($s !== $esperado) {
                $problemas[] = ['secuencia' => $esperado, 'id' => null, 'tipo' => $s > $esperado ? 'faltante' : 'duplicada', 'detalle' => $s > $esperado ? "Faltan las entradas $esperado a " . ($s - 1) . ': pudieron ser eliminadas.' : "Secuencia $s repetida."];
                if ($s < $esperado) continue;
                $esperado = $s;
            }
            if (($e['huellaAnterior'] ?? null) !== $anterior) $problemas[] = ['secuencia' => $s, 'id' => $e['id'] ?? null, 'tipo' => 'enlace', 'detalle' => 'La huella anterior no coincide con la entrada previa.'];
            if (hash('sha256', ($e['huellaAnterior'] ?? '') . '|' . self::contenido($e)) !== ($e['huella'] ?? '')) $problemas[] = ['secuencia' => $s, 'id' => $e['id'] ?? null, 'tipo' => 'modificada', 'detalle' => 'El contenido no coincide con su huella: la entrada fue modificada.'];
            $anterior = $e['huella'] ?? ''; $esperado++; $ultima = $s;
        }
        return ['total' => $total, 'encadenadas' => $enc, 'sinEncadenar' => $total - $enc, 'ultimaSecuencia' => $ultima, 'problemas' => $problemas, 'integra' => !$problemas];
    }

    public static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}

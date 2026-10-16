<?php
declare(strict_types=1);

namespace SI360;

use PDO;

/** Conexión PDO (MySQL 8 / MariaDB 10.6+), consultas siempre preparadas. */
final class Db
{
    private static ?PDO $pdo = null;

    public static function conectar(array $cfg): PDO
    {
        if (self::$pdo) return self::$pdo;
        self::$pdo = new PDO($cfg['dsn'], $cfg['usuario'], $cfg['clave'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);
        self::$pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
        self::$pdo->exec("SET time_zone = '+00:00'");
        return self::$pdo;
    }

    public static function pdo(): PDO
    {
        if (!self::$pdo) throw new \LogicException('Base de datos no inicializada.');
        return self::$pdo;
    }

    public static function uno(string $sql, array $p = []): ?array
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($p);
        $r = $st->fetch();
        return $r === false ? null : $r;
    }

    public static function todos(string $sql, array $p = []): array
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($p);
        return $st->fetchAll();
    }

    public static function ejecutar(string $sql, array $p = []): int
    {
        $st = self::pdo()->prepare($sql);
        $st->execute($p);
        return $st->rowCount();
    }

    /** Ejecuta $fn en una transacción; revierte ante cualquier excepción. */
    public static function transaccion(callable $fn)
    {
        $pdo = self::pdo();
        if ($pdo->inTransaction()) return $fn();
        $pdo->beginTransaction();
        try {
            $r = $fn();
            $pdo->commit();
            return $r;
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
    }

    /** Identificador SQL seguro (solo nombres definidos en Almacenes). */
    public static function id(string $n): string
    {
        if (!preg_match('/^[a-z_]{2,40}$/', $n)) throw new \InvalidArgumentException('Identificador no válido.');
        return "`$n`";
    }
}

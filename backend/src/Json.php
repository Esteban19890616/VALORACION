<?php
declare(strict_types=1);

namespace SI360;

/** Serialización JSON compatible con JSON.stringify de JavaScript y forma canónica para huellas. */
final class Json
{
    public const FLAGS = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS | JSON_THROW_ON_ERROR;

    public static function codificar($v): string
    {
        return json_encode($v, self::FLAGS);
    }

    /**
     * Decodifica a arreglos asociativos conservando los objetos vacíos como stdClass, para que
     * {} siga siendo {} (y no []) al volver a codificar.
     */
    public static function decodificar(string $t): array
    {
        $d = self::normalizar(json_decode($t, false, 512, JSON_THROW_ON_ERROR));
        return is_array($d) ? $d : [];
    }

    public static function normalizar($v)
    {
        if ($v instanceof \stdClass) {
            $a = get_object_vars($v);
            if (!$a) return new \stdClass();
            foreach ($a as $k => $x) $a[$k] = self::normalizar($x);
            // Un objeto con claves "0","1",... se codificaría como lista: se conserva como objeto.
            if (array_is_list($a)) { $o = new \stdClass(); foreach ($a as $k => $x) $o->{$k} = $x; return $o; }
            return $a;
        }
        if (is_array($v)) return array_map([self::class, 'normalizar'], $v);
        return $v;
    }

    /** Forma canónica: claves ordenadas recursivamente (para huellas SHA-256 de la bitácora). */
    public static function canonico($v): string
    {
        $objeto = $v instanceof \stdClass;
        if ($objeto) $v = get_object_vars($v);
        if (is_array($v)) {
            if (!$v) return $objeto ? '{}' : '[]';
            if (!$objeto && array_is_list($v)) return '[' . implode(',', array_map([self::class, 'canonico'], $v)) . ']';
            ksort($v, SORT_STRING);
            $p = [];
            foreach ($v as $k => $x) $p[] = self::codificar((string) $k) . ':' . self::canonico($x);
            return '{' . implode(',', $p) . '}';
        }
        return self::codificar($v);
    }

    /** Números enteros representados como float (1.0) se emiten como en JavaScript (1). */
    public static function comoJs($v)
    {
        if (is_float($v) && is_finite($v) && floor($v) === $v && abs($v) < 1e15) return (int) $v;
        if (is_array($v)) { foreach ($v as $k => $x) $v[$k] = self::comoJs($x); return $v; }
        if ($v instanceof \stdClass) { $o = new \stdClass(); foreach (get_object_vars($v) as $k => $x) $o->{$k} = self::comoJs($x); return $o; }
        return $v;
    }
}

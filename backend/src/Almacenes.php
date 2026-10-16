<?php
declare(strict_types=1);

namespace SI360;

/**
 * Definición de almacenes. Espejo de STORES en js/core/config.js.
 * Cada almacén es una tabla con: clave primaria, documento JSON completo ("datos") y columnas
 * indexadas para las consultas por índice y el control de alcance por empresa.
 */
final class Almacenes
{
    /** nombre => [clave, [indiceJS => columna], escritura => roles] */
    public const DEF = [
        'usuarios'     => ['clave' => 'id', 'indices' => ['email' => 'email', 'rol' => 'rol'], 'escritura' => ['administrador']],
        'empresas'     => ['clave' => 'id', 'indices' => ['nit' => 'nit', 'codigo' => 'codigo', 'estado' => 'estado', 'asesorId' => 'asesor_id'], 'escritura' => ['administrador']],
        'documentos'   => ['clave' => 'id', 'indices' => ['empresaId' => 'empresa_id'], 'escritura' => ['administrador', 'asesor']],
        'requisitos'   => ['clave' => 'id', 'indices' => ['codigo' => 'codigo', 'campo' => 'campo', 'catalogoVersion' => 'catalogo_version', 'catalogoId' => 'catalogo_id'], 'escritura' => ['administrador']],
        'catalogos'    => ['clave' => 'id', 'indices' => ['estado' => 'estado'], 'escritura' => ['administrador']],
        'diagnosticos' => ['clave' => 'id', 'indices' => ['empresaId' => 'empresa_id', 'estado' => 'estado', 'asesorId' => 'asesor_id'], 'escritura' => ['administrador', 'asesor']],
        'respuestas'   => ['clave' => 'id', 'indices' => ['diagnosticoId' => 'diagnostico_id'], 'escritura' => ['administrador', 'asesor']],
        'evidencias'   => ['clave' => 'id', 'indices' => ['empresaId' => 'empresa_id', 'diagnosticoId' => 'diagnostico_id', 'respuestaId' => 'respuesta_id', 'actividadId' => 'actividad_id'], 'escritura' => ['administrador', 'asesor']],
        'hallazgos'    => ['clave' => 'id', 'indices' => ['empresaId' => 'empresa_id', 'diagnosticoId' => 'diagnostico_id', 'estado' => 'estado'], 'escritura' => ['administrador']],
        'planes'       => ['clave' => 'id', 'indices' => ['empresaId' => 'empresa_id', 'estado' => 'estado'], 'escritura' => ['administrador', 'asesor']],
        'actividades'  => ['clave' => 'id', 'indices' => ['empresaId' => 'empresa_id', 'planId' => 'plan_id', 'hallazgoId' => 'hallazgo_id'], 'escritura' => ['administrador', 'asesor']],
        'horas'        => ['clave' => 'id', 'indices' => ['empresaId' => 'empresa_id', 'actividadId' => 'actividad_id', 'usuarioId' => 'usuario_id'], 'escritura' => ['administrador', 'asesor']],
        'informes'     => ['clave' => 'id', 'indices' => ['empresaId' => 'empresa_id', 'tipo' => 'tipo'], 'escritura' => ['administrador', 'asesor', 'cliente']],
        'borradores'   => ['clave' => 'clave', 'indices' => [], 'escritura' => ['administrador', 'asesor', 'cliente']],
        'auditoria'    => ['clave' => 'id', 'indices' => ['fecha' => 'fecha', 'entidad' => 'entidad', 'usuarioId' => 'usuario_id'], 'escritura' => ['administrador', 'asesor', 'cliente']],
        'meta'         => ['clave' => 'clave', 'indices' => [], 'escritura' => ['administrador']],
    ];

    /** Almacenes cuyos registros pertenecen a una empresa (columna empresa_id). */
    public const CON_EMPRESA = ['empresas', 'documentos', 'diagnosticos', 'respuestas', 'evidencias', 'hallazgos', 'planes', 'actividades', 'horas', 'informes'];
    public const CON_ARCHIVO = ['documentos', 'evidencias'];

    public static function existe(string $s): bool { return isset(self::DEF[$s]); }
    public static function clave(string $s): string { return self::DEF[$s]['clave']; }
    public static function indices(string $s): array { return self::DEF[$s]['indices']; }

    /** Columnas físicas de la tabla, además de la clave y "datos". */
    public static function columnas(string $s): array
    {
        $c = array_values(self::indices($s));
        if (in_array($s, self::CON_EMPRESA, true) && !in_array('empresa_id', $c, true)) $c[] = 'empresa_id';
        if ($s === 'borradores') $c[] = 'usuario_id';
        return array_values(array_unique($c));
    }

    public static function columnaDeIndice(string $s, string $indice): ?string
    {
        return self::indices($s)[$indice] ?? null;
    }

    /** Valor de cada columna a partir del documento. */
    public static function valores(string $s, array $obj): array
    {
        $v = [];
        foreach (self::indices($s) as $js => $col) $v[$col] = self::escalar($obj[$js] ?? null);
        if ($s === 'usuarios' && isset($v['email'])) $v['email'] = mb_strtolower((string) $v['email']);
        if ($s === 'empresas') $v['empresa_id'] = (string) $obj['id'];
        if ($s === 'borradores') $v['usuario_id'] = explode(':', (string) ($obj['clave'] ?? ''), 2)[0];
        return $v;
    }

    private static function escalar($x): ?string
    {
        if ($x === null || $x === '') return null;
        if (is_bool($x)) return $x ? '1' : '0';
        if (is_scalar($x)) return mb_substr((string) $x, 0, 191);
        return null;
    }
}

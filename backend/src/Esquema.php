<?php
declare(strict_types=1);

namespace SI360;

/**
 * Esquema MySQL/MariaDB híbrido: cada almacén es una tabla con clave primaria, el documento JSON
 * completo en "datos" (validado con JSON_VALID) y columnas indexadas para consultas y alcance.
 * Fuente única: tools/generar-esquema.php escribe database/schema.sql a partir de esta clase.
 */
final class Esquema
{
    public const VERSION = 1;

    public static function sql(): string
    {
        $o = [];
        $o[] = "-- SER INTEGRAL 360 — Esquema de base de datos v" . self::VERSION . " (MySQL 8.0.16+ / MariaDB 10.6+)";
        $o[] = "-- Generado por tools/generar-esquema.php a partir de backend/src/Esquema.php. No editar a mano.";
        $o[] = "-- Propiedad de Ser Integral Consultora S.A.S.";
        $o[] = "SET NAMES utf8mb4;";
        $o[] = "";
        foreach (Almacenes::DEF as $s => $def) $o[] = self::tabla($s, $def);
        $o[] = <<<SQL
-- Control de intentos de ingreso por IP (limitación de fuerza bruta).
CREATE TABLE IF NOT EXISTS `intentos_ip` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `ip` VARCHAR(45) NOT NULL,
  `momento` DATETIME NOT NULL,
  KEY `ix_intentos_ip` (`ip`, `momento`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Versión del esquema instalada.
CREATE TABLE IF NOT EXISTS `esquema_version` (
  `version` INT NOT NULL PRIMARY KEY,
  `instalado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO `esquema_version` (`version`) VALUES (1);

SQL;
        $o[] = self::vistas();
        return implode("\n", $o) . "\n";
    }

    private static function tabla(string $s, array $def): string
    {
        $k = $def['clave'];
        $l = ["  `$k` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL", "  `datos` LONGTEXT NOT NULL"];
        $ix = [];
        foreach (Almacenes::columnas($s) as $c) {
            $l[] = "  `$c` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL";
            $ix[] = "  KEY `ix_{$s}_{$c}` (`$c`)";
        }
        if ($s === 'usuarios') {
            array_push($l, '  `credencial` VARCHAR(255) NULL', '  `intentos` INT NOT NULL DEFAULT 0', '  `bloqueado_hasta` VARCHAR(30) NULL', '  `ultimo_ingreso` VARCHAR(30) NULL', '  `debe_cambiar` TINYINT(1) NOT NULL DEFAULT 0');
            $ix = array_filter($ix, fn ($x) => !str_contains($x, '`ix_usuarios_email`'));
            $ix[] = '  UNIQUE KEY `uq_usuarios_email` (`email`)';
        }
        if ($s === 'empresas') {
            $l[] = '  `nit_vigente` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL';
            $ix = array_filter($ix, fn ($x) => !str_contains($x, '`ix_empresas_codigo`'));
            $ix[] = '  UNIQUE KEY `uq_empresas_nit_vigente` (`nit_vigente`)';
            $ix[] = '  UNIQUE KEY `uq_empresas_codigo` (`codigo`)';
        }
        if ($s === 'auditoria') {
            array_push($l, '  `secuencia` INT UNSIGNED NULL', '  `huella` CHAR(64) NULL');
            $ix[] = '  UNIQUE KEY `uq_auditoria_secuencia` (`secuencia`)';
        }
        $l[] = '  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP';
        $l[] = '  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP';
        $l[] = "  PRIMARY KEY (`$k`)";
        $l = array_merge($l, array_values($ix));
        $l[] = "  CONSTRAINT `ck_{$s}_json` CHECK (JSON_VALID(`datos`))";
        return "CREATE TABLE IF NOT EXISTS `$s` (\n" . implode(",\n", $l) . "\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n";
    }

    /** Vistas de solo lectura para reportes (Excel, Power BI, consultas del administrador). */
    private static function vistas(): string
    {
        $j = fn ($c) => "JSON_UNQUOTE(JSON_EXTRACT(datos, '$.$c'))";
        return "-- Vistas de consulta (solo lectura; el documento completo está en la columna datos).\n"
            . "CREATE OR REPLACE VIEW `v_empresas` AS SELECT id, codigo, nit, {$j('razonSocial')} AS razon_social, estado, asesor_id, {$j('sector')} AS sector, {$j('municipio')} AS municipio, {$j('trabajadores')} AS trabajadores, {$j('claseRiesgo')} AS clase_riesgo, {$j('horasContratadasMes')} AS horas_contratadas_mes, IF(JSON_EXTRACT(datos, '$.demo') = true, 1, 0) AS demo FROM `empresas`;\n"
            . "CREATE OR REPLACE VIEW `v_diagnosticos` AS SELECT id, {$j('codigo')} AS codigo, empresa_id, estado, asesor_id, {$j('fechaInicio')} AS fecha_inicio, {$j('aprobadoEn')} AS aprobado_en, {$j('resultados.global.porcentaje')} AS cumplimiento_global FROM `diagnosticos`;\n"
            . "CREATE OR REPLACE VIEW `v_actividades` AS SELECT id, {$j('codigo')} AS codigo, empresa_id, plan_id, {$j('estado')} AS estado, {$j('titulo')} AS titulo, {$j('responsable')} AS responsable, {$j('horasEstimadas')} AS horas_estimadas, {$j('prioridad')} AS prioridad FROM `actividades`;\n"
            . "CREATE OR REPLACE VIEW `v_horas` AS SELECT id, empresa_id, actividad_id, usuario_id, {$j('fecha')} AS fecha, CAST({$j('horas')} AS DECIMAL(6,2)) AS horas, IF(JSON_EXTRACT(datos, '$.anulado') = true, 1, 0) AS anulado FROM `horas`;\n"
            . "CREATE OR REPLACE VIEW `v_auditoria` AS SELECT secuencia, fecha, usuario_id, {$j('usuarioNombre')} AS usuario, {$j('accion')} AS accion, entidad, {$j('entidadId')} AS entidad_id, {$j('motivo')} AS motivo, {$j('resultado')} AS resultado, {$j('ip')} AS ip, huella FROM `auditoria`;\n";
    }

    /** Ejecuta el esquema sentencia por sentencia. */
    public static function instalar(): void
    {
        foreach (preg_split('/;\s*\n/', self::sql()) as $st) {
            $st = trim(preg_replace('/^--.*$/m', '', $st));
            if ($st !== '') Db::pdo()->exec($st);
        }
    }

    public static function instalado(): bool
    {
        return (bool) Db::uno("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'usuarios'");
    }
}

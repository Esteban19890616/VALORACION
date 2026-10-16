-- SER INTEGRAL 360 — Esquema de base de datos v1 (MySQL 8.0.16+ / MariaDB 10.6+)
-- Generado por tools/generar-esquema.php a partir de backend/src/Esquema.php. No editar a mano.
-- Propiedad de Ser Integral Consultora S.A.S.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `datos` LONGTEXT NOT NULL,
  `email` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `rol` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `credencial` VARCHAR(255) NULL,
  `intentos` INT NOT NULL DEFAULT 0,
  `bloqueado_hasta` VARCHAR(30) NULL,
  `ultimo_ingreso` VARCHAR(30) NULL,
  `debe_cambiar` TINYINT(1) NOT NULL DEFAULT 0,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_usuarios_rol` (`rol`),
  UNIQUE KEY `uq_usuarios_email` (`email`),
  CONSTRAINT `ck_usuarios_json` CHECK (JSON_VALID(`datos`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `empresas` (
  `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `datos` LONGTEXT NOT NULL,
  `nit` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `codigo` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `estado` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `asesor_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `empresa_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `nit_vigente` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_empresas_nit` (`nit`),
  KEY `ix_empresas_estado` (`estado`),
  KEY `ix_empresas_asesor_id` (`asesor_id`),
  KEY `ix_empresas_empresa_id` (`empresa_id`),
  UNIQUE KEY `uq_empresas_nit_vigente` (`nit_vigente`),
  UNIQUE KEY `uq_empresas_codigo` (`codigo`),
  CONSTRAINT `ck_empresas_json` CHECK (JSON_VALID(`datos`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `documentos` (
  `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `datos` LONGTEXT NOT NULL,
  `empresa_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_documentos_empresa_id` (`empresa_id`),
  CONSTRAINT `ck_documentos_json` CHECK (JSON_VALID(`datos`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `requisitos` (
  `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `datos` LONGTEXT NOT NULL,
  `codigo` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `campo` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `catalogo_version` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `catalogo_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_requisitos_codigo` (`codigo`),
  KEY `ix_requisitos_campo` (`campo`),
  KEY `ix_requisitos_catalogo_version` (`catalogo_version`),
  KEY `ix_requisitos_catalogo_id` (`catalogo_id`),
  CONSTRAINT `ck_requisitos_json` CHECK (JSON_VALID(`datos`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `catalogos` (
  `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `datos` LONGTEXT NOT NULL,
  `estado` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_catalogos_estado` (`estado`),
  CONSTRAINT `ck_catalogos_json` CHECK (JSON_VALID(`datos`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `diagnosticos` (
  `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `datos` LONGTEXT NOT NULL,
  `empresa_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `estado` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `asesor_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_diagnosticos_empresa_id` (`empresa_id`),
  KEY `ix_diagnosticos_estado` (`estado`),
  KEY `ix_diagnosticos_asesor_id` (`asesor_id`),
  CONSTRAINT `ck_diagnosticos_json` CHECK (JSON_VALID(`datos`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `respuestas` (
  `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `datos` LONGTEXT NOT NULL,
  `diagnostico_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `empresa_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_respuestas_diagnostico_id` (`diagnostico_id`),
  KEY `ix_respuestas_empresa_id` (`empresa_id`),
  CONSTRAINT `ck_respuestas_json` CHECK (JSON_VALID(`datos`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `evidencias` (
  `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `datos` LONGTEXT NOT NULL,
  `empresa_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `diagnostico_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `respuesta_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `actividad_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_evidencias_empresa_id` (`empresa_id`),
  KEY `ix_evidencias_diagnostico_id` (`diagnostico_id`),
  KEY `ix_evidencias_respuesta_id` (`respuesta_id`),
  KEY `ix_evidencias_actividad_id` (`actividad_id`),
  CONSTRAINT `ck_evidencias_json` CHECK (JSON_VALID(`datos`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hallazgos` (
  `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `datos` LONGTEXT NOT NULL,
  `empresa_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `diagnostico_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `estado` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_hallazgos_empresa_id` (`empresa_id`),
  KEY `ix_hallazgos_diagnostico_id` (`diagnostico_id`),
  KEY `ix_hallazgos_estado` (`estado`),
  CONSTRAINT `ck_hallazgos_json` CHECK (JSON_VALID(`datos`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `planes` (
  `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `datos` LONGTEXT NOT NULL,
  `empresa_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `estado` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_planes_empresa_id` (`empresa_id`),
  KEY `ix_planes_estado` (`estado`),
  CONSTRAINT `ck_planes_json` CHECK (JSON_VALID(`datos`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `actividades` (
  `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `datos` LONGTEXT NOT NULL,
  `empresa_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `plan_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `hallazgo_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_actividades_empresa_id` (`empresa_id`),
  KEY `ix_actividades_plan_id` (`plan_id`),
  KEY `ix_actividades_hallazgo_id` (`hallazgo_id`),
  CONSTRAINT `ck_actividades_json` CHECK (JSON_VALID(`datos`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `horas` (
  `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `datos` LONGTEXT NOT NULL,
  `empresa_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `actividad_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `usuario_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_horas_empresa_id` (`empresa_id`),
  KEY `ix_horas_actividad_id` (`actividad_id`),
  KEY `ix_horas_usuario_id` (`usuario_id`),
  CONSTRAINT `ck_horas_json` CHECK (JSON_VALID(`datos`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `informes` (
  `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `datos` LONGTEXT NOT NULL,
  `empresa_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `tipo` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_informes_empresa_id` (`empresa_id`),
  KEY `ix_informes_tipo` (`tipo`),
  CONSTRAINT `ck_informes_json` CHECK (JSON_VALID(`datos`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `borradores` (
  `clave` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `datos` LONGTEXT NOT NULL,
  `usuario_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`clave`),
  KEY `ix_borradores_usuario_id` (`usuario_id`),
  CONSTRAINT `ck_borradores_json` CHECK (JSON_VALID(`datos`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auditoria` (
  `id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `datos` LONGTEXT NOT NULL,
  `fecha` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `entidad` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `usuario_id` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
  `secuencia` INT UNSIGNED NULL,
  `huella` CHAR(64) NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_auditoria_fecha` (`fecha`),
  KEY `ix_auditoria_entidad` (`entidad`),
  KEY `ix_auditoria_usuario_id` (`usuario_id`),
  UNIQUE KEY `uq_auditoria_secuencia` (`secuencia`),
  CONSTRAINT `ck_auditoria_json` CHECK (JSON_VALID(`datos`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `meta` (
  `clave` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `datos` LONGTEXT NOT NULL,
  `creado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`clave`),
  CONSTRAINT `ck_meta_json` CHECK (JSON_VALID(`datos`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- Vistas de consulta (solo lectura; el documento completo está en la columna datos).
CREATE OR REPLACE VIEW `v_empresas` AS SELECT id, codigo, nit, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.razonSocial')) AS razon_social, estado, asesor_id, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.sector')) AS sector, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.municipio')) AS municipio, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.trabajadores')) AS trabajadores, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.claseRiesgo')) AS clase_riesgo, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.horasContratadasMes')) AS horas_contratadas_mes, IF(JSON_EXTRACT(datos, '$.demo') = true, 1, 0) AS demo FROM `empresas`;
CREATE OR REPLACE VIEW `v_diagnosticos` AS SELECT id, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.codigo')) AS codigo, empresa_id, estado, asesor_id, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.fechaInicio')) AS fecha_inicio, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.aprobadoEn')) AS aprobado_en, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.resultados.global.porcentaje')) AS cumplimiento_global FROM `diagnosticos`;
CREATE OR REPLACE VIEW `v_actividades` AS SELECT id, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.codigo')) AS codigo, empresa_id, plan_id, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.estado')) AS estado, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.titulo')) AS titulo, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.responsable')) AS responsable, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.horasEstimadas')) AS horas_estimadas, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.prioridad')) AS prioridad FROM `actividades`;
CREATE OR REPLACE VIEW `v_horas` AS SELECT id, empresa_id, actividad_id, usuario_id, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.fecha')) AS fecha, CAST(JSON_UNQUOTE(JSON_EXTRACT(datos, '$.horas')) AS DECIMAL(6,2)) AS horas, IF(JSON_EXTRACT(datos, '$.anulado') = true, 1, 0) AS anulado FROM `horas`;
CREATE OR REPLACE VIEW `v_auditoria` AS SELECT secuencia, fecha, usuario_id, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.usuarioNombre')) AS usuario, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.accion')) AS accion, entidad, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.entidadId')) AS entidad_id, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.motivo')) AS motivo, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.resultado')) AS resultado, JSON_UNQUOTE(JSON_EXTRACT(datos, '$.ip')) AS ip, huella FROM `auditoria`;


<?php
/**
 * SER INTEGRAL 360 — Configuración del servidor (EJEMPLO).
 *
 * Copie este archivo a una carpeta FUERA de public_html, por ejemplo:
 *   /home/uXXXX/domains/su-dominio.com/si360-privado/config.php
 * y reemplace los valores. Nunca suba el config.php real a GitHub.
 */
return [
    'db' => [
        // En Hostinger: hPanel → Bases de datos → Administración. El host suele ser localhost.
        'dsn' => 'mysql:host=localhost;port=3306;dbname=uXXXX_si360;charset=utf8mb4',
        'usuario' => 'uXXXX_si360',
        'clave' => 'CAMBIE-ESTA-CLAVE',
    ],
    // Carpetas privadas (por defecto, subcarpetas junto a este archivo):
    // 'archivos_dir'  => __DIR__ . '/archivos',   // documentos y evidencias adjuntos
    // 'sesiones_dir'  => __DIR__ . '/sesiones',   // sesiones PHP
    // 'respaldos_dir' => __DIR__ . '/respaldos',  // respaldos automáticos (cron)
    // 'registro'      => __DIR__ . '/registro/errores.log',

    // Permite crear el primer administrador desde el navegador mientras no exista ninguno.
    // Después de la instalación cámbielo a false (o instale con: php backend/cli/instalar.php).
    'permitir_instalacion_web' => true,

    'sesion_inactividad_min' => 30,
    'sesion_maxima_horas' => 12,
    'max_cuerpo_mb' => 16,      // tamaño máximo de una solicitud normal
    'max_respaldo_mb' => 96,    // tamaño máximo de un respaldo a importar (ajuste post_max_size en hPanel)
    'retener_respaldos' => 30,  // respaldos automáticos que se conservan
];

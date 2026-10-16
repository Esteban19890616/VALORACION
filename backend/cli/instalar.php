<?php
/**
 * Instala el esquema y (opcionalmente) crea el primer administrador.
 *   php backend/cli/instalar.php
 *   php backend/cli/instalar.php --solo-esquema           (el administrador se crea en el navegador)
 *   php backend/cli/instalar.php --nombre="Nombre" --email=correo@dominio.co   (pide la contraseña)
 */
require __DIR__ . '/comun.php';
try {
    si360_iniciar();
    $ya = SI360\Esquema::instalado();
    SI360\Esquema::instalar();
    echo $ya ? "Esquema verificado (las tablas ya existían; CREATE IF NOT EXISTS y vistas actualizadas).\n" : "Esquema instalado.\n";
    if (opcion($argv, 'solo-esquema')) salir('Cree el administrador desde el navegador (primer arranque).', 0);
    if (SI360\Db::uno('SELECT id FROM `usuarios` LIMIT 1')) salir("Ya existen usuarios: no se crea administrador.", 0);
    $nombre = opcion($argv, 'nombre') ?? (function () { echo 'Nombre del administrador: '; return trim((string) fgets(STDIN)); })();
    $email = opcion($argv, 'email') ?? (function () { echo 'Correo: '; return trim((string) fgets(STDIN)); })();
    $clave = getenv('SI360_CLAVE_ADMIN') ?: leerOculto('Contraseña (mín. 10, letras y números): ');
    $u = SI360\Db::transaccion(fn () => SI360\Api::crearAdministrador($nombre, $email, $clave, 'Instalación por línea de comandos'));
    echo "Administrador creado: {$u['email']}\nRecuerde poner 'permitir_instalacion_web' => false en config.php.\n";
} catch (SI360\ErrorHttp $e) { salir('Error: ' . $e->getMessage()); }
catch (Throwable $e) { salir('Error: ' . $e->getMessage()); }

<?php
declare(strict_types=1);

namespace SI360;

/**
 * API REST v1. Rutas (prefijo /api/v1):
 *   GET  /estado                      público: versión y si existe administrador
 *   POST /instalacion                 público una sola vez: crea el primer administrador
 *   GET|POST|DELETE /sesion           sesión actual, ingreso, salida
 *   POST /cuenta/contrasena           cambio de contraseña propia
 *   POST /usuarios/{id}/contrasena    restablecimiento por el administrador
 *   GET  /auditoria/verificar         verificación de la cadena de la bitácora
 *   GET|POST /respaldo                exportar / importar respaldo completo
 *   GET  /archivos/{almacen}/{id}     descarga de un adjunto
 *   POST /lote                        varias operaciones en una transacción
 *   POST /consecutivos/{clave}        consecutivo atómico
 *   GET  /{almacen}[?indice=&valor=&contar=1]   listar
 *   GET|PUT|DELETE /{almacen}/{id}    obtener, guardar, eliminar
 */
final class Api
{
    private const INTENTOS_USUARIO = 5;
    private const BLOQUEO_MIN = 5;
    private const INTENTOS_IP = 20;
    private const VENTANA_IP_MIN = 15;

    private ?Contexto $ctx = null;
    private ?array $fila = null;

    public function __construct(private array $cfg) {}

    public function atender(string $metodo, array $seg): never
    {
        Http::cabecerasSeguridad();
        try {
            Sesion::iniciar($this->cfg);
            $this->cargarUsuario();
            $this->despachar($metodo, $seg);
        } catch (ErrorHttp $e) {
            Http::error($e->estado, $e->getMessage(), $e->campos);
        } catch (\Throwable $e) {
            error_log('[SI360] ' . get_class($e) . ': ' . $e->getMessage() . ' en ' . $e->getFile() . ':' . $e->getLine());
            Http::error(500, !empty($this->cfg['depuracion']) ? $e->getMessage() : 'Error interno del servidor. No se aplicó el cambio; el detalle técnico quedó en el registro del servidor.');
        }
    }

    private function cargarUsuario(): void
    {
        $id = Sesion::usuarioId();
        if (!$id) return;
        $f = Db::uno('SELECT * FROM `usuarios` WHERE id = ?', [$id]);
        $u = $f ? Json::decodificar($f['datos']) : null;
        if (!$u || ($u['estado'] ?? '') !== 'activo') { Sesion::destruir(); return; }
        $this->fila = $f;
        $this->ctx = new Contexto($u);
    }

    private function exigirSesion(): Contexto
    {
        if (!$this->ctx) throw new ErrorHttp(401, 'Su sesión expiró o no ha iniciado sesión.');
        return $this->ctx;
    }

    private function exigirEscritura(bool $permitirClaveTemporal = false): Contexto
    {
        $ctx = $this->exigirSesion();
        Sesion::exigirCsrf();
        if (!$permitirClaveTemporal && !empty($this->fila['debe_cambiar'])) throw new ErrorHttp(403, 'Debe cambiar su contraseña temporal antes de continuar.');
        return $ctx;
    }

    private function cuerpo(): array { return Http::cuerpo((int) $this->cfg['max_cuerpo_mb'] * 1048576); }

    private function usuarioSesion(): array { return (new Repositorio($this->ctx))->obtener('usuarios', $this->ctx->id()); }

    private function despachar(string $m, array $seg): void
    {
        $a = $seg[0] ?? '';
        $b = $seg[1] ?? null;
        $c = $seg[2] ?? null;
        if (count($seg) > 3) throw new ErrorHttp(404, 'Recurso no encontrado.');

        // ----- Sistema y sesión -----
        if ($a === 'estado' && $m === 'GET') {
            $inst = Esquema::instalado();
            Http::json(['app' => 'SI360', 'version' => SI360_VERSION, 'modo' => 'api', 'esquema' => $inst,
                'administradorConfigurado' => $inst && (bool) Db::uno("SELECT id FROM `usuarios` WHERE rol = 'administrador' LIMIT 1")]);
        }
        if ($a === 'instalacion' && $m === 'POST') $this->instalar();
        if ($a === 'sesion') {
            if ($m === 'GET') Http::json($this->ctx ? ['usuario' => $this->usuarioSesion(), 'csrf' => Sesion::csrf()] : ['usuario' => null, 'csrf' => null]);
            if ($m === 'POST') $this->ingresar();
            if ($m === 'DELETE') {
                if ($this->ctx) Auditoria::evento('salida', 'usuarios', $this->ctx->id(), 'Cierre de sesión', $this->ctx->usuario);
                Sesion::destruir();
                Http::vacio();
            }
        }
        if (!Esquema::instalado()) throw new ErrorHttp(503, 'La base de datos aún no está instalada.');
        if ($a === 'cuenta' && $b === 'contrasena' && $m === 'POST') $this->cambiarContrasena();
        if ($a === 'usuarios' && $c === 'contrasena' && $m === 'POST') $this->restablecer((string) $b);
        if ($a === 'auditoria' && $b === 'verificar' && $m === 'GET') {
            $ctx = $this->exigirSesion(); $ctx->exigir('auditoria.ver');
            $r = Auditoria::verificar();
            Auditoria::evento('verificar', 'auditoria', null, $r['integra'] ? "Cadena íntegra ({$r['encadenadas']} entradas)" : count($r['problemas']) . ' problemas detectados', $ctx->usuario, $r['integra'] ? 'exitoso' : 'rechazado');
            Http::json($r);
        }
        if ($a === 'respaldo') $this->respaldo($m);
        if ($a === 'archivos' && $m === 'GET' && $b && $c) {
            $doc = (new Repositorio($this->exigirSesion()))->obtener($b, $c);
            Archivos::servir($b, $c, Json::decodificar((string) Repositorio::fila($b, $c)['datos']) + $doc);
        }
        if ($a === 'lote' && $m === 'POST') {
            (new Repositorio($this->exigirEscritura()))->lote($this->cuerpo()['ops'] ?? null);
            Http::vacio();
        }
        if ($a === 'consecutivos' && $m === 'POST' && $b) Http::json(['valor' => (new Repositorio($this->exigirEscritura()))->siguiente($b)]);

        // ----- Almacenes -----
        if ($a !== '' && Almacenes::existe($a)) {
            if ($m === 'GET') {
                $repo = new Repositorio($this->exigirSesion());
                if ($b !== null) {
                    // ?opcional=1: un registro inexistente (o fuera de alcance) responde null en lugar de 404.
                    try { Http::json($repo->obtener($a, $b)); }
                    catch (ErrorHttp $e) { if ($e->estado === 404 && ($_GET['opcional'] ?? '') === '1') Http::json(null); throw $e; }
                }
                $ind = isset($_GET['indice']) ? (string) $_GET['indice'] : null;
                Http::json($repo->listar($a, $ind, isset($_GET['valor']) ? (string) $_GET['valor'] : null, ($_GET['contar'] ?? '') === '1'));
            }
            if ($m === 'PUT' && $b !== null) {
                $obj = $this->cuerpo();
                $kp = Almacenes::clave($a);
                if (($obj[$kp] ?? null) !== $b) throw new ErrorHttp(422, 'El identificador de la ruta no coincide con el del registro.');
                (new Repositorio($this->exigirEscritura($a === 'borradores')))->guardar($a, $obj);
                Http::vacio();
            }
            if ($m === 'DELETE' && $b !== null) {
                (new Repositorio($this->exigirEscritura($a === 'borradores')))->eliminar($a, $b);
                Http::vacio();
            }
            throw new ErrorHttp(405, 'Método no permitido.');
        }
        throw new ErrorHttp(404, 'Recurso no encontrado.');
    }

    /* ---------------- Instalación ---------------- */

    private function instalar(): never
    {
        if (empty($this->cfg['permitir_instalacion_web'])) throw new ErrorHttp(403, 'La instalación desde el navegador está desactivada. Use: php backend/cli/instalar.php');
        $this->exigirOrigen();
        $d = $this->cuerpo();
        if (!Esquema::instalado()) Esquema::instalar();
        $u = Db::transaccion(function () use ($d) {
            if (Db::uno('SELECT id FROM `usuarios` LIMIT 1 FOR UPDATE')) throw new ErrorHttp(409, 'La aplicación ya fue instalada. Inicie sesión.');
            return self::crearAdministrador((string) ($d['nombre'] ?? ''), (string) ($d['email'] ?? ''), (string) ($d['contrasena'] ?? ''), 'Configuración inicial desde el navegador');
        });
        $this->abrirSesion($u['id']);
        Http::json(['usuario' => $this->usuarioSesion(), 'csrf' => Sesion::csrf()], 201);
    }

    /** También lo usa backend/cli/instalar.php. */
    public static function crearAdministrador(string $nombre, string $email, string $clave, string $motivo): array
    {
        $email = mb_strtolower(trim($email)); $nombre = trim($nombre);
        if ($nombre === '') throw new ErrorHttp(422, 'Ingrese el nombre completo.');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new ErrorHttp(422, 'Ingrese un correo válido.');
        Credenciales::exigirPolitica($clave);
        $ahora = Auditoria::ahora();
        $u = ['id' => Auditoria::uuid(), 'nombre' => $nombre, 'email' => $email, 'rol' => 'administrador', 'estado' => 'activo',
            'cargo' => 'Administrador del sistema', 'telefono' => '', 'empresaId' => null,
            'creadoEn' => $ahora, 'creadoPor' => 'primer-arranque', 'actualizadoEn' => $ahora, 'version' => 1];
        Repositorio::escribir('usuarios', $u['id'], $u, Almacenes::valores('usuarios', $u), false);
        Db::ejecutar('UPDATE `usuarios` SET credencial = ?, debe_cambiar = 0 WHERE id = ?', [Credenciales::hash($clave), $u['id']]);
        Auditoria::registrar(['accion' => 'crear', 'entidad' => 'usuarios', 'entidadId' => $u['id'], 'despues' => $u, 'motivo' => $motivo, 'resultado' => 'exitoso', 'cambios' => []], $u);
        return $u;
    }

    /* ---------------- Sesión ---------------- */

    private function exigirOrigen(): void
    {
        $o = $_SERVER['HTTP_ORIGIN'] ?? '';
        if ($o !== '' && parse_url($o, PHP_URL_HOST) !== explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]) throw new ErrorHttp(403, 'Origen de la solicitud no permitido.');
    }

    private function abrirSesion(string $id): void
    {
        Sesion::abrir($id);
        $this->fila = Db::uno('SELECT * FROM `usuarios` WHERE id = ?', [$id]);
        $this->ctx = new Contexto(Json::decodificar($this->fila['datos']));
    }

    private function ingresar(): never
    {
        $this->exigirOrigen();
        if (!Esquema::instalado()) throw new ErrorHttp(503, 'La base de datos aún no está instalada.');
        $d = $this->cuerpo();
        $email = mb_strtolower(trim((string) ($d['email'] ?? '')));
        $clave = (string) ($d['contrasena'] ?? '');
        $ip = Http::ip();
        Db::ejecutar('DELETE FROM `intentos_ip` WHERE momento < UTC_TIMESTAMP() - INTERVAL 1 DAY');
        $n = (int) Db::uno('SELECT COUNT(*) c FROM `intentos_ip` WHERE ip = ? AND momento > UTC_TIMESTAMP() - INTERVAL ' . self::VENTANA_IP_MIN . ' MINUTE', [$ip])['c'];
        if ($n >= self::INTENTOS_IP) throw new ErrorHttp(429, 'Demasiados intentos fallidos desde esta conexión. Espere ' . self::VENTANA_IP_MIN . ' minutos.');
        $generico = 'Correo o contraseña incorrectos.';
        $f = $email !== '' ? Db::uno('SELECT * FROM `usuarios` WHERE email = ?', [$email]) : null;
        $u = $f ? Json::decodificar($f['datos']) : null;
        $fallo = function (string $motivo) use ($ip, $u, $generico): never {
            Db::ejecutar('INSERT INTO `intentos_ip` (ip, momento) VALUES (?, UTC_TIMESTAMP())', [$ip]);
            Auditoria::evento('ingreso_fallido', 'usuarios', $u['id'] ?? null, $motivo, $u, 'rechazado');
            throw new ErrorHttp(401, $generico);
        };
        if (!$f) { password_verify($clave, '$2y$10$abcdefghijklmnopqrstuuJr5yEl6BFXT2N8Dcx0oP0zpLB/BRPq'); $fallo('Correo no registrado'); }
        if ($f['bloqueado_hasta'] && strtotime($f['bloqueado_hasta']) > time()) {
            $min = (int) ceil((strtotime($f['bloqueado_hasta']) - time()) / 60);
            throw new ErrorHttp(423, "Cuenta bloqueada temporalmente por intentos fallidos. Intente de nuevo en $min min.");
        }
        if (!$f['credencial'] || !Credenciales::verificar($clave, (string) $f['credencial'])) {
            $i = (int) $f['intentos'] + 1;
            $bloq = $i >= self::INTENTOS_USUARIO ? gmdate('Y-m-d\TH:i:s\Z', time() + self::BLOQUEO_MIN * 60) : null;
            Db::ejecutar('UPDATE `usuarios` SET intentos = ?, bloqueado_hasta = ? WHERE id = ?', [$bloq ? 0 : $i, $bloq, $f['id']]);
            $fallo($bloq ? 'Contraseña incorrecta; cuenta bloqueada ' . self::BLOQUEO_MIN . ' min' : 'Contraseña incorrecta');
        }
        if (($u['estado'] ?? '') !== 'activo') throw new ErrorHttp(403, 'La cuenta está suspendida. Contacte al administrador.');
        $rehash = Credenciales::requiereRehash((string) $f['credencial']) ? Credenciales::hash($clave) : $f['credencial'];
        Db::ejecutar('UPDATE `usuarios` SET intentos = 0, bloqueado_hasta = NULL, ultimo_ingreso = ?, credencial = ? WHERE id = ?', [Auditoria::ahora(), $rehash, $f['id']]);
        $this->abrirSesion($f['id']);
        Auditoria::evento('ingreso', 'usuarios', $f['id'], 'Inicio de sesión', $u);
        Http::json(['usuario' => $this->usuarioSesion(), 'csrf' => Sesion::csrf()]);
    }

    private function cambiarContrasena(): never
    {
        $ctx = $this->exigirEscritura(true);
        $d = $this->cuerpo();
        $actual = (string) ($d['actual'] ?? ''); $nueva = (string) ($d['nueva'] ?? '');
        if (!Credenciales::verificar($actual, (string) $this->fila['credencial'])) throw new ErrorHttp(422, 'La contraseña actual no es correcta.');
        Credenciales::exigirPolitica($nueva, 'La nueva contraseña');
        if ($actual === $nueva) throw new ErrorHttp(422, 'La nueva contraseña debe ser diferente de la actual.');
        Db::ejecutar('UPDATE `usuarios` SET credencial = ?, debe_cambiar = 0 WHERE id = ?', [Credenciales::hash($nueva), $ctx->id()]);
        Auditoria::evento('cambio_contrasena', 'usuarios', $ctx->id(), 'Cambio de contraseña propia', $ctx->usuario);
        session_regenerate_id(true);
        Http::json(['usuario' => $this->usuarioSesion()]);
    }

    private function restablecer(string $id): never
    {
        $ctx = $this->exigirEscritura(); $ctx->exigir('usuarios.administrar');
        $f = Db::uno('SELECT * FROM `usuarios` WHERE id = ?', [$id]);
        if (!$f) throw new ErrorHttp(404, 'El usuario no existe.');
        $t = (string) ($this->cuerpo()['temporal'] ?? '');
        Credenciales::exigirPolitica($t, 'La contraseña temporal');
        Db::ejecutar('UPDATE `usuarios` SET credencial = ?, debe_cambiar = 1, intentos = 0, bloqueado_hasta = NULL WHERE id = ?', [Credenciales::hash($t), $id]);
        $u = Json::decodificar($f['datos']);
        Auditoria::evento('cambio_contrasena', 'usuarios', $id, 'Contraseña temporal asignada por el administrador a ' . ($u['email'] ?? ''), $ctx->usuario);
        Http::vacio();
    }

    /* ---------------- Respaldos ---------------- */

    private function respaldo(string $m): never
    {
        if ($m === 'GET') {
            $ctx = $this->exigirSesion(); $ctx->exigir('respaldos.administrar');
            $p = Respaldo::exportar($ctx->usuario, SI360_VERSION);
            header('Content-Type: application/json; charset=utf-8');
            header('Content-Disposition: attachment; filename="si360-respaldo-' . gmdate('Ymd-His') . '.json"');
            echo Json::codificar($p);
            exit;
        }
        if ($m !== 'POST') throw new ErrorHttp(405, 'Método no permitido.');
        $ctx = $this->exigirEscritura(); $ctx->exigir('respaldos.administrar');
        if (!Respaldo::instalacionVacia()) throw new ErrorHttp(409, 'La importación desde el navegador solo se permite en una instalación nueva (sin empresas ni diagnósticos). Para reemplazar los datos de un servidor en uso, use la herramienta backend/cli/restaurar.php.');
        $d = Http::cuerpo((int) $this->cfg['max_respaldo_mb'] * 1048576);
        $motivo = trim((string) ($d['motivo'] ?? ''));
        if ($motivo === '') throw new ErrorHttp(422, 'Indique el motivo de la restauración.');
        $r = Respaldo::restaurar(is_array($d['paquete'] ?? null) ? $d['paquete'] : [], $motivo, $ctx->usuario);
        // Los usuarios ahora son los del respaldo: se cierra la sesión.
        Sesion::destruir();
        Http::json($r + ['sesionCerrada' => true]);
    }
}

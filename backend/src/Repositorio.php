<?php
declare(strict_types=1);

namespace SI360;

/**
 * Acceso a datos con control de alcance (qué registros ve cada rol), proyección (qué campos ve)
 * y reglas de negocio en cada escritura. Cada escritura queda en una transacción.
 */
final class Repositorio
{
    /** Campos de autenticación: viven en columnas propias, nunca en "datos" ni en las respuestas. */
    public const CAMPOS_AUTH = ['credencial', 'intentosFallidos', 'bloqueadoHasta', 'ultimoIngreso', 'debeCambiarContrasena'];
    private const META_PUBLICA = ['parametrosCalificacion'];
    private const CLAVE_VALIDA = '/^[\w:.|@\-]{1,190}$/u';
    public const CONSECUTIVO = '/^(consecutivoEmpresa|consecutivoDx\d{4}|consecutivoInf\d{4}|consecutivoAct:[\w-]{8,64})$/';

    private Reglas $reglas;
    private ?array $clienteDx = null;
    private ?array $clientePlanes = null;
    private ?array $clienteActividades = null;

    public function __construct(private Contexto $ctx) { $this->reglas = new Reglas($ctx); }

    /* ================= Lecturas internas (sin alcance) ================= */

    public static function fila(string $s, string $id, bool $bloquear = false): ?array
    {
        $t = Db::id($s); $k = Db::id(Almacenes::clave($s));
        return Db::uno("SELECT * FROM $t WHERE $k = ?" . ($bloquear ? ' FOR UPDATE' : ''), [$id]);
    }

    public static function filaDatos(string $s, string $id): ?array
    {
        if ($id === '') return null;
        $f = self::fila($s, $id);
        return $f ? Json::decodificar($f['datos']) : null;
    }

    /* ================= Lecturas con alcance ================= */

    private function exigirAlmacen(string $s): void
    {
        if (!Almacenes::existe($s)) throw new ErrorHttp(404, 'Recurso no encontrado.');
    }

    public function obtener(string $s, string $id): array
    {
        $this->exigirAlmacen($s);
        $f = self::fila($s, $id);
        if (!$f) throw new ErrorHttp(404, 'El registro no existe.');
        $d = Json::decodificar($f['datos']);
        if (!$this->visible($s, $f, $d)) throw new ErrorHttp(404, 'El registro no existe.');
        return $this->proyectar($s, $f, $d);
    }

    /** Listado completo o por índice. Devuelve solo lo visible para el rol (nunca un error por alcance). */
    public function listar(string $s, ?string $indice = null, ?string $valor = null, bool $contar = false): array
    {
        $this->exigirAlmacen($s);
        $t = Db::id($s); $w = []; $p = [];
        if ($indice !== null) {
            $col = Almacenes::columnaDeIndice($s, $indice);
            if (!$col) throw new ErrorHttp(400, "El almacén $s no tiene el índice $indice.");
            if ($valor === '' || $valor === null) { $w[] = Db::id($col) . ' IS NULL'; }
            else { $w[] = Db::id($col) . ' = ?'; $p[] = $s === 'usuarios' && $col === 'email' ? mb_strtolower($valor) : $valor; }
        }
        // Prefiltro por empresa en SQL (rendimiento); el filtro fino se hace en visible().
        $vis = $this->ctx->empresasVisibles();
        if ($vis !== null && in_array($s, Almacenes::CON_EMPRESA, true)) {
            if (!$vis) return $contar ? ['total' => 0] : [];
            $w[] = 'empresa_id IN (' . implode(',', array_fill(0, count($vis), '?')) . ')';
            array_push($p, ...$vis);
        }
        if ($s === 'borradores') { $w[] = 'usuario_id = ?'; $p[] = $this->ctx->id(); }
        if ($s === 'auditoria' && !$this->ctx->esAdmin()) {
            if (!$this->ctx->puede('auditoria.propia')) return $contar ? ['total' => 0] : [];
            $w[] = 'usuario_id = ?'; $p[] = $this->ctx->id();
        }
        $orden = $s === 'auditoria' ? ' ORDER BY secuencia' : '';
        $filas = Db::todos("SELECT * FROM $t" . ($w ? ' WHERE ' . implode(' AND ', $w) : '') . $orden, $p);
        $r = [];
        foreach ($filas as $f) {
            $d = Json::decodificar($f['datos']);
            if ($this->visible($s, $f, $d)) $r[] = $contar ? 1 : $this->proyectar($s, $f, $d);
        }
        return $contar ? ['total' => count($r)] : $r;
    }

    private function idsCliente(): void
    {
        if ($this->clienteDx !== null) return;
        $vis = $this->ctx->empresasVisibles() ?: ['-'];
        $in = implode(',', array_fill(0, count($vis), '?'));
        $this->clienteDx = array_column(Db::todos("SELECT id FROM `diagnosticos` WHERE empresa_id IN ($in) AND estado IN ('aprobado','cerrado')", $vis), 'id');
        $this->clientePlanes = array_column(Db::todos("SELECT id FROM `planes` WHERE empresa_id IN ($in) AND estado IN ('aprobado','cerrado')", $vis), 'id');
        $pl = $this->clientePlanes ?: ['-'];
        $this->clienteActividades = array_column(Db::todos('SELECT id FROM `actividades` WHERE plan_id IN (' . implode(',', array_fill(0, count($pl), '?')) . ')', $pl), 'id');
    }

    private function visible(string $s, array $f, array $d): bool
    {
        $ctx = $this->ctx;
        if ($ctx->esAdmin()) return true;
        if (in_array($s, Almacenes::CON_EMPRESA, true) && !$ctx->veEmpresa($f['empresa_id'] ?? '')) return false;
        switch ($s) {
            case 'catalogos': case 'requisitos': return true;
            case 'meta': return in_array($f['clave'], self::META_PUBLICA, true);
            case 'borradores': return $f['usuario_id'] === $ctx->id();
            case 'auditoria': return $ctx->puede('auditoria.propia') && $f['usuario_id'] === $ctx->id();
            case 'usuarios':
                if ($ctx->rol() === 'asesor') return true;
                if ($f['id'] === $ctx->id()) return true;
                $e = self::filaDatos('empresas', (string) ($ctx->usuario['empresaId'] ?? ''));
                return $e && ($e['asesorId'] ?? null) === $f['id'];
        }
        if ($ctx->rol() !== 'cliente') return true;
        // Cliente: solo información aprobada de su empresa.
        $this->idsCliente();
        return match ($s) {
            'empresas', 'documentos' => true,
            'diagnosticos' => in_array($f['id'], $this->clienteDx, true),
            'respuestas', 'hallazgos' => in_array($f['diagnostico_id'], $this->clienteDx, true),
            'evidencias' => in_array($f['diagnostico_id'], $this->clienteDx, true) || in_array($f['actividad_id'], $this->clienteActividades, true),
            'planes' => in_array($f['id'], $this->clientePlanes, true),
            'actividades', 'horas' => in_array($s === 'actividades' ? $f['id'] : $f['actividad_id'], $this->clienteActividades, true),
            'informes' => ($d['estadoFuente'] ?? '') === 'aprobado',
            default => false,
        };
    }

    private function proyectar(string $s, array $f, array $d): array
    {
        if ($s === 'usuarios') {
            foreach (self::CAMPOS_AUTH as $k) unset($d[$k]);
            if ($this->ctx->esAdmin() || $f['id'] === $this->ctx->id()) {
                $d['debeCambiarContrasena'] = (bool) $f['debe_cambiar'];
                $d['ultimoIngreso'] = $f['ultimo_ingreso'];
                $d['bloqueadoHasta'] = $f['bloqueado_hasta'];
                $d['intentosFallidos'] = (int) $f['intentos'];
                return $d;
            }
            return array_intersect_key($d, array_flip(['id', 'nombre', 'email', 'rol', 'estado', 'empresaId', 'cargo']));
        }
        return Json::comoJs($d);
    }

    /* ================= Escrituras ================= */

    public function guardar(string $s, $obj): void
    {
        $this->exigirAlmacen($s);
        $ctx = $this->ctx;
        if (!is_array($obj) || array_is_list($obj)) throw new ErrorHttp(422, 'El registro debe ser un objeto.');
        if (!in_array($ctx->rol(), Almacenes::DEF[$s]['escritura'], true)) throw new ErrorHttp(403, 'Su rol no puede modificar este tipo de registro.');
        $kp = Almacenes::clave($s);
        $id = $obj[$kp] ?? null;
        if (!is_string($id) || !preg_match(self::CLAVE_VALIDA, $id)) throw new ErrorHttp(422, 'Identificador del registro no válido.');
        if ($s === 'auditoria') { Auditoria::registrar($obj, $ctx->usuario); return; }

        Db::transaccion(function () use ($s, $obj, $id, $ctx) {
            $f = self::fila($s, $id, true);
            $e = $f ? Json::decodificar($f['datos']) : null;
            if ($f && !$this->visible($s, $f, $e)) throw new ErrorHttp(403, 'No tiene acceso a este registro.');
            $auth = null;
            if ($s === 'usuarios') {
                if (!$f) {
                    $auth = Credenciales::desdePrototipo($obj['credencial'] ?? null);
                    if (!$auth) throw new ErrorHttp(422, 'Credencial inicial no válida.');
                }
                foreach (self::CAMPOS_AUTH as $k) unset($obj[$k]);
            }
            // Empresa del registro (para el alcance) y verificación de que no cambie de empresa.
            $empresa = null;
            if (in_array($s, Almacenes::CON_EMPRESA, true)) {
                if ($s === 'empresas') $empresa = $id;
                elseif ($s === 'respuestas') { $dx = self::fila('diagnosticos', (string) ($obj['diagnosticoId'] ?? '')); $empresa = $dx['empresa_id'] ?? null; }
                else $empresa = is_string($obj['empresaId'] ?? null) ? $obj['empresaId'] : null;
                if ($s !== 'empresas') {
                    if (!$empresa || !self::fila('empresas', $empresa)) throw new ErrorHttp(422, 'El registro debe pertenecer a una empresa existente.');
                    $ctx->exigirEmpresa($empresa);
                }
                if ($f && $f['empresa_id'] !== null && $f['empresa_id'] !== $empresa) throw new ErrorHttp(409, 'Un registro no puede cambiar de empresa.');
            }
            $obj = $this->reglas->antesDeGuardar($s, $obj, $e);
            $cols = Almacenes::valores($s, $obj);
            if ($empresa !== null) $cols['empresa_id'] = $empresa;
            $this->escribir($s, $id, $obj, $cols, $f !== null);
            if ($s === 'usuarios' && $auth) Db::ejecutar('UPDATE `usuarios` SET credencial = ?, debe_cambiar = 1 WHERE id = ?', [$auth, $id]);
            if ($s === 'empresas') $ctx->olvidarAlcance();
        });
    }

    /** INSERT o UPDATE con traducción de violaciones de unicidad a mensajes comprensibles. */
    public static function escribir(string $s, string $id, array $obj, array $cols, bool $existe): void
    {
        $t = Db::id($s); $kp = Almacenes::clave($s);
        if ($s === 'empresas') $cols['nit_vigente'] = ($obj['estado'] ?? '') === 'eliminada' ? null : ($cols['nit'] ?? null);
        $cols['datos'] = Json::codificar($obj);
        try {
            if ($existe) {
                $set = implode(', ', array_map(fn ($c) => Db::id($c) . ' = ?', array_keys($cols)));
                Db::ejecutar("UPDATE $t SET $set WHERE " . Db::id($kp) . ' = ?', [...array_values($cols), $id]);
            } else {
                $cols = [$kp => $id] + $cols;
                $c = implode(', ', array_map([Db::class, 'id'], array_keys($cols)));
                Db::ejecutar("INSERT INTO $t ($c) VALUES (" . implode(',', array_fill(0, count($cols), '?')) . ')', array_values($cols));
            }
        } catch (\PDOException $ex) {
            if (($ex->errorInfo[1] ?? 0) === 1062) {
                $m = str_contains($ex->getMessage(), 'nit') ? ['Ya existe una empresa vigente con ese NIT.', ['nit' => 'NIT ya registrado.']]
                    : (str_contains($ex->getMessage(), 'email') ? ['Ya existe un usuario con ese correo.', ['email' => 'Correo ya registrado.']]
                    : (str_contains($ex->getMessage(), 'codigo') ? ['El código ya está en uso.', null] : ['El registro ya existe.', null]));
                throw new ErrorHttp(409, $m[0], $m[1]);
            }
            throw $ex;
        }
    }

    public function eliminar(string $s, string $id): void
    {
        $this->exigirAlmacen($s);
        if ($s === 'auditoria') throw new ErrorHttp(403, 'La bitácora es de solo inserción.');
        if (!in_array($this->ctx->rol(), Almacenes::DEF[$s]['escritura'], true)) throw new ErrorHttp(403, 'Su rol no puede eliminar este tipo de registro.');
        Db::transaccion(function () use ($s, $id) {
            $f = self::fila($s, $id, true);
            if (!$f) return; // idempotente, igual que IndexedDB
            $e = Json::decodificar($f['datos']);
            if (!$this->visible($s, $f, $e)) throw new ErrorHttp(403, 'No tiene acceso a este registro.');
            $this->reglas->antesDeEliminar($s, $e, $f['empresa_id'] ?? null);
            Db::ejecutar('DELETE FROM ' . Db::id($s) . ' WHERE ' . Db::id(Almacenes::clave($s)) . ' = ?', [$id]);
            if (in_array($s, Almacenes::CON_ARCHIVO, true)) Archivos::borrar($s, $id);
        });
    }

    /** Varias operaciones en UNA transacción: o se aplican todas o ninguna. */
    public function lote($ops): void
    {
        if (!is_array($ops) || !array_is_list($ops)) throw new ErrorHttp(422, 'Lote no válido.');
        if (count($ops) > 5000) throw new ErrorHttp(413, 'El lote supera 5.000 operaciones.');
        Db::transaccion(function () use ($ops) {
            foreach ($ops as $i => $o) {
                $tipo = $o['tipo'] ?? '';
                $s = (string) ($o['store'] ?? '');
                try {
                    if ($tipo === 'guardar') $this->guardar($s, $o['valor'] ?? null);
                    elseif ($tipo === 'eliminar') $this->eliminar($s, (string) ($o['id'] ?? ''));
                    else throw new ErrorHttp(422, 'Operación no permitida en el servidor: ' . $tipo);
                } catch (ErrorHttp $ex) {
                    throw new ErrorHttp($ex->estado, $ex->getMessage() . " (operación " . ($i + 1) . " de " . count($ops) . ", $s). No se aplicó ningún cambio.", $ex->campos);
                }
            }
        });
    }

    /** Consecutivo atómico (SELECT ... FOR UPDATE sobre la fila de meta). */
    public function siguiente(string $clave): int
    {
        if (!preg_match(self::CONSECUTIVO, $clave)) throw new ErrorHttp(400, 'Consecutivo no reconocido.');
        if ($clave === 'consecutivoEmpresa') $this->ctx->exigir('empresas.crear');
        elseif (str_starts_with($clave, 'consecutivoDx')) $this->ctx->exigir('diagnosticos.crear');
        elseif (str_starts_with($clave, 'consecutivoInf')) { if (!$this->ctx->puede('informes.generar') && !$this->ctx->puede('informes.descargar_autorizados')) throw new ErrorHttp(403, 'No tiene permiso para realizar esta operación.'); }
        else $this->ctx->exigir('planes.generar');
        return Db::transaccion(function () use ($clave) {
            $f = Db::uno('SELECT datos FROM `meta` WHERE clave = ? FOR UPDATE', [$clave]);
            $v = ($f ? (int) (Json::decodificar($f['datos'])['valor'] ?? 0) : 0) + 1;
            Db::ejecutar('INSERT INTO `meta` (clave, datos) VALUES (?, ?) ON DUPLICATE KEY UPDATE datos = VALUES(datos)', [$clave, Json::codificar(['clave' => $clave, 'valor' => $v])]);
            return $v;
        });
    }
}

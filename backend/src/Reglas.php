<?php
declare(strict_types=1);

namespace SI360;

/**
 * Reglas de negocio que el servidor hace cumplir aunque el cliente sea manipulado:
 * inmutabilidad de diagnósticos aprobados, validación de "No aplica" solo por el revisor,
 * cierre de actividades solo con evidencia, horas de solo registro, catálogos publicados inmutables,
 * unicidad de NIT, control del último administrador, archivos inmutables, y eliminación física restringida.
 */
final class Reglas
{
    private const DX_EDITABLES = ['borrador', 'en_ejecucion', 'devuelto'];
    private const DX_ESTADOS = ['borrador', 'en_ejecucion', 'pendiente_revision', 'devuelto', 'aprobado', 'cerrado'];

    /** Estado compartido durante una solicitud (lote). */
    public array $catalogosCreados = [];
    public array $catalogosBorradorEliminados = [];
    public array $empresasDemoEliminadas = [];

    public function __construct(private Contexto $ctx) {}

    private static function igual($a, $b, array $ignorar = []): bool
    {
        foreach ($ignorar as $k) { unset($a[$k], $b[$k]); }
        return Json::canonico($a) === Json::canonico($b);
    }

    private static function conflicto(string $m): never { throw new ErrorHttp(409, $m); }

    /** Valida y, si corresponde, ajusta el documento antes de guardarlo. */
    public function antesDeGuardar(string $s, array $n, ?array $e): array
    {
        $ctx = $this->ctx;
        switch ($s) {
            case 'usuarios': return $this->usuario($n, $e);
            case 'empresas': return $this->empresa($n, $e);
            case 'catalogos':
                $estados = ['borrador', 'publicado', 'reemplazado'];
                if (!in_array($n['estado'] ?? '', $estados, true)) throw new ErrorHttp(422, 'Estado de catálogo no válido.');
                if (!$e) {
                    $hayPublicado = (bool) Db::uno("SELECT id FROM `catalogos` WHERE estado = 'publicado'");
                    if ($n['estado'] !== 'borrador' && ($n['estado'] !== 'publicado' || $hayPublicado)) self::conflicto('Un catálogo nuevo debe crearse como borrador.');
                    $this->catalogosCreados[] = $n['id'];
                } else {
                    $ok = ($e['estado'] === 'borrador' && in_array($n['estado'], ['borrador', 'publicado'], true))
                        || ($e['estado'] === 'publicado' && in_array($n['estado'], ['publicado', 'reemplazado'], true));
                    if (!$ok) self::conflicto('Transición de estado del catálogo no permitida: una versión reemplazada es inmutable.');
                }
                return $n;
            case 'requisitos':
                $cat = Repositorio::filaDatos('catalogos', (string) ($n['catalogoId'] ?? ''));
                if (!$cat) throw new ErrorHttp(422, 'El requisito debe pertenecer a un catálogo existente.');
                if ($cat['estado'] !== 'borrador' && !in_array($cat['id'], $this->catalogosCreados, true)) self::conflicto('Los requisitos de una versión publicada no se modifican: cree un borrador de nueva versión.');
                return $n;
            case 'diagnosticos': return $this->diagnostico($n, $e);
            case 'respuestas': return $this->respuesta($n, $e);
            case 'evidencias':
            case 'documentos': return $this->adjunto($s, $n, $e);
            case 'hallazgos': return $n;
            case 'planes':
                $ctx->exigir('planes.generar');
                $d = $n['distribucion'] ?? [];
                if ($d instanceof \stdClass) $d = [];
                if (!is_array($d)) throw new ErrorHttp(422, 'Distribución de horas no válida.');
                foreach ($d as $v) if (!is_numeric($v) || $v < 0 || $v > 100) throw new ErrorHttp(422, 'Cada porcentaje debe estar entre 0 y 100.');
                if (($n['estado'] ?? '') === 'aprobado' && abs(array_sum(array_map('floatval', $d)) - 100) > 0.001) self::conflicto('Un plan solo se aprueba si la distribución suma exactamente 100 %.');
                if (!(is_numeric($n['horasMes'] ?? null) && $n['horasMes'] > 0)) throw new ErrorHttp(422, 'Las horas disponibles por mes deben ser mayores que cero.');
                return $n;
            case 'actividades': return $this->actividad($n, $e);
            case 'horas': return $this->horas($n, $e);
            case 'informes':
                if ($e) self::conflicto('El registro de informes es de solo inserción.');
                $n['generadoPor'] = $ctx->id(); $n['generadoPorNombre'] = $ctx->usuario['nombre']; $n['generadoEn'] = Auditoria::ahora();
                if ($ctx->rol() === 'cliente' && ($n['estadoFuente'] ?? '') !== 'aprobado') throw new ErrorHttp(403, 'Su rol solo permite informes de diagnósticos y planes aprobados.');
                return $n;
            case 'borradores':
                if (!str_starts_with((string) ($n['clave'] ?? ''), $ctx->id() . ':')) throw new ErrorHttp(403, 'Solo puede guardar sus propios borradores.');
                return $n;
            case 'meta':
                $k = (string) ($n['clave'] ?? '');
                if ($k === 'cadenaBitacora' || str_starts_with($k, 'consecutivo')) throw new ErrorHttp(403, 'Este valor lo administra el servidor.');
                return $n;
        }
        return $n;
    }

    private function usuario(array $n, ?array $e): array
    {
        $email = mb_strtolower(trim((string) ($n['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) throw new ErrorHttp(422, 'Correo no válido.', ['email' => 'Correo no válido.']);
        if (!in_array($n['rol'] ?? '', ['administrador', 'asesor', 'cliente'], true)) throw new ErrorHttp(422, 'Rol no válido.');
        if (!in_array($n['estado'] ?? '', ['activo', 'suspendido'], true)) throw new ErrorHttp(422, 'Estado no válido.');
        if (trim((string) ($n['nombre'] ?? '')) === '') throw new ErrorHttp(422, 'El nombre es obligatorio.');
        if ($n['rol'] === 'cliente' && !Repositorio::filaDatos('empresas', (string) ($n['empresaId'] ?? ''))) throw new ErrorHttp(422, 'Un usuario cliente debe estar vinculado a una empresa existente.');
        $n['email'] = $email;
        if ($e && $e['id'] === $this->ctx->id() && ($n['rol'] !== $e['rol'] || $n['estado'] !== $e['estado'])) throw new ErrorHttp(403, 'No puede cambiar su propio rol ni suspender su propia cuenta.');
        if ($e && $e['rol'] === 'administrador' && $e['estado'] === 'activo' && ($n['rol'] !== 'administrador' || $n['estado'] !== 'activo')) {
            $otros = Db::uno("SELECT COUNT(*) c FROM `usuarios` WHERE rol = 'administrador' AND id <> ? AND JSON_UNQUOTE(JSON_EXTRACT(datos, '$.estado')) = 'activo'", [$e['id']]);
            if ((int) $otros['c'] === 0) self::conflicto('Debe existir al menos un administrador activo.');
        }
        if ($e && isset($e['version'], $n['version']) && (int) $n['version'] !== (int) $e['version'] + 1 && !self::igual($n, $e, ['actualizadoEn', 'credencial', 'ultimoIngreso', 'bloqueadoHasta', 'intentosFallidos', 'debeCambiarContrasena']))
            self::conflicto('Otro usuario modificó este registro. Recargue la página y repita el cambio.');
        return $n;
    }

    private function empresa(array $n, ?array $e): array
    {
        $nit = preg_replace('/\D/', '', (string) ($n['nit'] ?? ''));
        if (!preg_match('/^\d{6,15}$/', $nit)) throw new ErrorHttp(422, 'NIT no válido.', ['nit' => 'NIT no válido.']);
        if (isset($n['dv']) && $n['dv'] !== null && (int) $n['dv'] !== self::dv($nit)) throw new ErrorHttp(422, 'El dígito de verificación no corresponde al NIT.', ['nit' => 'Dígito de verificación incorrecto.']);
        if (trim((string) ($n['razonSocial'] ?? '')) === '') throw new ErrorHttp(422, 'La razón social es obligatoria.', ['razonSocial' => 'Obligatoria.']);
        if (!in_array($n['estado'] ?? '', ['prospecto', 'activa', 'suspendida', 'finalizada', 'archivada', 'eliminada'], true)) throw new ErrorHttp(422, 'Estado de empresa no válido.');
        $n['nit'] = $nit;
        if (!empty($n['asesorId'])) {
            $a = Repositorio::filaDatos('usuarios', (string) $n['asesorId']);
            if (!$a || $a['rol'] !== 'asesor') throw new ErrorHttp(422, 'El asesor asignado no existe o no tiene rol de asesor.');
        }
        if ($e && isset($e['version'], $n['version']) && (int) $n['version'] !== (int) $e['version'] + 1 && !self::igual($n, $e, ['actualizadoEn']))
            self::conflicto('Otro usuario modificó esta empresa mientras usted la editaba. Recargue y repita el cambio.');
        return $n;
    }

    /** Dígito de verificación DIAN (módulo 11 con pesos primos). */
    public static function dv(string $nit): int
    {
        $p = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
        $s = 0; $r = strrev($nit);
        for ($i = 0; $i < strlen($r); $i++) $s += (int) $r[$i] * $p[$i];
        $m = $s % 11;
        return $m > 1 ? 11 - $m : $m;
    }

    private function diagnostico(array $n, ?array $e): array
    {
        $ctx = $this->ctx; $nuevo = (string) ($n['estado'] ?? '');
        if (!in_array($nuevo, self::DX_ESTADOS, true)) throw new ErrorHttp(422, 'Estado de diagnóstico no válido.');
        if (!$e) {
            $ctx->exigir('diagnosticos.crear');
            if ($nuevo !== 'borrador') self::conflicto('Un diagnóstico nuevo inicia en borrador.');
            return $n;
        }
        $ign = ['historial', 'actualizadoEn', 'estado'];
        switch ($e['estado']) {
            case 'borrador': case 'en_ejecucion': case 'devuelto':
                $ctx->exigir('diagnosticos.diligenciar');
                if (!in_array($nuevo, ['borrador', 'en_ejecucion', 'pendiente_revision'], true)) throw new ErrorHttp(403, 'Solo el revisor puede aprobar, devolver o cerrar un diagnóstico.');
                return $n;
            case 'pendiente_revision':
                if ($nuevo === 'pendiente_revision' && self::igual($n, $e, ['actualizadoEn'])) return $n;
                $ctx->exigir('diagnosticos.aprobar');
                if (!in_array($nuevo, ['devuelto', 'aprobado', 'pendiente_revision'], true)) self::conflicto('Transición no permitida desde "pendiente de revisión".');
                if ($nuevo === 'aprobado') {
                    if (empty($n['resultados'])) self::conflicto('La aprobación debe congelar los resultados.');
                    $n['aprobadoPor'] = $ctx->id(); $n['aprobadoPorNombre'] = $ctx->usuario['nombre']; $n['aprobadoEn'] = Auditoria::ahora();
                }
                return $n;
            case 'aprobado':
                $ctx->exigir('diagnosticos.aprobar');
                if (!in_array($nuevo, ['aprobado', 'cerrado'], true) || !self::igual($n, $e, $ign)) self::conflicto('Un diagnóstico aprobado es inmutable: cree una nueva revisión.');
                return $n;
            default:
                if (!self::igual($n, $e, ['actualizadoEn'])) self::conflicto('Un diagnóstico cerrado no admite cambios.');
                return $n;
        }
    }

    private function respuesta(array $n, ?array $e): array
    {
        $ctx = $this->ctx;
        $d = Repositorio::filaDatos('diagnosticos', (string) ($n['diagnosticoId'] ?? ''));
        if (!$d) throw new ErrorHttp(422, 'La respuesta debe pertenecer a un diagnóstico existente.');
        if (!str_starts_with((string) $n['id'], $d['id'] . ':')) throw new ErrorHttp(422, 'Identificador de respuesta no válido.');
        if (in_array($d['estado'], ['aprobado', 'cerrado'], true)) self::conflicto('El diagnóstico está aprobado: sus respuestas son inmutables.');
        if ($d['estado'] === 'pendiente_revision') { $ctx->exigir('diagnosticos.aprobar'); return $n; }
        $ctx->exigir('diagnosticos.diligenciar');
        // Solo el revisor valida exclusiones "No aplica".
        if (($n['naEstado'] ?? null) === 'aprobada' && !$ctx->puede('diagnosticos.aprobar')) {
            $mantiene = $e && ($e['naEstado'] ?? null) === 'aprobada' && ($e['respuesta'] ?? null) === ($n['respuesta'] ?? null) && ($e['justificacionNA'] ?? null) === ($n['justificacionNA'] ?? null);
            $copia = false;
            if (!$e && !empty($n['copiadaDe'])) {
                $o = Repositorio::filaDatos('respuestas', (string) $n['copiadaDe']);
                $copia = $o && ($o['naEstado'] ?? null) === 'aprobada' && ($o['respuesta'] ?? null) === ($n['respuesta'] ?? null) && ($o['justificacionNA'] ?? null) === ($n['justificacionNA'] ?? null);
            }
            if (!$mantiene && !$copia) throw new ErrorHttp(403, 'Solo el revisor puede validar una exclusión "No aplica".');
        }
        return $n;
    }

    private function adjunto(string $s, array $n, ?array $e): array
    {
        if ($s === 'documentos') $this->ctx->exigir('empresas.documentos'); else $this->ctx->exigir('evidencias.adjuntar');
        if ($e) {
            // Inmutables: solo se permite la eliminación lógica.
            $campos = ['archivo', 'eliminado', 'eliminadoEn', 'eliminadoPor', 'motivoEliminacion'];
            if (!self::igual($n, $e, $campos)) self::conflicto('Los adjuntos no se modifican; solo pueden retirarse (eliminación lógica).');
            if (!empty($e['eliminado']) && empty($n['eliminado'])) self::conflicto('Un adjunto retirado no se reactiva.');
            $n['archivo'] = $e['archivo'];
            return $n;
        }
        if ($s === 'evidencias') {
            if (!empty($n['diagnosticoId'])) {
                $d = Repositorio::filaDatos('diagnosticos', (string) $n['diagnosticoId']);
                if (!$d || !in_array($d['estado'], self::DX_EDITABLES, true)) self::conflicto('El diagnóstico no admite nuevas evidencias en su estado actual.');
            }
            if (!empty($n['actividadId'])) {
                $a = Repositorio::filaDatos('actividades', (string) $n['actividadId']);
                if (!$a || in_array($a['estado'], ['verificada', 'cancelada'], true)) self::conflicto('La actividad está cerrada.');
            }
        }
        if (!is_array($n['archivo'] ?? null) || empty($n['archivo']['base64'])) throw new ErrorHttp(422, 'Falta el archivo adjunto.');
        $n['archivo'] = Archivos::guardar($s, (string) $n['id'], $n['archivo']);
        $n['tamano'] = $n['archivo']['tamano']; $n['mime'] = $n['archivo']['mime'];
        $n['creadoPor'] = $this->ctx->id();
        return $n;
    }

    private function actividad(array $n, ?array $e): array
    {
        $ctx = $this->ctx; $ctx->exigir('planes.generar');
        $plan = Repositorio::filaDatos('planes', (string) ($n['planId'] ?? ''));
        if (!$plan || ($plan['empresaId'] ?? null) !== ($n['empresaId'] ?? null)) throw new ErrorHttp(422, 'La actividad debe pertenecer a un plan de la misma empresa.');
        if ($e && in_array($e['estado'], ['verificada', 'cancelada'], true)) {
            if (!self::igual($n, $e, ['actualizadoEn'])) self::conflicto('La actividad está cerrada y no admite cambios.');
            return $n;
        }
        $nuevo = $n['estado'] ?? 'pendiente';
        if (!in_array($nuevo, ['pendiente', 'en_curso', 'ejecutada', 'verificada', 'cancelada'], true)) throw new ErrorHttp(422, 'Estado de actividad no válido.');
        if ($nuevo === 'ejecutada' && ($e['estado'] ?? null) !== 'ejecutada') {
            $h = Db::uno("SELECT COUNT(*) c FROM `horas` WHERE actividad_id = ? AND COALESCE(JSON_EXTRACT(datos, '$.anulado'), false) = false", [$n['id']]);
            if ((int) $h['c'] === 0) self::conflicto('Registre horas ejecutadas antes de marcar la actividad como ejecutada.');
        }
        if ($nuevo === 'verificada') {
            if (!$ctx->puede('diagnosticos.aprobar')) throw new ErrorHttp(403, 'La verificación de cierre la realiza un administrador o revisor.');
            if (($e['estado'] ?? null) !== 'ejecutada') self::conflicto('Solo se verifican actividades ejecutadas.');
            $ev = Db::uno("SELECT COUNT(*) c FROM `evidencias` WHERE actividad_id = ? AND COALESCE(JSON_EXTRACT(datos, '$.eliminado'), false) = false", [$n['id']]);
            if ((int) $ev['c'] === 0) self::conflicto('No se puede cerrar sin evidencia: adjunte al menos un soporte.');
            $n['verificadaPor'] = $ctx->id(); $n['verificadaEn'] = Auditoria::ahora();
        }
        return $n;
    }

    private function horas(array $n, ?array $e): array
    {
        $ctx = $this->ctx; $ctx->exigir('horas.registrar');
        if ($e) {
            if (!empty($e['anulado'])) self::conflicto('El registro ya está anulado.');
            if (empty($n['anulado']) || !self::igual($n, $e, ['anulado', 'anuladoEn', 'anuladoPor', 'motivoAnulacion'])) self::conflicto('Las horas registradas no se modifican; solo pueden anularse con motivo.');
            if ($e['usuarioId'] !== $ctx->id() && !$ctx->esAdmin()) throw new ErrorHttp(403, 'Solo quien registró las horas o un administrador puede anularlas.');
            if (trim((string) ($n['motivoAnulacion'] ?? '')) === '') throw new ErrorHttp(422, 'Indique el motivo de la anulación.');
            $n['anuladoPor'] = $ctx->id(); $n['anuladoEn'] = Auditoria::ahora();
            return $n;
        }
        $h = $n['horas'] ?? null;
        if (!is_numeric($h) || $h <= 0 || $h > 12) throw new ErrorHttp(422, 'Registre entre 0,25 y 12 horas por registro.');
        $f = (string) ($n['fecha'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $f) || $f > gmdate('Y-m-d', time() + 86400)) throw new ErrorHttp(422, 'Fecha de ejecución no válida o futura.');
        $a = Repositorio::filaDatos('actividades', (string) ($n['actividadId'] ?? ''));
        if (!$a || ($a['empresaId'] ?? null) !== ($n['empresaId'] ?? null)) throw new ErrorHttp(422, 'Las horas deben corresponder a una actividad de la misma empresa.');
        if (in_array($a['estado'], ['verificada', 'cancelada'], true)) self::conflicto('La actividad está cerrada.');
        $n['usuarioId'] = $ctx->id(); $n['usuarioNombre'] = $ctx->usuario['nombre']; $n['anulado'] = false;
        return $n;
    }

    /** ¿Se permite la eliminación física? (por defecto no: se usa eliminación lógica) */
    public function antesDeEliminar(string $s, array $e, ?string $empresaId): void
    {
        $ctx = $this->ctx;
        if ($s === 'borradores') {
            if (!str_starts_with((string) $e['clave'], $ctx->id() . ':')) throw new ErrorHttp(403, 'Solo puede eliminar sus propios borradores.');
            return;
        }
        if (!$ctx->esAdmin()) throw new ErrorHttp(403, 'La eliminación física no está permitida; use la eliminación lógica.');
        if ($s === 'catalogos') {
            if ($e['estado'] !== 'borrador') self::conflicto('Solo se descartan catálogos en borrador.');
            $this->catalogosBorradorEliminados[] = $e['id'];
            return;
        }
        if ($s === 'requisitos') {
            $cat = Repositorio::filaDatos('catalogos', (string) $e['catalogoId']);
            if (($cat && $cat['estado'] === 'borrador') || in_array($e['catalogoId'], $this->catalogosBorradorEliminados, true)) return;
            self::conflicto('Los requisitos de una versión publicada no se eliminan.');
        }
        if ($s === 'empresas' && !empty($e['demo'])) { $this->empresasDemoEliminadas[] = $e['id']; return; }
        if ($empresaId !== null && in_array($s, Almacenes::CON_EMPRESA, true)) {
            if (in_array($empresaId, $this->empresasDemoEliminadas, true)) return;
            $emp = Repositorio::filaDatos('empresas', $empresaId);
            if ($emp && !empty($emp['demo'])) return;
        }
        throw new ErrorHttp(403, 'La eliminación física no está permitida; use la eliminación lógica.');
    }
}

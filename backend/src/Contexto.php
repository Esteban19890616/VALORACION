<?php
declare(strict_types=1);

namespace SI360;

/**
 * Usuario autenticado y su alcance de datos (principio de mínimo privilegio).
 * Misma matriz que js/domain/permisos.js; aquí es la barrera real.
 */
final class Contexto
{
    public const PERMISOS = [
        'administrador' => ['*'],
        'asesor' => ['dashboard.ver', 'empresas.ver', 'empresas.documentos', 'catalogo.ver', 'diagnosticos.ver', 'diagnosticos.crear', 'diagnosticos.diligenciar', 'evidencias.adjuntar', 'planes.ver', 'planes.generar', 'horas.registrar', 'informes.generar', 'auditoria.propia'],
        'cliente' => ['dashboard.ver', 'empresas.ver', 'diagnosticos.ver', 'diagnosticos.ver_aprobados', 'planes.ver', 'planes.ver_aprobados', 'informes.descargar_autorizados'],
    ];

    private ?array $empresas = null;

    public function __construct(public readonly array $usuario) {}

    public function id(): string { return $this->usuario['id']; }
    public function rol(): string { return $this->usuario['rol']; }
    public function esAdmin(): bool { return $this->rol() === 'administrador'; }

    public function puede(string $permiso): bool
    {
        if (($this->usuario['estado'] ?? '') !== 'activo') return false;
        $p = self::PERMISOS[$this->rol()] ?? [];
        return in_array('*', $p, true) || in_array($permiso, $p, true);
    }

    public function exigir(string $permiso): void
    {
        if (!$this->puede($permiso)) throw new ErrorHttp(403, 'No tiene permiso para realizar esta operación.');
    }

    /** null = todas las empresas; arreglo = ids visibles. */
    public function empresasVisibles(): ?array
    {
        if ($this->esAdmin()) return null;
        if ($this->empresas !== null) return $this->empresas;
        if ($this->rol() === 'asesor') {
            $this->empresas = array_column(Db::todos("SELECT id FROM `empresas` WHERE asesor_id = ? AND (estado IS NULL OR estado <> 'eliminada')", [$this->id()]), 'id');
        } else {
            $e = (string) ($this->usuario['empresaId'] ?? '');
            $this->empresas = $e !== '' && Db::uno("SELECT id FROM `empresas` WHERE id = ? AND (estado IS NULL OR estado <> 'eliminada')", [$e]) ? [$e] : [];
        }
        return $this->empresas;
    }

    public function veEmpresa(?string $empresaId): bool
    {
        if ($empresaId === null) return true;
        $v = $this->empresasVisibles();
        return $v === null || in_array($empresaId, $v, true);
    }

    public function exigirEmpresa(?string $empresaId): void
    {
        if (!$this->veEmpresa($empresaId)) throw new ErrorHttp(403, 'No tiene acceso a la empresa de este registro.');
    }

    public function olvidarAlcance(): void { $this->empresas = null; }
}

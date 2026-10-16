<?php
declare(strict_types=1);

namespace SI360;

/** Error controlado con código HTTP y, opcionalmente, errores por campo. */
final class ErrorHttp extends \RuntimeException
{
    public function __construct(public readonly int $estado, string $mensaje, public readonly ?array $campos = null)
    {
        parent::__construct($mensaje);
    }
}


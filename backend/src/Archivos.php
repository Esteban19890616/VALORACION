<?php
declare(strict_types=1);

namespace SI360;

/**
 * Archivos adjuntos (documentos y evidencias) en una carpeta PRIVADA fuera de public_html.
 * Se valida tamaño, tipo real (finfo) y se guarda la huella SHA-256. Se sirven solo a través de la API.
 */
final class Archivos
{
    public const MAX_BYTES = 5 * 1048576;
    public const TIPOS = ['application/pdf', 'image/jpeg', 'image/png',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

    private static string $raiz = '';

    public static function configurar(string $raiz): void { self::$raiz = rtrim($raiz, '/\\'); }

    private static function ruta(string $almacen, string $id): string
    {
        if (!in_array($almacen, Almacenes::CON_ARCHIVO, true)) throw new ErrorHttp(400, 'Almacén sin archivos.');
        if (self::$raiz === '') throw new ErrorHttp(500, 'La carpeta de archivos no está configurada.');
        return self::$raiz . DIRECTORY_SEPARATOR . $almacen . DIRECTORY_SEPARATOR . hash('sha256', $id);
    }

    /** Recibe {base64, mime}; devuelve la referencia que se guarda en el documento. */
    public static function guardar(string $almacen, string $id, array $archivo): array
    {
        $bin = base64_decode((string) ($archivo['base64'] ?? ''), true);
        if ($bin === false || $bin === '') throw new ErrorHttp(422, 'El archivo adjunto está vacío o dañado.');
        if (strlen($bin) > self::MAX_BYTES) throw new ErrorHttp(413, 'El archivo supera el límite de 5 MB.');
        $real = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bin) ?: 'application/octet-stream';
        // DOCX y XLSX son contenedores ZIP: finfo puede informarlos como application/zip.
        $declarado = (string) ($archivo['mime'] ?? '');
        $ofimatica = str_contains($declarado, 'openxmlformats') && in_array($real, ['application/zip', 'application/octet-stream', $declarado], true);
        if (!in_array($declarado, self::TIPOS, true) || (!$ofimatica && $real !== $declarado)) throw new ErrorHttp(415, 'Tipo de archivo no permitido o no coincide con su contenido. Use PDF, JPG, PNG, DOCX o XLSX.');
        $ruta = self::ruta($almacen, $id);
        if (!is_dir(dirname($ruta)) && !mkdir(dirname($ruta), 0700, true)) throw new ErrorHttp(500, 'No se pudo crear la carpeta de archivos.');
        $tmp = $ruta . '.tmp';
        if (file_put_contents($tmp, $bin, LOCK_EX) !== strlen($bin) || !rename($tmp, $ruta)) throw new ErrorHttp(500, 'No se pudo guardar el archivo.');
        @chmod($ruta, 0600);
        return ['ref' => true, 'mime' => $declarado, 'tamano' => strlen($bin), 'sha256' => hash('sha256', $bin)];
    }

    public static function leer(string $almacen, string $id): string
    {
        $ruta = self::ruta($almacen, $id);
        if (!is_file($ruta)) throw new ErrorHttp(404, 'El archivo no existe en el servidor.');
        return (string) file_get_contents($ruta);
    }

    public static function existe(string $almacen, string $id): bool { return is_file(self::ruta($almacen, $id)); }

    public static function borrar(string $almacen, string $id): void { $r = self::ruta($almacen, $id); if (is_file($r)) unlink($r); }

    public static function servir(string $almacen, string $id, array $doc): never
    {
        $bin = self::leer($almacen, $id);
        if (!empty($doc['archivo']['sha256']) && !hash_equals($doc['archivo']['sha256'], hash('sha256', $bin))) throw new ErrorHttp(500, 'La huella del archivo no coincide: el archivo pudo ser alterado en el servidor.');
        $nombre = preg_replace('/[^\w.\- ]+/u', '_', (string) ($doc['nombre'] ?? 'archivo'));
        header('Content-Type: ' . ($doc['archivo']['mime'] ?? 'application/octet-stream'));
        header('Content-Length: ' . strlen($bin));
        header('Content-Disposition: attachment; filename="' . $nombre . '"');
        header('X-Content-Type-Options: nosniff');
        echo $bin;
        exit;
    }
}

<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(403); exit; }
require dirname(__DIR__) . '/bootstrap.php';

function opcion(array $argv, string $n, ?string $def = null): ?string
{
    foreach ($argv as $a) if (str_starts_with($a, "--$n=")) return substr($a, strlen($n) + 3);
    return in_array("--$n", $argv, true) ? '1' : $def;
}
function salir(string $m, int $c = 1): never { fwrite($c ? STDERR : STDOUT, $m . PHP_EOL); exit($c); }
function leerOculto(string $p): string
{
    echo $p;
    if (DIRECTORY_SEPARATOR === '/') { system('stty -echo'); $v = trim((string) fgets(STDIN)); system('stty echo'); echo PHP_EOL; return $v; }
    return trim((string) fgets(STDIN));
}

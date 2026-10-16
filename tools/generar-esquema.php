<?php
/** Escribe database/schema.sql a partir de backend/src/Esquema.php (fuente única). */
spl_autoload_register(fn ($c) => is_file($f = dirname(__DIR__) . '/backend/src/' . substr($c, 6) . '.php') && require $f);
file_put_contents(dirname(__DIR__) . '/database/schema.sql', SI360\Esquema::sql());
echo "database/schema.sql actualizado.\n";

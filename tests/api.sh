#!/usr/bin/env bash
# Ejecuta las pruebas de integración de la API sobre una base de datos de pruebas VACÍA.
# Uso: SI360_DB=si360_test tests/api.sh   (requiere backend/config.local.php o SI360_CONFIG apuntando a esa base)
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${SI360_DB:-si360_test}"; MYSQL="${SI360_MYSQL_CMD:-mysql}"
$MYSQL -e "DROP DATABASE IF EXISTS \`$DB\`; CREATE DATABASE \`$DB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
php backend/cli/instalar.php --solo-esquema
php -S 127.0.0.1:8080 backend/dev-router.php > /tmp/si360-php.log 2>&1 &
PID=$!; trap 'kill $PID' EXIT; sleep 1
SI360_MYSQL="$MYSQL $DB" node tests/api.integracion.mjs

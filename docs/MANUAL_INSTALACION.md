# Manual de instalación — SER INTEGRAL 360 v1.0.0

Hay tres formas de ejecutar la aplicación. Elija según el uso:

| Forma | Para qué | Dónde quedan los datos |
|---|---|---|
| A. Prototipo local en Windows | Probar, capacitar, trabajo individual | En el navegador de ese equipo |
| B. Servidor de desarrollo local (PHP + MariaDB) | Probar el modo servidor antes de publicar | Base de datos local |
| C. **Producción en Hostinger** | Trabajo real multiusuario | MySQL de Hostinger → ver `DESPLIEGUE_HOSTINGER.md` |

---

## A. Prototipo local en Windows

1. Descomprima `ser-integral-360-v1.0.0.zip`, por ejemplo en `Documentos\ser-integral-360`.
2. Doble clic en **`iniciar.bat`**. Se abre `http://localhost:8360`.
   * Requiere **Python 3** (recomendado) o **Node.js**. Si no tiene ninguno, instale Python desde python.org marcando *Add python.exe to PATH*.
3. La primera vez cree la cuenta del administrador.
4. Use siempre el mismo navegador y la misma dirección. Descargue un respaldo semanal (**Respaldo y datos**).

No abra `index.html` con doble clic: los módulos de JavaScript no funcionan desde `file://`.
Limitaciones de este modo: `LIMITACIONES.md`.

---

## B. Servidor de desarrollo local (opcional)

Sirve para ver la aplicación exactamente como funcionará en Hostinger.

**Requisitos:**
* PHP 8.2 o superior con `pdo_mysql`, `mbstring`, `fileinfo` y `zlib`.
* MariaDB 10.6 o superior, o MySQL 8.0.16 o superior.
* En Windows sirve un paquete como XAMPP; use su consola, con `php` y `mysql` en el PATH.

**Pasos:**

1. Crear la base y el usuario:
   ```sql
   CREATE DATABASE si360_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'si360'@'localhost' IDENTIFIED BY 'una-clave-local';
   GRANT ALL ON si360_dev.* TO 'si360'@'localhost';
   ```
2. Crear `backend/config.local.php`. Git lo ignora, y solo se acepta cuando se navega en `localhost`:
   ```php
   <?php
   return [
       'db' => ['dsn' => 'mysql:host=127.0.0.1;dbname=si360_dev;charset=utf8mb4', 'usuario' => 'si360', 'clave' => 'una-clave-local'],
       'archivos_dir' => __DIR__ . '/../../si360-privado-dev/archivos',
       'sesiones_dir' => __DIR__ . '/../../si360-privado-dev/sesiones',
       'respaldos_dir' => __DIR__ . '/../../si360-privado-dev/respaldos',
       'registro' => __DIR__ . '/../../si360-privado-dev/errores.log',
   ];
   ```
3. Desde la carpeta del proyecto:
   ```bash
   php backend/cli/instalar.php --solo-esquema
   php -S 127.0.0.1:8080 backend/dev-router.php
   ```
4. Abra `http://127.0.0.1:8080`.
   * Verá la configuración inicial del modo servidor.
   * El enrutador de desarrollo imita el `.htaccess`: sirve `api/entorno.php` como `js/entorno.js` y bloquea `backend/`, `docs/` y las demás carpetas internas.
5. Diagnóstico: `php backend/cli/verificar.php`.
   * En local es normal que falle "Instalación web desactivada" mientras `permitir_instalacion_web` siga activo.

---

## Pruebas

```bash
npm test          # pruebas unitarias (Node 18+): motor, planes, PDF, seguridad
tests/api.sh      # integración de la API: crea una base VACÍA, levanta php -S y ejecuta 27 pruebas
```

`tests/api.sh` borra y recrea la base indicada en `SI360_DB` (por defecto `si360_test`). **Nunca lo ejecute contra una base con datos reales.**

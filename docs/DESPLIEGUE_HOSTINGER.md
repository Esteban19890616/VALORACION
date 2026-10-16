# Despliegue en Hostinger con GitHub

Guía paso a paso para publicar SER INTEGRAL 360 en un plan de Hostinger con PHP y MySQL/MariaDB, con control de cambios en GitHub.
Las rutas de menú de hPanel se verificaron en la documentación de Hostinger a octubre de 2026. Si Hostinger cambia su panel, busque la opción por su nombre.

---

## 0. Idea central: dos carpetas

| Carpeta | Contenido | ¿La toca Git? |
|---|---|---|
| `/home/uXXXX/domains/su-dominio.com/public_html/` | El código (este repositorio) | **Sí.** Cada despliegue la sobrescribe. |
| `/home/uXXXX/domains/su-dominio.com/si360-privado/` | `config.php` (claves de la base de datos), archivos adjuntos, sesiones, respaldos y registro de errores | **No.** Nunca se publica ni se sobrescribe. |

Hostinger reemplaza el contenido de la carpeta de destino al desplegar desde Git. Por eso **nada privado puede quedar dentro de `public_html`**.
La aplicación busca `si360-privado/config.php` en la carpeta padre de `public_html`. Si encuentra la configuración dentro de la carpeta pública, se niega a arrancar.

`uXXXX` es su usuario de Hostinger. Puede verlo en hPanel o en la ruta que muestra el Administrador de archivos.

---

## 1. Requisitos

* Plan de Hostinger con PHP y bases de datos MySQL (planes de hosting web Premium, Business o superiores).
* Dominio apuntando al plan y certificado SSL activo.
* Cuenta de GitHub con el repositorio del proyecto, preferiblemente **privado**.
* PHP **8.2 o superior** (recomendado 8.3) con `pdo_mysql`, `mbstring`, `fileinfo` y `zlib`. En Hostinger suelen venir activas; `verificar.php` lo comprueba.

---

## 2. Subir el proyecto a GitHub

```bash
cd ser-integral-360
git init
git add .
git commit -m "SER INTEGRAL 360 v1.0.0"
git branch -M main
git remote add origin git@github.com:<su-usuario>/ser-integral-360.git
git push -u origin main
```

El `.gitignore` excluye `backend/config.local.php`, `si360-privado/`, cualquier `config.php` y los respaldos `SI360_*.json`.
**Antes de cada push**, revise con `git status` que no va ningún archivo con claves o datos personales.

Con cada push, GitHub ejecuta las pruebas automáticas (`.github/workflows/ci.yml`): pruebas unitarias, sintaxis PHP y 27 pruebas de la API sobre MySQL 8.
Si la marca queda en rojo, no despliegue.

---

## 3. Crear la base de datos

1. hPanel → **Bases de datos** → **Administración** (Management).
2. Cree la base y el usuario, por ejemplo `uXXXX_si360` con una contraseña larga y aleatoria. Hostinger antepone el prefijo `uXXXX_`.
3. Anote el **nombre de la base**, el **usuario**, la **contraseña** y el **host**. En hosting compartido el host suele ser `localhost`; hPanel lo indica.

Use un usuario exclusivo para esta aplicación. No reutilice el usuario de otro sitio.

---

## 4. Crear la carpeta privada y la configuración

1. hPanel → **Archivos** → **Administrador de archivos**.
2. Suba un nivel desde `public_html` hasta `domains/su-dominio.com/` y cree la carpeta **`si360-privado`**.
3. Dentro de ella cree **`config.php`** copiando `backend/config.ejemplo.php` y reemplace los datos de conexión:

```php
<?php
return [
    'db' => [
        'dsn' => 'mysql:host=localhost;port=3306;dbname=uXXXX_si360;charset=utf8mb4',
        'usuario' => 'uXXXX_si360',
        'clave' => 'la-contraseña-de-la-base',
    ],
    'permitir_instalacion_web' => true,   // cámbielo a false después del paso 7
];
```

Las subcarpetas `archivos/`, `sesiones/`, `respaldos/` y `registro/` se crean solas junto a `config.php`.

---

## 5. Conectar GitHub con Hostinger y desplegar

1. hPanel → **Sitios web** → **Panel** del sitio → **Avanzado** → **Git**.
2. **Repositorio privado:** en esa misma pantalla genere la clave SSH y agréguela en GitHub.
   * Ruta en GitHub: repositorio → *Settings* → *Deploy keys* → *Add deploy key*.
   * Solo lectura; no marque *Allow write access*.
3. Cree el repositorio en Hostinger:
   * Dirección: `git@github.com:<su-usuario>/ser-integral-360.git`
   * Rama: `main`
   * Directorio: vacío, para desplegar en `public_html`. También puede indicar una subcarpeta, por ejemplo `si360` → `su-dominio.com/si360`.
4. Hostinger exige que la carpeta de destino esté vacía en el primer despliegue. Elimine antes el `index.php` o `default.php` de bienvenida.
5. Pulse **Desplegar** (Deploy).
6. **Opcional: despliegue automático.** Active *Auto Deployment* y copie la URL del *webhook* en GitHub.
   * Ruta en GitHub: *Settings* → *Webhooks* → *Add webhook*, tipo `application/json`, evento *push*.
   * Desde entonces cada push a `main` se publica solo. Hágalo cuando las pruebas de GitHub estén en verde.

---

## 6. PHP y HTTPS

1. hPanel → **Avanzado** → **Configuración de PHP**: seleccione **PHP 8.3**.
2. hPanel → **Seguridad** → **SSL**: instale o active el certificado gratuito.
   * El `.htaccess` del proyecto ya redirige todo a HTTPS, envía las cabeceras de seguridad (CSP, HSTS, `nosniff`, anti-iframe) y bloquea por web `backend/`, `database/`, `docs/`, `tests/`, `tools/` y los archivos `.md`, `.sql` y `.json` de configuración.
3. El `.htaccess` sube los límites de PHP siguiendo el método que documenta Hostinger (`php_value post_max_size 100M`, etc.), para importar respaldos grandes. Si su plan tiene topes menores, ajuste `max_respaldo_mb` en `config.php`.

---

## 7. Primer arranque

1. Abra `https://su-dominio.com`. El navegador recibe el **modo servidor**: el `.htaccess` sirve `api/entorno.php` en lugar de `js/entorno.js`, así que la aplicación nunca guarda datos en el navegador por error.
2. Verá **Configuración inicial**. Cree el administrador; en ese momento la aplicación instala solas las tablas de la base de datos.
3. Al ingresar el administrador se instala el catálogo normativo base (139 requisitos).
4. **Inmediatamente después**, en `si360-privado/config.php` ponga `'permitir_instalacion_web' => false`.

**Alternativas para instalar las tablas:**

| Opción | Cómo |
|---|---|
| phpMyAdmin | Importe `database/schema.sql`. |
| SSH (si su plan lo incluye) | `php public_html/backend/cli/instalar.php`. Instala las tablas y pide el administrador por consola. |

---

## 8. Migrar los datos del prototipo local

Si ya trabajó con la versión local (`iniciar.bat`):

1. En el prototipo: **Respaldo y datos** → **Descargar respaldo**.
2. En el servidor recién instalado (sin empresas ni diagnósticos), ingrese con el administrador de instalación → **Respaldo y datos** → cargue el archivo → **Restaurar este respaldo** → escriba el motivo.
3. El servidor valida la huella SHA-256 y reemplaza los datos en una sola transacción:
   * Re-encadena la bitácora y marca las entradas como importadas.
   * Guarda los adjuntos en la carpeta privada.
4. La sesión se cierra: **los usuarios ahora son los del respaldo**. Ingrese con las mismas contraseñas del prototipo; en el primer ingreso cada contraseña se convierte a Argon2id.

La importación desde el navegador solo se permite en una instalación nueva. Para reemplazar los datos de un servidor en uso, use la línea de comandos (sección 10).

---

## 9. Respaldos automáticos (obligatorio)

hPanel → **Avanzado** → **Cron Jobs** → crear una tarea diaria, por ejemplo a las 02:15:

```
php /home/uXXXX/domains/su-dominio.com/public_html/backend/cli/respaldar.php >> /home/uXXXX/domains/su-dominio.com/si360-privado/registro/cron.log 2>&1
```

* Genera `si360-privado/respaldos/si360-AAAAMMDD-HHMMSS.json.gz`.
* Lo relee y verifica su huella antes de darlo por bueno.
* Conserva los últimos 30 (`retener_respaldos`).
* Deja constancia en la bitácora.

Un respaldo guardado en el mismo servidor no protege si se pierde la cuenta o el servidor. Lleve copias fuera:

* **Semanal:** descargue el último respaldo (Administrador de archivos o **Respaldo y datos** → *Descargar respaldo*) y guárdelo en otra nube o disco cifrado.
* **Trimestral:** prueba de restauración en una base de prueba (`restaurar.php` sin `--confirmar` valida sin modificar nada). Deje acta.
* Los respaldos propios de Hostinger son un complemento, no un sustituto.

---

## 10. Herramientas de línea de comandos (SSH)

| Comando | Para qué |
|---|---|
| `php backend/cli/verificar.php` | Diagnóstico: versión de PHP, extensiones, conexión, esquema, carpetas privadas fuera del despliegue, instalación web desactivada y **cadena de la bitácora íntegra**. |
| `php backend/cli/respaldar.php` | Respaldo inmediato verificado. |
| `php backend/cli/restaurar.php archivo.json.gz --motivo="..."` | Valida un respaldo **sin modificar nada**. |
| `php backend/cli/restaurar.php archivo.json.gz --motivo="..." --confirmar` | **Reemplaza todo.** Antes genera un respaldo de seguridad del estado actual. |
| `php backend/cli/instalar.php` | Instala o verifica las tablas y crea el primer administrador. |

Sin SSH: el botón **Verificar integridad** de la Bitácora hace la verificación de la cadena desde el navegador.

---

## 11. Actualizaciones y reversión

* **Actualizar:** `git push` a `main` → despliegue (manual o automático).
  * La base de datos y la carpeta privada no se tocan.
  * Si una versión futura cambia el esquema, traerá su script de migración y lo indicará en el README.
* **Revertir:** `git revert <commit>` y push. Hostinger publica el estado anterior del código.
* Antes de cualquier actualización mayor, ejecute un respaldo manual.

---

## 12. Lista de verificación final

- [ ] `https://su-dominio.com/backend/bootstrap.php` y `/database/schema.sql` responden **403**.
- [ ] `https://su-dominio.com/js/entorno.js` contiene `persistencia: 'api'`.
- [ ] `permitir_instalacion_web` en `false`.
- [ ] `verificar.php` (o el botón *Verificar integridad*) sin fallas.
- [ ] Cron de respaldo creado y el primer `.json.gz` presente en `si360-privado/respaldos/`.
- [ ] Política de tratamiento de datos publicada y autorizaciones de los titulares (ver `SEGURIDAD.md`).

---

Fuentes de Hostinger consultadas: documentación de *Cron jobs* (docs.hostinger.com/websites/cron-jobs), *How to Edit PHP Values via .htaccess* (hostinger.com/support/4622356) y las guías de despliegue Git de hPanel.

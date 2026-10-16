# Seguridad de SER INTEGRAL 360 (v1.0.0)

Qué protege la aplicación, cómo lo hace, qué queda fuera y qué obligaciones legales siguen a cargo de Ser Integral Consultora S.A.S.

## 1. Dos modos, dos niveles de seguridad

| | Prototipo local (`iniciar.bat`) | Servidor (Hostinger, PHP + MySQL) |
|---|---|---|
| Dónde están los datos | IndexedDB del navegador de un equipo | Base MySQL/MariaDB y carpeta privada del servidor |
| Quién hace cumplir permisos y reglas | El código del navegador: lo puede alterar quien controle el equipo | **El servidor**: el navegador solo muestra y propone |
| Bitácora | Encadenada con SHA-256; la manipulación se detecta, no se impide | Encadenada por el servidor, solo inserción; identidad, fecha e IP selladas por el servidor |
| Uso adecuado | Pruebas y trabajo individual en un equipo | Trabajo real multiusuario por Internet |

El modo lo decide el servidor web, no el usuario. En Hostinger, `.htaccess` sirve `api/entorno.php` en lugar de `js/entorno.js`, así que el navegador queda en modo servidor. Si la configuración no carga, la aplicación se detiene; nunca pasa en silencio al modo local.

## 2. Controles del servidor

### Autenticación y sesión
* **Contraseñas:** se guardan con Argon2id mediante `password_hash()` (bcrypt si el servidor no lo soporta). Política: mínimo 10 caracteres, con letras y números.
  * Las credenciales PBKDF2-SHA256 del prototipo (210 000 iteraciones) se aceptan al migrar y se convierten a Argon2id en el primer ingreso.
  * El hash vive en una columna propia: nunca está dentro del documento JSON, nunca se envía al navegador y nunca se escribe en la bitácora.
* **Fuerza bruta:**
  * Por cuenta: 5 intentos fallidos bloquean la cuenta 5 minutos.
  * Por IP: 20 intentos fallidos en 15 minutos devuelven HTTP 429.
  * El mensaje es genérico ("Correo o contraseña incorrectos"), y el tiempo de respuesta se iguala aunque el correo no exista.
* **Cookie de sesión `SI360SESS`:**
  * Lleva `HttpOnly` (JavaScript no la lee), `SameSite=Strict` y `Secure` en HTTPS.
  * El identificador se regenera al ingresar y al cambiar la contraseña.
  * Cierre por 30 minutos de inactividad y duración máxima de 12 horas.
* **Contraseña temporal:** mientras el usuario no la cambie, el servidor rechaza cualquier escritura.
* **Instalación web:** solo funciona si no existe ningún usuario y `permitir_instalacion_web` está activo. Debe desactivarse después de instalar.

### Solicitudes
* **Token CSRF:** se exige en toda escritura (cabecera `X-CSRF-Token`), además de verificar que el `Origin` coincida con el sitio.
* **Base de datos:** solo consultas preparadas con PDO. Los nombres de tabla y columna salen de una lista cerrada (`Almacenes.php`).
* **Límites de tamaño:** 16 MB por solicitud; el respaldo a importar es configurable. Un lote admite hasta 5 000 operaciones y se ejecuta en una transacción: se aplica completo o no se aplica.
* **Cabeceras de seguridad:** CSP estricta (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'self'`), HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. Las respuestas de la API no se guardan en caché.
* **Errores:** el detalle técnico va al registro privado del servidor; el usuario ve un mensaje sin rutas ni consultas.

### Autorización: mínimo privilegio
* La matriz de permisos por rol (`Contexto.php`) es la misma de `js/domain/permisos.js`, pero aquí es la barrera real.
* **Alcance por empresa** en cada lectura y escritura:
  * El asesor solo ve las empresas que tiene asignadas.
  * El cliente solo ve su empresa y, de ella, únicamente lo aprobado: diagnósticos, planes, actividades e informes aprobados. No ve la bitácora.
  * Un registro fuera de alcance responde "no existe", sin revelar que existe.
* **Proyección de usuarios:** los no administradores ven solo nombre, correo, rol y estado de los demás.

### Reglas de negocio que el servidor hace cumplir (`Reglas.php`)
* **Diagnósticos:**
  * Solo el revisor (administrador) aprueba, devuelve o cierra.
  * Aprobar congela los resultados y el servidor sella quién aprobó y cuándo.
  * Un diagnóstico aprobado o cerrado y sus respuestas no se modifican.
* **Exclusiones "No aplica":** solo las valida el revisor.
* **Actividades:**
  * No se marcan ejecutadas sin horas registradas.
  * No se verifican sin evidencia; la verificación la hace el administrador.
  * Las verificadas o canceladas son inmutables.
* **Horas:**
  * Entre 0,25 y 12 por registro, sin fechas futuras.
  * El autor lo sella el servidor.
  * No se editan: solo se anulan, con motivo.
* **Catálogo normativo:**
  * Una versión publicada no cambia; se crea un borrador de nueva versión.
  * Una versión reemplazada es inmutable.
* **Empresas:** NIT con dígito de verificación DIAN, NIT vigente único y control de versión. Si dos personas editan a la vez, la segunda recibe un aviso en vez de sobrescribir.
* **Usuarios:** nadie cambia su propio rol ni se suspende a sí mismo, y siempre debe quedar al menos un administrador activo.
* **Eliminación física:** prohibida. Se usa eliminación lógica. Excepciones:
  * Borradores propios.
  * Catálogos en borrador.
  * Datos de demostración.
* **Consecutivos** (empresas, diagnósticos, informes, actividades): los asigna el servidor de forma atómica, con bloqueo de fila.

### Archivos adjuntos
* Se guardan en `si360-privado/archivos/`, fuera de la carpeta pública, con nombre derivado de un hash.
* Solo se descargan a través de la API, después de verificar permisos.
* Límite de 5 MB. Tipos permitidos: PDF, JPG, PNG, DOCX y XLSX. El servidor comprueba el tipo **real** del contenido (`finfo`), no solo la extensión.
* Se guarda la huella SHA-256; si el archivo en disco no coincide al descargarlo, la descarga se rechaza.
* Los adjuntos no se modifican: solo se retiran con eliminación lógica.

### Bitácora y trazabilidad
* Tabla de solo inserción: la API no ofrece modificar ni borrar entradas.
* **Cadena de huellas:** `huella_n = SHA-256(huella_{n-1} | JSON canónico de la entrada)`, con un número de secuencia único.
* **Verificar integridad** (Bitácora o `verificar.php`) detecta entradas modificadas, eliminadas o insertadas fuera de la cadena, incluso cuando la alteración se hace directamente en MySQL (probado).
* El servidor registra ingresos, intentos fallidos, salidas, cambios y restablecimientos de contraseña, instalaciones, importaciones, respaldos automáticos y verificaciones.

### Respaldos
* Respaldo diario por cron, comprimido, verificado al escribirlo y con rotación (ver `DESPLIEGUE_HOSTINGER.md` §9).
* Formato SI360-RESPALDO con huella SHA-256: un respaldo del servidor se valida en el navegador y viceversa.
* **Restaurar:**
  * Valida todo antes de tocar los datos y reemplaza en una sola transacción.
  * Desde el navegador solo se permite en una instalación nueva.
  * En un servidor en uso solo por línea de comandos, con `--confirmar` y respaldo previo automático.

## 3. Qué NO cubre esta versión

1. **Doble factor (2FA)** y **recuperación de contraseña por correo**: no implementados. Un administrador asigna una contraseña temporal.
2. **Análisis antivirus** de adjuntos: no se realiza. Se valida el tipo y el tamaño. Abra los adjuntos con software actualizado.
3. **Cifrado de los datos en reposo**: depende de la infraestructura de Hostinger. La aplicación no cifra columnas.
4. **Firma digital** de informes: no. Los PDF muestran quién aprobó y cuándo, según la bitácora, y su huella SHA-256 se puede verificar.
5. **Inmutabilidad absoluta de la bitácora:** un usuario de MySQL con privilegios puede alterarla. La cadena hace la alteración **evidente**, no imposible. Para mayor garantía, lleve las huellas del respaldo diario a un lugar externo.
6. **Protección ante caída del proveedor:** depende de las copias externas (§9 del despliegue).
7. **Estilos en línea en la CSP** (`style-src 'unsafe-inline'`): necesarios para los gráficos y algunos componentes. Los scripts sí están restringidos a `'self'`.
8. **WAF o protección DDoS:** propios de Hostinger, no de la aplicación.

## 4. Datos personales: obligaciones que siguen a cargo de la empresa

La aplicación trata datos personales de usuarios y de contactos de las empresas cliente, y puede contener información de trabajadores en evidencias y documentos. La herramienta ayuda, pero el cumplimiento es de Ser Integral Consultora S.A.S. como responsable o encargada del tratamiento.

* **Ley 1581 de 2012:**
  * Art. 4, literal g (principio de seguridad).
  * Art. 9 (autorización del titular).
  * Art. 17 (deberes del responsable). El literal n incluye informar a la autoridad de protección de datos, la Superintendencia de Industria y Comercio (SIC), cuando se presenten violaciones a los códigos de seguridad que pongan en riesgo la información.
* **Decreto 1074 de 2015** (compila el Decreto 1377 de 2013): política de tratamiento de la información y aviso de privacidad.
* **Registro Nacional de Bases de Datos (RNBD):** el Decreto 090 de 2018 limita la obligación de inscribir las bases a las sociedades y entidades sin ánimo de lucro con activos totales superiores a 100 000 UVT, y a las personas jurídicas de naturaleza pública. Verifique si Ser Integral Consultora S.A.S. supera ese umbral.
* **Contratos con las empresas cliente:** defina en ellos el rol (responsable o encargado), la finalidad, la conservación y la devolución o supresión de la información al terminar el servicio.

### Procedimiento sugerido ante un incidente
1. Contener: cambiar las contraseñas afectadas, suspender usuarios y rotar la clave de la base en `config.php`.
2. Preservar evidencia: respaldo inmediato, `verificar.php` y copia del registro de errores.
3. Evaluar el alcance con la bitácora.
4. Si hay riesgo para los titulares, informar a la SIC conforme al art. 17, literal n, de la Ley 1581 y comunicar a los afectados.
5. Documentar la lección aprendida.

## 5. Evidencia de pruebas de seguridad

Ver `PRUEBAS.md`, secciones de las Fases 7 y 8.
* `tests/api.integracion.mjs`: 27 pruebas contra PHP y MariaDB 10.11, configuradas además para correr en GitHub Actions sobre MySQL 8 con cada push.
* Suite de navegador en modo servidor: migración, cookies HttpOnly, CSP sin omitir y manipulación directa en MySQL.

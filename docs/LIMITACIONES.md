# Límites de SER INTEGRAL 360 v1.0.0

Lea esto antes de registrar información real de clientes. La versión tiene dos modos: **prototipo local** (secciones siguientes) y **servidor** en Hostinger (sección "Modo servidor", al final). Para trabajo real con clientes use el modo servidor.

## Qué SÍ hace
* Guarda empresas, usuarios, documentos y bitácora en IndexedDB del navegador, con estado de guardado visible y borradores automáticos.
* Protege contraseñas con PBKDF2 y aplica permisos y alcance por empresa en los servicios.
* Exporta respaldos completos verificables (SHA-256) y los restaura solo si superan todas las validaciones, en una única transacción.
* Registra en la bitácora creaciones, modificaciones, asignaciones, archivos, eliminaciones lógicas, restauraciones, ingresos, exportaciones e importaciones.

## Qué NO garantiza
1. **Conservación permanente.** Los datos viven en un navegador de un computador. Se pierden si se borran los datos de navegación, se formatea el equipo, se usa otro navegador o perfil, o el navegador libera espacio. **El respaldo exportado es su copia de seguridad**: descárguelo al menos una vez por semana y guárdelo fuera del equipo.
2. **Seguridad multiusuario.** Quien tenga acceso al computador y conocimientos técnicos puede leer, modificar o borrar la base local, incluida la bitácora. Las cuentas sirven para separar el trabajo en un equipo compartido, no para publicar en Internet.
3. **Trabajo simultáneo.** Cada navegador tiene su propia base. Dos asesores en dos equipos no ven los datos del otro. Para eso está el modo servidor.
4. **Vista publicada (artefacto).** La versión que se abre desde el enlace de Claude es para revisar el diseño y el flujo. Cada persona que la abre tiene su propia base vacía, y el visor puede bloquear las descargas (respaldos, CSV, documentos). Para uso real, ejecútela en su equipo con `iniciar.bat`.
5. **Orientación normativa.** Las indicaciones de aplicabilidad (Estándares Mínimos, COPASST/Vigía) son preliminares; ver el estado de cada cita en `REFERENCIAS_NORMATIVAS.md`. No constituyen concepto jurídico.

## Módulos no implementados en esta versión
Doble factor de autenticación, recuperación de contraseña por correo, notificaciones por correo, análisis antivirus de adjuntos y firma digital de informes (ver `SEGURIDAD.md` §3).

## Límites de los módulos implementados
* **Catálogo normativo.** 34 de 139 requisitos están "pendientes de validación normativa". El catálogo no se actualiza solo: la vigencia depende de la revisión periódica del administrador.
* **Calificación Res. 0312.** La regla de "No aplica" validado (recibe el valor del ítem) y los valores de la tabla del art. 27 se cotejaron con una fuente secundaria. Falta el cotejo literal con el texto oficial.
* **Revisiones.** Las evidencias quedan ligadas al diagnóstico donde se cargaron; una nueva revisión no las copia.
* **Programación.** Usa bloques de semana fijos dentro de cada mes (días 1–7, 8–14, 15–21 y 22 a fin de mes). No considera festivos ni la disponibilidad individual de cada asesor; usa una capacidad semanal del equipo por empresa.
* **Datos de demostración.** Incluyen un diagnóstico con respuestas ficticias que no deben usarse en informes.

## Modo servidor (Hostinger, PHP + MySQL)

**Qué resuelve:** datos centralizados, trabajo multiusuario, permisos y reglas aplicados por el servidor, sesiones seguras, adjuntos en carpeta privada, bitácora de solo inserción y respaldos automáticos. Detalle en `SEGURIDAD.md`.

**Qué sigue dependiendo de la empresa:**
1. **Configuración correcta:** `config.php` fuera de `public_html`, instalación web desactivada, SSL activo y cron de respaldo. Use la lista de `DESPLIEGUE_HOSTINGER.md` §12.
2. **Copias externas:** el respaldo diario queda en el mismo servidor. Sin la copia externa semanal, la pérdida de la cuenta implica pérdida de datos.
3. **Obligaciones de datos personales** (Ley 1581 de 2012): política de tratamiento publicada, autorizaciones de los titulares, contratos con los clientes y, si aplica, el Registro Nacional de Bases de Datos.

**Límites técnicos:**
* **Cálculos:** se ejecutan en el navegador (calificación, priorización, PDF). El servidor no recalcula los resultados de un diagnóstico; valida transiciones, permisos e inmutabilidad y exige que la aprobación congele resultados.
  * Un administrador malintencionado con acceso a las herramientas del navegador podría aprobar resultados alterados. El hecho queda en la bitácora con su identidad.
* **Restauración desde el navegador:** solo en una instalación nueva. En un servidor en uso se hace por línea de comandos (SSH).
* **Respaldos grandes:** el respaldo es un único archivo JSON con los adjuntos en Base64. Con muchos adjuntos (cientos de MB) puede superar los límites de PHP del plan; en ese caso use `respaldar.php` por cron o SSH, que no pasa por el navegador.
* **Pruebas en Hostinger:** la aplicación se probó con PHP 8.3 y MariaDB 10.11 en un entorno de pruebas, no todavía en el hosting real. Haga la verificación del primer despliegue.
* **Respaldos del servidor en el prototipo:** no sirven para volver al prototipo local, porque las contraseñas quedan en formato Argon2id.

## Informes PDF (Fase 6)
* **Generación.** Los PDF se generan en el navegador (jsPDF 2.5.1). Usan las fuentes estándar del PDF (Helvetica): los caracteres fuera de Latin-1 se convierten a equivalentes (por ejemplo "≥" se escribe ">=").
* **Almacenamiento.** El sistema registra el código, los parámetros, la versión, el autor, la fecha, el número de páginas y la huella SHA-256 de cada informe, pero **no guarda el archivo**. "Regenerar" crea una versión nueva con los datos actuales. Para diagnósticos aprobados el contenido no cambia (resultados congelados); para planes refleja el avance a la fecha.
* **Marcas de agua.** Los informes de diagnósticos o planes no aprobados salen con la marca "BORRADOR - NO APROBADO" o "PLAN NO APROBADO". Los de empresas de demostración salen con "DEMOSTRACIÓN - NO VÁLIDO".
* **Firmas.** Los informes no incluyen firmas manuscritas ni certificados de firma digital: muestran quién aprobó y cuándo, según el registro de auditoría.
* **Verificación.** "Verificar un PDF" solo reconoce informes generados en la misma instalación (la misma base de datos).
* **Consecutivos.** El número del informe se asigna antes de construir el PDF. Si la generación falla, ese número queda sin usar.
* **Vista previa y descarga.** En el visor de Claude pueden estar bloqueadas; en el equipo local funcionan.

# Manual del administrador — SER INTEGRAL 360 v1.0.0

Funciones exclusivas del rol **administrador**: personas y accesos, catálogo normativo, revisión y aprobación, respaldos, bitácora y operación del servidor.

## 1. Usuarios y roles

| Rol | Puede | No puede |
|---|---|---|
| Administrador | Todo: usuarios, empresas, catálogo, aprobar diagnósticos y validar "No aplica", verificar actividades, respaldos y bitácora completa | Cambiar su propio rol ni suspenderse; dejar el sistema sin administrador activo |
| Asesor | Diligenciar diagnósticos de **sus** empresas asignadas, adjuntar evidencias, generar y aprobar planes, registrar horas, generar informes, ver su propia bitácora | Ver empresas no asignadas, aprobar diagnósticos, validar "No aplica", verificar actividades, editar empresas |
| Cliente | Consultar su empresa: diagnósticos, planes e informes **aprobados** | Ver borradores, horas internas no aprobadas o la bitácora; modificar información |

**Crear usuario:** Usuarios y roles → *Crear usuario*.
* La contraseña que asigne es **temporal**. En el primer ingreso el sistema obliga a cambiarla y, mientras tanto, no permite ninguna otra operación.
* El usuario cliente debe vincularse a una empresa.

**Restablecer contraseña:** en la fila del usuario → *Restablecer contraseña*.
* Asigna una clave temporal, desbloquea la cuenta y queda en la bitácora.
* Entréguela por un canal distinto al correo, por ejemplo por teléfono.

**Cuenta bloqueada:**
* Tras 5 intentos fallidos la cuenta se bloquea 5 minutos.
* Si hay más de 20 intentos fallidos desde una misma conexión en 15 minutos, el servidor la frena.
* Para desbloquear antes, restablezca la contraseña.

**Retiro de personal:** suspenda el usuario el mismo día; no lo elimine. La suspensión cierra su acceso y conserva la trazabilidad de lo que hizo.

**Mi cuenta:** cada persona ve allí sus datos, su último ingreso, el cambio de contraseña y el cierre de sesión.

## 2. Empresas y asignación
* Solo el administrador crea, edita, asigna asesor, archiva o elimina (lógicamente) empresas.
* El NIT se valida con el dígito de verificación de la DIAN y no puede repetirse entre empresas vigentes.
* Si otra persona modificó la empresa mientras usted la editaba, el servidor rechaza su cambio para no sobrescribirlo: recargue y repita.

## 3. Revisión y aprobación
Ver `MANUAL_USUARIO.md` §3. En el servidor estas reglas se aplican aunque alguien manipule el navegador:
* Un diagnóstico aprobado queda congelado. Para corregirlo se crea una **nueva revisión**.
* Solo usted verifica actividades ejecutadas, y solo si tienen evidencia adjunta.

## 4. Catálogo normativo
* **Versiones:**
  * Una versión publicada no se edita: cree un borrador de nueva versión, compárelo y publíquelo.
  * Los diagnósticos anteriores conservan la versión con la que se hicieron.
* **Revisión periódica:** revise al menos cada trimestre los requisitos "pendientes de validación normativa" y las normas nuevas o modificadas (ver `REFERENCIAS_NORMATIVAS.md`).
* **Parámetros de calificación:** puntaje de "Parcial" y rangos visuales. Los cambios aplican a diagnósticos no aprobados.

## 5. Respaldos
* **Servidor:**
  * El respaldo diario es automático (cron); se configura una sola vez según `DESPLIEGUE_HOSTINGER.md` §9.
  * **Semanalmente**, descargue el respaldo (*Respaldo y datos → Descargar respaldo*) y guárdelo fuera del servidor, cifrado.
  * **Trimestralmente**, haga una prueba de restauración en una base de prueba y deje acta.
* **Restauración en el servidor:** desde el navegador solo en una instalación nueva (migración desde el prototipo). En un servidor en uso, por línea de comandos: `restaurar.php ... --confirmar`, que primero respalda el estado actual.
* El respaldo contiene **datos personales y hashes de contraseñas**. Trátelo como información confidencial (Ley 1581 de 2012).

## 6. Bitácora
* Registra quién, cuándo, desde qué IP (en el servidor), qué acción, sobre qué registro, los valores antes y después, el motivo y el resultado.
* **Verificar integridad:** recalcula la cadena de huellas SHA-256.
  * Si aparece "problemas de integridad", alguien modificó o eliminó entradas por fuera de la aplicación.
  * Trátelo como incidente de seguridad (`SEGURIDAD.md` §4).
* Exporte el CSV para auditorías internas o de clientes.

## 7. Datos de demostración
*Respaldo y datos → Cargar datos de demostración* crea 4 empresas ficticias, marcadas **[DEMO]**, y un diagnóstico de ejemplo.
* Sus informes salen con la marca "DEMOSTRACIÓN - NO VÁLIDO".
* Retírelas antes de operar con clientes reales: son los únicos registros que se borran físicamente.

## 8. Rutina recomendada

| Frecuencia | Tarea |
|---|---|
| Diaria | Automático: respaldo. Revise que el cron no reporte errores (`si360-privado/registro/cron.log`). |
| Semanal | Copia externa del respaldo. Revise los usuarios con clave temporal pendiente o bloqueados. |
| Mensual | Verificar integridad de la bitácora. Revise los usuarios activos frente al personal vigente. |
| Trimestral | Prueba de restauración. Revisión del catálogo normativo y de `REFERENCIAS_NORMATIVAS.md`. |
| Con cada versión | Respaldo manual antes de desplegar; `verificar.php` después. |

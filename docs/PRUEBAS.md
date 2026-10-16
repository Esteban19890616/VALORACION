# Matriz de pruebas

Resultados por fase. La ejecución más reciente (v1.0.0, Fases 7 y 8) está al final.

# Fases 1–2

Ejecución: 15-oct-2026. Entorno: Chromium (Playwright) + servidor estático local; Node 22 para pruebas unitarias.
Datos de prueba: cuentas creadas durante la prueba en una base vacía y empresas DEMO ficticias (NIT 999.000.101 a 999.000.104).

## A. Pruebas unitarias — `npm test` (ejecutadas: 32/32 superadas)

| Grupo | Casos | Resultado |
|---|---|---|
| NIT y DV | DV de 890903938 = 8, 800197268 = 4, 899999068 = 1; formato con puntos y guion; DV errado; letras; vacío | Superadas |
| Validadores | Correo válido/inválido; CIIU de 4 dígitos | Superadas |
| Res. 0312/2019 | 5 y 10 trab. riesgo I–III → art. 3; 11 y 50 → art. 9; 51 → art. 16; 3 trab. riesgo IV → art. 16; agropecuaria ≤10 riesgo I → art. 7, riesgo V → art. 16; sin clase de riesgo → "sin datos suficientes" | Superadas |
| Participación SST | 9 trab. → Vigía; 10 → COPASST; coherencia de sedes | Superadas |
| Permisos | Asesor no administra empresas ni usuarios; asesor ve solo su empresa; cliente solo la suya; empresa eliminada oculta al asesor; usuario suspendido sin permisos | Superadas |

## B. Pruebas de navegador (ejecutadas: 23/24 superadas)

| # | Prueba | Resultado esperado | Resultado |
|---|---|---|---|
| 1 | Primer arranque | Pide crear administrador | Superada |
| 2 | Contraseña débil | Rechazo con mensaje de política | Superada |
| 3 | Ingreso | Muestra el tablero | Superada |
| 4 | Almacenamiento de contraseña | Hash PBKDF2, nunca texto plano | Superada |
| 5 | Datos DEMO | Banda de advertencia en el tablero | Superada |
| 6 | NIT con DV errado | Mensaje en vivo | Superada |
| 7 | Orientación 0312 | 25 trab. riesgo II → 21 estándares | Superada |
| 8 | Crear empresa | Código EMP-0005 | Superada |
| 9 | NIT duplicado (otro formato) | Bloqueo y enlace al expediente existente | Superada |
| 10 | Crear asesor | Aparece en la lista | Superada |
| 11 | Cambio de NIT sin motivo | Campo motivo marcado como obligatorio | Superada |
| 12 | Asignar asesor | Historial muestra "Asignación" | Superada |
| 13 | Archivar sin motivo | Rechazado | Superada |
| 14 | Archivar con motivo | Expediente en solo lectura | Superada |
| 15 | Restaurar | Vuelve a "Activa" | Superada |
| 16 | Exportar respaldo | JSON con formato, conteos y SHA-256 | Superada |
| 17 | Importar respaldo alterado | Rechazado; datos intactos | Superada |
| 18 | Importar respaldo íntegro | Validado y listo para restaurar | Superada |
| 19 | Bitácora | Registra creación, archivo y exportación | Superada |
| 20 | Pantalla de 390 px | Sin desplazamiento horizontal | Superada (tras corregir un desborde en la tabla) |
| 21 | Credenciales erróneas | Mensaje genérico | Superada |
| 22 | Aislamiento del asesor | Solo ve su empresa asignada | Superada |
| 23 | Asesor en Usuarios | Redirigido al tablero | Superada |
| 24 | Consola sin errores | 0 errores | **No superada en el entorno de prueba**: los 2 errores son la descarga bloqueada de Google Fonts por la red del entorno. La aplicación usa fuentes del sistema como respaldo. Verificar en su equipo. |

## C. Documentadas, no ejecutadas
* Restauración completa (botón "Restaurar este respaldo") de punta a punta: la validación sí se ejecutó; el reemplazo transaccional debe probarse manualmente.
* Adjuntar, ver y retirar documentos.
* Bloqueo tras 5 intentos fallidos y cierre por 30 minutos de inactividad.
* Ejecución de `database/schema.sql` en MySQL/MariaDB de Hostinger.
* `iniciar.bat` en Windows.
* Pruebas de diagnósticos, planes y horas: ver la sección "Fases 3 a 5". Generación de PDF: Fase 6.


# Fases 3 a 5 — ejecución 15-oct-2026

## A. Pruebas unitarias (`npm test`): 88 de 88 superadas
* `tests/run-tests.mjs` (32): NIT/DV, Res. 0312 por grupos, permisos.
* `tests/motor.test.mjs` (31):
  * Cálculo ponderado; pendientes; "No aplica" validado y no validado; sin datos.
  * Alertas críticas por encima del promedio; calificación 0312 (parciales, "No aplica", rangos).
  * Aplicabilidad tri-estado; integridad del catálogo (60 ítems suman 100, códigos únicos, normas citadas).
* `tests/planes.test.mjs` (25):
  * Ejemplo de 40 h (16/10/6/8); suma exacta de 100 %; asistente con piso para intervenciones inmediatas.
  * Programación por bolsa y por semana; no programa en el pasado.
  * Consolidación anual sin duplicar horas.

## B. Navegador (Chromium): 34 de 34 superadas
* **Catálogo:**
  * Se instalan 139 requisitos; la ficha muestra fuente y estado de verificación.
  * El borrador rechaza una obligación legal sin norma; la comparación detecta 1 modificado y 1 nuevo; se publica la versión 2026.11.
* **Diagnóstico:**
  * Lista de chequeo con autoguardado; nivel de riesgo para las brechas.
  * Resultados con cobertura y calificación 0312; resultado marcado como incompleto.
* **Flujo de aprobación:**
  * Bloquea el envío con críticos pendientes y la aprobación con "No aplica" sin validar.
  * Aprueba; el análisis de impacto detecta la versión nueva; se registran los hallazgos.
* **Plan:**
  * El asistente explica la propuesta; detecta sumas distintas de 100 % y bloquea la aprobación.
  * Genera, reprograma y aprueba el plan.
  * Registra horas; bloquea la verificación sin evidencia y verifica con evidencia, lo que cierra el hallazgo.
  * Vistas anual y semanal; horas anuales iguales a la suma de registros.
* **Tablero:** promedios simple y ponderado.
* **Pantallas de 390 px:** diagnóstico, plan y catálogo sin desborde.
* **Consola:** sin errores (excluida la carga de Google Fonts, que el entorno de prueba bloquea).

## C. Documentadas, no ejecutadas
* Rol cliente consultando diagnósticos y planes aprobados (cubierto por las pruebas unitarias de permisos).
* Restauración de un respaldo con diagnósticos y evidencias.
* Migración de la base local de la versión 1 a la 2 con datos existentes: en la prueba, la base se creó directamente en la versión 2.


# Fase 6 — ejecución 15-oct-2026

## A. Unitarias: `tests/pdf.test.mjs` (5 de 5)
Conversión de texto a Latin-1: conserva tildes, eñe y signos de apertura; convierte rayas, comillas y símbolos.

## B. Navegador (Chromium): 22 de 22 superadas
* **Escenario:**
  * Diagnóstico aprobado y su revisión aprobada.
  * Plan configurado (40 h/mes), generado y aprobado, con horas registradas.
* **Informes generados con datos reales** (páginas y tamaño):

| Informe | Páginas | Tamaño |
|---|---|---|
| Diagnóstico integral | 14 | 147 KB |
| SST | 10 | 290 KB |
| Jurídico | 7 | 176 KB |
| Calidad | 7 | 221 KB |
| Ambiental | 7 | 174 KB |
| Plan mensual | 3 | 61 KB |
| Plan anual | 5 | 79 KB |
| Seguimiento de horas | 2 | 13 KB |
| Avance | 4 | 50 KB |
| Comparativo | 4 | 76 KB |

* **Trazabilidad:**
  * Cada informe tiene código, huella SHA-256 y registro.
  * Regenerar crea la versión 2 con referencia al original.
* **Interfaz:**
  * El registro lista los 11 informes.
  * Generación desde el formulario con vista previa y descarga.
  * Verificación: el PDF descargado coincide con el registro y un PDF alterado se rechaza.
  * Botones de PDF en el diagnóstico y en el plan.
* **Panel de indicadores:** evolución y comparación por empresa.
* **Pantalla de 390 px:** sin desborde.
* **Consola:** sin errores.

## C. Revisión visual
Se rasterizaron los PDF (pdftoppm) y se revisaron:
* Portada.
* Encabezados y pies con "Página X de Y".
* Código de documento.
* Gráficos.
* Tablas que continúan entre páginas.
* Marca de agua de demostración.


# Fases 7 y 8 — ejecución 16-oct-2026

Entorno: Chromium (Playwright), Node 22, PHP 8.3.6, MariaDB 10.11.

## A. Unitarias (`npm test`): 100 de 100 superadas
32 + 31 + 25 + 5 + **7 de seguridad** (`tests/seguridad.test.mjs`): cadena SHA-256 de la bitácora; detección de entradas modificadas, eliminadas y reordenadas; JSON canónico.

## B. Integración de la API (`tests/api.sh` → `tests/api.integracion.mjs`): 27 de 27 superadas
Contra PHP + MariaDB, sobre una base vacía.
* **Instalación:** una sola vez.
* **Sesión y solicitudes:**
  * Rechazo sin sesión (401), sin token CSRF y desde otro origen (403).
  * Cierre de sesión que invalida la cookie.
  * Bloqueo por intentos fallidos (423).
* **Usuarios:**
  * Usuarios creados con credencial PBKDF2, sin exponer hashes; correo único.
  * El administrador no se suspende a sí mismo.
  * La clave temporal bloquea escrituras hasta cambiarla.
* **Datos protegidos del servidor:** la cabecera de la bitácora y los consecutivos no se pueden escribir; consecutivo atómico.
* **Empresas:** DV, NIT único y control de versión.
* **Alcance:**
  * El asesor ve solo sus empresas; el registro ajeno responde 404.
  * El cliente no ve diagnósticos sin aprobar.
* **Catálogo:** una versión publicada no se modifica.
* **Diagnóstico:**
  * El asesor no aprueba ni valida "No aplica".
  * La aprobación congela respuestas y diagnóstico y sella al aprobador.
* **Seguimiento:**
  * Horas con autor sellado, solo inserción y anulación.
  * Actividad ejecutada exige horas; verificada exige evidencia y queda inmutable.
* **Evidencias:** tipo real del archivo (un texto con extensión PDF se rechaza: 415), huella, descarga idéntica e inmutabilidad.
* **Eliminación física:** prohibida.
* **Lote:** atómico.
* **Bitácora:**
  * Sellada por el servidor e imposible de sobrescribir.
  * Su verificación detecta una **modificación hecha directamente en MySQL**.
* **Respaldo del servidor:**
  * Su huella coincide con la del navegador e incluye los adjuntos.
  * Importarlo sobre datos existentes se rechaza.

Las mismas pruebas están configuradas en `.github/workflows/ci.yml` sobre **MySQL 8.0**. Se ejecutarán con el primer push a GitHub; en este entorno se probaron solo sobre MariaDB, con una simulación local del flujo de integración continua y la configuración fuera del proyecto: 27 de 27.

## C. Navegador en modo servidor (la misma interfaz contra PHP + MariaDB)

| Suite | Resultado |
|---|---|
| Flujo base: instalación, empresas, NIT, usuarios, archivo y restauración de empresas, respaldo, bitácora, clave temporal, alcance del asesor | 24 de 25 funcionales superadas; la restante es la verificación de "consola sin errores", que registra los 401 provocados a propósito por la prueba de contraseña incorrecta |
| Diagnóstico completo, revisión, aprobación, priorización, plan, horas y cierre con evidencia | 34 de 34 |
| Informes PDF (10 tipos), registro, regeneración, verificación e indicadores | 22 de 22 |
| **Migración y seguridad** (CSP real, sin omitirla) | 21 de 21 |

Detalle de la suite de migración y seguridad:
* **Modo y sesión:**
  * El navegador recibe el modo servidor.
  * Cookie `HttpOnly` + `SameSite=Strict`.
  * Ningún dato en IndexedDB.
  * El catálogo base se instala en MySQL.
* **Migración:**
  * Respaldo del prototipo importado en 0,3 s.
  * Usuarios del respaldo; contraseña PBKDF2 aceptada y convertida a Argon2id en el primer ingreso.
  * 120 de 120 respuestas, con empresa derivada.
  * 128 entradas de bitácora importadas y re-encadenadas, con la cadena íntegra.
* **Protecciones:**
  * La segunda importación sobre datos se rechaza y remite a `restaurar.php`.
  * El respaldo del servidor se valida en el navegador.
  * Una manipulación en MySQL se detecta.
  * Tras salir, la API responde 401.

## D. Regresión del prototipo local
Tras los cambios de estas fases, las cuatro suites del modo local se volvieron a ejecutar: 25 de 25, 34 de 34, 22 de 22 y 17 de 17 (seguridad local).

## E. Documentadas, no ejecutadas
* **En un hosting real de Hostinger:** despliegue, `.htaccess` (LiteSpeed), cron y límites de PHP. Ejecutar la lista de verificación de `DESPLIEGUE_HOSTINGER.md` §12 tras el primer despliegue.
* **Cierre por inactividad de 30 minutos y máximo de 12 horas en el servidor:** lógica revisada; no se esperó el tiempo real.
* **Pruebas de carga y de concurrencia** con varios usuarios simultáneos editando la misma empresa: el control de versión está probado con solicitudes secuenciales.

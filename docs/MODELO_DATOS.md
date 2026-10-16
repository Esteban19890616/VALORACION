# Modelo de datos

Los almacenes de IndexedDB (`js/core/config.js → STORES`) y las tablas MySQL (`database/schema.sql`) tienen los mismos nombres. Los campos de los documentos van en camelCase; las columnas MySQL, en snake_case.

## Esquema del servidor (v1, tablas híbridas)

Cada almacén es una tabla con:
* **Clave primaria:** `id`, o `clave` en `borradores` y `meta`.
* **`datos`:** el documento JSON completo, validado con `CHECK (JSON_VALID(datos))`.
* **Columnas indexadas:** las mismas de los índices del prototipo, más `empresa_id` para el alcance.
* **`creado_en` y `actualizado_en`.**

El esquema se genera desde `backend/src/Esquema.php` con `php tools/generar-esquema.php`. La integración continua comprueba que `schema.sql` esté al día.

| Tabla | Columnas adicionales y restricciones |
|---|---|
| `usuarios` | `email` **único**. Columnas de autenticación fuera del JSON: `credencial` (Argon2id o heredada `pbkdf2_sha256$…`), `intentos`, `bloqueado_hasta`, `ultimo_ingreso`, `debe_cambiar`. |
| `empresas` | `nit_vigente` **único** (NULL si la empresa está eliminada) y `codigo` **único**. |
| `auditoria` | `secuencia` **única** y `huella` (SHA-256) de la cadena. El servidor sella `fecha`, `usuarioId`, `usuarioNombre`, `usuarioRol` e `ip`; la fecha enviada por el navegador se conserva como `fechaCliente`. |
| `respuestas` | `empresa_id` derivado del diagnóstico por el servidor. |
| `documentos`, `evidencias` | `datos.archivo = {ref, mime, tamano, sha256}`. El binario está en `si360-privado/archivos/`, no en la base. |
| `intentos_ip` | Intentos de ingreso fallidos por IP (limitación de fuerza bruta). |
| `esquema_version` | Versión instalada del esquema. |

Vistas de solo lectura para reportes (Excel, Power BI): `v_empresas`, `v_diagnosticos`, `v_actividades`, `v_horas` y `v_auditoria`.

## Entidades activas en esta versión

### usuarios
`id` (UUID) · `nombre` · `email` (único) · `rol` (administrador | asesor | cliente) · `estado` (activo | suspendido) · `cargo` · `telefono` · `empresaId` (solo cliente) · `disponibilidadSemanal` · `credencial` {algoritmo, iteraciones, sal, hash} · `debeCambiarContrasena` · `intentosFallidos` · `bloqueadoHasta` · `ultimoIngreso` · `creadoEn/Por` · `actualizadoEn/Por` · `version`.

### empresas
`id` · `codigo` (EMP-0001, único, consecutivo) · `razonSocial` · `nombreComercial` · `nit` (base) · `dv` · `nitFormato` · `tipoPersona` · `actividadEconomica` · `ciiu` · `sector` · `representanteLegal` · `trabajadores` · `contratistas` · `claseRiesgo` (I–V) · `arl` · `agropecuaria` · `departamento` · `municipio` · `direccion` · `contactoNombre` · `contactoCargo` · `email` · `telefono` · `sedes[]` {id, nombre, municipio, direccion, trabajadores} · `infoLegal` · `fechaVinculacion` · `estado` · `estadoAnterior` · `asesorId` · `horasContratadasMes` · `observaciones` · `demo` · `eliminadaEn/Por` · `archivadaEn` · auditoría de versión.

Reglas: NIT único entre empresas no eliminadas · DV calculado y verificado · cambio de NIT exige motivo · eliminación siempre lógica · restaurar no puede crear un NIT duplicado.

Estados: `prospecto` → `activa` ⇄ `suspendida` → `finalizada`; cualquiera → `archivada` (solo lectura) o `eliminada` (lógica, oculta a asesores y clientes); ambas → restaurar.

### documentos
`id` · `empresaId` · `nombre` · `mime` · `tamano` · `tipoDocumental` · `fechaDocumento` · `descripcion` · `archivo` (Blob) · `eliminado` · `creadoEn/Por`. Límite 5 MB; PDF, JPG, PNG, DOCX, XLSX.

### auditoria
`id` · `fecha` · `usuarioId` · `usuarioNombre` · `usuarioRol` · `accion` · `entidad` · `entidadId` · `antes` · `despues` · `cambios[]` {campo, antes, despues} · `motivo` · `resultado`. Nunca incluye credenciales ni binarios.

### borradores · meta
Borradores de formularios por usuario (no se exportan) y consecutivos internos.

## Relaciones principales

```
usuarios 1─┬─< empresas (asesorId)
           └─< usuarios cliente (empresaId) >─1 empresas
empresas 1─< documentos | diagnosticos | evidencias | hallazgos | planes | actividades | horas
catalogos 1─< requisitos ;  diagnosticos >─1 catalogos (versión congelada)
diagnosticos 1─< respuestas >─1 requisitos ;  respuestas 1─< evidencias ;  hallazgos >─ respuestas
planes 1─< actividades 1─< horas
```

## Formato de respaldo (`SI360-RESPALDO`, versión 1)

```json
{
  "formato": "SI360-RESPALDO",
  "versionFormato": 1,
  "app": "SER INTEGRAL 360", "versionApp": "1.0.0", "origen": "servidor (solo en respaldos del servidor)",
  "generado": "2026-10-15T16:00:00.000Z",
  "generadoPor": { "id": "…", "nombre": "…" },
  "conteos": { "empresas": 12, "usuarios": 3, "...": 0 },
  "integridad": { "algoritmo": "SHA-256", "hash": "<sha256 de JSON.stringify(datos)>" },
  "advertencia": "Contiene datos personales…",
  "datos": { "usuarios": [], "empresas": [], "documentos": [ { "...": "", "archivo": { "base64": "…", "mime": "application/pdf" } } ], "evidencias": [ "… igual que documentos …" ], "auditoria": [], "meta": [] }
}
```

Al importar se verifica: formato y versión, huella SHA-256, identificadores presentes y no repetidos, existencia de un administrador activo, NIT no duplicados y referencias a empresas existentes. Solo si todo es válido se reemplazan los datos, en una única transacción. Antes de restaurar se descarga automáticamente un respaldo del estado actual.

Los archivos adjuntos (documentos y evidencias) viajan dentro del mismo JSON en Base64; para recuperarlos basta restaurar el respaldo.
* Hasta la versión 0.3.0, los respaldos locales no incluían el archivo de las **evidencias**. Al importarlos, esas evidencias quedan sin archivo y el sistema lo advierte.
* En los respaldos del servidor, `credencial` es una cadena Argon2id. El prototipo local no puede validar esas contraseñas: un respaldo del servidor sirve para restaurar el servidor, no para volver al modo local.
* El servidor valida la huella recalculando `SHA-256(JSON.stringify(datos))` con una codificación JSON equivalente a la del navegador; las pruebas lo comprueban en ambos sentidos.


## Entidades de las Fases 3 a 5 (activas desde la versión 0.2.0)

* **catalogos.** `id`, `version`, `estado` (borrador | publicado | reemplazado), `fechaCorte`, `basadoEn`, `notas`, `publicadoEn/Por`.
* **requisitos.** El `id` es `catalogoId:codigo`. Campos: `campo`, `categoria`, `subcategoria`, `pregunta`, `criterio`, `naturaleza`, `norma`, `normaNumero`, `disposicion`, `fuente`, `enlace`, `fechaExpedicion`, `normasRelacionadas`, `vigencia` (verificada | pendiente_validacion | sin_norma | derogada), `fechaRevision`, `notaVerificacion`, `aplicabilidad`, `evidencia`, `metodo`, `peso`, `severidad`, `recomendacion`, `responsable`, `periodicidad`, `ref0312` y `estado` (vigente | retirado).
  * La regla de `aplicabilidad` admite: `grupos0312[]`, `minTrabajadores`, `maxTrabajadores`, `minContratistas`, `condiciones[]` (todas deben cumplirse) y `algunaCondicion[]`.
* **empresas.perfil.** Condiciones de aplicabilidad tri-estado ('si' | 'no' | '').
* **diagnosticos.** Campos de identificación y alcance: `codigo` (DX-AAAA-NNNN), `empresaId`, `asesorId`, `catalogoId`, `catalogoVersion`, `fechaCorteNormativo`, `campos[]`, `alcance`, `sedes[]`.
  * Perfil y estado: `perfil` (instantánea), `grupo0312`, `estado`, `version`, `revisionDe`, `inclusionesManuales[]`, `madurez{}`, `conclusiones{}`, `historial[]`.
  * `resultados` es la instantánea congelada al aprobar, con los parámetros usados. También guarda `aprobadoPor` y `aprobadoEn`.
* **respuestas.** El `id` es `diagnosticoId:requisitoId`. Campos: `respuesta`, `justificacionNA`, `naEstado`, `observaciones`, `recomendacion`, `responsable`, `fechaVerificacion`, `probabilidad` y `comentarioRevision`.
* **evidencias.** Ligadas a un `respuestaId` (diagnóstico) o a un `actividadId` (plan). El archivo es un Blob y la eliminación es lógica.
* **hallazgos.** Se crean al aprobar el diagnóstico. Campos: `tipo`, `severidad`, `probabilidad`, `riesgo`, `naturaleza`, `recomendacion` y `estado` (abierto | cerrado_verificado).
* **planes.** Uno vigente por empresa. Campos: `horasMes`, `capacidadSemanal`, `mesInicio`, `meses`, `distribucion{}` (suma 100), `origenDistribucion`, `justificacion`, `estado`, `version`, `alertasProgramacion[]` e `historial[]`.
* **actividades.** Campos: `codigo`, `hallazgoId`, `campo`, `actividad`, `objetivo`, `entregable`, `responsable`, `especialista`, `horasEstimadas`, `horasProgramadas`, `prioridad`, `puntajePrioridad`, `mesProgramado`, `semanaProgramada`, `fechaInicio`, `fechaLimite`, `estado`, `indicador`, `facturable` y `fijada`.
* **horas.** Un registro por sesión de trabajo: `actividadId`, `usuarioId`, `fecha`, `horas`, `facturable`, `descripcion` y `anulado`.
  * Las horas ejecutadas siempre se calculan sumando estos registros; nunca se copian.

La base local pasó a la versión 2 de IndexedDB: se agregaron índices y la migración es automática al abrir la aplicación.


## Informes (Fase 6, base local versión 3)
* **informes.** Registro de trazabilidad de cada PDF generado.
  * Identificación: `id`, `codigo` (SI360-SIGLA-AAAA-NNNN), `tipo`, `nombre`, `empresaId`, `empresaNombre`, `objetoId`, `objeto`.
  * Generación: `parametros`, `version` (n-ésima generación del mismo tipo y objeto), `regeneradoDe`, `estadoFuente` (aprobado | preliminar), `demo`.
  * Archivo: `paginas`, `tamano`, `sha256`, `generadoEn`, `generadoPor`, `generadoPorNombre`.
* El archivo PDF no se almacena: se regenera con los parámetros guardados.

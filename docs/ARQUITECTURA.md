# SER INTEGRAL 360 — Arquitectura

Versión 1.0.0 · Fases 1–8 · 16 de octubre de 2026
Propietario: Ser Integral Consultora S.A.S.

## 1. Decisiones

| Tema | Decisión | Razón |
|---|---|---|
| Interfaz | HTML5 + CSS3 + JavaScript ES2020 en módulos nativos, sin compilador | Se abre con un servidor estático; el mismo código sirve en local y en Hostinger. |
| Persistencia local | IndexedDB detrás de un adaptador | Datos estructurados y archivos adjuntos; la interfaz no conoce el motor. |
| Backend de producción | **PHP 8.2+ con API REST** | Disponible en todos los planes de Hostinger (Node.js solo en algunos). |
| Base de datos | MySQL 8.0.16+ / MariaDB 10.6+ de Hostinger, tablas híbridas (columnas indexadas + documento JSON validado) | Mismo modelo de documentos que el prototipo: migración sin transformación y esquema generado desde una sola fuente (`backend/src/Esquema.php`). |
| Selección del modo | `js/entorno.js` (local) o `api/entorno.php` (servidor, vía `.htaccess`) | El servidor decide el modo; nunca hay caída silenciosa al almacenamiento del navegador. |
| Control de versiones | GitHub; despliegue a Hostinger por Git | Hostinger permite desplegar desde un repositorio (hPanel → Git). |
| Gráficos | Chart.js 4.4.4 en `vendor/` (local) | Los gráficos funcionan sin Internet. |
| PDF | jsPDF 2.5.1 + jspdf-autotable 3.8.2 en `vendor/`, cargados solo al generar | Generación en el navegador sin servicios externos. |

## 2. Capas

```
Presentación      js/views/*         Pinta pantallas y lee formularios. No calcula ni guarda.
      │
Servicios         js/services/*      Casos de uso: valida, verifica permisos, guarda, audita.
      │
Dominio           js/domain/*        Reglas puras y probadas: NIT/DV, permisos, Res. 0312.
      │                              (Fase 3+: motor de calificación y de priorización aquí)
Persistencia      js/core/persistence/
                    index.js         Elige el adaptador según APP.PERSISTENCIA
                    indexeddb-adapter.js   (prototipo local)
                    api-adapter.js         (servidor: API REST PHP + MySQL; mismo contrato)
Núcleo            js/core/*          Configuración, sesión, bitácora, cifrado, eventos, utilidades, router.
```

Regla: una vista nunca importa `persistence/`. Los cálculos de cumplimiento y priorización viven en `js/domain/`.

En modo servidor el navegador sigue calculando (motor de calificación, priorización, PDF), pero **el servidor decide qué se acepta**:
* Permisos y alcance por empresa.
* Transiciones de estado e inmutabilidades.
* Sellos de autor y fecha.
* Bitácora encadenada.

```
Navegador (mismas vistas y servicios)
   │  fetch JSON · cookie HttpOnly · X-CSRF-Token
   ▼
api/index.php → backend/src/Api.php        Rutas, sesión, ingreso, respaldos
                 ├─ Contexto.php            Usuario, matriz de permisos, empresas visibles
                 ├─ Repositorio.php         Lectura con alcance y proyección; escritura en transacción
                 │    └─ Reglas.php         Reglas de negocio del servidor
                 ├─ Auditoria.php           Bitácora de solo inserción con cadena SHA-256
                 ├─ Archivos.php            Adjuntos en carpeta privada (finfo, SHA-256)
                 └─ Respaldo.php            Exportación/importación SI360-RESPALDO
                        │ PDO (consultas preparadas)
                        ▼
                 MySQL / MariaDB  (database/schema.sql)
```

## 3. Árbol de archivos

```
ser-integral-360/
├── index.html                 Punto de entrada
├── iniciar.bat                Servidor local para Windows (doble clic)
├── package.json               Solo para ejecutar pruebas (npm test)
├── README.md
├── assets/
│   ├── css/  tokens.css · base.css · layout.css · componentes.css
│   └── img/  logo.svg         Monograma provisional: reemplazar por el logo oficial
├── vendor/
│   ├── chart.umd.min.js       Chart.js 4.4.4 (MIT)
│   ├── jspdf.umd.min.js       jsPDF 2.5.1 (MIT)
│   └── jspdf.plugin.autotable.min.js  jspdf-autotable 3.8.2 (MIT)
├── js/
│   ├── main.js                Arranque, rutas y guardas de permiso
│   ├── core/
│   │   ├── config.js          Parámetros, almacenes, roles, estados
│   │   ├── persistence/       Contrato de datos intercambiable
│   │   ├── audit.js           Bitácora
│   │   ├── crypto.js          PBKDF2-SHA256 para contraseñas (prototipo)
│   │   ├── session.js         Sesión e inactividad
│   │   ├── router.js          Enrutador por hash
│   │   ├── ui.js              Avisos, modales, confirmaciones, iconos
│   │   ├── events.js · utils.js
│   ├── data/
│   │   ├── catalogo-base.js   Catálogo normativo base 2026.10 (139 requisitos con fuente y estado de verificación)
│   │   └── catalogo-sst-0312.js  60 ítems de la Res. 0312 con valores del art. 27 y grupos de los arts. 3, 7 y 9
│   ├── domain/
│   │   ├── validadores.js     NIT/DV, correo, teléfono, CIIU
│   │   ├── permisos.js        Matriz de roles y alcance por empresa
│   │   ├── reglas-empresa.js  Orientación Res. 0312/2019 y COPASST/Vigía
│   │   ├── perfil.js          Perfil de aplicabilidad tri-estado y evaluador de reglas
│   │   ├── calificacion.js    Motor de cumplimiento, cobertura, alertas, calificación 0312, riesgo, madurez
│   │   ├── priorizacion.js    Prioridad de atención y distribución de horas (suma exacta 100 %)
│   │   └── planificacion.js   Programación semanal/mensual y consolidación sin duplicar horas
│   ├── reports/
│   │   ├── pdf-base.js        Documento PDF institucional (portada, encabezado, pie, paginación, marcas de agua)
│   │   ├── graficos-pdf.js    Gráficos Chart.js fuera de pantalla para imprimir
│   │   ├── informe-diagnostico.js · informe-plan.js · informe-comparativo.js
│   ├── services/              auth · usuarios · empresas · catalogo · diagnosticos · planes · informes · respaldo
│   │                          auditoria · dashboard · borradores · demo
│   └── views/                 layout · acceso · tablero · empresas · empresa-form · empresa-detalle · catalogo
│                              diagnosticos · diagnostico · planes · informes · empresa-indicadores · usuarios · bitacora · respaldo · graficos
├── .htaccess                  HTTPS, cabeceras de seguridad, bloqueo de carpetas internas, modo servidor
├── api/
│   ├── index.php              Punto de entrada de la API REST (/api/v1/…)
│   ├── entorno.php            Configuración del navegador en modo servidor
│   └── .htaccess              Reescritura de rutas de la API
├── backend/                   Nunca servido por web (Require all denied)
│   ├── bootstrap.php          Autocarga, búsqueda de si360-privado/config.php fuera de public_html
│   ├── config.ejemplo.php     Plantilla de configuración
│   ├── dev-router.php         Servidor de desarrollo (php -S) que imita el .htaccess
│   ├── src/                   Api · Contexto · Repositorio · Reglas · Auditoria · Archivos · Respaldo
│   │                          Almacenes · Esquema · Sesion · Credenciales · Db · Http · Json · ErrorHttp
│   └── cli/                   instalar · respaldar (cron) · restaurar · verificar
├── database/schema.sql        Esquema MySQL generado por tools/generar-esquema.php
├── .github/workflows/ci.yml   Pruebas automáticas en cada push (Node + PHP + MySQL 8)
├── tests/                     run-tests · motor · planes · pdf · seguridad (node) · api.integracion + api.sh
└── docs/                      ARQUITECTURA · MODELO_DATOS · PRUEBAS · LIMITACIONES · SEGURIDAD · REFERENCIAS_NORMATIVAS
                               DEPENDENCIAS · MANUAL_INSTALACION · MANUAL_USUARIO · MANUAL_ADMINISTRADOR · DESPLIEGUE_HOSTINGER
```

## 4. Seguridad

Ver `SEGURIDAD.md`. En resumen:
* **Prototipo local:** protege el uso cotidiano en un equipo (PBKDF2, bloqueo por intentos, inactividad, bitácora encadenada que hace evidente la manipulación). No es multiusuario seguro.
* **Servidor:** la barrera real son las reglas del servidor (sesión HttpOnly, CSRF, Argon2id, permisos, alcance, reglas de negocio, bitácora de solo inserción, adjuntos fuera de la carpeta pública).

## 5. Despliegue en Hostinger + GitHub (Fase 8, implementada)

Paso a paso en `DESPLIEGUE_HOSTINGER.md`. Resumen:
1. Repositorio privado en GitHub, con las pruebas automáticas de `.github/workflows/ci.yml`.
2. Base MySQL creada en hPanel.
3. `si360-privado/config.php` fuera de `public_html`: el despliegue Git sobrescribe la carpeta pública.
4. hPanel → Git → desplegar `main` (opcionalmente automático por webhook). PHP 8.3 y SSL.
5. Primer arranque: crea las tablas y el administrador. Luego se desactiva la instalación web.
6. Migración: el respaldo del prototipo se importa en la instalación nueva. Las contraseñas PBKDF2 se aceptan y se convierten a Argon2id en el primer ingreso.
7. Respaldo diario por cron con verificación y rotación, más copia externa semanal.

## 6. Contrato de la API (v1)

| Método y ruta | Descripción |
|---|---|
| `GET /api/v1/estado` | Público: versión y si existe administrador |
| `POST /instalacion` | Una sola vez: tablas + primer administrador |
| `GET · POST · DELETE /sesion` | Sesión actual, ingreso, salida |
| `POST /cuenta/contrasena` · `POST /usuarios/{id}/contrasena` | Cambio propio · clave temporal asignada por el administrador |
| `GET /{almacén}[?indice=&valor=&contar=1]` | Listado con alcance |
| `GET · PUT · DELETE /{almacén}/{id}` | Obtener (`?opcional=1` → `null` si no existe) · guardar · eliminar |
| `POST /lote` | Varias operaciones en una transacción |
| `POST /consecutivos/{clave}` | Consecutivo atómico |
| `GET /archivos/{almacén}/{id}` | Descarga de un adjunto |
| `GET /auditoria/verificar` | Verificación de la cadena |
| `GET · POST /respaldo` | Exportar · importar (solo instalación nueva) |

Todas las escrituras exigen sesión y `X-CSRF-Token`. Los errores responden `{error, campos?}` con el código HTTP correspondiente (401, 403, 404, 409, 413, 415, 422, 423, 429).

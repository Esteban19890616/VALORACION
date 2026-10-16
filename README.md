# SER INTEGRAL 360

Aplicativo de diagnóstico empresarial integral de **Ser Integral Consultora S.A.S.**: jurídico, SST, calidad y ambiental.

**Versión 1.0.0 — Fases 1 a 8.** Incluye:
* Empresas, usuarios y catálogo normativo versionado.
* Diagnóstico con motor de calificación, priorización y distribución de horas.
* Planes de trabajo, seguimiento, indicadores e informes PDF con trazabilidad.
* Seguridad reforzada y bitácora encadenada.
* **Modo servidor con PHP + MySQL para Hostinger**, desplegable desde GitHub.

## Dos formas de usarlo

| | Prototipo local | Servidor (producción) |
|---|---|---|
| Cómo | Doble clic en `iniciar.bat` → `http://localhost:8360` | Hostinger + GitHub → `https://su-dominio.com` |
| Datos | En el navegador de ese equipo | MySQL del servidor, multiusuario |
| Guía | `docs/MANUAL_INSTALACION.md` | **`docs/DESPLIEGUE_HOSTINGER.md`** |

El código es el mismo. El servidor web decide el modo: en Hostinger, `.htaccess` sirve `api/entorno.php` en lugar de `js/entorno.js`, y el navegador trabaja contra la API.
Lea `docs/LIMITACIONES.md` antes de registrar información real.

## Inicio rápido en Hostinger
1. Suba el repositorio a GitHub (privado).
2. Cree la base MySQL en hPanel.
3. Cree `si360-privado/config.php` **fuera** de `public_html`, a partir de `backend/config.ejemplo.php`.
4. hPanel → Git → despliegue la rama `main`. Active PHP 8.3 y SSL.
5. Abra el sitio y cree el administrador; las tablas se instalan solas. Luego ponga `permitir_instalacion_web => false`.
6. Opcional: importe el respaldo del prototipo para migrar sus datos.
7. Programe el respaldo diario con `backend/cli/respaldar.php` (Cron Jobs).

## Pruebas
```bash
npm test            # 100 pruebas unitarias (Node 18+)
npm run test:api    # 27 pruebas de integración de la API (PHP 8.2+ y MySQL/MariaDB; usa una base VACÍA)
```
GitHub ejecuta ambas en cada push (`.github/workflows/ci.yml`).

## Documentación
| Documento | Contenido |
|---|---|
| `docs/MANUAL_INSTALACION.md` | Prototipo en Windows, servidor de desarrollo local y pruebas |
| `docs/DESPLIEGUE_HOSTINGER.md` | Publicación en Hostinger con GitHub, migración, respaldos y verificación |
| `docs/MANUAL_USUARIO.md` | Uso diario: empresas, diagnósticos, planes, horas e informes |
| `docs/MANUAL_ADMINISTRADOR.md` | Usuarios y roles, catálogo, aprobación, respaldos, bitácora y rutina |
| `docs/SEGURIDAD.md` | Controles, lo que no cubre y obligaciones de datos personales |
| `docs/ARQUITECTURA.md` | Capas, árbol de archivos, contrato de la API y decisiones |
| `docs/MODELO_DATOS.md` | Entidades, esquema MySQL y formato de respaldo |
| `docs/REFERENCIAS_NORMATIVAS.md` | Normas citadas y su estado de verificación |
| `docs/PRUEBAS.md` | Pruebas ejecutadas y pendientes, por fase |
| `docs/LIMITACIONES.md` | Qué garantiza y qué no cada modo |
| `docs/DEPENDENCIAS.md` | Librerías, versiones y licencias |
| `database/schema.sql` | Esquema MySQL (generado por `tools/generar-esquema.php`) |

## Estado por fase
| Fase | Alcance | Estado |
|---|---|---|
| 1 | Arquitectura, carpetas, modelo de datos, diseño | Implementada |
| 2 | Navegación, tablero, usuarios, empresas, bitácora, respaldos | Implementada |
| 3 | Catálogo normativo (139 requisitos), listas de chequeo, motor de calificación, revisión y aprobación | Implementada |
| 4 | Priorización y distribución de horas | Implementada |
| 5 | Planes de trabajo semanal, mensual y anual; registro de horas y cierre con evidencia | Implementada |
| 6 | Informes PDF (10 tipos), gráficos, panel por empresa, registro y verificación de informes | Implementada |
| 7 | Seguridad: CSP, bitácora encadenada SHA-256, consecutivos atómicos, cambio de contraseña obligatorio, pruebas y manuales | Implementada |
| 8 | API PHP + MySQL para Hostinger, migración desde el prototipo, respaldos automáticos, integración continua | Implementada; falta probarla en el hosting real |

Propiedad de Ser Integral Consultora S.A.S. Uso interno.

# Inventario de dependencias y licencias

| Componente | Versión | Uso | Licencia | Ubicación | Instalación |
|---|---|---|---|---|---|
| Chart.js | 4.4.4 | Gráficos del tablero | MIT | `vendor/chart.umd.min.js` (copia local) | Incluida. Para actualizar: `npm i chart.js@<versión>` y copiar `dist/chart.umd.js`. |
| jsPDF | 2.5.1 | Generación de informes PDF | MIT | `vendor/jspdf.umd.min.js` | Incluida. Se carga solo al generar un informe. |
| jspdf-autotable | 3.8.2 | Tablas de los informes PDF | MIT | `vendor/jspdf.plugin.autotable.min.js` | Incluida. |
| IBM Plex Sans / IBM Plex Mono | Google Fonts | Tipografía de texto y datos | SIL Open Font License 1.1 | Google Fonts (en línea) | Sin conexión se usan Segoe UI y Consolas. |
| Source Serif 4 | Google Fonts | Títulos | SIL Open Font License 1.1 | Google Fonts (en línea) | Sin conexión se usa Georgia. |
| PHP | 8.2 o superior (recomendado 8.3), extensiones `pdo_mysql`, `mbstring`, `fileinfo`, `zlib` | API del modo servidor | PHP License 3.01 | Hostinger (hPanel → Configuración de PHP) | Incluido en el plan |
| MySQL / MariaDB | MySQL 8.0.16+ o MariaDB 10.6+ | Base de datos del modo servidor | GPL v2 | Hostinger (hPanel → Bases de datos) | Incluido en el plan |
| Node.js | 18 o superior | Solo para pruebas (`npm test`, `tests/api.sh`) y como servidor alternativo | MIT | Opcional | https://nodejs.org |
| GitHub Actions: `actions/checkout@v4`, `actions/setup-node@v4`, `shivammathur/setup-php@v2`, imagen `mysql:8.0` | — | Integración continua (`.github/workflows/ci.yml`) | MIT / GPL v2 | GitHub | Automático al hacer push |
| Python | 3.8 o superior | Servidor local de `iniciar.bat` | PSF | Opcional | https://www.python.org |

El backend PHP no usa librerías externas ni Composer: solo la biblioteca estándar de PHP.

No se usan servicios pagos, claves API ni conexiones externas para las funciones esenciales.

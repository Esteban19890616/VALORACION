/** Envoltorio de Chart.js (cargado localmente desde vendor/). Colores tomados de los tokens CSS. */
const activos = [];

const token = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

export function destruirGraficos() { while (activos.length) activos.pop().destroy(); }
export const registrarGrafico = (g) => activos.push(g);

export function graficoBarras(id, datos, { horizontal = false } = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  const etiquetas = Object.keys(datos); const valores = Object.values(datos);
  if (!etiquetas.length) { el.replaceWith(Object.assign(document.createElement('p'), { className: 'vacio-graf', textContent: 'Sin datos para graficar.' })); return; }
  if (!globalThis.Chart) { el.replaceWith(Object.assign(document.createElement('p'), { className: 'vacio-graf', textContent: 'No se pudo cargar la librería de gráficos (vendor/chart.umd.min.js).' })); return; }
  const texto = token('--texto-2'); const rejilla = token('--linea');
  const g = new Chart(el, {
    type: 'bar',
    data: { labels: etiquetas, datasets: [{ data: valores, backgroundColor: token('--graf-1'), hoverBackgroundColor: token('--acento'), borderRadius: 3, maxBarThickness: 28 }] },
    options: {
      indexAxis: horizontal ? 'y' : 'x', responsive: true, maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${c.parsed[horizontal ? 'x' : 'y']} empresa(s)` } } },
      scales: {
        [horizontal ? 'x' : 'y']: { beginAtZero: true, ticks: { precision: 0, color: texto }, grid: { color: rejilla } },
        [horizontal ? 'y' : 'x']: { ticks: { color: texto, autoSkip: false }, grid: { display: false } },
      },
    },
  });
  activos.push(g);
}

/** Barras de porcentaje (0–100) por categoría; los valores null se muestran como "sin datos". */
export function graficoPorcentaje(id, etiquetas, valores, { horizontal = false, colores = null } = {}) {
  const el = document.getElementById(id);
  if (!el || !globalThis.Chart) return;
  const texto = token('--texto-2'); const rejilla = token('--linea');
  const g = new Chart(el, {
    type: 'bar',
    data: { labels: etiquetas, datasets: [{ data: valores.map((v) => v ?? 0), backgroundColor: colores || valores.map((v) => (v == null ? token('--linea-fuerte') : token('--graf-1'))), borderRadius: 3, maxBarThickness: 44 }] },
    options: {
      indexAxis: horizontal ? 'y' : 'x', responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => (valores[c.dataIndex] == null ? ' Sin datos suficientes' : ` ${valores[c.dataIndex]} %`) } } },
      scales: {
        [horizontal ? 'x' : 'y']: { min: 0, max: 100, ticks: { stepSize: 20, color: texto, callback: (v) => `${v} %` }, grid: { color: rejilla } },
        [horizontal ? 'y' : 'x']: { ticks: { color: texto }, grid: { display: false } },
      },
    },
  });
  activos.push(g);
}

/** Radar de cumplimiento por campo (solo campos con datos). */
export function graficoRadar(id, etiquetas, series) {
  const el = document.getElementById(id);
  if (!el || !globalThis.Chart) return;
  const texto = token('--texto-2'); const rejilla = token('--linea');
  const paleta = [token('--graf-1'), token('--aviso'), token('--ok')];
  const g = new Chart(el, {
    type: 'radar',
    data: { labels: etiquetas, datasets: series.map((s, i) => ({ label: s.nombre, data: s.valores, borderColor: paleta[i % 3], backgroundColor: `${paleta[i % 3]}33`, pointBackgroundColor: paleta[i % 3], borderWidth: 2 })) },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: series.length > 1, labels: { color: texto } } },
      scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, color: texto, backdropColor: 'transparent' }, grid: { color: rejilla }, angleLines: { color: rejilla }, pointLabels: { color: texto, font: { size: 12 } } } },
    },
  });
  activos.push(g);
}

/** Línea de evolución histórica. */
export function graficoLinea(id, etiquetas, series) {
  const el = document.getElementById(id);
  if (!el || !globalThis.Chart) return;
  const texto = token('--texto-2'); const rejilla = token('--linea');
  const paleta = [token('--graf-1'), token('--aviso'), token('--ok'), token('--critico'), token('--texto-3')];
  const g = new Chart(el, {
    type: 'line',
    data: { labels: etiquetas, datasets: series.map((s, i) => ({ label: s.nombre, data: s.valores, borderColor: paleta[i % paleta.length], backgroundColor: paleta[i % paleta.length], spanGaps: true, tension: .2 })) },
    options: { responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { labels: { color: texto } } },
      scales: { y: { min: 0, max: 100, ticks: { color: texto, callback: (v) => `${v} %` }, grid: { color: rejilla } }, x: { ticks: { color: texto }, grid: { display: false } } } },
  });
  activos.push(g);
}

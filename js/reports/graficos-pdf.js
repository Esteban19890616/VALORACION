/** Gráficos para PDF: Chart.js sobre un lienzo fuera de pantalla, con paleta fija de impresión (tema claro). */
const P = { azul: '#1f5a96', acento: '#4a7fb5', gris: '#c3cdd8', texto: '#4a5867', linea: '#e3e8ee', ok: '#1e7a4f', aviso: '#c08a1c', critico: '#b3261e' };
export const PALETA_PDF = P;

function lienzo(ancho, alto) {
  const c = document.createElement('canvas');
  c.width = ancho * 2; c.height = alto * 2; c.style.width = `${ancho}px`; c.style.height = `${alto}px`;
  return c;
}

function render(config, ancho = 900, alto = 420) {
  if (!globalThis.Chart) return null;
  const c = lienzo(ancho, alto);
  const fondo = { id: 'fondo', beforeDraw: (ch) => { const x = ch.ctx; x.save(); x.fillStyle = '#ffffff'; x.fillRect(0, 0, ch.width, ch.height); x.restore(); } };
  const ch = new Chart(c, { ...config, options: { ...config.options, responsive: false, animation: false, devicePixelRatio: 2 }, plugins: [fondo, ...(config.plugins || [])] });
  ch.resize(ancho, alto);
  const url = c.toDataURL('image/png');
  ch.destroy();
  return url;
}

const etiquetasValor = (sufijo = ' %') => ({
  id: 'etiquetas', afterDatasetsDraw: (ch) => {
    const x = ch.ctx; x.save(); x.font = '600 13px Helvetica, Arial, sans-serif'; x.fillStyle = '#1d2733';
    ch.data.datasets.forEach((ds, i) => ch.getDatasetMeta(i).data.forEach((bar, j) => {
      const v = ds._valoresReales ? ds._valoresReales[j] : ds.data[j];
      const txt = v == null ? 'Sin datos' : `${String(v).replace('.', ',')}${sufijo}`;
      if (ch.options.indexAxis === 'y') { x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(txt, bar.x + 6, bar.y); }
      else { x.textAlign = 'center'; x.textBaseline = 'bottom'; x.fillText(txt, bar.x, bar.y - 4); }
    }));
    x.restore();
  },
});

const ejes = (horizontal, max = 100, sufijo = ' %') => ({
  [horizontal ? 'x' : 'y']: { min: 0, ...(max ? { max } : {}), beginAtZero: true, ticks: { color: P.texto, font: { size: 12 }, callback: (v) => `${v}${sufijo}` }, grid: { color: P.linea } },
  [horizontal ? 'y' : 'x']: { ticks: { color: P.texto, font: { size: 12 } }, grid: { display: false } },
});

export function barrasPorcentaje(etiquetas, valores, { horizontal = false, ancho = 900, alto = 380, colores = null } = {}) {
  return render({
    type: 'bar',
    data: { labels: etiquetas, datasets: [{ data: valores.map((v) => v ?? 0), _valoresReales: valores, backgroundColor: colores || valores.map((v) => (v == null ? P.gris : P.azul)), borderRadius: 3, maxBarThickness: 70 }] },
    options: { indexAxis: horizontal ? 'y' : 'x', layout: { padding: { top: 24, right: horizontal ? 70 : 10 } }, plugins: { legend: { display: false } }, scales: ejes(horizontal) },
    plugins: [etiquetasValor()],
  }, ancho, alto);
}

export function barrasAgrupadas(etiquetas, series, { sufijo = ' h', max = null, ancho = 900, alto = 380 } = {}) {
  const colores = [P.gris, P.acento, P.ok, P.aviso];
  return render({
    type: 'bar',
    data: { labels: etiquetas, datasets: series.map((s, i) => ({ label: s.nombre, data: s.valores, backgroundColor: s.color || colores[i % colores.length], borderRadius: 2, maxBarThickness: 36 })) },
    options: { layout: { padding: { top: 18 } }, plugins: { legend: { labels: { color: P.texto, font: { size: 12 }, boxWidth: 14 } } }, scales: ejes(false, max, sufijo) },
    plugins: [etiquetasValor(sufijo)],
  }, ancho, alto);
}

export function radar(etiquetas, series, { ancho = 520, alto = 420 } = {}) {
  const colores = [P.azul, P.aviso, P.ok];
  return render({
    type: 'radar',
    data: { labels: etiquetas, datasets: series.map((s, i) => ({ label: s.nombre, data: s.valores, borderColor: colores[i], backgroundColor: `${colores[i]}2e`, pointBackgroundColor: colores[i], borderWidth: 2 })) },
    options: { plugins: { legend: { display: series.length > 1, labels: { color: P.texto, font: { size: 12 } } } }, scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, color: P.texto, backdropColor: '#fff' }, grid: { color: P.linea }, angleLines: { color: P.linea }, pointLabels: { color: '#1d2733', font: { size: 14, weight: '600' } } } } },
  }, ancho, alto);
}

export function linea(etiquetas, series, { ancho = 900, alto = 340, max = 100, sufijo = ' %' } = {}) {
  const colores = [P.azul, P.aviso, P.ok, P.critico];
  return render({
    type: 'line',
    data: { labels: etiquetas, datasets: series.map((s, i) => ({ label: s.nombre, data: s.valores, borderColor: colores[i % 4], backgroundColor: colores[i % 4], tension: 0.2, spanGaps: true, pointRadius: 4 })) },
    options: { plugins: { legend: { labels: { color: P.texto, font: { size: 12 } } } }, scales: ejes(false, max, sufijo) },
  }, ancho, alto);
}

export function dona(etiquetas, valores, colores, { ancho = 520, alto = 360 } = {}) {
  return render({
    type: 'doughnut',
    data: { labels: etiquetas, datasets: [{ data: valores, backgroundColor: colores, borderColor: '#ffffff', borderWidth: 2 }] },
    options: { cutout: '58%', plugins: { legend: { position: 'right', labels: { color: P.texto, font: { size: 13 }, boxWidth: 14 } } } },
  }, ancho, alto);
}

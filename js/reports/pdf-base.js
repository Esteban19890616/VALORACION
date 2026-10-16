/**
 * Motor de documentos PDF institucionales (jsPDF 2.5.1 + jspdf-autotable 3.8.2, copias locales en vendor/).
 * Portada, encabezado y pie en cada página, paginación "Página X de Y", código de documento,
 * fecha de generación y marcas de agua para borradores y datos de demostración.
 *
 * Las fuentes estándar de PDF solo cubren Latin-1: S() convierte los demás caracteres a equivalentes seguros.
 */
const COLOR = {
  azul: [18, 52, 92], azulOscuro: [11, 35, 64], acento: [47, 127, 200], grafito: [43, 51, 61], texto: [29, 39, 51],
  texto2: [74, 88, 103], texto3: [111, 125, 140], linea: [219, 226, 234], fondo: [241, 244, 247], fondo2: [247, 249, 251],
  ok: [30, 122, 79], aviso: [138, 90, 0], critico: [179, 38, 30], blanco: [255, 255, 255],
};
export const TONOS_PDF = { ok: COLOR.ok, aviso: COLOR.aviso, critico: COLOR.critico, info: COLOR.acento, neutro: COLOR.texto3 };

let cargado = null;
function cargarScript(src) {
  return new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok;
    s.onerror = () => fail(new Error(`No se pudo cargar ${src}. Verifique que la carpeta vendor/ esté completa.`));
    document.head.append(s);
  });
}
export async function cargarLibreriaPDF() {
  if (globalThis.jspdf?.jsPDF?.API?.autoTable) return globalThis.jspdf.jsPDF;
  cargado ||= (async () => { if (!globalThis.jspdf) await cargarScript('vendor/jspdf.umd.min.js'); await cargarScript('vendor/jspdf.plugin.autotable.min.js'); })();
  await cargado;
  return globalThis.jspdf.jsPDF;
}

const REEMPLAZOS = { '–': '-', '—': '-', '‒': '-', '…': '...', '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'", '•': '-', '→': '->', '←': '<-', '≥': '>=', '≤': '<=', '≠': '<>', '✓': 'Si', '✔': 'Si', '✕': 'X', '✘': 'X', '▲': '^', '▼': 'v', '▸': '>', '€': 'EUR', ' ': ' ', ' ': ' ' };
/** Texto seguro para las fuentes estándar del PDF (Latin-1). */
export function S(v) {
  return String(v ?? '').replace(/[^\x00-\xff]/g, (c) => REEMPLAZOS[c] ?? (c.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x00-\xff]/g, '') || '?'));
}

const fechaLarga = (d = new Date()) => d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
const fechaHora = (d = new Date()) => d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

async function logoPNG() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="160" height="160"><rect width="40" height="40" rx="8" fill="#ffffff"/><path d="M10 26.5c1.6 1.4 3.6 2.1 5.7 2.1 2.6 0 4.3-1.2 4.3-3.1 0-4.4-9.6-2.6-9.6-8.6 0-2.9 2.5-5 6-5 2 0 3.8.6 5.2 1.6" fill="none" stroke="#12345c" stroke-width="2.4" stroke-linecap="round"/><path d="M28 12v16.5" stroke="#2f7fc8" stroke-width="2.4" stroke-linecap="round"/><circle cx="28" cy="8.2" r="1.6" fill="#2f7fc8"/></svg>`;
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = 160; c.height = 160; c.getContext('2d').drawImage(img, 0, 0); ok(c.toDataURL('image/png')); };
    img.onerror = () => ok(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

export class DocumentoPDF {
  /**
   * @param {object} o  titulo, subtitulo, codigo, empresa, generadoPor, marcaAgua (texto o null), confidencial (bool)
   */
  static async crear(o) {
    const jsPDF = await cargarLibreriaPDF();
    const d = new DocumentoPDF();
    d.doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    d.o = o; d.logo = await logoPNG();
    d.W = 210; d.H = 297; d.m = 18; d.top = 26; d.bottom = 20; d.y = d.top; d.seccion = 0;
    d.doc.setProperties({ title: S(o.titulo), subject: S(o.subtitulo || ''), author: 'Ser Integral Consultora S.A.S.', creator: 'SER INTEGRAL 360', keywords: S(o.codigo) });
    return d;
  }

  get ancho() { return this.W - this.m * 2; }
  color(c, tipo = 'text') { const f = tipo === 'text' ? 'setTextColor' : tipo === 'fill' ? 'setFillColor' : 'setDrawColor'; this.doc[f](...c); }
  fuente(estilo = 'normal', tam = 10, c = COLOR.texto) { this.doc.setFont('helvetica', estilo); this.doc.setFontSize(tam); this.color(c); }
  nuevaPagina() { this.doc.addPage(); this.y = this.top; }
  asegurar(h) { if (this.y + h > this.H - this.bottom) this.nuevaPagina(); }

  /* ---------------- Portada ---------------- */
  portada({ lineas = [], datos = [], estado = null }) {
    const { doc } = this;
    this.color(COLOR.azulOscuro, 'fill'); doc.rect(0, 0, this.W, 118, 'F');
    this.color(COLOR.acento, 'fill'); doc.rect(0, 118, this.W, 1.6, 'F');
    if (this.logo) doc.addImage(this.logo, 'PNG', this.m, 22, 16, 16);
    this.fuente('bold', 11, COLOR.blanco); doc.text('SER INTEGRAL CONSULTORA S.A.S.', this.m + 21, 29);
    this.fuente('normal', 9, [185, 202, 220]); doc.text('SER INTEGRAL 360 · Diagnóstico empresarial integral', this.m + 21, 35);
    this.fuente('bold', 24, COLOR.blanco);
    const t = doc.splitTextToSize(S(this.o.titulo), this.ancho); doc.text(t, this.m, 66);
    let yy = 66 + t.length * 10;
    if (this.o.subtitulo) { this.fuente('normal', 12, [201, 214, 228]); const st = doc.splitTextToSize(S(this.o.subtitulo), this.ancho); doc.text(st, this.m, yy); yy += st.length * 6; }
    lineas.forEach((l) => { this.fuente('normal', 10, [185, 202, 220]); doc.text(S(l), this.m, yy + 4); yy += 6; });
    this.y = 134;
    if (estado) {
      const c = TONOS_PDF[estado.tono] || COLOR.texto3;
      this.color(c, 'fill'); doc.roundedRect(this.m, this.y, doc.getTextWidth(S(estado.texto)) * 1.25 + 10, 8, 2, 2, 'F');
      this.fuente('bold', 9, COLOR.blanco); doc.text(S(estado.texto), this.m + 5, this.y + 5.4);
      this.y += 16;
    }
    this.tablaPares(datos, { anchoEtiqueta: 52 });
    this.asegurar(30);
    this.y = Math.max(this.y + 8, this.H - 58);
    this.color(COLOR.linea, 'draw'); doc.setLineWidth(0.3); doc.line(this.m, this.y, this.W - this.m, this.y);
    this.fuente('normal', 8, COLOR.texto3);
    const aviso = doc.splitTextToSize(S('Documento confidencial. Contiene información de la empresa evaluada y datos personales tratados conforme a la Ley 1581 de 2012. Su contenido es un diagnóstico técnico basado en la información suministrada y verificada a la fecha de corte indicada; no constituye concepto jurídico vinculante ni certificación de cumplimiento.'), this.ancho);
    doc.text(aviso, this.m, this.y + 6);
    this.nuevaPagina();
  }

  /* ---------------- Bloques ---------------- */
  titulo(texto, { numerado = true } = {}) {
    this.asegurar(18);
    if (numerado) this.seccion += 1;
    this.y += 3;
    this.fuente('bold', 13, COLOR.azul);
    this.doc.text(S(numerado ? `${this.seccion}. ${texto}` : texto), this.m, this.y);
    this.color(COLOR.acento, 'draw'); this.doc.setLineWidth(0.6); this.doc.line(this.m, this.y + 2, this.m + 18, this.y + 2);
    this.y += 9;
  }

  subtitulo(texto) { this.asegurar(12); this.fuente('bold', 10.5, COLOR.grafito); this.doc.text(S(texto), this.m, this.y); this.y += 6; }

  parrafo(texto, { tam = 9.5, color = COLOR.texto, estilo = 'normal', interlineado = 1.42, sangria = 0 } = {}) {
    if (!texto) return;
    this.fuente(estilo, tam, color);
    const lh = tam * 0.3528 * interlineado;
    for (const bloque of String(texto).split('\n')) {
      const lineas = this.doc.splitTextToSize(S(bloque), this.ancho - sangria);
      for (const l of lineas) { this.asegurar(lh); this.doc.text(l, this.m + sangria, this.y); this.y += lh; }
    }
    this.y += 2;
  }

  nota(texto) { this.parrafo(texto, { tam: 8, color: COLOR.texto3 }); }

  vinetas(items, { tam = 9.5 } = {}) {
    for (const it of items) {
      this.fuente('normal', tam, COLOR.texto);
      const lineas = this.doc.splitTextToSize(S(it), this.ancho - 6);
      const lh = tam * 0.3528 * 1.4;
      this.asegurar(lh * Math.min(lineas.length, 2));
      this.color(COLOR.acento, 'fill'); this.doc.circle(this.m + 1.5, this.y - 1.2, 0.8, 'F');
      lineas.forEach((l) => { this.asegurar(lh); this.doc.text(l, this.m + 5, this.y); this.y += lh; });
    }
    this.y += 2;
  }

  /** Fila de indicadores grandes (máx. 4 por fila). items: [{etiqueta, valor, detalle, tono}] */
  indicadores(items) {
    const n = Math.min(4, items.length); const gap = 4; const w = (this.ancho - gap * (n - 1)) / n; const h = 24;
    for (let i = 0; i < items.length; i += n) {
      this.asegurar(h + 4);
      items.slice(i, i + n).forEach((it, j) => {
        const x = this.m + j * (w + gap);
        this.color(COLOR.fondo2, 'fill'); this.color(COLOR.linea, 'draw'); this.doc.setLineWidth(0.25);
        this.doc.roundedRect(x, this.y, w, h, 1.5, 1.5, 'FD');
        if (it.tono) { this.color(TONOS_PDF[it.tono], 'fill'); this.doc.rect(x, this.y, 1.2, h, 'F'); }
        this.fuente('normal', 7.5, COLOR.texto3); this.doc.text(S(it.etiqueta).toUpperCase(), x + 4, this.y + 5.5, { maxWidth: w - 7 });
        this.fuente('bold', 15, it.tono ? TONOS_PDF[it.tono] : COLOR.texto); this.doc.text(S(it.valor), x + 4, this.y + 14);
        if (it.detalle) { this.fuente('normal', 7, COLOR.texto2); this.doc.text(this.doc.splitTextToSize(S(it.detalle), w - 7).slice(0, 2), x + 4, this.y + 19); }
      });
      this.y += h + 4;
    }
    this.y += 1;
  }

  /** Tabla etiqueta/valor. */
  tablaPares(pares, { anchoEtiqueta = 50 } = {}) {
    const body = pares.filter((p) => p && p[1] !== undefined).map(([k, v]) => [S(k), S(v === null || v === '' ? '—' : v)]);
    if (!body.length) return;
    this.doc.autoTable({
      startY: this.y, margin: { left: this.m, right: this.m, top: this.top, bottom: this.bottom }, body, theme: 'plain',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 1.6, bottom: 1.6, left: 2, right: 2 }, textColor: COLOR.texto, lineColor: COLOR.linea, lineWidth: { bottom: 0.2 } },
      columnStyles: { 0: { cellWidth: anchoEtiqueta, textColor: COLOR.texto3 } },
    });
    this.y = this.doc.lastAutoTable.finalY + 5;
  }

  /** Tabla con encabezado. columnas: [{titulo, ancho?, alinear?}] filas: arrays de texto o {content, styles} */
  tabla(columnas, filas, { tam = 8.2, colorearColumna = null, vacio = 'Sin registros.' } = {}) {
    if (!filas.length) { this.nota(vacio); return; }
    const columnStyles = {};
    columnas.forEach((c, i) => { columnStyles[i] = { ...(c.ancho ? { cellWidth: c.ancho } : {}), ...(c.alinear ? { halign: c.alinear } : {}) }; });
    this.doc.autoTable({
      startY: this.y, margin: { left: this.m, right: this.m, top: this.top + 2, bottom: this.bottom + 2 },
      head: [columnas.map((c) => S(c.titulo))],
      body: filas.map((f) => f.map((c) => (c && typeof c === 'object' ? { ...c, content: S(c.content) } : S(c)))),
      theme: 'grid', rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: tam, cellPadding: 1.8, textColor: COLOR.texto, lineColor: COLOR.linea, lineWidth: 0.2, valign: 'top', overflow: 'linebreak' },
      headStyles: { fillColor: COLOR.azul, textColor: COLOR.blanco, fontStyle: 'bold', fontSize: tam },
      alternateRowStyles: { fillColor: COLOR.fondo2 },
      columnStyles,
      didParseCell: colorearColumna ? (h) => { if (h.section === 'body') colorearColumna(h); } : undefined,
    });
    this.y = this.doc.lastAutoTable.finalY + 5;
  }

  imagen(dataURL, { alto = 70, ancho = null } = {}) {
    if (!dataURL) return;
    const w = ancho || this.ancho;
    this.asegurar(alto + 4);
    this.doc.addImage(dataURL, dataURL.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG', this.m + (this.ancho - w) / 2, this.y, w, alto);
    this.y += alto + 5;
  }

  /** Dos imágenes lado a lado. */
  imagenesPar(a, b, { alto = 62 } = {}) {
    const w = (this.ancho - 6) / 2;
    this.asegurar(alto + 4);
    if (a) this.doc.addImage(a, 'PNG', this.m, this.y, w, alto);
    if (b) this.doc.addImage(b, 'PNG', this.m + w + 6, this.y, w, alto);
    this.y += alto + 5;
  }

  aviso(texto, tono = 'aviso') {
    this.fuente('normal', 8.8, COLOR.texto);
    const lineas = this.doc.splitTextToSize(S(texto), this.ancho - 10);
    const h = lineas.length * 4.3 + 5;
    this.asegurar(h + 2);
    const c = TONOS_PDF[tono];
    this.doc.setFillColor(...c.map((v) => Math.round(v + (255 - v) * 0.88)));
    this.doc.rect(this.m, this.y, this.ancho, h, 'F');
    this.color(c, 'fill'); this.doc.rect(this.m, this.y, 1.2, h, 'F');
    this.fuente('normal', 8.8, COLOR.texto); this.doc.text(lineas, this.m + 5, this.y + 5);
    this.y += h + 4;
  }

  /* ---------------- Cierre: encabezado, pie, marca de agua ---------------- */
  finalizar() {
    const { doc } = this; const total = doc.getNumberOfPages();
    const gen = `Generado el ${fechaHora()} por ${this.o.generadoPor || '—'}`;
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      if (this.o.marcaAgua) {
        doc.saveGraphicsState(); doc.setGState(new doc.GState({ opacity: 0.09 }));
        this.fuente('bold', 34, COLOR.critico);
        const txt = S(this.o.marcaAgua); const w = doc.getTextWidth(txt); const a = (35 * Math.PI) / 180;
        doc.text(txt, this.W / 2 - (Math.cos(a) * w) / 2, this.H / 2 + (Math.sin(a) * w) / 2, { angle: 35 });
        doc.restoreGraphicsState();
      }
      if (i > 1) {
        this.color(COLOR.linea, 'draw'); doc.setLineWidth(0.3); doc.line(this.m, 17, this.W - this.m, 17);
        if (this.logo) doc.addImage(this.logo, 'PNG', this.m, 9.3, 5.5, 5.5);
        this.fuente('bold', 8, COLOR.azul); doc.text('SER INTEGRAL CONSULTORA S.A.S.', this.m + 7.5, 13.2);
        this.fuente('normal', 7.5, COLOR.texto3); doc.text(S(this.o.empresa || ''), this.m + 7.5, 16, { maxWidth: 110 });
        this.fuente('normal', 7.5, COLOR.texto3); doc.text(S(this.o.titulo).slice(0, 70), this.W - this.m, 11.5, { align: 'right' });
        this.fuente('bold', 7.5, COLOR.grafito); doc.text(S(this.o.codigo), this.W - this.m, 15.2, { align: 'right' });
      }
      this.color(COLOR.linea, 'draw'); doc.line(this.m, this.H - 14, this.W - this.m, this.H - 14);
      this.fuente('normal', 7, COLOR.texto3);
      doc.text(S(`${this.o.codigo} · ${gen}`), this.m, this.H - 9.5);
      doc.text(S('Confidencial · SER INTEGRAL 360'), this.m, this.H - 6.3);
      this.fuente('bold', 7.5, COLOR.grafito); doc.text(`Página ${i} de ${total}`, this.W - this.m, this.H - 9.5, { align: 'right' });
    }
    return { blob: doc.output('blob'), paginas: total };
  }
}

export { COLOR, fechaLarga, fechaHora };

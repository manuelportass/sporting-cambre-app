// Importación (CSV/Excel) y exportación (CSV/Excel/PDF) en el navegador
import Papa from 'papaparse';
import { readSheet } from 'read-excel-file/browser';
import writeXlsxFile from 'write-excel-file/browser';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const normKey = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// Devuelve { headers, rows: [{clave_normalizada: valor}] }
export async function readTable(file) {
  const name = file.name.toLowerCase();
  let matrix;
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const text = await file.text();
    const res = Papa.parse(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy', delimiter: '' });
    matrix = res.data;
  } else if (name.endsWith('.xlsx')) {
    matrix = await readSheet(file);
  } else if (name.endsWith('.xls')) {
    throw new Error('El formato .xls antiguo no es compatible. Guarda el archivo como .xlsx o .csv.');
  } else throw new Error('Formato no compatible. Usa .xlsx o .csv.');
  matrix = matrix.filter(r => r.some(c => c !== null && c !== ''));
  if (matrix.length < 2) throw new Error('El archivo no tiene filas de datos (la primera fila debe ser la cabecera).');
  const headers = matrix[0].map(h => String(h ?? '').trim());
  const keys = headers.map(normKey);
  const rows = matrix.slice(1).map(r => {
    const o = {};
    keys.forEach((k, i) => {
      let v = r[i];
      if (v instanceof Date) v = v.toISOString().slice(0, 10);
      o[k] = v === null || v === undefined ? '' : (typeof v === 'string' ? v.trim() : v);
    });
    return o;
  });
  return { headers, keys, rows };
}

// Aplica un mapa de columnas {campoDestino: claveOrigen}
export const mapRows = (rows, map) => rows.map(r => Object.fromEntries(Object.entries(map).filter(([, src]) => src).map(([dst, src]) => [dst, r[src]])));

// Guarda un archivo generado. En la versión publicada en Claude usa la capacidad «downloads».
export async function saveBlob(blob, filename) {
  const cap = window.claude?.use ? await window.claude.use('downloads').catch(() => null) : null;
  if (cap) {
    try { await cap.save({ filename, data: blob }); } catch (e) { if (e?.code !== 'declined') throw new Error('No se pudo descargar el archivo en esta vista.'); }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// columns: [{ key, label }]
export function exportCSV(rows, columns, filename) {
  const csv = Papa.unparse({ fields: columns.map(c => c.label), data: rows.map(r => columns.map(c => r[c.key] ?? '')) }, { delimiter: ';' });
  return saveBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), filename);
}
export async function exportXLSX(sheets, filename) {
  // sheets: [{ name, columns, rows }]
  const sheetObjs = sheets.map(s => ({
    sheet: s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31),
    columns: s.columns.map(c => ({ width: Math.max(10, Math.min(40, c.label.length + 6)) })),
    data: [
      s.columns.map(c => ({ value: c.label, fontWeight: 'bold' })),
      ...s.rows.map(r => s.columns.map(c => { const v = r[c.key]; return v === null || v === undefined || v === '' ? null : { value: typeof v === 'number' ? v : String(v), type: typeof v === 'number' ? Number : String }; })),
    ],
  }));
  const blob = await writeXlsxFile(sheetObjs).toBlob();
  return saveBlob(blob, filename);
}
export function downloadTemplate(columns, filename) {
  exportCSV([], columns.map(c => ({ key: c, label: c })), filename);
}

async function crestDataUrl() {
  try {
    const info = await (await fetch('/api/public/club')).json();
    if (!info.hasCrest) return null;
    const res = await fetch('/api/public/crest');
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.type === 'image/svg+xml') return null; // jsPDF no inserta SVG
    return await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  } catch { return null; }
}

// Informe PDF genérico: { title, subtitle, meta: [[k,v]], sections: [{ title, columns, rows, note }], footer }
export async function exportPDF({ title, subtitle, meta = [], sections = [], filename, club = 'Sporting Cambre', accent = '#dc0b11', landscape = false }) {
  const primary = accent;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const crest = await crestDataUrl();
  // Cabecera blanca con escudo y filete rojo (identidad del club)
  doc.setFillColor(...rgb(primary)); doc.rect(0, 30, W, 1.4, 'F');
  let x = 14;
  if (crest) {
    const img = new Image(); img.src = crest; await img.decode().catch(() => {});
    const h = 24, w = img.width && img.height ? (img.width / img.height) * h : h;
    doc.addImage(crest, 14, 3, Math.min(w, 30), h); x = 14 + Math.min(w, 30) + 6;
  }
  doc.setTextColor(...rgb(primary)); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text((subtitle || club).toUpperCase(), x, 12);
  doc.setTextColor(20, 20, 20); doc.setFontSize(16); doc.text(title, x, 20);
  let y = 38;
  doc.setFontSize(9.5);
  meta.forEach(([k, v]) => { doc.setFont('helvetica', 'bold'); doc.text(`${k}:`, 14, y); doc.setFont('helvetica', 'normal'); doc.text(String(v ?? '—'), 58, y); y += 5.2; });
  y += 2;
  for (const s of sections) {
    if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 18; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(s.small ? 10 : 11.5); doc.setTextColor(...rgb(s.small ? '#141414' : primary)); doc.text(s.small ? s.title : s.title.toUpperCase(), 14, y); doc.setTextColor(20, 20, 20);
    y += 2;
    if (s.text) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      const lines = doc.splitTextToSize(s.text, W - 28); doc.text(lines, 14, y + 4); y += 4 + lines.length * 4.2 + 4;
      continue;
    }
    autoTable(doc, {
      startY: y + 1, head: [s.columns.map(c => c.label)], body: s.rows.map(r => s.columns.map(c => r[c.key] ?? '—')),
      styles: { fontSize: 8.5, cellPadding: 1.8 }, headStyles: { fillColor: [24, 26, 24], textColor: 255 },
      alternateRowStyles: { fillColor: [246, 247, 244] }, margin: { left: 14, right: 14 },
      columnStyles: Object.fromEntries(s.columns.map((c, i) => [i, c.align === 'right' ? { halign: 'right' } : {}])),
      didParseCell: d => {
        if (d.section === 'head' && s.columns[d.column.index]?.align === 'right') d.cell.styles.halign = 'right';
        const c = d.section === 'body' && s.rows[d.row.index]?._color;
        if (c && s.columns[d.column.index]?.colored) { d.cell.styles.textColor = rgb(c); d.cell.styles.fontStyle = 'bold'; }
      },
    });
    y = doc.lastAutoTable.finalY + 4;
    if (s.note) { doc.setFont('helvetica', 'italic'); doc.setFontSize(8); const l = doc.splitTextToSize(s.note, W - 28); doc.text(l, 14, y + 2); y += l.length * 3.8 + 4; }
    y += 4;
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`${club} · Generado el ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`, 14, doc.internal.pageSize.getHeight() - 8);
    doc.text(`${i} / ${pages}`, W - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' });
  }
  return saveBlob(doc.output('blob'), filename);
}

// Ajusta una foto al formato de las fotos editadas del primer equipo (3:4, 600 × 800 px, JPEG):
// la recorta por el centro si hace falta, rellena con blanco y la reduce para que pese poco.
export async function normalizePlayerPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const W = 600, H = 800, r = W / H;
    let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
    if (sw / sh > r) { const nw = sh * r; sx = (sw - nw) / 2; sw = nw; } else if (sw / sh < r) { const nh = sw / r; sy = (sh - nh) / 2; sh = nh; }
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
    return new File([blob], (file.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally { URL.revokeObjectURL(url); }
}

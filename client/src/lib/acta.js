// Lectura de la «Ficha del Partido» de la Federación Gallega de Fútbol (PDF).
// Extrae: competición, jornada, fecha, temporada, equipos, resultado, alineaciones,
// suplentes, sustituciones (con minuto), goles y tarjetas (amarilla/roja según el icono).
// Funciona en el navegador y en Node (recibe la librería pdf.js como parámetro).

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// "45'" → 45 ; "90'+3" → 90 (el tiempo añadido no suma minutos jugados) ; límite = duración
export function parseMinute(s, duration = 90) {
  const m = String(s).match(/(\d+)'?\s*(?:\+\s*(\d+))?/);
  if (!m) return null;
  return Math.min(Number(m[1]), duration);
}
// "LOPEZ VAZQUEZ, DIEGO" → "Diego Lopez Vazquez"
export function displayName(actaName) {
  const [ap, nom] = String(actaName).split(',').map(x => x.trim());
  const cap = t => t.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (a, b, c) => b + c.toUpperCase());
  return nom ? `${cap(nom)} ${cap(ap)}` : cap(ap);
}
const splitMin = s => { const m = String(s).match(/^(.*?)\s*\(([^)]*)\)\s*$/); return m ? { name: m[1].trim(), min: m[2] } : { name: String(s).trim(), min: null }; };

function mul(m, n) { return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]]; }

async function readPage(pdfjs, data) {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, isOffscreenCanvasSupported: false, disableFontFace: true, verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const width = page.getViewport({ scale: 1 }).width;
  const tc = await page.getTextContent();
  const texts = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ x: i.transform[4], y: i.transform[5], s: i.str.trim() }));
  // Iconos de tarjeta: color medio de cada imagen pequeña (amarillo / rojo)
  const ops = await page.getOperatorList();
  const O = pdfjs.OPS;
  let ctm = [1, 0, 0, 1, 0, 0]; const stack = []; const cards = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const f = ops.fnArray[i], a = ops.argsArray[i];
    if (f === O.save) stack.push(ctm);
    else if (f === O.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (f === O.transform) ctm = mul(ctm, a);
    else if (f === O.paintImageXObject) {
      const img = await new Promise(r => { try { page.objs.get(a[0], r); } catch { r(null); } });
      if (!img?.data || img.width > 12 || img.height > 14) continue; // solo iconos de tarjeta (8×11)
      const ch = img.data.length / (img.width * img.height);
      let R = 0, G = 0, n = 0;
      for (let p = 0; p < img.data.length; p += ch) { R += img.data[p]; G += img.data[p + 1]; n++; }
      cards.push({ x: ctm[4], y: ctm[5], color: G / n > 130 ? 'amarilla' : R / n > 150 ? 'roja' : 'desconocida' });
    }
  }
  await doc.destroy();
  return { width, texts, cards };
}

// Agrupa textos de una columna en filas (misma altura ± 3 pt)
function rows(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const out = [];
  for (const t of sorted) {
    const r = out.find(o => Math.abs(o.y - t.y) <= 3);
    if (r) r.items.push(t); else out.push({ y: t.y, items: [t] });
  }
  return out.map(r => ({ y: r.y, text: r.items.sort((a, b) => a.x - b.x).map(i => i.s).join(' ').replace(/\s+/g, ' ').trim() }));
}

function parseSide(texts, cards, xMin, xMax) {
  const col = texts.filter(t => t.x >= xMin && t.x < xMax);
  const head = name => col.find(t => norm(t.s) === name)?.y;
  const yTit = head('TITULARES'), ySup = head('SUPLENTES'), yCT = head('CUERPO TECNICO'), ySus = head('SUSTITUCIONES'), yTar = head('TARJETAS');
  const between = (hi, lo) => rows(col.filter(t => t.y < hi - 2 && t.y > (lo ?? -1) + 2));
  const num = r => { const m = r.text.match(/^(\d{1,3})\s+(.+)$/); return m ? { dorsal: Number(m[1]), name: m[2].trim() } : null; };
  const starters = yTit ? between(yTit, ySup).map(num).filter(Boolean) : [];
  const subsBench = ySup ? between(ySup, yCT ?? ySus ?? yTar).map(num).filter(Boolean) : [];
  const subs = [];
  if (ySus) {
    const lines = between(ySus, yTar).map(num).filter(Boolean).map(x => ({ ...x, ...splitMin(x.name) }));
    // Las sustituciones van por parejas: entra (sin minuto) · sale (con minuto)
    for (let i = 0; i + 1 < lines.length; i += 2) {
      const [a, b] = lines[i].min ? [lines[i + 1], lines[i]] : [lines[i], lines[i + 1]];
      subs.push({ in: a.name, inDorsal: a.dorsal, out: b.name, outDorsal: b.dorsal, minute: b.min || a.min });
    }
  }
  const cardsList = [];
  if (yTar) {
    for (const r of between(yTar, null)) {
      const { name, min } = splitMin(r.text);
      if (!min) continue;
      const icons = cards.filter(c => c.x >= xMin && c.x < xMax && Math.abs(c.y + 5 - r.y) <= 7).map(c => c.color);
      cardsList.push({ name, minute: min, icons, kind: icons.includes('roja') && icons.includes('amarilla') ? 'doble_amarilla' : icons.includes('roja') ? 'roja' : icons.includes('amarilla') ? 'amarilla' : 'desconocida' });
    }
  }
  return { starters, bench: subsBench, subs, cards: cardsList };
}

export async function parseActa(pdfjs, data, { clubName = 'Sporting Cambre', duration = 90 } = {}) {
  const { width, texts, cards } = await readPage(pdfjs, data);
  const all = rows(texts);
  const find = re => all.map(r => r.text.match(re)).find(Boolean);
  if (!find(/Ficha del Partido/i)) throw new Error('El PDF no parece una «Ficha del Partido» de la federación.');
  const L = width * 0.38, R = width * 0.63;
  const fecha = find(/Fecha:\s*(\d{2})-(\d{2})-(\d{4})/);
  const jornada = find(/Jornada\s+(\S+)/);
  const comp = all.find(r => /Jornada/.test(r.text))?.text.replace(/Jornada.*$/, '').trim() || null;
  const temp = find(/Temporada\s+(\d{4})\s*-\s*(\d{4})/);
  const hora = find(/Hora:\s*(\d{1,2}:\d{2})/);
  // Equipos: la fila justo debajo de la fecha, a izquierda y derecha
  const yFecha = texts.find(t => /^Fecha:?$/.test(t.s))?.y ?? 0;
  const teamRow = texts.filter(t => t.y < yFecha - 5 && t.y > yFecha - 40);
  const home = teamRow.filter(t => t.x < L).map(t => t.s).join(' ').trim();
  const away = teamRow.filter(t => t.x >= R).map(t => t.s).join(' ').trim();
  const score = rows(texts.filter(t => t.x >= L && t.x < R && Math.abs(t.y - (teamRow[0]?.y ?? 0)) < 40)).map(r => r.text.match(/^(\d+)\s*-\s*(\d+)$/)).find(Boolean);
  const goals = rows(texts.filter(t => t.x >= L - 20 && t.x < R)).map(r => r.text.match(/^(\d+)\s*-\s*(\d+)\s+(.+?)\s*\(([^)]*)\)/)).filter(Boolean)
    .map(m => ({ home: +m[1], away: +m[2], name: m[3].trim(), minute: m[4] }));
  const key = norm(clubName).split(' ').pop();
  const ourSide = norm(home).includes(key) ? 'local' : norm(away).includes(key) ? 'visitante' : null;
  if (!ourSide) throw new Error(`No se encuentra a «${clubName}» en el acta (equipos: ${home} / ${away}).`);
  const sideData = ourSide === 'local' ? parseSide(texts, cards, 0, L) : parseSide(texts, cards, R, width + 1);
  // Goles de nuestro equipo: los que hacen subir nuestro marcador
  let prev = { home: 0, away: 0 };
  const ourGoals = [];
  for (const g of goals) { const ours = ourSide === 'local' ? g.home > prev.home : g.away > prev.away; if (ours) ourGoals.push(g); prev = g; }
  const gf = score ? +score[ourSide === 'local' ? 1 : 2] : null, gc = score ? +score[ourSide === 'local' ? 2 : 1] : null;

  // Minutos jugados por jugador
  const players = new Map();
  const add = (name, dorsal, starter) => players.set(norm(name), { name, dorsal, starter, in: starter ? 0 : null, out: null, goals: 0, yellow: 0, red: 0, notes: [] });
  sideData.starters.forEach(p => add(p.name, p.dorsal, true));
  sideData.bench.forEach(p => add(p.name, p.dorsal, false));
  for (const s of sideData.subs) {
    const m = parseMinute(s.minute, duration);
    const pin = players.get(norm(s.in)), pout = players.get(norm(s.out));
    if (pin) pin.in = m;
    if (pout) pout.out = m;
  }
  for (const c of sideData.cards) {
    const p = players.get(norm(c.name)); if (!p) continue;
    if (c.kind === 'amarilla') p.yellow++;
    else if (c.kind === 'doble_amarilla') { p.yellow++; p.red = 1; p.out = parseMinute(c.minute, duration); p.notes.push('Expulsado por doble amarilla'); }
    else if (c.kind === 'roja') { p.red = 1; p.out = parseMinute(c.minute, duration); p.notes.push('Expulsado'); }
    else p.notes.push(`Tarjeta sin identificar (${c.minute}): revisa el color`);
  }
  for (const g of ourGoals) { const p = players.get(norm(g.name)); if (p) p.goals++; }
  const list = [...players.values()].map(p => ({
    actaName: p.name, name: displayName(p.name), dorsal: p.dorsal, started: p.starter,
    minutes: p.in === null ? 0 : Math.max(0, (p.out ?? duration) - p.in), goals: p.goals, yellow: p.yellow, red: p.red, notes: p.notes,
  }));
  return {
    competition: comp, matchday: jornada?.[1] || null,
    date: fecha ? `${fecha[3]}-${fecha[2]}-${fecha[1]}` : null, time: hora?.[1] || null,
    season: temp ? `${temp[1]}/${temp[2]}` : null,
    home, away, home_away: ourSide, opponent: ourSide === 'local' ? away : home,
    goals_for: gf, goals_against: gc, players: list,
    goalsUnmatched: ourGoals.filter(g => !players.has(norm(g.name))).map(g => g.name),
  };
}

// Filas en el mismo formato que la importación CSV/Excel
export function actaToRows(a) {
  return a.players.map(p => ({
    fecha: a.date, rival: a.opponent, competicion: a.competition, jornada: a.matchday, temporada: a.season,
    local_visitante: a.home_away, goles_favor: a.goals_for, goles_contra: a.goals_against,
    jugador: p.name, titular: p.started ? 'si' : 'no', minutos: p.minutes, goles: p.goals, asistencias: '', amarillas: p.yellow, rojas: p.red,
  }));
}

// Carga pdf.js en el navegador (sin worker externo: compatible con la versión publicada en Claude)
let pdfjsPromise = null;
export function loadPdfjs() {
  pdfjsPromise ||= Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.mjs')])
    .then(([pdfjs, worker]) => { globalThis.pdfjsWorker = worker; return pdfjs; });
  return pdfjsPromise;
}
export async function readActaFile(file, opts) {
  const pdfjs = await loadPdfjs();
  return parseActa(pdfjs, new Uint8Array(await file.arrayBuffer()), opts);
}

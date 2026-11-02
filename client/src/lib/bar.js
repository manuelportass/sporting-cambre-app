// Velocidad de la barra en sentadilla a partir de un vídeo (todo en el navegador; el vídeo no se guarda).
//  · Escala: el entrenador marca el diámetro del disco (45 cm en discos olímpicos) → metros por píxel.
//  · Seguimiento: se sigue el extremo de la barra (centro del disco) fotograma a fotograma por correlación de imagen.
//  · Se suaviza la trayectoria vertical, se deriva la velocidad y se detecta cada fase concéntrica
//    (del punto más bajo al más alto): velocidad media concéntrica (VMC), velocidad pico y recorrido.
export const BRZYCKI = (peso, reps) => peso / (1.0278 - 0.0278 * reps);
export const PCTS = [20, 40, 60, 80];
export const loadFor = (rm, pct) => Math.round(rm * pct / 100 * 2) / 2; // redondeo a 0,5 kg

const WMAX = 480;
const once = (el, ev) => new Promise(r => el.addEventListener(ev, r, { once: true }));
async function seek(video, t) { video.currentTime = t; await once(video, 'seeked'); }

export function frameSize(video) {
  const W = Math.min(WMAX, video.videoWidth);
  return { W, H: Math.round(W * video.videoHeight / video.videoWidth) };
}
function grayFrame(video, g, W, H) {
  g.drawImage(video, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data, out = new Uint8Array(W * H);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) out[j] = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
  return out;
}
// Búsqueda del parche más parecido (suma de diferencias absolutas) alrededor de (cx, cy), con ajuste subpíxel
function match(img, W, H, tpl, r, cx, cy, S) {
  let best = Infinity, bx = cx, by = cy;
  const sad = (x, y) => {
    let s = 0;
    for (let dy = -r; dy <= r; dy += 2) {
      const yy = y + dy; if (yy < 0 || yy >= H) { s += 255 * (2 * r + 1); continue; }
      for (let dx = -r; dx <= r; dx += 2) {
        const xx = x + dx; if (xx < 0 || xx >= W) { s += 255; continue; }
        s += Math.abs(img[yy * W + xx] - tpl[(dy + r) * (2 * r + 1) + (dx + r)]);
      }
    }
    return s;
  };
  const x0 = Math.round(cx), y0 = Math.round(cy);
  for (let y = y0 - S; y <= y0 + S; y++) for (let x = x0 - Math.round(S / 2); x <= x0 + Math.round(S / 2); x++) { const v = sad(x, y); if (v < best) { best = v; bx = x; by = y; } }
  const a = sad(bx, by - 1), c = sad(bx, by + 1), den = a - 2 * best + c;
  const sub = den > 0 ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * den))) : 0;
  return { x: bx, y: by + sub };
}
function patch(img, W, H, cx, cy, r) {
  const n = 2 * r + 1, t = new Uint8Array(n * n);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = Math.min(W - 1, Math.max(0, Math.round(cx) + dx)), y = Math.min(H - 1, Math.max(0, Math.round(cy) + dy));
    t[(dy + r) * n + (dx + r)] = img[y * W + x];
  }
  return t;
}

// Sigue el punto (px, py en coordenadas normalizadas 0–1). Devuelve { pts: [{ t, x, y }] (px), fps, W, H }
export async function trackBar(video, start, { onProgress, signal, plateRadiusPx } = {}) {
  const { W, H } = frameSize(video);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  const r = Math.max(8, Math.min(24, Math.round((plateRadiusPx || 40) * 0.35)));
  let cx = start.x * W, cy = start.y * H, tpl = null;
  const pts = [];
  const step = img => {
    if (!tpl) { tpl = patch(img, W, H, cx, cy, r); pts.push({ x: cx, y: cy }); return; }
    const m = match(img, W, H, tpl, r, cx, cy, Math.max(12, Math.round(r * 1.6)));
    cx = m.x; cy = m.y; pts.push({ x: cx, y: cy });
  };
  const dur = video.duration;
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    await seek(video, 0);
    video.muted = true; video.playbackRate = 0.25;
    await new Promise((resolve, reject) => {
      let last = -1;
      const cb = (now, meta) => {
        if (signal?.aborted) { video.pause(); reject(new Error('Cancelado')); return; }
        if (meta.mediaTime > last) { step(grayFrame(video, g, W, H)); pts[pts.length - 1].t = meta.mediaTime; last = meta.mediaTime; onProgress?.(Math.min(1, meta.mediaTime / dur)); }
        if (!video.ended) video.requestVideoFrameCallback(cb);
      };
      video.requestVideoFrameCallback(cb);
      video.addEventListener('ended', () => resolve(), { once: true });
      video.play().catch(reject);
    });
    video.playbackRate = 1;
  } else {
    for (let t = 0; t < dur; t += 1 / 30) {
      if (signal?.aborted) throw new Error('Cancelado');
      await seek(video, t); step(grayFrame(video, g, W, H)); pts[pts.length - 1].t = t; onProgress?.(t / dur);
    }
  }
  const dts = pts.slice(1).map((p, i) => p.t - pts[i].t).filter(x => x > 0).sort((a, b) => a - b);
  const md = dts[Math.floor(dts.length / 2)] || 1 / 30;
  const normal = dts.filter(x => x <= md * 1.6), mean = normal.length ? normal.reduce((a, x) => a + x, 0) / normal.length : md;
  const raw = 1 / mean, std = [24, 25, 30, 48, 50, 60, 90, 100, 120, 180, 240].find(f => Math.abs(f - raw) / f < 0.04);
  return { pts, fps: std || Math.round(raw), W, H };
}

// Análisis: altura (m, hacia arriba +), velocidad (m/s) y fases concéntricas
export function analyze(pts, mPerPx, timeScale = 1) {
  const n = pts.length;
  if (n < 10) return { error: 'El vídeo es demasiado corto.' };
  const t = pts.map(p => (p.t - pts[0].t) * timeScale);
  const h0 = pts.map(p => -(p.y - pts[0].y) * mPerPx);
  // Suavizado: media móvil de ~50 ms
  const dtm = (t[n - 1] - t[0]) / (n - 1), w = Math.max(1, Math.round(0.025 / dtm));
  const h = h0.map((_, i) => { let s = 0, k = 0; for (let j = Math.max(0, i - w); j <= Math.min(n - 1, i + w); j++) { s += h0[j]; k++; } return s / k; });
  const v = h.map((_, i) => { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); return (h[b] - h[a]) / ((t[b] - t[a]) || 1); });
  // Puntos de giro con histéresis (3 cm)
  const turns = []; let mode = null, iMax = 0, iMin = 0;
  for (let i = 1; i < n; i++) {
    if (mode !== 'down' && h[i] > h[iMax]) iMax = i;
    if (mode !== 'up' && h[i] < h[iMin]) iMin = i;
    if (mode !== 'down' && h[iMax] - h[i] > 0.03) { turns.push({ i: iMax, type: 'top' }); mode = 'down'; iMin = i; }
    else if (mode !== 'up' && h[i] - h[iMin] > 0.03) { turns.push({ i: iMin, type: 'bottom' }); mode = 'up'; iMax = i; }
  }
  if (mode === 'up') turns.push({ i: iMax, type: 'top' });
  const reps = [];
  for (let k = 0; k < turns.length - 1; k++) {
    const a = turns[k], b = turns[k + 1];
    if (a.type !== 'bottom' || b.type !== 'top') continue;
    if (h[b.i] - h[a.i] < 0.15) continue;
    // Inicio de la subida: último fotograma aún abajo (±2 mm); final: primer fotograma arriba (±2 mm). Excluye pausas.
    let st = a.i; while (st + 1 < b.i && h[st + 1] <= h[a.i] + 0.002) st++;
    let en = b.i; while (en - 1 > st && h[en - 1] >= h[b.i] - 0.002) en--;
    const rom = h[en] - h[st], dur = t[en] - t[st];
    if (dur <= 0) continue;
    let vp = 0; for (let i = st; i <= en; i++) vp = Math.max(vp, v[i]);
    reps.push({ start: st, end: en, rom, dur, mcv: rom / dur, vpeak: vp });
  }
  if (!reps.length) return { t, h, v, reps, error: 'No se ha detectado ninguna subida de la barra (mínimo 15 cm). Comprueba la escala y el punto de seguimiento.' };
  return { t, h, v, reps };
}

// Regresión lineal velocidad–carga
export function linfit(xs, ys) {
  const n = xs.length; if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  if (!sxx) return null;
  const slope = sxy / sxx, icpt = my - slope * mx;
  return { slope, icpt, r2: syy ? (sxy * sxy) / (sxx * syy) : 1 };
}

export async function drawAt(video, t, canvas) {
  await seek(video, t + 0.0005);
  const { W, H } = frameSize(video);
  canvas.width = W; canvas.height = H;
  canvas.getContext('2d').drawImage(video, 0, 0, W, H);
}

// Altura de salto a partir del TIEMPO DE VUELO medido en un vídeo (método de Bosco; h = g·t² / 8).
// Todo se procesa en el navegador: el vídeo no se sube al servidor.
//  1) Se recorren los fotogramas del vídeo y, en la zona de los pies (recuadro), se mide cuánto cambia cada
//     fotograma respecto a la posición inicial de pie (jugador quieto).
//  2) El vuelo es el tramo en el que los pies han desaparecido de esa zona: despegue = primer fotograma en el aire,
//     aterrizaje = primer fotograma de nuevo en contacto. Ambos se pueden corregir fotograma a fotograma.
export const G = 9.81;
export const heightCm = T => (G * T * T / 8) * 100;
// Error aproximado de la altura por ±1 fotograma
export const frameErrorCm = (T, fps) => (G * T / 4) * (1 / fps) * 100;

const SW = 72; // ancho de la muestra de la zona de los pies (px)

function sampler(video, roi) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const rx = roi.x * vw, ry = roi.y * vh, rw = Math.max(4, roi.w * vw), rh = Math.max(4, roi.h * vh);
  const sh = Math.max(8, Math.min(72, Math.round(SW * rh / rw)));
  const c = document.createElement('canvas'); c.width = SW; c.height = sh;
  const g = c.getContext('2d', { willReadFrequently: true });
  return () => {
    g.drawImage(video, rx, ry, rw, rh, 0, 0, SW, sh);
    const px = g.getImageData(0, 0, SW, sh).data, out = new Uint8Array(SW * sh);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) out[j] = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
    return out;
  };
}
const once = (el, ev) => new Promise(r => el.addEventListener(ev, r, { once: true }));

// iPhone/iPad (Safari): un vídeo no muestra imagen ni se deja reproducir hasta que se reproduce una vez con un toque
// del usuario (sobre todo con el ahorro de batería). Se llama DENTRO del toque (sin esperas antes) para «desbloquearlo».
export function primeVideo(video) {
  if (!video || video.__primed) return;
  video.muted = true; video.playsInline = true;
  try {
    const p = video.play();
    if (p && p.then) p.then(() => { video.__primed = true; video.pause(); }).catch(() => {});
  } catch { /* nada */ }
}
// Reproduce y devuelve true si el navegador lo permite
async function tryPlay(video) { try { await video.play(); return true; } catch { return false; } }
// Salto a un instante del vídeo (con tiempo máximo, por si el navegador no avisa al llegar)
async function seek(video, t) {
  if (Math.abs(video.currentTime - t) < 1e-4 && video.readyState >= 2) return;
  await new Promise(r => { const k = setTimeout(r, 3000); video.addEventListener('seeked', () => { clearTimeout(k); r(); }, { once: true }); video.currentTime = t; });
}

// ¿La imagen leída está vacía? (negra y lisa: el navegador no deja leer los píxeles de este vídeo, p. ej. HDR en iPhone)
export function isBlank(px) {
  let mn = 255, mx = 0, sum = 0;
  for (let i = 0; i < px.length; i += 3) { const v = px[i]; if (v < mn) mn = v; if (v > mx) mx = v; sum += v; }
  return mx - mn < 4 && sum / Math.ceil(px.length / 3) < 12;
}
export const NO_PIXELS = 'NO_PIXELS';
// Comprobación rápida antes de analizar: lee un fotograma de la mitad del vídeo
export async function canReadPixels(video) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 36;
  const g = c.getContext('2d', { willReadFrequently: true });
  for (const f of [0.5, 0.2, 0.8]) {
    await seek(video, video.duration * f);
    g.drawImage(video, 0, 0, 64, 36);
    const d = g.getImageData(0, 0, 64, 36).data, gray = new Uint8Array(d.length / 4);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) gray[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    if (!isBlank(gray)) return true;
  }
  return false;
}

// Recorre todos los fotogramas. Devuelve { frames: [{ t, d }], fps }
export async function extractFrames(video, roi, { onProgress, fallbackFps = 60, signal, fast = true } = {}) {
  const grab = sampler(video, roi);
  const frames = [];
  const dur = video.duration;
  let played = false, trueFps = null;
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    await seek(video, 0);
    // 1) Primeros fotogramas despacio, para medir los fps reales del vídeo
    // 2) El resto, deprisa: basta para encontrar los vuelos; luego se afina fotograma a fotograma (densify)
    video.muted = true; video.playbackRate = fast ? 0.25 : 0.3;
    played = await tryPlay(video);
    if (played) await new Promise((resolve, reject) => {
      let last = -1, measured = !fast;
      const cb = (now, meta) => {
        if (signal?.aborted) { video.pause(); reject(new Error('Cancelado')); return; }
        if (meta.mediaTime > last) { frames.push({ t: meta.mediaTime, d: grab() }); last = meta.mediaTime; onProgress?.(Math.min(1, meta.mediaTime / dur)); }
        if (!measured && (meta.mediaTime > 0.5 || frames.length > 40)) {
          measured = true;
          trueFps = fpsOf(frames);
          video.playbackRate = 4; // suficiente para encontrar los vuelos; luego se afinan despacio
        }
        if (!video.ended) video.requestVideoFrameCallback(cb);
      };
      video.requestVideoFrameCallback(cb);
      video.addEventListener('ended', () => resolve(), { once: true });
    });
    video.playbackRate = 1;
  }
  if (!played) {
    // Navegadores sin requestVideoFrameCallback: avance fotograma a fotograma por tiempo
    const step = 1 / fallbackFps;
    for (let t = 0; t < dur - step / 2; t += step) {
      if (signal?.aborted) throw new Error('Cancelado');
      await seek(video, t + step / 2); // mitad del fotograma: evita caer justo en el cambio entre dos
      frames.push({ t, d: grab() }); onProgress?.(t / dur);
    }
  }
  if (frames.length && frames.filter(f => isBlank(f.d)).length > frames.length * 0.9) throw new Error(NO_PIXELS);
  if (trueFps) return { frames, fps: trueFps, dropped: 0, coarse: true };
  const dts = frames.slice(1).map((f, i) => f.t - frames[i].t).filter(x => x > 0).sort((a, b) => a - b);
  const md = dts[Math.floor(dts.length / 2)] || 1 / fallbackFps;
  const dropped = dts.filter(x => x > md * 1.6).length;
  // fps: media de los intervalos normales (las marcas de tiempo pueden venir redondeadas al milisegundo)
  const normal = dts.filter(x => x <= md * 1.6);
  const mean = normal.length ? normal.reduce((a, x) => a + x, 0) / normal.length : md;
  const raw = 1 / mean, std = [24, 25, 30, 48, 50, 60, 90, 100, 120, 180, 240, 480, 960].find(f => Math.abs(f - raw) / f < 0.04);
  return { frames, fps: std || Math.round(raw), dropped };
}

// fps de una serie de fotogramas consecutivos (ajustado a los valores estándar)
function fpsOf(frames) {
  const dts = frames.slice(1).map((f, i) => f.t - frames[i].t).filter(x => x > 0).sort((a, b) => a - b);
  const md = dts[Math.floor(dts.length / 2)] || 1 / 30;
  const normal = dts.filter(x => x <= md * 1.6), mean = normal.length ? normal.reduce((a, x) => a + x, 0) / normal.length : md;
  // valor estándar más cercano (incluidos 29,97 / 59,94 / 119,88 de los móviles)
  const raw = 1 / mean, cand = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 100, 119.88, 120, 180, 239.76, 240, 480, 960];
  const best = cand.reduce((b, f) => (Math.abs(f - raw) < Math.abs(b - raw) ? f : b), cand[0]);
  return Math.abs(best - raw) / best < 0.04 ? best : Math.round(raw);
}

// Completa los fotogramas alrededor del despegue y del aterrizaje (por si el navegador se saltó alguno al reproducir)
export async function densify(video, roi, frames, around, fps) {
  const grab = sampler(video, roi), dt = 1 / fps;
  // Ventanas: del fotograma anterior a cada cambio al siguiente (con margen); las que se solapan se unen
  let wins = around.map(i => [Math.max(0, frames[Math.max(0, i - 1)].t - 3 * dt), frames[Math.min(frames.length - 1, i)].t + 3 * dt]).sort((x, y) => x[0] - y[0]);
  wins = wins.reduce((o, w) => { const l = o[o.length - 1]; if (l && w[0] <= l[1] + 0.25) l[1] = Math.max(l[1], w[1]); else o.push([...w]); return o; }, []);
  const add = [];
  for (const [a, b] of wins) {
    // Se reproduce despacio solo ese tramo, leyendo cada fotograma (como el análisis completo a cámara lenta)
    let ok = false;
    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
      await seek(video, a); video.playbackRate = 0.25;
      ok = await tryPlay(video);
      if (ok) await new Promise(resolve => {
        let last = -1;
        const stop = () => { video.pause(); resolve(); };
        const cb = (now, meta) => {
          if (meta.mediaTime > last) { add.push({ t: meta.mediaTime, d: grab(), fine: true }); last = meta.mediaTime; }
          if (meta.mediaTime >= b || video.ended) stop(); else video.requestVideoFrameCallback(cb);
        };
        video.requestVideoFrameCallback(cb);
        video.addEventListener('ended', stop, { once: true });
      });
      video.playbackRate = 1;
    }
    if (!ok) for (let t = a; t <= b; t += dt) { await seek(video, t + dt / 2); add.push({ t, d: grab(), fine: true }); }
  }
  // Dentro de cada ventana solo cuentan los fotogramas leídos uno a uno
  const keep = frames.filter(f => !wins.some(([a, b]) => f.t >= a - dt / 2 && f.t <= b + dt / 2));
  const all = [...keep, ...add].sort((x, y) => x.t - y.t), out = [];
  for (const f of all) if (!out.length || f.t - out[out.length - 1].t > dt * 0.4) out.push(f);
  return out;
}

// Detección automática del vuelo
export function detectFlight(frames, scale = 1) {
  const n = frames.length;
  if (n < 10) return { error: 'El vídeo es demasiado corto.' };
  const k = Math.max(3, Math.round(n * 0.06));
  const len = frames[0].d.length, base = new Float32Array(len);
  for (let i = 0; i < k; i++) for (let j = 0; j < len; j++) base[j] += frames[i].d[j] / k;
  const diff = frames.map(f => { let s = 0; for (let j = 0; j < len; j++) s += Math.abs(f.d[j] - base[j]); return s / len; });
  const sorted = [...diff].sort((a, b) => a - b), pct = q => sorted[Math.min(n - 1, Math.floor(q * n))];
  const lo = pct(0.2), hi = pct(0.98);
  if (hi - lo < 4) return { diff, error: 'No se detecta movimiento en la zona de los pies. Ajusta el recuadro para que cubra solo las zapatillas apoyadas en el suelo.' };
  const thr = lo + 0.45 * (hi - lo);
  const segs = [];
  for (let i = k; i < n; i++) {
    if (diff[i] > thr && (i === 0 || diff[i - 1] <= thr)) {
      let j = i; while (j + 1 < n && diff[j + 1] > thr) j++;
      if (j + 1 < n) segs.push({ takeoff: i, landing: j + 1, T: (frames[j + 1].t - frames[i].t) * scale });
      i = j;
    }
  }
  const ok = segs.filter(s => s.T >= 0.12 && s.T <= 1.2).sort((a, b) => b.T - a.T);
  if (!ok.length) return { diff, thr, error: 'No se ha encontrado un vuelo claro. Comprueba que se ven los pies antes, durante y después del salto, o marca los fotogramas a mano.' };
  return { diff, thr, takeoff: ok[0].takeoff, landing: ok[0].landing, others: ok.length - 1 };
}

// Muestra el fotograma de tiempo t en un canvas
export async function drawFrameAt(video, t, canvas, roi) {
  await seek(video, t + 0.0005);
  const vw = video.videoWidth, vh = video.videoHeight;
  canvas.width = Math.min(480, vw); canvas.height = Math.round(canvas.width * vh / vw);
  const g = canvas.getContext('2d');
  g.drawImage(video, 0, 0, canvas.width, canvas.height);
  if (roi) { g.strokeStyle = '#e30613'; g.lineWidth = 2; g.setLineDash([6, 4]); g.strokeRect(roi.x * canvas.width, roi.y * canvas.height, roi.w * canvas.width, roi.h * canvas.height); }
}

// ---------- Protocolo de 3 saltos en un solo vídeo (≈ 5 s de descanso entre saltos) ----------
// La referencia es la imagen «de pie» más habitual en el vídeo (mediana de cada píxel), porque el jugador
// pasa casi todo el tiempo apoyado. Se buscan los tramos en el aire y se devuelven los n más claros en orden.
export function detectFlights(frames, scale = 1, n = 3) {
  const N = frames.length;
  if (N < 20) return { error: 'El vídeo es demasiado corto.', flights: [] };
  const len = frames[0].d.length, base = new Float32Array(len);
  const step = Math.max(1, Math.floor(N / 150)), sample = [];
  for (let i = 0; i < N; i += step) sample.push(frames[i].d);
  const col = new Array(sample.length);
  for (let j = 0; j < len; j++) { for (let i = 0; i < sample.length; i++) col[i] = sample[i][j]; col.sort((a, b) => a - b); base[j] = col[col.length >> 1]; }
  const diff = frames.map(f => { let s = 0; for (let j = 0; j < len; j++) s += Math.abs(f.d[j] - base[j]); return s / len; });
  // Percentiles ponderados por el tiempo que representa cada fotograma (hay tramos leídos deprisa y tramos fotograma a fotograma)
  const w = frames.map((f, i) => ((frames[Math.min(N - 1, i + 1)].t - frames[Math.max(0, i - 1)].t) / 2) || 1e-3);
  const ord = diff.map((d, i) => [d, w[i]]).sort((x, y) => x[0] - y[0]), W = w.reduce((x, y) => x + y, 0);
  const pct = q => { let acc = 0; for (const [d, ww] of ord) { acc += ww; if (acc >= q * W) return d; } return ord[ord.length - 1][0]; };
  const lo = pct(0.3), hi = pct(0.99);
  if (hi - lo < 4) return { diff, flights: [], error: 'No se detecta movimiento en la zona de los pies. Ajusta el recuadro para que cubra solo las zapatillas apoyadas en el suelo.' };
  const thr = lo + 0.45 * (hi - lo);
  const segs = [];
  for (let i = 1; i < N; i++) {
    if (diff[i] > thr && diff[i - 1] <= thr) {
      let j = i; while (j + 1 < N && diff[j + 1] > thr) j++;
      if (j + 1 < N) segs.push({ takeoff: i, landing: j + 1, T: (frames[j + 1].t - frames[i].t) * scale, peak: Math.max(...diff.slice(i, j + 1)) });
      i = j;
    }
  }
  // Vuelos plausibles de CMJ; si dos tramos están muy juntos (rebote, recolocación) se queda el más largo
  let ok = segs.filter(s => s.T >= 0.12 && s.T <= 1.0);
  ok = ok.filter(s => !ok.some(o => o !== s && Math.abs(frames[o.takeoff].t - frames[s.takeoff].t) < 1.2 && o.T > s.T));
  const flights = ok.sort((a, b) => b.T - a.T).slice(0, n).sort((a, b) => a.takeoff - b.takeoff);
  const error = !flights.length ? 'No se ha encontrado ningún vuelo claro. Comprueba que se ven los pies en todo el vídeo.' :
    flights.length < n ? `Solo se han encontrado ${flights.length} de ${n} saltos. Marca el resto a mano o revisa el recuadro.` : null;
  return { diff, thr, flights, error, extra: Math.max(0, ok.length - n) };
}

// Vídeos grabados en el navegador (webm) a veces no indican su duración: se fuerza su cálculo
export async function fixDuration(video) {
  if (Number.isFinite(video.duration) && video.duration > 0) return;
  await new Promise(res => {
    const on = () => { if (Number.isFinite(video.duration)) { video.removeEventListener('durationchange', on); res(); } };
    video.addEventListener('durationchange', on);
    video.currentTime = 1e7;
    setTimeout(res, 4000);
  });
  video.currentTime = 0;
}

// ---------- Revisión manual ----------
// fps reales del vídeo: se reproducen unos fotogramas despacio y se miden sus tiempos
export async function measureFps(video) {
  if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return null;
  await seek(video, Math.min(0.2, video.duration / 4));
  video.muted = true; video.playbackRate = 0.25;
  if (!(await tryPlay(video))) { video.playbackRate = 1; return null; }
  const ts = [];
  await new Promise(resolve => {
    const t0 = setTimeout(resolve, 4000);
    const cb = (now, meta) => { ts.push({ t: meta.mediaTime }); if (ts.length >= 25 || video.ended) { clearTimeout(t0); resolve(); } else video.requestVideoFrameCallback(cb); };
    video.requestVideoFrameCallback(cb);
  });
  video.pause(); video.playbackRate = 1;
  return ts.length > 5 ? fpsOf(ts) : null;
}
// Dibuja el fotograma k (k / fps) grande; con zoom, alrededor del recuadro de los pies
export async function drawFrameBig(video, k, fps, canvas, roi, zoom, aspect = 16 / 9) {
  await seek(video, (k + 0.3) / fps);
  const vw = video.videoWidth, vh = video.videoHeight;
  let sx = 0, sy = 0, sw = vw, sh = vh;
  if (zoom && roi) {
    const cx = (roi.x + roi.w / 2) * vw, cy = (roi.y + roi.h / 2) * vh;
    sw = Math.min(vw, Math.max(roi.w * vw * 1.6, vw / 2.5)); sh = Math.min(vh, sw / aspect); sw = Math.min(vw, sh * aspect);
    sx = Math.max(0, Math.min(vw - sw, cx - sw / 2)); sy = Math.max(0, Math.min(vh - sh, cy - sh * 0.6));
  }
  canvas.width = Math.min(1280, Math.round(sw * (zoom ? 2 : 1))); canvas.height = Math.round(canvas.width * sh / sw);
  const g = canvas.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return { sx, sy, sw, sh };
}
// Recuadro de los pies automático con el detector de postura (tobillos, talones y puntas)
export async function autoFeetRoi(video, detect) {
  await seek(video, Math.min(0.3, video.duration / 3));
  const l = await detect(video);
  if (!l) return null;
  const pts = [27, 28, 29, 30, 31, 32].map(i => l[i]).filter(p => p && (p.visibility ?? 1) > 0.3);
  if (pts.length < 4) return null;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = Math.max(0.12, (x1 - x0) * 1.5), h = Math.max(0.08, (y1 - y0) * 1.7 + 0.04);
  const cx = (x0 + x1) / 2, top = y0 - (y1 - y0) * 0.35;
  const r = { x: Math.max(0, cx - w / 2), y: Math.max(0, top), w: Math.min(1, w), h: Math.min(1 - Math.max(0, top), h) };
  return r.w > 0.03 && r.h > 0.02 ? r : null;
}

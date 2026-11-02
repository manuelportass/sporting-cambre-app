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
async function seek(video, t) { video.currentTime = t; await once(video, 'seeked'); }

// Recorre todos los fotogramas. Devuelve { frames: [{ t, d }], fps }
export async function extractFrames(video, roi, { onProgress, fallbackFps = 30, signal } = {}) {
  const grab = sampler(video, roi);
  const frames = [];
  const dur = video.duration;
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    await seek(video, 0);
    video.muted = true; video.playbackRate = 0.3;
    await new Promise((resolve, reject) => {
      let last = -1;
      const cb = (now, meta) => {
        if (signal?.aborted) { video.pause(); reject(new Error('Cancelado')); return; }
        if (meta.mediaTime > last) { frames.push({ t: meta.mediaTime, d: grab() }); last = meta.mediaTime; onProgress?.(Math.min(1, meta.mediaTime / dur)); }
        if (!video.ended) video.requestVideoFrameCallback(cb);
      };
      video.requestVideoFrameCallback(cb);
      video.addEventListener('ended', () => resolve(), { once: true });
      video.play().catch(reject);
    });
    video.playbackRate = 1;
  } else {
    // Navegadores sin requestVideoFrameCallback: avance fotograma a fotograma por tiempo
    const step = 1 / fallbackFps;
    for (let t = 0; t < dur; t += step) {
      if (signal?.aborted) throw new Error('Cancelado');
      await seek(video, t);
      frames.push({ t, d: grab() }); onProgress?.(t / dur);
    }
  }
  const dts = frames.slice(1).map((f, i) => f.t - frames[i].t).filter(x => x > 0).sort((a, b) => a - b);
  const md = dts[Math.floor(dts.length / 2)] || 1 / fallbackFps;
  const dropped = dts.filter(x => x > md * 1.6).length;
  // fps: media de los intervalos normales (las marcas de tiempo pueden venir redondeadas al milisegundo)
  const normal = dts.filter(x => x <= md * 1.6);
  const mean = normal.length ? normal.reduce((a, x) => a + x, 0) / normal.length : md;
  const raw = 1 / mean, std = [24, 25, 30, 48, 50, 60, 90, 100, 120, 180, 240, 480, 960].find(f => Math.abs(f - raw) / f < 0.04);
  return { frames, fps: std || Math.round(raw), dropped };
}

// Completa los fotogramas alrededor del despegue y del aterrizaje (por si el navegador se saltó alguno al reproducir)
export async function densify(video, roi, frames, around, fps) {
  const grab = sampler(video, roi), dt = 1 / fps, add = [];
  for (const i of around) {
    const a = frames[Math.max(0, i - 3)].t, b = frames[Math.min(frames.length - 1, i + 2)].t;
    for (let t = a; t <= b + dt / 2; t += dt) { await seek(video, t + dt * 0.3); add.push({ t, d: grab() }); }
  }
  const all = [...frames, ...add].sort((x, y) => x.t - y.t), out = [];
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

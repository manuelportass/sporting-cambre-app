/* Conversión de vídeo en el propio dispositivo con ffmpeg.wasm (@ffmpeg/core 0.12.10, GPL-2.0-or-later).
   Se usa cuando el navegador no puede abrir el vídeo (p. ej. HEVC/H.265 de la cámara lenta del iPhone).
   Pasa el vídeo a H.264, con menos resolución y SIN cambiar los tiempos de cada fotograma (los fps se conservan).
   El vídeo no sale del dispositivo. */
let core = null;
async function load(base) {
  if (core) return core;
  importScripts(base + 'ffmpeg-core.js');
  const parts = await Promise.all(['ffmpeg-core-1.wasm', 'ffmpeg-core-2.wasm'].map(async f => {
    const r = await fetch(base + f); if (!r.ok) throw new Error('No se ha podido descargar el conversor (' + r.status + ').');
    return new Uint8Array(await r.arrayBuffer());
  }));
  const wasm = new Uint8Array(parts[0].length + parts[1].length); wasm.set(parts[0]); wasm.set(parts[1], parts[0].length);
  core = await self.createFFmpegCore({
    wasmBinary: wasm.buffer,
    mainScriptUrlOrBlob: base + 'ffmpeg-core.js#' + btoa(JSON.stringify({ wasmURL: base + 'ffmpeg-core.wasm', workerURL: base + 'ffmpeg-core.worker.js' })),
  });
  return core;
}
self.onmessage = async e => {
  const { base, name, data } = e.data;
  try {
    self.postMessage({ type: 'stage', stage: 'load' });
    const c = await load(base);
    let dur = 0;
    c.setLogger(({ message }) => { const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(message || ''); if (m) dur = +m[1] * 3600 + +m[2] * 60 + +m[3]; });
    c.setProgress(({ time }) => { if (dur > 0 && time > 0) self.postMessage({ type: 'progress', p: Math.min(1, time / 1e6 / dur) }); });
    const ext = (/\.[a-z0-9]+$/i.exec(name || '') || ['.mov'])[0].toLowerCase();
    c.FS.writeFile('in' + ext, new Uint8Array(data));
    self.postMessage({ type: 'stage', stage: 'run' });
    c.exec('-i', 'in' + ext, '-an', '-vf', 'scale=min(640\\,iw):-2', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-g', '12', '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough', '-movflags', '+faststart', 'out.mp4');
    const ret = c.ret; c.reset();
    if (ret !== 0) throw new Error('No se ha podido convertir este vídeo.');
    const out = c.FS.readFile('out.mp4');
    try { c.FS.unlink('in' + ext); c.FS.unlink('out.mp4'); } catch (_) { /* nada */ }
    self.postMessage({ type: 'done', data: out.buffer }, [out.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: (err && err.message) || String(err) });
  }
};

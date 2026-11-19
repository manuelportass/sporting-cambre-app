// Vídeos que el navegador no puede abrir (p. ej. HEVC/H.265 de la cámara lenta del iPhone en Chrome o Windows):
// se convierten en el propio dispositivo con ffmpeg.wasm (archivos en /ffmpeg/, solo se descargan si hacen falta).
import { useEffect, useMemo, useRef, useState } from 'react';

const base = () => (window.__scpfDemo ? new URL('ffmpeg/', location.href.split('#')[0].replace(/[^/]*$/, '')).href : '/ffmpeg/');

export function convertVideo(file, onProgress) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker(base() + 'convert-worker.js'); } catch (e) { reject(new Error('Este navegador no permite convertir vídeos.')); return; }
    w.onmessage = e => {
      const m = e.data;
      if (m.type === 'stage') onProgress?.({ stage: m.stage, p: 0 });
      else if (m.type === 'progress') onProgress?.({ stage: 'run', p: m.p });
      else if (m.type === 'done') { w.terminate(); resolve(new File([m.data], file.name.replace(/\.[^.]+$/, '') + '-convertido.mp4', { type: 'video/mp4' })); }
      else if (m.type === 'error') { w.terminate(); reject(new Error(m.message)); }
    };
    w.onerror = () => { w.terminate(); reject(new Error('No se ha podido cargar el conversor de vídeo.')); };
    file.arrayBuffer().then(buf => w.postMessage({ base: base(), name: file.name, data: buf }, [buf]), reject);
  });
}

// Fuente de vídeo con conversión automática si el navegador no la puede abrir
export function usePlayableVideo(file) {
  const [cur, setCur] = useState(file);
  const [state, setState] = useState('ok'); // ok | bad | converting | failed
  const [prog, setProg] = useState({ stage: 'load', p: 0 });
  const [msg, setMsg] = useState('');
  const url = useMemo(() => URL.createObjectURL(cur), [cur]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const busy = useRef(false);
  const convert = async () => {
    if (busy.current) return; busy.current = true;
    setState('converting'); setProg({ stage: 'load', p: 0 });
    try { const f = await convertVideo(file, setProg); setCur(f); setState('ok'); }
    catch (e) { setMsg(e.message); setState('failed'); }
    finally { busy.current = false; }
  };
  // El vídeo no se puede abrir: se convierte automáticamente
  const fail = () => { if (cur !== file || state !== 'ok') { if (cur !== file) { setMsg('Ni siquiera convertido se puede abrir este vídeo.'); setState('failed'); } return; } setState('bad'); convert(); };
  // Algunos navegadores abren el archivo pero no la imagen (solo el audio): también se convierte
  const checkMeta = v => { if (!v.videoWidth) { fail(); return false; } return true; };
  return { url, file: cur, state, prog, msg, fail, checkMeta, convert, converted: cur !== file };
}

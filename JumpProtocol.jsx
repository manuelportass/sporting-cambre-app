// Protocolo de salto: 3 CMJ casi consecutivos (≈ 5 s de descanso) en UN solo vídeo.
// La app detecta los 3 vuelos, mide su duración (tiempo de vuelo) y calcula la altura (h = g·t²/8).
// El preparador puede corregir cada despegue / aterrizaje fotograma a fotograma o escribir la duración.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { autoFeetRoi, canReadPixels, NO_PIXELS, primeVideo, densify, detectFlights, drawFrameAt, drawFrameBig, extractFrames, fixDuration, frameErrorCm, heightCm, measureFps } from '../lib/jump';
import { detectPose } from '../lib/pose';
import { fmtNum } from '../lib/format';
import { usePlayableVideo } from '../lib/convert';
import VideoConvert from './VideoConvert';
import { ErrorBox, Field } from './ui';

const DEF_ROI = { x: 0.2, y: 0.76, w: 0.6, h: 0.2 };
const COLORS = ['#e30613', '#2a78d6', '#2e9e4f', '#ef7d32'];
export const REST_S = 5;

// ---------- Grabación guiada dentro de la app (pitidos y cuenta atrás) ----------
function beep(ctx, f = 880, d = 0.15) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
  g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d); o.start(); o.stop(ctx.currentTime + d + 0.02);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function GuidedRecorder({ n = 3, rest = REST_S, onVideo, onCancel }) {
  const vid = useRef(null), stream = useRef(null), recr = useRef(null), chunks = useRef([]), stop = useRef(false);
  const [state, setState] = useState('init'); // init | ready | rec | error
  const [msg, setMsg] = useState('');
  const [big, setBig] = useState('');
  const [fps, setFps] = useState(null);
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'environment', frameRate: { ideal: 120 }, width: { ideal: 1280 }, height: { ideal: 720 } } });
        if (off) { s.getTracks().forEach(t => t.stop()); return; }
        stream.current = s; vid.current.srcObject = s; await vid.current.play().catch(() => {});
        setFps(Math.round(s.getVideoTracks()[0].getSettings().frameRate || 30)); setState('ready');
      } catch { setState('error'); }
    })();
    return () => { off = true; stop.current = true; stream.current?.getTracks().forEach(t => t.stop()); };
  }, []);
  const start = async () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const mime = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => window.MediaRecorder?.isTypeSupported?.(m)) || '';
    const r = new MediaRecorder(stream.current, mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined);
    chunks.current = []; r.ondataavailable = e => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      if (stop.current) return;
      const type = r.mimeType || 'video/webm';
      onVideo(new File(chunks.current, `cmj-3-saltos.${type.includes('mp4') ? 'mp4' : 'webm'}`, { type }));
    };
    recr.current = r; r.start(); setState('rec');
    setMsg('Quieto, manos en la cadera'); setBig('');
    await sleep(1500);
    for (let k = 1; k <= n; k++) {
      for (let c = 3; c >= 1; c--) { if (stop.current) return; setBig(String(c)); beep(ctx, 660, 0.1); await sleep(k === 1 ? 1000 : Math.max(600, (rest * 1000 - 1600) / 3)); }
      if (stop.current) return;
      setBig('¡Salta!'); setMsg(`Salto ${k} de ${n}`); beep(ctx, 1200, 0.35);
      await sleep(1600);
      if (k < n) { setBig(''); setMsg(`Descanso · salto ${k + 1} en ${rest} s`); }
    }
    setBig(''); setMsg('Quieto…'); await sleep(1800);
    if (!stop.current) { beep(ctx, 440, 0.3); r.stop(); setMsg('Grabación terminada'); }
  };
  return <div className="card jl-an gr">
    <div className="row between"><h3 style={{ margin: 0 }}>Grabación guiada · {n} saltos</h3><button className="btn sm ghost" onClick={() => { stop.current = true; recr.current?.state === 'recording' && recr.current.stop(); onCancel(); }}>Cancelar</button></div>
    <div className="gr-v"><video ref={vid} muted playsInline />{big && <span className="gr-big">{big}</span>}{state === 'rec' && <span className="gr-rec">● REC</span>}</div>
    {state === 'init' && <p className="small">Abriendo la cámara…</p>}
    {state === 'error' && <div className="alert warn small"><span>⚠</span><div>No se ha podido abrir la cámara desde la app. Usa «Grabar con la cámara del móvil» o adjunta el vídeo.</div></div>}
    {state === 'ready' && <><p className="small" style={{ margin: 0 }}>Coloca el móvil fijo, en horizontal, a la altura del suelo y con los pies del jugador siempre a la vista. Al pulsar «Empezar» sonará una cuenta atrás y un pitido largo para cada salto; entre salto y salto hay {rest} s de descanso. La grabación se detiene sola.</p>
      <p className="small muted" style={{ margin: 0 }}>Cámara a {fps} fps{fps < 60 ? ' · precisión limitada; si necesitas más precisión, graba a cámara lenta con la cámara del móvil' : ''}.</p>
      <div className="row"><button className="btn primary" onClick={start}>▶ Empezar protocolo</button></div></>}
    {state === 'rec' && <p className="small" style={{ margin: 0 }}><b>{msg}</b></p>}
  </div>;
}

// ---------- Análisis de los 3 saltos de un vídeo ----------
// Las marcas se guardan como número de fotograma (k / fps del vídeo): así se puede ir fotograma a fotograma sin saltarse ninguno.
export function MultiJumpAnalyzer({ file, n = 3, label, onDone, onCancel }) {
  const src = usePlayableVideo(file), url = src.url;
  const video = useRef(null), box = useRef(null), canv = useRef({});
  const [stage, setStage] = useState('load'); // load | roi | run | review
  const [roi, setRoi] = useState(DEF_ROI);
  const [roiAuto, setRoiAuto] = useState(null); // null | 'busy' | 'ok' | 'no'
  const [realFps, setRealFps] = useState('');
  const [prog, setProg] = useState(0);
  const [vfps, setVfps] = useState(null); // fps del archivo de vídeo
  const [det, setDet] = useState(null);
  const [js, setJs] = useState([]); // [{ a: fotograma despegue, b: fotograma aterrizaje, ms }]
  const [view, setView] = useState(null); // { k: salto, w: 'a' | 'b' } marca que se está ajustando
  const [cur, setCur] = useState(0); // fotograma visible en el visor
  const [zoom, setZoom] = useState(true);
  const [err, setErr] = useState(null);
  const abort = useRef(null), drag = useRef(null);
  const nFrames = vfps && video.current ? Math.floor(video.current.duration * vfps) : 0;
  const onMeta = async () => {
    if (!src.checkMeta(video.current)) return;
    try { await fixDuration(video.current); video.current.currentTime = Math.min(0.1, video.current.duration / 2); } catch { /* */ }
    setStage('roi');
    // Recuadro sobre los pies, automático (detector de postura en el propio dispositivo)
    setRoiAuto('busy');
    try { const r = await Promise.race([autoFeetRoi(video.current, detectPose), new Promise(res => setTimeout(() => res(null), 10000))]); if (r) { setRoi(r); setRoiAuto('ok'); } else setRoiAuto('no'); } catch { setRoiAuto('no'); }
  };
  const pt = e => { const r = box.current.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  const down = e => { primeVideo(video.current); if (stage !== 'roi') return; e.preventDefault(); box.current.setPointerCapture?.(e.pointerId); drag.current = pt(e); };
  const move = e => { if (!drag.current) return; const a = drag.current, b = pt(e); const r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; if (r.w > 0.03 && r.h > 0.02) { setRoi(r); setRoiAuto(null); } };
  const up = () => { drag.current = null; };
  const scale = () => { const rf = Number(realFps); return rf > 0 && vfps ? vfps / rf : 1; };
  const run = async () => {
    primeVideo(video.current); // dentro del toque: desbloquea el vídeo en iPhone
    setErr(null); setStage('run'); setProg(0);
    const ctl = { aborted: false }; abort.current = ctl;
    try {
      const v = video.current;
      if (!src.converted && !(await canReadPixels(v))) { src.needPixels(); setStage('roi'); return; }
      const r = await extractFrames(v, roi, { onProgress: setProg, signal: ctl });
      const sc = Number(realFps) > 0 ? r.fps / Number(realFps) : 1;
      let d = detectFlights(r.frames, sc, n);
      if (d.flights.length) { r.frames = await densify(v, roi, r.frames, d.flights.flatMap(f => [f.takeoff, f.landing]), r.fps); d = detectFlights(r.frames, sc, n); }
      const k = t => Math.round(t * r.fps);
      setVfps(r.fps); setDet({ ...d, ts: r.frames.map(f => f.t) }); setErr(d.error);
      setJs(d.flights.map(f => ({ a: k(r.frames[f.takeoff].t), b: k(r.frames[f.landing].t), ms: null })));
      setView(null); setStage('review');
    } catch (e) { if (e.message === NO_PIXELS) { src.needPixels(); setStage('roi'); return; } if (e.message !== 'Cancelado') setErr('No se ha podido leer el vídeo en este navegador. Prueba con otro formato o desde el móvil con el que se grabó.'); setStage('roi'); }
  };
  // Marcar todo a mano, sin análisis automático
  const manual = async () => {
    primeVideo(video.current);
    setErr(null);
    const f = (await measureFps(video.current)) || 30;
    setVfps(f); setDet(null); setJs([]); setCur(0); setView({ k: 0, w: 'a' }); setStage('review');
  };
  useEffect(() => () => { if (abort.current) abort.current.aborted = true; }, []);
  // Miniaturas de despegue y aterrizaje
  const key = js.map(j => j.a + '-' + j.b).join('|');
  useEffect(() => {
    if (stage !== 'review' || !vfps) return;
    let off = false;
    (async () => {
      const v = video.current; v.pause();
      for (let k = 0; k < js.length; k++) for (const w of ['a', 'b']) {
        if (off) return;
        const c = canv.current[k + w]; if (c && js[k][w] != null) await drawFrameAt(v, (js[k][w] + 0.3) / vfps, c, roi);
      }
    })();
    return () => { off = true; };
  }, [stage, key, vfps]); // eslint-disable-line

  const fps = vfps ? (Number(realFps) > 0 ? Number(realFps) : vfps) : null;
  const Tof = j => (j.ms != null && j.ms > 0 ? j.ms / 1000 : j.a != null && j.b != null && j.b > j.a ? (j.b - j.a) / vfps * scale() : null);
  const res = vfps ? js.map(j => { const T = Tof(j); return { T, h: T ? heightCm(T) : null, edited: j.ms != null }; }) : [];
  const ok = res.filter(r => r.h);
  const best = ok.length ? Math.max(...ok.map(r => r.h)) : null, mean = ok.length ? ok.reduce((a, r) => a + r.h, 0) / ok.length : null;
  const setJ = (k, patch) => setJs(o => o.map((j, i) => (i === k ? { ...j, ...patch } : j)));
  const openView = (k, w) => { setView({ k, w }); setCur(js[k]?.[w] ?? cur); };
  // Marca la posición actual del visor como despegue / aterrizaje del salto k
  const mark = (k, w) => setJs(o => { const x = [...o]; while (x.length <= k) x.push({ a: null, b: null, ms: null }); x[k] = { ...x[k], [w]: cur, ms: null }; return x; });

  return <div className="card jl-an">
    <div className="row between"><h3 style={{ margin: 0 }}>{label || `${n} saltos en un vídeo`} · {file.name}</h3><button className="btn sm ghost" onClick={() => { if (abort.current) abort.current.aborted = true; onCancel(); }}>Cancelar</button></div>
    <VideoConvert src={src} />
    <div className={'jl-stage' + (stage === 'review' || src.state !== 'ok' ? ' jl-off' : '')}>
      <div ref={box} className="jl-vid" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <video ref={video} src={url} muted playsInline preload="auto" onLoadedMetadata={onMeta} onError={src.fail} />
        {stage !== 'load' && <div className="jl-roi" style={{ left: roi.x * 100 + '%', top: roi.y * 100 + '%', width: roi.w * 100 + '%', height: roi.h * 100 + '%' }}><span>Pies</span></div>}
      </div>
      {stage === 'roi' && <div className="stack" style={{ gap: 8 }}>
        <p className="small" style={{ margin: 0 }}>{roiAuto === 'busy' ? 'Buscando los pies para el zoom…' : roiAuto === 'ok' ? <>✔ Recuadro del zoom colocado sobre los pies. Si no está bien, <b>arrástralo</b> sobre la imagen.</> : <>Arrastra sobre la imagen un recuadro sobre <b>las zapatillas</b>: es la zona que se amplía en el visor.</>} Si la imagen se ve en negro (iPhone), tócala una vez.</p>
        <Field label="¿Grabado a cámara lenta? fps reales de grabación" hint="p. ej. 120 si el vídeo a cámara lenta se reproduce ralentizado; vacío si se reproduce a velocidad normal"><input type="number" min="1" max="1000" placeholder="p. ej. 120" value={realFps} onChange={e => setRealFps(e.target.value)} style={{ maxWidth: 160 }} /></Field>
        <div className="row" style={{ gap: 8 }}><button className="btn primary" onClick={manual}>Abrir el visor y marcar los {n === 1 ? 'fotogramas' : `${n} saltos`}</button></div>
      </div>}
      {stage === 'run' && <div className="stack" style={{ gap: 6 }}><span className="small">Analizando fotogramas… {Math.round(prog * 100)} %</span><div className="jl-bar"><i style={{ width: prog * 100 + '%' }} /></div></div>}
    </div>
    {stage === 'review' && vfps && <div className="stack" style={{ gap: 10 }}>
      {det?.diff && <MultiTrace diff={det.diff} thr={det.thr} ts={det.ts} js={js} fps={vfps} onPick={k => { setView(v => ({ ...(v || { k: 0, w: 'a' }) })); setCur(k); }} />}
      {err && <div className="alert warn small"><span>⚠</span><div>{err}</div></div>}
      {view && <FrameViewer key="fv" video={video} vfps={vfps} nFrames={nFrames} cur={cur} setCur={setCur} roi={roi} setRoi={setRoi} zoom={zoom} setZoom={setZoom}
        js={js} res={res} n={n} view={view} setView={setView} mark={mark} onClose={() => setView(null)} />}
      <div className="mj-list">{Array.from({ length: Math.max(js.length, view ? 0 : 0) }, (_, k) => js[k]).map((j, k) => <div key={k} className={'mj-it' + (view?.k === k ? ' sel' : '')} style={{ '--c': COLORS[k % 4] }}>
        <div className="row between"><b>Salto {k + 1}</b>
          <span className="row" style={{ gap: 6 }}><span className="mj-h">{res[k]?.h ? fmtNum(res[k].h, 1) : '—'} <small>cm</small></span>
            <button className="btn sm ghost" onClick={() => { setJs(o => o.filter((_, i) => i !== k)); setView(null); }} aria-label={`Quitar salto ${k + 1}`}>×</button></span></div>
        <div className="mj-fr">
          {['a', 'b'].map(w => <button key={w} type="button" className={'mj-th' + (view?.k === k && view?.w === w ? ' on' : '')} onClick={() => openView(k, w)}>
            <span className="small muted">{w === 'a' ? 'Despegue' : 'Aterrizaje'} · f. {j[w] ?? '—'}</span>
            {j[w] != null ? <canvas ref={el => { canv.current[k + w] = el; }} /> : <span className="mj-empty">Sin marcar</span>}
            <span className="small">🔍 Ver grande y ajustar</span></button>)}
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <Field label="Duración del vuelo (ms)"><input type="number" min="50" max="1200" value={res[k]?.T ? Math.round(res[k].T * 1000) : ''} onChange={e => setJ(k, { ms: e.target.value === '' ? null : Number(e.target.value) })} style={{ maxWidth: 110 }} /></Field>
          {res[k]?.edited ? <button className="btn sm ghost" onClick={() => setJ(k, { ms: null })}>Volver a la medida del vídeo</button> : <span className="small muted">{res[k]?.T ? `${j.b - j.a} fotogramas · ±${fmtNum(frameErrorCm(res[k].T, fps), 1)} cm por fotograma` : ''}</span>}
        </div>
      </div>)}</div>
      {js.length < n && !view && <button className="btn" onClick={() => { setView({ k: js.length, w: 'a' }); }}>+ Marcar el salto {js.length + 1} a mano</button>}
      <div className="jl-sum">
        <div><small>CMJ más alto</small><b>{best != null ? fmtNum(best, 1) : '—'} <small>cm</small></b></div>
        <div><small>Media de {ok.length === n ? `los ${n} saltos` : `${ok.length} salto${ok.length === 1 ? '' : 's'}`}</small><b>{mean != null ? fmtNum(mean, 1) : '—'} <small>cm</small></b></div>
        <div><small>Vídeo</small><b>{fps} <small>fps</small></b>{Number(realFps) > 0 && <span className="small muted">cámara lenta ({vfps} fps en el archivo)</span>}</div>
      </div>
      {fps < 100 && <div className="alert warn small"><span>⚠</span><div>Vídeo a {fps} fps: cada fotograma de error supone unos ±3–4 cm. Si lo grabaste a cámara lenta y se reproduce ralentizado, indica los fps reales y vuelve a analizar.</div></div>}
      <div className="row">
        <button className="btn" onClick={() => { setStage('roi'); setDet(null); setErr(null); setView(null); }}>Cambiar zona del zoom / fps</button>
        <button className="btn primary" disabled={ok.length < n} onClick={() => onDone({ jumps: res.filter(r => r.h).map(r => ({ h: r.h, T: r.T, edited: r.edited })), best, mean, fps })}>{ok.length < n ? `Faltan ${n - ok.length} saltos` : `Usar: mejor ${fmtNum(best, 1)} cm · media ${fmtNum(mean, 1)} cm`}</button>
      </div>
    </div>}
    {stage !== 'review' && err && <ErrorBox error={err} />}
  </div>;
}

// Visor grande: fotograma a fotograma, con zoom en los pies, para marcar o corregir despegues y aterrizajes
function FrameViewer({ video, vfps, nFrames, cur, setCur, roi, setRoi, zoom, setZoom, js, res, n, view, setView, mark, onClose }) {
  const cv = useRef(null), busy = useRef(false), want = useRef(cur), drawn = useRef(null), jobs = useRef([]), crop = useRef(null);
  const roiKey = `${roi.x.toFixed(3)},${roi.y.toFixed(3)}`;
  // Cola de dibujo: primero el fotograma grande; las miniaturas, cuando no hay nada más que hacer
  const pump = async () => {
    if (busy.current) return; busy.current = true;
    try {
      for (;;) {
        const key = want.current + (zoom ? 'z' : '');
        if (drawn.current !== key && cv.current && video.current) { crop.current = await drawFrameBig(video.current, want.current, vfps, cv.current, roi, zoom, window.innerWidth < 600 ? 1 : 16 / 9); drawn.current = key; continue; }
        const job = jobs.current.shift(); if (!job) break; await job();
      }
    } finally { busy.current = false; }
  };
  useEffect(() => { want.current = cur; pump(); }, [cur, zoom, vfps]); // eslint-disable-line
  useEffect(() => { drawn.current = null; pump(); }, [roiKey]); // eslint-disable-line
  // Tocar la imagen: centra el zoom en ese punto
  const recenter = e => {
    const c = crop.current, v = video.current; if (!c || !v) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (c.sx + (e.clientX - r.left) / r.width * c.sw) / v.videoWidth, py = (c.sy + (e.clientY - r.top) / r.height * c.sh) / v.videoHeight;
    setRoi(o => ({ ...o, x: Math.max(0, Math.min(1 - o.w, px - o.w / 2)), y: Math.max(0, Math.min(1 - o.h, py - o.h / 2)) }));
    if (!zoom) setZoom(true);
  };
  const NT = Math.min(48, Math.max(12, Math.round(nFrames / vfps)));
  const [thumbs, setThumbs] = useState([]);
  useEffect(() => {
    let off = false; const out = [];
    jobs.current = Array.from({ length: NT }, (_, i) => async () => {
      if (off) return;
      const k = Math.round((i + 0.5) / NT * (nFrames - 1));
      const c = document.createElement('canvas'); await drawFrameBig(video.current, k, vfps, c, roi, true);
      const d = document.createElement('canvas'); d.width = 120; d.height = Math.round(120 * c.height / c.width); d.getContext('2d').drawImage(c, 0, 0, d.width, d.height);
      out.push({ k, url: d.toDataURL('image/jpeg', 0.6) });
      if (out.length % 4 === 0 || out.length === NT) setThumbs([...out]);
    });
    pump();
    return () => { off = true; jobs.current = []; };
  }, [nFrames, vfps]); // eslint-disable-line
  const go = d => setCur(c => Math.max(0, Math.min(nFrames - 1, c + d)));
  useEffect(() => {
    const kb = e => { if (e.target.tagName === 'INPUT') return; if (e.key === 'ArrowRight') { go(e.shiftKey ? 10 : 1); e.preventDefault(); } if (e.key === 'ArrowLeft') { go(e.shiftKey ? -10 : -1); e.preventDefault(); } };
    window.addEventListener('keydown', kb); return () => window.removeEventListener('keydown', kb);
  }); // eslint-disable-line
  const j = js[view.k] || {};
  const t = cur / vfps;
  return <div className="fv">
    <div className="row between" style={{ gap: 8 }}>
      <div className="chips">{Array.from({ length: Math.min(Math.max(js.length + 1, 1), n) }, (_, k) => <button key={k} type="button" className={'chip' + (view.k === k ? ' on' : '')} onClick={() => { setView({ k, w: js[k]?.a == null ? 'a' : js[k]?.b == null ? 'b' : view.w }); if (js[k]?.a != null) setCur(js[k].a); }}>Salto {k + 1}{res[k]?.h ? ` · ${fmtNum(res[k].h, 1)} cm` : ''}</button>)}</div>
      <button className="btn sm ghost" onClick={onClose}>Cerrar visor</button>
    </div>
    <div className="fv-img" onClick={recenter} title="Toca para centrar el zoom aquí"><canvas ref={cv} />
      <span className="fv-badge">fotograma {cur}{j.a === cur ? ' · DESPEGUE' : j.b === cur ? ' · ATERRIZAJE' : ''}</span></div>
    {thumbs.length > 0 && <div className="fv-strip">{thumbs.map(x => <button key={x.k} type="button" className={Math.abs(x.k - cur) < (nFrames / NT) / 2 ? 'on' : ''} onClick={() => setCur(x.k)}><img src={x.url} alt="" /><small>{fmtNum(x.k / vfps, 1)} s</small></button>)}</div>}
    {thumbs.length === 0 && <span className="small muted">Preparando las miniaturas del vídeo…</span>}
    <input className="fv-range" type="range" min="0" max={Math.max(0, nFrames - 1)} step="1" value={cur} onChange={e => setCur(Number(e.target.value))} aria-label="Posición en el vídeo" />
    <div className="fv-ctl">
      <button className="btn" onClick={() => go(-10)}>« 10</button><button className="btn" onClick={() => go(-1)}>‹ 1</button>
      <span className="fv-t">{fmtNum(t, 2)} s</span>
      <button className="btn" onClick={() => go(1)}>1 ›</button><button className="btn" onClick={() => go(10)}>10 »</button>
      <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={zoom} onChange={e => setZoom(e.target.checked)} /> Zoom en los pies</label>
    </div>
    <div className="fv-mark">
      <button className={'btn' + (view.w === 'a' ? ' primary' : '')} onClick={() => { mark(view.k, 'a'); setView({ ...view, w: 'b' }); }}>Marcar despegue aquí<small>primer fotograma en el aire</small></button>
      <button className={'btn' + (view.w === 'b' ? ' primary' : '')} onClick={() => { mark(view.k, 'b'); setView({ ...view, w: 'a' }); }}>Marcar aterrizaje aquí<small>primer fotograma tocando el suelo</small></button>
      {j.a != null && <button className="btn sm ghost" onClick={() => setCur(j.a)}>Ir al despegue (f. {j.a})</button>}
      {j.b != null && <button className="btn sm ghost" onClick={() => setCur(j.b)}>Ir al aterrizaje (f. {j.b})</button>}
    </div>
    <p className="small muted" style={{ margin: 0 }}>Toca una miniatura o desliza la barra hasta el salto y avanza fotograma a fotograma. Toca la imagen para centrar el zoom en ese punto (en el ordenador, también con las flechas ← →; con Mayús, de 10 en 10). Se muestran todos los fotogramas del vídeo.</p>
  </div>;
}

function MultiTrace({ diff, thr, ts, js, fps, onPick }) {
  const W = 600, H = 70, T0 = ts[0], T1 = ts[ts.length - 1] || 1, max = Math.max(...diff, thr || 0) || 1;
  const x = t => ((t - T0) / (T1 - T0 || 1)) * W, y = v => H - 4 - (v / max) * (H - 8);
  const click = e => { const r = e.currentTarget.getBoundingClientRect(); const t = T0 + (e.clientX - r.left) / r.width * (T1 - T0); onPick(Math.round(t * fps)); };
  return <svg className="jl-trace" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onClick={click} style={{ cursor: 'pointer' }}>
    {js.map((j, k) => j.a != null && j.b != null && <rect key={k} x={x(j.a / fps)} y="0" width={Math.max(2, x(j.b / fps) - x(j.a / fps))} height={H} fill={COLORS[k % 4]} opacity=".22" />)}
    {thr != null && <line x1="0" x2={W} y1={y(thr)} y2={y(thr)} stroke="#9a9b95" strokeDasharray="4 4" />}
    <polyline fill="none" stroke="#111511" strokeWidth="1.5" points={diff.map((v, i) => `${x(ts[i])},${y(v)}`).join(' ')} />
  </svg>;
}

// Botones para elegir cómo obtener el vídeo de los 3 saltos
export function ThreeJumpButtons({ disabled, onFile, onGuided }) {
  const rec = useRef(null), pick = useRef(null);
  const f = e => { const x = e.target.files[0]; e.target.value = ''; if (x) onFile(x); };
  return <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
    <input ref={rec} type="file" accept="video/*" capture="environment" hidden onChange={f} />
    <input ref={pick} type="file" accept="video/*" hidden onChange={f} />
    <button className="btn sm primary" disabled={disabled} onClick={onGuided}>🔊 Grabación guiada</button>
    <button className="btn sm" disabled={disabled} onClick={() => rec.current.click()}>🎥 Cámara del móvil</button>
    <button className="btn sm" disabled={disabled} onClick={() => pick.current.click()}>Adjuntar vídeo</button>
  </div>;
}

// Protocolo de salto: 3 CMJ casi consecutivos (≈ 5 s de descanso) en UN solo vídeo.
// La app detecta los 3 vuelos, mide su duración (tiempo de vuelo) y calcula la altura (h = g·t²/8).
// El preparador puede corregir cada despegue / aterrizaje fotograma a fotograma o escribir la duración.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { densify, detectFlights, drawFrameAt, extractFrames, fixDuration, frameErrorCm, heightCm } from '../lib/jump';
import { fmtNum } from '../lib/format';
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
export function MultiJumpAnalyzer({ file, n = 3, label, onDone, onCancel }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const video = useRef(null), box = useRef(null), canv = useRef({});
  const [stage, setStage] = useState('load');
  const [roi, setRoi] = useState(DEF_ROI);
  const [realFps, setRealFps] = useState('');
  const [prog, setProg] = useState(0);
  const [data, setData] = useState(null);
  const [det, setDet] = useState(null);
  const [js, setJs] = useState([]); // [{ t, l, ms (override) }]
  const [err, setErr] = useState(null);
  const abort = useRef(null), drag = useRef(null);
  const onMeta = async () => { try { await fixDuration(video.current); video.current.currentTime = Math.min(0.1, video.current.duration / 2); } catch { /* */ } setStage('roi'); };
  const pt = e => { const r = box.current.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  const down = e => { if (stage !== 'roi') return; e.preventDefault(); box.current.setPointerCapture?.(e.pointerId); drag.current = pt(e); };
  const move = e => { if (!drag.current) return; const a = drag.current, b = pt(e); const r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; if (r.w > 0.03 && r.h > 0.02) setRoi(r); };
  const up = () => { drag.current = null; };
  const scale = fps => { const rf = Number(realFps); return rf > 0 ? fps / rf : 1; };
  const run = async () => {
    setErr(null); setStage('run'); setProg(0);
    const ctl = { aborted: false }; abort.current = ctl;
    try {
      const v = video.current;
      const r = await extractFrames(v, roi, { onProgress: setProg, signal: ctl });
      let d = detectFlights(r.frames, scale(r.fps), n);
      if (d.flights.length) { r.frames = await densify(v, roi, r.frames, d.flights.flatMap(f => [f.takeoff, f.landing]), r.fps); d = detectFlights(r.frames, scale(r.fps), n); }
      setData(r); setDet(d); setErr(d.error);
      setJs(d.flights.map(f => ({ t: f.takeoff, l: f.landing, ms: null })));
      setStage('review');
    } catch (e) { if (e.message !== 'Cancelado') setErr('No se ha podido leer el vídeo en este navegador. Prueba con otro formato o desde el móvil con el que se grabó.'); setStage('roi'); }
  };
  useEffect(() => () => { if (abort.current) abort.current.aborted = true; }, []);
  // Dibuja los fotogramas de despegue y aterrizaje de cada salto (uno detrás de otro)
  const key = js.map(j => j.t + '-' + j.l).join('|');
  useEffect(() => {
    if (stage !== 'review' || !data) return;
    let off = false;
    (async () => {
      const v = video.current; v.pause();
      for (let k = 0; k < js.length; k++) for (const w of ['t', 'l']) {
        if (off) return;
        const c = canv.current[k + w]; if (c) await drawFrameAt(v, data.frames[js[k][w]].t, c, roi);
      }
    })();
    return () => { off = true; };
  }, [stage, key, data]); // eslint-disable-line

  const fps = data ? (Number(realFps) > 0 ? Number(realFps) : data.fps) : null;
  const Tof = j => (j.ms != null && j.ms > 0 ? j.ms / 1000 : j.l > j.t ? (data.frames[j.l].t - data.frames[j.t].t) * scale(data.fps) : null);
  const res = data ? js.map(j => { const T = Tof(j); return { T, h: T ? heightCm(T) : null, edited: j.ms != null }; }) : [];
  const ok = res.filter(r => r.h);
  const best = ok.length ? Math.max(...ok.map(r => r.h)) : null, mean = ok.length ? ok.reduce((a, r) => a + r.h, 0) / ok.length : null;
  const setJ = (k, patch) => setJs(o => o.map((j, i) => (i === k ? { ...j, ...patch } : j)));
  const bump = (k, w, d) => setJs(o => o.map((j, i) => (i === k ? { ...j, [w]: Math.max(0, Math.min(data.frames.length - 1, j[w] + d)), ms: null } : j)));
  const addManual = () => {
    const N = data.frames.length, used = js.flatMap(j => [j.t, j.l]).sort((a, b) => a - b);
    const marks = [0, ...used, N - 1]; let gi = 0, gl = -1;
    for (let i = 0; i + 1 < marks.length; i++) if (marks[i + 1] - marks[i] > gl) { gl = marks[i + 1] - marks[i]; gi = i; }
    const mid = Math.round((marks[gi] + marks[gi + 1]) / 2), w = Math.max(4, Math.round(0.45 * data.fps / scale(data.fps)));
    setJs(o => [...o, { t: Math.max(0, mid - (w >> 1)), l: Math.min(N - 1, mid + (w >> 1)), ms: null }].sort((a, b) => a.t - b.t));
  };

  return <div className="card jl-an">
    <div className="row between"><h3 style={{ margin: 0 }}>{label || `${n} saltos en un vídeo`} · {file.name}</h3><button className="btn sm ghost" onClick={() => { if (abort.current) abort.current.aborted = true; onCancel(); }}>Cancelar</button></div>
    <div className="jl-stage" style={{ display: stage === 'review' ? 'none' : undefined }}>
      <div ref={box} className="jl-vid" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <video ref={video} src={url} muted playsInline preload="auto" onLoadedMetadata={onMeta} onError={() => setErr('Este navegador no puede abrir el vídeo.')} />
        {stage !== 'load' && <div className="jl-roi" style={{ left: roi.x * 100 + '%', top: roi.y * 100 + '%', width: roi.w * 100 + '%', height: roi.h * 100 + '%' }}><span>Pies</span></div>}
      </div>
      {stage === 'roi' && <div className="stack" style={{ gap: 8 }}>
        <p className="small" style={{ margin: 0 }}>Comprueba que el recuadro cubre <b>las zapatillas apoyadas en el suelo</b> (si no, arrástralo sobre la imagen). La app buscará los {n} vuelos del vídeo.</p>
        <Field label="¿Grabado a cámara lenta? fps reales de grabación" hint="déjalo vacío si el vídeo se reproduce a velocidad normal"><input type="number" min="1" max="1000" placeholder="p. ej. 240" value={realFps} onChange={e => setRealFps(e.target.value)} style={{ maxWidth: 160 }} /></Field>
        <div className="row"><button className="btn primary" onClick={run}>Analizar los {n} saltos</button></div>
      </div>}
      {stage === 'run' && <div className="stack" style={{ gap: 6 }}><span className="small">Analizando fotogramas… {Math.round(prog * 100)} %</span><div className="jl-bar"><i style={{ width: prog * 100 + '%' }} /></div></div>}
    </div>
    {stage === 'review' && data && <div className="stack" style={{ gap: 10 }}>
      {det?.diff && <MultiTrace diff={det.diff} thr={det.thr} js={js} />}
      {err && <div className="alert warn small"><span>⚠</span><div>{err}</div></div>}
      <div className="mj-list">{js.map((j, k) => <div key={k} className="mj-it" style={{ '--c': COLORS[k % 4] }}>
        <div className="row between"><b>Salto {k + 1}</b>
          <span className="row" style={{ gap: 6 }}><span className="mj-h">{res[k].h ? fmtNum(res[k].h, 1) : '—'} <small>cm</small></span>
            <button className="btn sm ghost" onClick={() => setJs(o => o.filter((_, i) => i !== k))} aria-label={`Quitar salto ${k + 1}`}>×</button></span></div>
        <div className="mj-fr">
          {['t', 'l'].map(w => <div key={w}><span className="small muted">{w === 't' ? 'Despegue' : 'Aterrizaje'} · f. {j[w]}</span><canvas ref={el => { canv.current[k + w] = el; }} />
            <div className="row" style={{ gap: 3 }}><button className="btn xs" onClick={() => bump(k, w, -10)}>«</button><button className="btn xs" onClick={() => bump(k, w, -1)}>‹</button><button className="btn xs" onClick={() => bump(k, w, 1)}>›</button><button className="btn xs" onClick={() => bump(k, w, 10)}>»</button></div></div>)}
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
          <Field label="Duración del vuelo (ms)"><input type="number" min="50" max="1200" value={res[k].T ? Math.round(res[k].T * 1000) : ''} onChange={e => setJ(k, { ms: e.target.value === '' ? null : Number(e.target.value) })} style={{ maxWidth: 110 }} /></Field>
          {res[k].edited ? <button className="btn sm ghost" onClick={() => setJ(k, { ms: null })}>Volver a la medida del vídeo</button> : <span className="small muted">medido en el vídeo · ±{res[k].T ? fmtNum(frameErrorCm(res[k].T, fps), 1) : '—'} cm por fotograma</span>}
        </div>
      </div>)}</div>
      {js.length < n && <button className="btn" onClick={addManual}>+ Marcar un salto a mano</button>}
      <div className="jl-sum">
        <div><small>CMJ más alto</small><b>{best != null ? fmtNum(best, 1) : '—'} <small>cm</small></b></div>
        <div><small>Media de {ok.length === n ? `los ${n} saltos` : `${ok.length} salto${ok.length === 1 ? '' : 's'}`}</small><b>{mean != null ? fmtNum(mean, 1) : '—'} <small>cm</small></b></div>
        <div><small>Vídeo</small><b>{fps} <small>fps</small></b></div>
      </div>
      {fps < 100 && <div className="alert warn small"><span>⚠</span><div>Vídeo a {fps} fps: cada fotograma de error supone unos ±3–4 cm. Si lo grabaste a cámara lenta y se reproduce ralentizado, indica los fps reales y vuelve a analizar.</div></div>}
      <div className="row">
        <button className="btn" onClick={() => { setStage('roi'); setData(null); setDet(null); setErr(null); }}>Cambiar recuadro / volver a analizar</button>
        <button className="btn primary" disabled={ok.length < n} onClick={() => onDone({ jumps: res.filter(r => r.h).map(r => ({ h: r.h, T: r.T, edited: r.edited })), best, mean, fps })}>{ok.length < n ? `Faltan ${n - ok.length} saltos` : `Usar: mejor ${fmtNum(best, 1)} cm · media ${fmtNum(mean, 1)} cm`}</button>
      </div>
    </div>}
    {stage !== 'review' && err && <ErrorBox error={err} />}
  </div>;
}

function MultiTrace({ diff, thr, js }) {
  const W = 600, H = 70, n = diff.length, max = Math.max(...diff, thr || 0) || 1;
  const x = i => (i / (n - 1)) * W, y = v => H - 4 - (v / max) * (H - 8);
  return <svg className="jl-trace" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
    {js.map((j, k) => <rect key={k} x={x(j.t)} y="0" width={Math.max(2, x(j.l) - x(j.t))} height={H} fill={COLORS[k % 4]} opacity=".22" />)}
    {thr != null && <line x1="0" x2={W} y1={y(thr)} y2={y(thr)} stroke="#9a9b95" strokeDasharray="4 4" />}
    <polyline fill="none" stroke="#111511" strokeWidth="1.5" points={diff.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
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

// Test de salto con vídeo: 3 saltos por test (CMJ bilateral / derecha / izquierda), altura por tiempo de vuelo.
// El vídeo se analiza en el propio dispositivo y no se guarda: solo se guardan los resultados.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { densify, detectFlight, drawFrameAt, extractFrames, frameErrorCm, heightCm } from '../lib/jump';
import { fmtNum, todayISO } from '../lib/format';
import { ErrorBox, Field, Modal, useApi, useToast } from './ui';

const N = 3;
const DEF_ROI = { x: 0.25, y: 0.78, w: 0.5, h: 0.17 };

export default function JumpLab({ types, initialTypeId, onClose, onSaved }) {
  const toast = useToast();
  const players = useApi('/players?category=senior');
  const jumpTypes = types.filter(t => t.family === 'salto');
  const [typeId, setTypeId] = useState(initialTypeId && jumpTypes.some(t => t.id === initialTypeId) ? initialTypeId : jumpTypes[0]?.id);
  const [pid, setPid] = useState('');
  const [date, setDate] = useState(todayISO());
  const [jumps, setJumps] = useState(Array(N).fill(null));
  const [active, setActive] = useState(null); // { slot, file }
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const rec = useRef(null), pick = useRef(null), slotRef = useRef(0);
  const type = jumpTypes.find(t => t.id === typeId);
  const done = jumps.filter(Boolean);
  const best = done.length ? Math.max(...done.map(j => j.h)) : null;
  const mean = done.length ? done.reduce((a, j) => a + j.h, 0) / done.length : null;
  const open = (slot, how) => { slotRef.current = slot; (how === 'rec' ? rec : pick).current.click(); };
  const onFile = e => { const f = e.target.files[0]; e.target.value = ''; if (f) setActive({ slot: slotRef.current, file: f }); };
  useEffect(() => { setJumps(Array(N).fill(null)); setActive(null); }, [pid, typeId]);

  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const r1 = x => Math.round(x * 10) / 10;
      const fps = [...new Set(done.map(j => j.fps))].join('/');
      await api.post('/team/tests', {
        test_type_id: type.id, player_id: Number(pid), date, protocol: type.protocol || '',
        device: `Vídeo · tiempo de vuelo · ${fps} fps`,
        values: { altura: r1(best), media: r1(mean) },
        notes: `Análisis por vídeo (tiempo de vuelo, h = g·t²/8). Saltos: ${done.map((j, i) => `${i + 1}) ${fmtNum(j.h, 1)} cm · ${Math.round(j.T * 1000)} ms`).join(' | ')}`,
      });
      toast('Test de salto guardado'); onSaved?.(); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return <Modal wide title="Test de salto con vídeo" onClose={onClose} footer={<>
    <button className="btn" onClick={onClose}>Cerrar</button>
    <button className="btn primary" disabled={busy || done.length < N || !pid} onClick={save}>{busy ? 'Guardando…' : `Guardar mejor salto y media`}</button></>}>
    <input ref={rec} type="file" accept="video/*" capture="environment" hidden onChange={onFile} />
    <input ref={pick} type="file" accept="video/*" hidden onChange={onFile} />
    <div className="stack" style={{ gap: 12 }}>
      <div className="inline-fields">
        <Field label="Jugador" required><select value={pid} onChange={e => setPid(e.target.value)}><option value="">Selecciona…</option>{players.data?.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
        <Field label="Test" required><select value={typeId || ''} onChange={e => setTypeId(Number(e.target.value))}>{jumpTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field label="Fecha"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      </div>
      <details className="jl-tips"><summary>Cómo grabar para que la medida sea precisa</summary><ul className="small">
        <li><b>Cámara lenta</b> (120 o 240 fps) siempre que el móvil lo permita: a 30 fps el error puede ser de ±3–4 cm por fotograma.</li>
        <li>Móvil <b>fijo</b> (trípode o apoyado), en <b>horizontal</b>, a la altura del suelo y a unos 1,5–2 m, de frente o de lado.</li>
        <li>Que se vean <b>los pies en todo momento</b>, con buena luz y fondo liso, sin nadie pasando por detrás.</li>
        <li>El jugador empieza <b>quieto 1–2 s</b>, manos en la cadera, salta y aterriza en el mismo sitio con las piernas estiradas.</li>
        <li>Un vídeo por salto, corto (3–6 s). El vídeo no se guarda: se analiza en este dispositivo y solo se guardan los resultados.</li>
      </ul></details>
      {!pid ? <p className="muted small" style={{ margin: 0 }}>Elige el jugador para empezar.</p> : <>
        <div className="jl-slots">{jumps.map((j, i) => <div key={i} className={'jl-slot' + (active?.slot === i ? ' on' : '') + (j ? ' ok' : '')}>
          <span className="small muted">Salto {i + 1}</span>
          {j ? <b>{fmtNum(j.h, 1)} <small>cm</small></b> : <b className="muted">—</b>}
          {j && <span className="small muted">{Math.round(j.T * 1000)} ms · {j.fps} fps</span>}
          <div className="row" style={{ gap: 4, justifyContent: 'center' }}>
            <button className="btn sm primary" disabled={!!active} onClick={() => open(i, 'rec')}>{j ? 'Repetir' : 'Grabar'}</button>
            <button className="btn sm" disabled={!!active} onClick={() => open(i, 'pick')}>Adjuntar</button></div>
        </div>)}</div>
        {active && <JumpAnalyzer key={active.file.name + active.slot + active.file.size} file={active.file} slot={active.slot}
          onCancel={() => setActive(null)} onDone={res => { setJumps(js => js.map((x, k) => (k === active.slot ? res : x))); setActive(null); }} />}
        {done.length > 0 && <div className="jl-sum">
          <div><small>Salto más alto</small><b>{fmtNum(best, 1)} <small>cm</small></b></div>
          <div><small>Media de {done.length === N ? 'los tres saltos' : `${done.length} salto${done.length > 1 ? 's' : ''}`}</small><b>{fmtNum(mean, 1)} <small>cm</small></b></div>
          {done.length < N && <span className="small muted">Faltan {N - done.length} salto{N - done.length > 1 ? 's' : ''} para guardar el test.</span>}
        </div>}
      </>}
      <ErrorBox error={err} />
    </div>
  </Modal>;
}

// Analiza un vídeo: zona de los pies → recorrido de fotogramas → despegue/aterrizaje (corregibles) → altura
export function JumpAnalyzer({ file, slot, label, onDone, onCancel }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const video = useRef(null), box = useRef(null), cT = useRef(null), cL = useRef(null);
  const [stage, setStage] = useState('load'); // load | roi | run | review
  const [roi, setRoi] = useState(DEF_ROI);
  const [realFps, setRealFps] = useState('');
  const [prog, setProg] = useState(0);
  const [data, setData] = useState(null); // { frames, fps, dropped }
  const [det, setDet] = useState(null);
  const [idx, setIdx] = useState({ t: null, l: null });
  const [err, setErr] = useState(null);
  const abort = useRef(null);
  const drag = useRef(null);

  const onMeta = async () => { try { video.current.currentTime = Math.min(0.1, video.current.duration / 2); } catch { /* */ } setStage('roi'); };
  const pt = e => { const r = box.current.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  const down = e => { if (stage !== 'roi') return; e.preventDefault(); box.current.setPointerCapture?.(e.pointerId); drag.current = pt(e); };
  const move = e => { if (!drag.current) return; const a = drag.current, b = pt(e); const r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; if (r.w > 0.03 && r.h > 0.02) setRoi(r); };
  const up = () => { drag.current = null; };

  const scaleFor = (fps) => { const rf = Number(realFps); return rf > 0 ? fps / rf : 1; };
  const run = async () => {
    setErr(null); setStage('run'); setProg(0);
    const ctl = { aborted: false }; abort.current = ctl;
    try {
      const v = video.current;
      const r = await extractFrames(v, roi, { onProgress: setProg, signal: ctl });
      let d = detectFlight(r.frames, scaleFor(r.fps));
      if (!d.error) { setProg(1); r.frames = await densify(v, roi, r.frames, [d.takeoff, d.landing], r.fps); d = detectFlight(r.frames, scaleFor(r.fps)); }
      setData(r); setDet(d);
      if (d.error) { setErr(d.error); setIdx({ t: Math.round(r.frames.length * 0.4), l: Math.round(r.frames.length * 0.55) }); }
      else setIdx({ t: d.takeoff, l: d.landing });
      setStage('review');
    } catch (e) { if (e.message !== 'Cancelado') { setErr('No se ha podido leer el vídeo en este navegador. Prueba con otro formato o desde el móvil con el que se grabó.'); } setStage('roi'); }
  };
  useEffect(() => () => { if (abort.current) abort.current.aborted = true; }, []);
  useEffect(() => {
    if (stage !== 'review' || !data) return;
    (async () => {
      const v = video.current; v.pause();
      if (idx.t != null) await drawFrameAt(v, data.frames[idx.t].t, cT.current, roi);
      if (idx.l != null) await drawFrameAt(v, data.frames[idx.l].t, cL.current, roi);
    })();
  }, [stage, idx.t, idx.l, data]); // eslint-disable-line

  const fps = data ? (Number(realFps) > 0 ? Number(realFps) : data.fps) : null;
  const T = data && idx.t != null && idx.l != null && idx.l > idx.t ? (data.frames[idx.l].t - data.frames[idx.t].t) * scaleFor(data.fps) : null;
  const h = T ? heightCm(T) : null;
  const plausible = T && T >= 0.15 && T <= 1.0;
  const bump = (k, d) => setIdx(o => ({ ...o, [k]: Math.max(0, Math.min(data.frames.length - 1, o[k] + d)) }));

  return <div className="card jl-an">
    <div className="row between"><h3 style={{ margin: 0 }}>{label || `Salto ${slot + 1}`} · {file.name}</h3><button className="btn sm ghost" onClick={() => { if (abort.current) abort.current.aborted = true; onCancel(); }}>Cancelar</button></div>
    <div className="jl-stage" style={{ display: stage === 'review' ? 'none' : undefined }}>
      <div ref={box} className="jl-vid" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <video ref={video} src={url} muted playsInline preload="auto" onLoadedMetadata={onMeta} onError={() => setErr('Este navegador no puede abrir el vídeo.')} />
        {stage !== 'load' && <div className="jl-roi" style={{ left: roi.x * 100 + '%', top: roi.y * 100 + '%', width: roi.w * 100 + '%', height: roi.h * 100 + '%' }}><span>Pies</span></div>}
      </div>
      {stage === 'roi' && <div className="stack" style={{ gap: 8 }}>
        <p className="small" style={{ margin: 0 }}><b>Arrastra sobre la imagen</b> para marcar un recuadro que cubra solo las zapatillas apoyadas en el suelo (con un poco de margen). En ese recuadro se detecta cuándo los pies despegan y cuándo vuelven a tocar el suelo.</p>
        <Field label="¿Grabado a cámara lenta? fps reales de grabación" hint="déjalo vacío si el vídeo se reproduce a velocidad normal"><input type="number" min="1" max="1000" placeholder="p. ej. 240" value={realFps} onChange={e => setRealFps(e.target.value)} style={{ maxWidth: 160 }} /></Field>
        <div className="row"><button className="btn primary" onClick={run}>Analizar salto</button></div>
      </div>}
      {stage === 'run' && <div className="stack" style={{ gap: 6 }}><span className="small">Analizando fotogramas… {Math.round(prog * 100)} %</span><div className="jl-bar"><i style={{ width: prog * 100 + '%' }} /></div></div>}
    </div>
    {stage === 'review' && data && <div className="stack" style={{ gap: 10 }}>
      {det?.diff && <Trace diff={det.diff} thr={det.thr} t={idx.t} l={idx.l} />}
      <div className="jl-frames">
        <div><span className="small"><b>Despegue</b> · primer fotograma en el aire</span><canvas ref={cT} /><div className="row" style={{ gap: 4 }}><button className="btn sm" onClick={() => bump('t', -1)}>◀ 1</button><button className="btn sm" onClick={() => bump('t', 1)}>1 ▶</button><span className="small muted">fotograma {idx.t}</span></div></div>
        <div><span className="small"><b>Aterrizaje</b> · primer fotograma en el suelo</span><canvas ref={cL} /><div className="row" style={{ gap: 4 }}><button className="btn sm" onClick={() => bump('l', -1)}>◀ 1</button><button className="btn sm" onClick={() => bump('l', 1)}>1 ▶</button><span className="small muted">fotograma {idx.l}</span></div></div>
      </div>
      {err && <div className="alert warn small"><span>⚠</span><div>{err} Puedes marcar el despegue y el aterrizaje con las flechas.</div></div>}
      <div className="jl-res">
        <div><small>Tiempo de vuelo</small><b>{T ? Math.round(T * 1000) : '—'} <small>ms</small></b></div>
        <div><small>Altura de salto</small><b>{h ? fmtNum(h, 1) : '—'} <small>cm</small></b></div>
        <div><small>Vídeo</small><b>{fps} <small>fps</small></b>{T && <span className="small muted">±{fmtNum(frameErrorCm(T, fps), 1)} cm por fotograma</span>}</div>
      </div>
      {fps < 100 && <div className="alert warn small"><span>⚠</span><div>Vídeo a {fps} fps: la precisión es limitada (±{T ? fmtNum(frameErrorCm(T, fps), 1) : '3–4'} cm por fotograma). Si puedes, graba a cámara lenta (120–240 fps). Si ya lo grabaste a cámara lenta y se reproduce ralentizado, indica los fps reales y vuelve a analizar.</div></div>}
      {data.dropped > 2 && <div className="alert warn small"><span>⚠</span><div>El navegador se saltó {data.dropped} fotogramas al leer el vídeo: revisa el despegue y el aterrizaje.</div></div>}
      {T && !plausible && <div className="alert warn small"><span>⚠</span><div>Tiempo de vuelo poco habitual para un CMJ: revisa los fotogramas marcados.</div></div>}
      <div className="row">
        <button className="btn" onClick={() => { setStage('roi'); setData(null); setDet(null); setErr(null); }}>Cambiar recuadro / volver a analizar</button>
        <button className="btn primary" disabled={!h} onClick={() => onDone({ h, T, fps })}>Usar este salto ({h ? fmtNum(h, 1) : '—'} cm)</button>
      </div>
    </div>}
    {stage !== 'review' && err && <ErrorBox error={err} />}
  </div>;
}

// Señal de cambio en la zona de los pies: el tramo alto es el vuelo
function Trace({ diff, thr, t, l }) {
  const W = 600, H = 70, n = diff.length, max = Math.max(...diff, thr || 0) || 1;
  const x = i => (i / (n - 1)) * W, y = v => H - 4 - (v / max) * (H - 8);
  return <svg className="jl-trace" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
    {t != null && l != null && <rect x={x(t)} y="0" width={Math.max(1, x(l) - x(t))} height={H} fill="#e30613" opacity=".1" />}
    {thr != null && <line x1="0" x2={W} y1={y(thr)} y2={y(thr)} stroke="#9a9b95" strokeDasharray="4 4" />}
    <polyline fill="none" stroke="#111511" strokeWidth="1.5" points={diff.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
    {t != null && <line x1={x(t)} x2={x(t)} y1="0" y2={H} stroke="#e30613" strokeWidth="2" />}
    {l != null && <line x1={x(l)} x2={x(l)} y1="0" y2={H} stroke="#2a78d6" strokeWidth="2" />}
  </svg>;
}

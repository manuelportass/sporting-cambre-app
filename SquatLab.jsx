// Sentadilla: 1RM estimado (Brzycki, 1993) + velocidad de la barra por vídeo al 20-40-60-80 % del 1RM → curva carga–velocidad
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ResponsiveContainer, ComposedChart, LineChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ReferenceDot } from 'recharts';
import { api } from '../api';
import { BRZYCKI, PCTS, analyze, drawAt, frameSize, linfit, loadFor, repStats, trackBar } from '../lib/bar';
import { fmtDate, fmtNum, todayISO } from '../lib/format';
import { usePlayableVideo } from '../lib/convert';
import { primeVideo } from '../lib/jump';
import VideoConvert from './VideoConvert';
import { ErrorBox, Field, Modal, useApi, useToast } from './ui';

export const RM_TEST = 'Sentadilla · 1RM estimado';
export const LV_TEST = 'Sentadilla · perfil carga–velocidad';
const REPS = 5;

export default function SquatLab({ types, onClose, onSaved }) {
  const toast = useToast();
  const players = useApi('/players?category=senior');
  const rmType = types.find(t => t.name === RM_TEST), lvType = types.find(t => t.name === LV_TEST);
  const [pid, setPid] = useState('');
  const rms = useApi(pid && rmType ? `/team/tests?type_id=${rmType.id}&player_id=${pid}` : null);
  const [date, setDate] = useState(todayISO());
  const [rmIn, setRmIn] = useState({ peso: '', reps: '' });
  const [res, setRes] = useState({}); // pct → { mcv, vpeak, rom, fps }
  const [active, setActive] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const rec = useRef(null), pick = useRef(null), slotRef = useRef(null);
  useEffect(() => { setRes({}); setActive(null); setRmIn({ peso: '', reps: '' }); }, [pid]);
  const lastRm = rms.data?.[0];
  const rm = lastRm?.values.rm ?? null;
  const preview = rmIn.peso && rmIn.reps && Number(rmIn.reps) >= 1 && Number(rmIn.reps) <= 10 ? BRZYCKI(Number(rmIn.peso), Number(rmIn.reps)) : null;
  const saveRm = async () => {
    setErr(null);
    try { await api.post('/team/tests', { test_type_id: rmType.id, player_id: Number(pid), date, protocol: rmType.protocol, values: { peso: rmIn.peso, reps: rmIn.reps } }); toast('1RM guardado'); setRmIn({ peso: '', reps: '' }); setRes({}); rms.reload(); }
    catch (e) { setErr(e.message); }
  };
  const open = (pct, how) => { slotRef.current = pct; (how === 'rec' ? rec : pick).current.click(); };
  const onFile = e => { const f = e.target.files[0]; e.target.value = ''; if (f) setActive({ pct: slotRef.current, file: f }); };
  const pts = PCTS.filter(p => res[p]).map(p => ({ pct: p, load: loadFor(rm, p), v: res[p].mcv }));
  const fit = linfit(pts.map(p => p.load), pts.map(p => p.v));
  const ptsMax = PCTS.filter(p => res[p]).map(p => ({ pct: p, load: loadFor(rm, p), v: res[p].vmax }));
  const fitMax = linfit(ptsMax.map(p => p.load), ptsMax.map(p => p.v));
  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const r2 = x => Math.round(x * 100) / 100;
      await api.post('/team/tests', {
        test_type_id: lvType.id, player_id: Number(pid), date, protocol: lvType.protocol,
        device: `Vídeo · seguimiento de barra · ${[...new Set(PCTS.map(p => res[p]?.fps).filter(Boolean))].join('/')} fps`,
        values: { v20: r2(res[20].mcv), v40: r2(res[40].mcv), v60: r2(res[60].mcv), v80: r2(res[80].mcv), p20: r2(res[20].vmax), p40: r2(res[40].vmax), p60: r2(res[60].vmax), p80: r2(res[80].vmax), rm },
        notes: `1RM ${fmtNum(rm, 1)} kg (${fmtDate(lastRm.date)}). ` + PCTS.map(p => `${p} % = ${fmtNum(loadFor(rm, p), 1)} kg: v. media ${fmtNum(res[p].mcv, 2)} m/s · v. máxima ${fmtNum(res[p].vmax, 2)} m/s (${res[p].n} rep. VMC/pico: ${res[p].reps.map(x => `${fmtNum(x.mcv, 2)}/${fmtNum(x.vpeak, 2)}`).join(' · ')}) · ${Math.round(res[p].rom * 100)} cm`).join(' | ')
          + (fit ? ` | Recta: v = ${fmtNum(fit.icpt, 3)} ${fit.slope < 0 ? '−' : '+'} ${fmtNum(Math.abs(fit.slope), 4)}·kg (R² ${fmtNum(fit.r2, 2)})` : ''),
      });
      toast('Perfil carga–velocidad guardado'); onSaved?.(); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!rmType || !lvType) return <Modal title="Sentadilla" onClose={onClose}><p>Faltan los tests de sentadilla en la configuración.</p></Modal>;
  return <Modal wide title="Sentadilla · 1RM y velocidad con vídeo" onClose={onClose} footer={<>
    <button className="btn" onClick={onClose}>Cerrar</button>
    <button className="btn primary" disabled={busy || !rm || PCTS.some(p => !res[p])} onClick={save}>{busy ? 'Guardando…' : 'Guardar perfil carga–velocidad'}</button></>}>
    <input ref={rec} type="file" accept="video/*" capture="environment" hidden onChange={onFile} />
    <input ref={pick} type="file" accept="video/*" hidden onChange={onFile} />
    <div className="stack" style={{ gap: 12 }}>
      <div className="inline-fields">
        <Field label="Jugador" required><select value={pid} onChange={e => setPid(e.target.value)}><option value="">Selecciona…</option>{players.data?.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
        <Field label="Fecha"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      </div>
      {pid && <>
        <div className="card sq-rm"><h3 style={{ margin: 0 }}>1 · 1RM estimado</h3>
          <div className="sq-rm-row">
            <div className="sq-rm-now">{rm ? <><b>{fmtNum(rm, 1)} <small>kg</small></b><span className="small muted">{fmtNum(lastRm.values.peso, 1)} kg × {lastRm.values.reps} rep · {fmtDate(lastRm.date)}</span></> : <span className="small muted">Sin 1RM registrado.</span>}</div>
            <div className="inline-fields" style={{ flex: 1 }}>
              <Field label="Peso levantado (kg)"><input type="number" min="0" step="0.5" value={rmIn.peso} onChange={e => setRmIn({ ...rmIn, peso: e.target.value })} /></Field>
              <Field label="Repeticiones (1–10)"><input type="number" min="1" max="10" step="1" value={rmIn.reps} onChange={e => setRmIn({ ...rmIn, reps: e.target.value })} /></Field>
              <div className="field"><span>1RM estimado</span><b className="sq-prev">{preview ? `${fmtNum(preview, 1)} kg` : '—'}</b></div>
            </div>
            <button className="btn primary" disabled={!preview} onClick={saveRm}>{rm ? 'Guardar nuevo 1RM' : 'Guardar 1RM'}</button>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Brzycki (1993): 1RM = peso / (1,0278 − 0,0278 × repeticiones).</p>
        </div>
        {rm && <div className="card stack" style={{ gap: 10 }}><h3 style={{ margin: 0 }}>2 · Velocidad de la barra con vídeo</h3>
          <details className="jl-tips"><summary>Cómo grabar</summary><ul className="small">
            <li>Móvil <b>fijo</b> (trípode), en horizontal, <b>de lado</b> y perpendicular a la barra, a la altura de la barra con el jugador de pie, a unos 2–3 m.</li>
            <li>Que se vea el <b>disco entero</b> durante toda la repetición; discos de 45 cm si es posible (si no, indica su diámetro).</li>
            <li>Cámara lenta (60–240 fps) si se puede. <b>{REPS} repeticiones consecutivas en el mismo vídeo</b> por carga, a la <b>máxima velocidad intencional</b> en la subida. La app marca las {REPS} repeticiones y los puntos de inicio y final de cada subida (puedes corregirlos) y calcula la velocidad media y la máxima.</li>
            <li>El vídeo no se guarda: se analiza en este dispositivo.</li>
          </ul></details>
          <div className="sq-loads">{PCTS.map(p => <div key={p} className={'sq-load' + (res[p] ? ' ok' : '') + (active?.pct === p ? ' on' : '')}>
            <span className="sq-pct">{p} %</span><b>{fmtNum(loadFor(rm, p), 1)} <small>kg</small></b>
            <span className="small">{res[p] ? <>Media <span className="sq-v">{fmtNum(res[p].mcv, 2)}</span> · máx. <span className="sq-v">{fmtNum(res[p].vmax, 2)}</span> m/s · {res[p].n} rep.</> : <span className="muted">Sin grabar · {REPS} rep.</span>}</span>
            <div className="row" style={{ gap: 4, justifyContent: 'center' }}><button className="btn sm primary" disabled={!!active} onClick={() => open(p, 'rec')}>{res[p] ? 'Repetir' : 'Grabar'}</button><button className="btn sm" disabled={!!active} onClick={() => open(p, 'pick')}>Adjuntar</button></div>
          </div>)}</div>
          {active && <BarAnalyzer key={active.file.name + active.pct + active.file.size} file={active.file} title={`${active.pct} % · ${fmtNum(loadFor(rm, active.pct), 1)} kg`}
            onCancel={() => setActive(null)} onDone={r => { setRes(o => ({ ...o, [active.pct]: r })); setActive(null); }} />}
        </div>}
        {pts.length > 0 && <div className="grid g2" style={{ alignItems: 'start' }}>
          {[['Velocidad máxima', ptsMax, fitMax, 'Velocidad pico más alta de las 5 repeticiones de cada carga.'], ['Velocidad media', pts, fit, 'Media de la velocidad media concéntrica (VMC) de las 5 repeticiones de cada carga.']].map(([t, P, F, note]) => <div key={t} className="card"><h3 style={{ marginTop: 0 }}>3 · {t}</h3><LVChart pts={P} fit={F} rm={rm} height={220} label={t} />
            {F && <div className="sq-fit small"><span>v = <b>{fmtNum(F.icpt, 2)} {F.slope < 0 ? '−' : '+'} {fmtNum(Math.abs(F.slope), 4)} × kg</b></span><span>R² <b>{fmtNum(F.r2, 2)}</b></span><span>−{fmtNum(Math.abs(F.slope * 10), 3)} m/s cada 10 kg</span></div>}
            <p className="small muted" style={{ margin: '6px 0 0' }}>{note}</p></div>)}
          </div>}
        {pts.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>Repeticiones por carga</h3><div className="table-wrap"><table className="t small"><thead><tr><th>Carga</th>{Array.from({ length: REPS }, (_, k) => <th key={k} className="n">Rep. {k + 1}<br /><span className="muted">VMC / pico</span></th>)}<th className="n">Media</th><th className="n">Máxima</th></tr></thead>
          <tbody>{PCTS.filter(p => res[p]).map(p => <tr key={p}><td>{p} % · {fmtNum(loadFor(rm, p), 1)} kg</td>{Array.from({ length: REPS }, (_, k) => { const r = res[p].reps[k]; return <td key={k} className="n">{r ? <>{fmtNum(r.mcv, 2)} / {fmtNum(r.vpeak, 2)}</> : '—'}</td>; })}<td className="n"><b>{fmtNum(res[p].mcv, 2)}</b></td><td className="n"><b>{fmtNum(res[p].vmax, 2)}</b></td></tr>)}</tbody></table></div>
          {PCTS.some(p => !res[p]) && <p className="small muted" style={{ margin: '6px 0 0' }}>Graba las cuatro cargas para guardar el perfil.</p>}</div>}
      </>}
      <ErrorBox error={err} />
    </div>
  </Modal>;
}

export function LVChart({ pts, fit, rm, height = 240, prev, label = 'VMC' }) {
  const xs = pts.map(p => p.load), x0 = 0, x1 = Math.ceil((rm || Math.max(...xs)) / 10) * 10;
  const line = fit ? [{ load: x0, fit: fit.icpt }, { load: x1, fit: Math.max(0, fit.icpt + fit.slope * x1) }] : [];
  return <ResponsiveContainer width="100%" height={height}>
    <ComposedChart margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
      <CartesianGrid stroke="#ecede8" />
      <XAxis type="number" dataKey="load" domain={[0, x1]} unit=" kg" stroke="#9a9b95" fontSize={11} tickLine={false} />
      <YAxis type="number" domain={[0, 'auto']} unit=" m/s" stroke="#9a9b95" fontSize={11} tickLine={false} width={64} />
      <Tooltip formatter={(v, n) => [fmtNum(v, 2) + ' m/s', n === 'fit' ? 'Recta' : n === 'prev' ? 'Anterior' : label]} labelFormatter={v => `${fmtNum(v, 1)} kg`} />
      {prev?.length > 0 && <Scatter data={prev} dataKey="prev" fill="#c9cac4" isAnimationActive={false} />}
      {fit && <Line data={line} dataKey="fit" stroke="#2a78d6" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />}
      <Scatter data={pts.map(p => ({ load: p.load, v: p.v }))} dataKey="v" fill="#e30613" isAnimationActive={false} />
    </ComposedChart>
  </ResponsiveContainer>;
}

// Un vídeo: escala (diámetro del disco) + punto a seguir → trayectoria → repeticiones
function BarAnalyzer({ file, title, onDone, onCancel }) {
  const src = usePlayableVideo(file), url = src.url;
  const video = useRef(null), box = useRef(null), abort = useRef(null), drag = useRef(null);
  const [stage, setStage] = useState('load');
  const [mode, setMode] = useState('line'); // line | point
  const [line, setLine] = useState(null);
  const [pt, setPt] = useState(null);
  const [diam, setDiam] = useState('45');
  const [realFps, setRealFps] = useState('');
  const [prog, setProg] = useState(0);
  const [out, setOut] = useState(null);
  const [marks, setMarks] = useState([]); // [{ start, end, on }] inicio y final de cada fase concéntrica (editables)
  const [sel, setSel] = useState(0);
  const [raw, setRaw] = useState(null); // trayectoria en píxeles y tiempos del vídeo
  const cS = useRef(null), cE = useRef(null);
  const [err, setErr] = useState(null);
  const onMeta = () => { if (!src.checkMeta(video.current)) return; try { video.current.currentTime = Math.min(0.1, video.current.duration / 2); } catch { /* */ } setStage('calib'); };
  const P = e => { const r = box.current.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  const down = e => { primeVideo(video.current); if (stage !== 'calib') return; e.preventDefault(); box.current.setPointerCapture?.(e.pointerId); const p = P(e); if (mode === 'line') { drag.current = p; setLine({ a: p, b: p }); } else { setPt(p); } };
  const move = e => { if (drag.current) setLine({ a: drag.current, b: P(e) }); };
  const up = () => { if (drag.current) { drag.current = null; setMode('point'); } };
  const pxLen = () => { if (!line) return 0; const { W, H } = frameSize(video.current); return Math.hypot((line.b.x - line.a.x) * W, (line.b.y - line.a.y) * H); };
  const run = async () => {
    primeVideo(video.current); // dentro del toque: desbloquea el vídeo en iPhone
    setErr(null); setStage('run'); setProg(0);
    const ctl = { aborted: false }; abort.current = ctl;
    try {
      const len = pxLen();
      const tr = await trackBar(video.current, pt, { onProgress: setProg, signal: ctl, plateRadiusPx: len / 2 });
      const scale = Number(realFps) > 0 ? tr.fps / Number(realFps) : 1;
      const a = analyze(tr.pts, Number(diam) / 100 / len, scale);
      setOut({ ...a, fps: Number(realFps) > 0 ? Number(realFps) : tr.fps }); setRaw(tr);
      setMarks((a.reps || []).slice(0, 8).map(r => ({ start: r.start, end: r.end, on: true }))); setSel(0);
      if (a.error) setErr(a.error);
      setStage('review');
    } catch (e) { if (e.message !== 'Cancelado') setErr('No se ha podido leer el vídeo en este navegador.'); setStage('calib'); }
  };
  useEffect(() => () => { if (abort.current) abort.current.aborted = true; }, []);
  const ok = line && pxLen() > 10 && pt && Number(diam) > 0;
  const stats = out?.t ? marks.map(m => ({ ...repStats(out, m.start, m.end), on: m.on })) : [];
  const chosen = stats.filter(r => r.on && r.mcv != null);
  const avg = k => chosen.length ? chosen.reduce((x, r) => x + r[k], 0) / chosen.length : null;
  const rep = chosen.length ? { mcv: avg('mcv'), vpeak: avg('vpeak'), vmax: Math.max(...chosen.map(r => r.vpeak)), rom: avg('rom'), dur: avg('dur'), n: chosen.length, best: Math.max(...chosen.map(r => r.mcv)), reps: chosen.map(r => ({ mcv: r.mcv, vpeak: r.vpeak, rom: r.rom })) } : null;
  const nudge = (k, w, d) => setMarks(o => o.map((m, i) => { if (i !== k) return m; const v = Math.max(0, Math.min(out.t.length - 1, m[w] + d)); return w === 'start' ? { ...m, start: Math.min(v, m.end - 2) } : { ...m, end: Math.max(v, m.start + 2) }; }));
  const addRep = () => {
    const n = out.t.length, used = marks.flatMap(m => [m.start, m.end]).sort((a, b) => a - b), cuts = [0, ...used, n - 1];
    let gi = 0, gl = -1; for (let i = 0; i + 1 < cuts.length; i++) if (cuts[i + 1] - cuts[i] > gl) { gl = cuts[i + 1] - cuts[i]; gi = i; }
    let lo = cuts[gi], hi = cuts[gi + 1], a = lo, b = hi;
    for (let i = lo; i <= hi; i++) if (out.h[i] < out.h[a]) a = i;
    for (let i = a; i <= hi; i++) if (out.h[i] > out.h[b] || b < a) b = i;
    if (b - a < 3) { a = lo; b = Math.min(hi, lo + 10); }
    setMarks(o => [...o, { start: a, end: b, on: true }].sort((x, y) => x.start - y.start));
  };
  // Fotogramas de inicio y final de la repetición seleccionada, con el punto seguido
  const mk = marks[sel];
  useEffect(() => {
    if (stage !== 'review' || !raw || !mk) return;
    let off = false;
    (async () => {
      const v = video.current; v.pause();
      for (const [c, i] of [[cS.current, mk.start], [cE.current, mk.end]]) {
        if (off || !c) return;
        await drawAt(v, raw.pts[i].t, c);
        const g = c.getContext('2d'); g.strokeStyle = '#e30613'; g.lineWidth = 2; g.beginPath(); g.arc(raw.pts[i].x, raw.pts[i].y, 9, 0, 7); g.stroke();
        g.beginPath(); g.moveTo(0, raw.pts[i].y); g.lineTo(c.width, raw.pts[i].y); g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]);
      }
    })();
    return () => { off = true; };
  }, [stage, raw, sel, mk?.start, mk?.end]); // eslint-disable-line
  const series = out?.t ? out.t.map((t, i) => ({ t, h: out.h[i] * 100, v: out.v[i] })) : [];

  return <div className="card jl-an">
    <div className="row between"><h3 style={{ margin: 0 }}>{title} · {file.name}</h3><button className="btn sm ghost" onClick={() => { if (abort.current) abort.current.aborted = true; onCancel(); }}>Cancelar</button></div>
    <VideoConvert src={src} />
    <div className="jl-stage" style={{ display: stage === 'review' || src.state !== 'ok' ? 'none' : undefined }}>
      <div ref={box} className="jl-vid" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <video ref={video} src={url} muted playsInline preload="auto" onLoadedMetadata={onMeta} onError={src.fail} />
        <svg className="sq-ov" viewBox="0 0 1 1" preserveAspectRatio="none">
          {line && <line x1={line.a.x} y1={line.a.y} x2={line.b.x} y2={line.b.y} stroke="#2a78d6" strokeWidth="0.006" />}
          {pt && <><circle cx={pt.x} cy={pt.y} r="0.012" fill="none" stroke="#e30613" strokeWidth="0.005" /><circle cx={pt.x} cy={pt.y} r="0.003" fill="#e30613" /></>}
        </svg>
      </div>
      {stage === 'calib' && <div className="stack" style={{ gap: 8 }}>
        <div className="sq-steps">
          <button className={mode === 'line' ? 'on' : ''} onClick={() => setMode('line')}><b>1</b> Arrastra de un borde a otro del disco {line && pxLen() > 10 ? '✓' : ''}</button>
          <button className={mode === 'point' ? 'on' : ''} onClick={() => setMode('point')}><b>2</b> Toca el centro del disco (extremo de la barra) {pt ? '✓' : ''}</button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Si la imagen se ve en negro (iPhone), toca una vez sobre el vídeo.</p>
        <div className="inline-fields">
          <Field label="Diámetro del disco (cm)"><input type="number" min="10" max="60" step="0.5" value={diam} onChange={e => setDiam(e.target.value)} /></Field>
          <Field label="¿Cámara lenta? fps reales" hint="vacío si se reproduce a velocidad normal"><input type="number" min="1" max="1000" placeholder="p. ej. 240" value={realFps} onChange={e => setRealFps(e.target.value)} /></Field>
        </div>
        <div className="row"><button className="btn primary" disabled={!ok} onClick={run}>Analizar repetición</button></div>
      </div>}
      {stage === 'run' && <div className="stack" style={{ gap: 6 }}><span className="small">Siguiendo la barra… {Math.round(prog * 100)} %</span><div className="jl-bar"><i style={{ width: prog * 100 + '%' }} /></div></div>}
    </div>
    {stage === 'review' && out && <div className="stack" style={{ gap: 10 }}>
      {series.length > 0 && <ResponsiveContainer width="100%" height={180}><LineChart data={series} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#ecede8" /><XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={v => fmtNum(v, 1) + ' s'} stroke="#9a9b95" fontSize={10} />
        <YAxis yAxisId="h" stroke="#9a9b95" fontSize={10} width={40} unit=" cm" /><YAxis yAxisId="v" orientation="right" stroke="#9a9b95" fontSize={10} width={46} unit=" m/s" />
        {marks.map((m, i) => <ReferenceArea key={i} yAxisId="h" x1={out.t[m.start]} x2={out.t[m.end]} fill={m.on ? '#e30613' : '#9a9b95'} fillOpacity={i === sel ? 0.22 : m.on ? 0.1 : 0.06} label={{ value: String(i + 1), position: 'insideTop', fontSize: 11, fontWeight: 700 }} />)}
        {marks.map((m, i) => <ReferenceDot key={'s' + i} yAxisId="h" x={out.t[m.start]} y={out.h[m.start] * 100} r={4} fill="#2e9e4f" stroke="#fff" />)}
        {marks.map((m, i) => <ReferenceDot key={'e' + i} yAxisId="h" x={out.t[m.end]} y={out.h[m.end] * 100} r={4} fill="#e30613" stroke="#fff" />)}
        <Line yAxisId="h" dataKey="h" stroke="#111511" dot={false} strokeWidth={2} isAnimationActive={false} />
        <Line yAxisId="v" dataKey="v" stroke="#2a78d6" dot={false} strokeWidth={1.5} isAnimationActive={false} />
      </LineChart></ResponsiveContainer>}
      <div className="small muted"><span style={{ color: '#111511' }}>━</span> altura de la barra · <span style={{ color: '#2a78d6' }}>━</span> velocidad · zonas rojas = subidas que entran en la media</div>
      <div className="small muted"><span style={{ color: '#2e9e4f' }}>●</span> inicio de la subida (punto más bajo) · <span style={{ color: '#e30613' }}>●</span> final (punto más alto). Toca una repetición para revisar sus puntos.</div>
      {marks.length > 0 && <div className="table-wrap"><table className="t small sq-reps"><thead><tr><th>Rep.</th><th className="n">Recorrido</th><th className="n">Duración</th><th className="n">V. media (VMC)</th><th className="n">V. máxima (pico)</th><th>En el cálculo</th><th /></tr></thead>
        <tbody>{stats.map((r, i) => <tr key={i} className={i === sel ? 'sel' : ''} onClick={() => setSel(i)}>
          <td><b>{i + 1}</b></td><td className="n">{r.rom != null ? Math.round(r.rom * 100) + ' cm' : '—'}</td><td className="n">{r.dur != null ? fmtNum(r.dur, 2) + ' s' : '—'}</td>
          <td className="n"><b>{r.mcv != null ? fmtNum(r.mcv, 2) : '—'}</b></td><td className="n">{r.vpeak != null ? fmtNum(r.vpeak, 2) : '—'}</td>
          <td><input type="checkbox" checked={r.on} onClick={e => e.stopPropagation()} onChange={() => setMarks(o => o.map((m, k) => (k === i ? { ...m, on: !m.on } : m)))} /></td>
          <td><button className="btn xs ghost" onClick={e => { e.stopPropagation(); setMarks(o => o.filter((_, k) => k !== i)); setSel(0); }} aria-label="Quitar">×</button></td></tr>)}</tbody></table></div>}
      {marks.length !== REPS && <div className="alert warn small"><span>⚠</span><div>Se esperan {REPS} repeticiones y hay {marks.length}. {marks.length < REPS ? 'Puedes añadir una a mano y ajustar sus puntos.' : 'Quita las que no correspondan.'}</div></div>}
      {marks.length < 8 && <div><button className="btn sm" onClick={addRep}>+ Añadir repetición a mano</button></div>}
      {mk && <div className="card sq-adj"><b className="small">Repetición {sel + 1} · puntos exactos de la fase concéntrica</b>
        <div className="mj-fr">{[['start', 'Inicio (abajo)', cS], ['end', 'Final (arriba)', cE]].map(([w, l, ref]) => <div key={w}><span className="small muted">{l} · {fmtNum(out.t[mk[w]], 2)} s</span><canvas ref={ref} />
          <div className="row" style={{ gap: 3 }}><button className="btn xs" onClick={() => nudge(sel, w, -5)}>«</button><button className="btn xs" onClick={() => nudge(sel, w, -1)}>‹ fotograma</button><button className="btn xs" onClick={() => nudge(sel, w, 1)}>fotograma ›</button><button className="btn xs" onClick={() => nudge(sel, w, 5)}>»</button></div></div>)}</div></div>}
      {rep && <div className="jl-res">
        <div><small>Velocidad media · {rep.n} rep.</small><b>{fmtNum(rep.mcv, 2)} <small>m/s</small></b></div>
        <div><small>Velocidad máxima</small><b>{fmtNum(rep.vmax, 2)} <small>m/s</small></b></div>
        <div><small>Mejor VMC</small><b>{fmtNum(rep.best, 2)} <small>m/s</small></b></div>
        <div><small>Recorrido medio</small><b>{Math.round(rep.rom * 100)} <small>cm</small></b></div>
        <div><small>Vídeo</small><b>{out.fps} <small>fps</small></b></div>
      </div>}
      {rep && (rep.rom < 0.3 || rep.rom > 0.9) && <div className="alert warn small"><span>⚠</span><div>Recorrido medio poco habitual para una sentadilla ({Math.round(rep.rom * 100)} cm): revisa el diámetro del disco y que el punto siga el extremo de la barra.</div></div>}
      {err && <div className="alert warn small"><span>⚠</span><div>{err}</div></div>}
      <div className="row">
        <button className="btn" onClick={() => { setStage('calib'); setOut(null); setRaw(null); setMarks([]); setErr(null); }}>Volver a marcar y analizar</button>
        <button className="btn primary" disabled={!rep} onClick={() => onDone({ mcv: rep.mcv, vmax: rep.vmax, vpeak: rep.vpeak, rom: rep.rom, n: rep.n, best: rep.best, reps: rep.reps, list: rep.reps.map(r => r.mcv), fps: out.fps })}>Usar: media {rep ? fmtNum(rep.mcv, 2) : '—'} · máx. {rep ? fmtNum(rep.vmax, 2) : '—'} m/s</button>
      </div>
    </div>}
    {stage !== 'review' && err && <ErrorBox error={err} />}
  </div>;
}

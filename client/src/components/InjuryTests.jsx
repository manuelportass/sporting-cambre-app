// Tests de evolución de lesionados (mensuales): movilidad (ángulo medido sobre una foto), Y-Balance y fuerza.
// Siempre lado lesionado frente a lado sano, con LSI (lesionado / sano × 100) en colores.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { MultiLine } from './charts';
import { JumpAnalyzer } from './JumpLab';
import { Confirm, Empty, ErrorBox, Field, Modal, Seg, useToast } from './ui';
import { fmtDate, fmtNum, todayISO } from '../lib/format';

const MOB = [
  ['rodilla_flexion', 'Flexión de rodilla', 'knee'],
  ['tobillo_wblt', 'Flexión dorsal de tobillo (WBLT)', 'tibia'],
  ['cadera_flexion_activa', 'Flexión de cadera activa', 'hip'],
  ['cadera_flexion_pasiva', 'Flexión de cadera pasiva', 'hip'],
];
const MOB_LABEL = Object.fromEntries(MOB.map(([k, l]) => [k, l]));
// LSI: ≥ 90 % verde · 80–89 % naranja · < 80 % rojo
export const lsiColor = v => (v == null ? '#9a9b95' : v >= 90 ? 'var(--verde)' : v >= 80 ? 'var(--naranja)' : 'var(--rojo)');
export const Lsi = ({ v, label = 'LSI' }) => <span className="lsi" style={{ '--c': lsiColor(v) }}>{label} {v == null ? '—' : `${fmtNum(v, 1)} %`}</span>;
const brz = (p, r) => (p > 0 && r >= 1 && r <= 10 ? p / (1.0278 - 0.0278 * r) : null);
const other = s => (s === 'derecha' ? 'izquierda' : s === 'izquierda' ? 'derecha' : null);

export default function InjuryTestsTab({ injury, reload }) {
  const toast = useToast();
  const [add, setAdd] = useState(null); // movilidad | ybt | fuerza
  const [del, setDel] = useState(null);
  const sideL = injury.laterality === 'derecha' || injury.laterality === 'izquierda' ? injury.laterality : null;
  const names = { les: sideL ? `Lesionado (${sideL})` : 'Lesionado', sano: sideL ? `Sano (${other(sideL)})` : 'Sano' };
  const groups = useMemo(() => {
    const m = new Map();
    for (const t of injury.tests) {
      const key = t.kind === 'movilidad' ? 'm:' + t.data.test : t.kind === 'ybt' ? 'ybt' : t.kind === 'salto' ? 'cmj' : `f:${t.data.mode}:${t.data.exercise.toLowerCase()}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(t);
    }
    return [...m.entries()];
  }, [injury.tests]);
  return <div className="stack" style={{ gap: 14 }}>
    <div className="card it-head"><div style={{ flex: 1 }}><b>Tests mensuales de progresión</b><div className="small muted">Movilidad, equilibrio (Y-Balance), fuerza y salto (CMJ unilateral), comparando el lado lesionado con el sano. LSI = lesionado / sano × 100: <span style={{ color: 'var(--verde)' }}>●</span> ≥ 90 % · <span style={{ color: 'var(--naranja)' }}>●</span> 80–89 % · <span style={{ color: 'var(--rojo)' }}>●</span> &lt; 80 %.</div></div>
      <div className="row" style={{ gap: 6 }}><button className="btn" onClick={() => setAdd('movilidad')}>+ Movilidad</button><button className="btn" onClick={() => setAdd('ybt')}>+ Y-Balance</button><button className="btn" onClick={() => setAdd('fuerza')}>+ Fuerza</button><button className="btn" onClick={() => setAdd('salto')}>+ Salto CMJ</button></div></div>
    {!sideL && <div className="alert info small"><span>ⓘ</span><div>La lesión no tiene lateralidad derecha/izquierda indicada: los tests se registran como «lesionado» y «sano».</div></div>}
    {!groups.length ? <Empty title="Sin tests registrados">Haz la primera evaluación y repítela cada mes para ver la progresión.</Empty> :
      <div className="grid g2" style={{ alignItems: 'start' }}>{groups.map(([k, list]) => <Group key={k} list={list} names={names} onDel={setDel} />)}</div>}
    {add && <AddTest kind={add} injury={injury} names={names} onClose={() => setAdd(null)} onSaved={() => { reload(); toast('Test guardado'); }} />}
    {del && <Confirm title="Eliminar test" danger confirmText="Eliminar" message={`¿Eliminar el test del ${fmtDate(del.date)}?`} onConfirm={async () => { await api.del('/injuries/tests/' + del.id); reload(); }} onClose={() => setDel(null)} />}
  </div>;
}

function Group({ list, names, onDel }) {
  const t0 = list[0], k = t0.kind, d = t0.data;
  const title = k === 'movilidad' ? MOB_LABEL[d.test] : k === 'ybt' ? 'Y-Balance Test' : k === 'salto' ? 'CMJ unilateral (altura)' : `${d.exercise} · ${d.mode === '1rm' ? '1RM estimado (Brzycki)' : `isométrico (${d.unit})`}`;
  const unit = k === 'movilidad' ? '°' : k === 'ybt' ? '%' : k === 'salto' ? 'cm' : d.unit;
  const v = (t, side) => (t.kind === 'movilidad' || t.kind === 'salto' ? t.data[side] : t.kind === 'ybt' ? t.data['comp_' + side] : t.data.mode === '1rm' ? t.data[side].rm : t.data[side]);
  const L = t => (t.kind === 'ybt' ? t.data.lsi.comp : t.data.lsi);
  const evo = [...list].reverse().map(t => ({ date: t.date, lsi: L(t) }));
  return <div className="card it-card">
    <div className="row between"><h3 style={{ margin: 0 }}>{title}</h3><span className="small muted">{list.length} evaluación{list.length > 1 ? 'es' : ''}</span></div>
    <div className="it-now">
      <div><small>{names.les}</small><b>{fmtNum(v(t0, 'les'), 1)}<small> {unit}</small></b></div>
      <div><small>{names.sano}</small><b>{fmtNum(v(t0, 'sano'), 1)}<small> {unit}</small></b></div>
      <div className="it-lsi"><Lsi v={L(t0)} label={k === 'ybt' ? 'LSI comp.' : 'LSI'} /><small className="muted">{fmtDate(t0.date)}</small></div>
    </div>
    {k === 'ybt' && <table className="t small"><thead><tr><th>Alcance (cm)</th><th className="n">{names.les}</th><th className="n">{names.sano}</th><th className="n">LSI</th></tr></thead><tbody>
      {[['ant', 'Anterior'], ['pm', 'Posteromedial'], ['pl', 'Posterolateral']].map(([x, l]) => <tr key={x}><td>{l}</td><td className="n">{fmtNum(d.les[x], 1)}</td><td className="n">{fmtNum(d.sano[x], 1)}</td><td className="n"><Lsi v={d.lsi[x]} label="" /></td></tr>)}
      <tr><td><b>Compuesta (%)</b></td><td className="n"><b>{fmtNum(d.comp_les, 1)}</b></td><td className="n"><b>{fmtNum(d.comp_sano, 1)}</b></td><td className="n"><Lsi v={d.lsi.comp} label="" /></td></tr>
    </tbody></table>}
    {k === 'ybt' && <p className="small muted" style={{ margin: 0 }}>Longitud de pierna: {fmtNum(d.leg_les, 1)} / {fmtNum(d.leg_sano, 1)} cm · diferencia en el alcance anterior: {fmtNum(d.diff_ant, 1)} cm.</p>}
    {k === 'fuerza' && d.mode === '1rm' && <p className="small muted" style={{ margin: 0 }}>{fmtNum(d.les.peso, 1)} kg × {d.les.reps} rep (lesionado) · {fmtNum(d.sano.peso, 1)} kg × {d.sano.reps} rep (sano).</p>}
    {evo.length >= 2 && <MultiLine data={evo} lines={[{ key: 'lsi', label: 'LSI (%)' }]} decimals={1} height={130} yDomain={[Math.min(60, ...evo.map(e => e.lsi ?? 100)), 110]} />}
    <table className="t small"><thead><tr><th>Fecha</th><th className="n">Lesionado</th><th className="n">Sano</th><th className="n">LSI</th><th /></tr></thead>
      <tbody>{list.map(t => <tr key={t.id}><td>{fmtDate(t.date)}</td><td className="n">{fmtNum(v(t, 'les'), 1)} {unit}</td><td className="n">{fmtNum(v(t, 'sano'), 1)} {unit}</td><td className="n"><Lsi v={L(t)} label="" /></td>
        <td><button className="btn sm ghost" onClick={() => onDel(t)} aria-label="Eliminar">×</button></td></tr>)}</tbody></table>
    {list.some(t => t.notes) && <p className="small muted" style={{ margin: 0 }}>{list.filter(t => t.notes).map(t => `${fmtDate(t.date)}: ${t.notes}`).join(' · ')}</p>}
  </div>;
}

function AddTest({ kind, injury, names, onClose, onSaved }) {
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [vid, setVid] = useState(null); // { side, file } para medir el CMJ con vídeo
  const pickV = useRef(null), recV = useRef(null), vidSide = useRef('les');
  const [d, setD] = useState(kind === 'salto' ? { les: '', sano: '', method: 'manual' } : kind === 'movilidad' ? { test: 'rodilla_flexion', les: '', sano: '' } : kind === 'ybt' ? { leg_les: '', leg_sano: '', les: { ant: '', pm: '', pl: '' }, sano: { ant: '', pm: '', pl: '' } } : { mode: '1rm', exercise: '', unit: 'kg', les: { peso: '', reps: '' }, sano: { peso: '', reps: '' } });
  const [photo, setPhoto] = useState(null); // 'les' | 'sano'
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const num = x => (x === '' || x == null ? null : Number(String(x).replace(',', '.')));
  const lsi = (a, b) => (num(a) != null && num(b) ? num(a) / num(b) * 100 : null);
  const save = async () => {
    setErr(null); setBusy(true);
    const data = kind === 'fuerza' && d.mode === 'iso' ? { ...d, les: d.isoL, sano: d.isoS } : d;
    try { await api.post(`/injuries/${injury.id}/tests`, { kind, date, notes, data }); onSaved(); onClose(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const title = { movilidad: 'Test de movilidad', ybt: 'Y-Balance Test', fuerza: 'Test de fuerza', salto: 'Salto CMJ unilateral' }[kind];
  const comp = (s, L) => { const a = ['ant', 'pm', 'pl'].map(x => num(s[x])); return a.every(x => x != null) && num(L) ? (a[0] + a[1] + a[2]) / (3 * num(L)) * 100 : null; };
  return <Modal wide title={title} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar test'}</button></>}>
    <div className="stack" style={{ gap: 12 }}>
      <div className="inline-fields"><Field label="Fecha"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field></div>

      {kind === 'movilidad' && <>
        <Field label="Test"><select value={d.test} onChange={e => setD({ ...d, test: e.target.value })}>{MOB.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <div className="it-sides">{['les', 'sano'].map(sd => <div key={sd} className="it-side"><b>{names[sd]}</b>
          <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}><Field label="Ángulo (°)"><input type="number" min="0" max="180" step="0.5" value={d[sd]} onChange={e => setD({ ...d, [sd]: e.target.value })} style={{ maxWidth: 110 }} /></Field>
            <button className="btn sm primary" onClick={() => setPhoto(sd)}>📷 Medir con foto</button></div></div>)}</div>
        <div className="it-res"><Lsi v={lsi(d.les, d.sano)} /></div>
        {photo && <AngleTool mode={MOB.find(m => m[0] === d.test)[2]} title={`${MOB_LABEL[d.test]} · ${names[photo]}`} onClose={() => setPhoto(null)} onDone={a => { setD(o => ({ ...o, [photo]: String(Math.round(a * 10) / 10) })); setPhoto(null); }} />}
      </>}

      {kind === 'ybt' && <>
        <p className="small muted" style={{ margin: 0 }}>Alcances en cm (mejor de 3 intentos válidos en cada dirección). Longitud de la pierna: de la espina ilíaca anterosuperior al maléolo interno.</p>
        <div className="it-sides">{['les', 'sano'].map(sd => <div key={sd} className="it-side"><b>{names[sd]}</b>
          <div className="inline-fields">
            <Field label="Longitud de la pierna (cm)"><input type="number" step="0.5" value={d['leg_' + sd]} onChange={e => setD({ ...d, ['leg_' + sd]: e.target.value })} /></Field>
            {[['ant', 'Anterior'], ['pm', 'Posteromedial'], ['pl', 'Posterolateral']].map(([x, l]) => <Field key={x} label={`${l} (cm)`}><input type="number" step="0.5" value={d[sd][x]} onChange={e => setD({ ...d, [sd]: { ...d[sd], [x]: e.target.value } })} /></Field>)}
          </div>
          <div className="small">Puntuación compuesta: <b>{comp(d[sd], d['leg_' + sd]) != null ? fmtNum(comp(d[sd], d['leg_' + sd]), 1) + ' %' : '—'}</b></div></div>)}</div>
        <div className="it-res">{[['ant', 'Anterior'], ['pm', 'Posteromedial'], ['pl', 'Posterolateral']].map(([x, l]) => <Lsi key={x} v={lsi(d.les[x], d.sano[x])} label={`LSI ${l.toLowerCase()}`} />)}
          <Lsi v={lsi(comp(d.les, d.leg_les), comp(d.sano, d.leg_sano))} label="LSI compuesto" /></div>
        <p className="small muted" style={{ margin: 0 }}>Puntuación compuesta (%) = (anterior + posteromedial + posterolateral) / (3 × longitud de la pierna) × 100.</p>
      </>}

      {kind === 'fuerza' && <>
        <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
          <Seg value={d.mode} onChange={m => setD({ ...d, mode: m })} options={[{ value: '1rm', label: '1RM (Brzycki)' }, { value: 'iso', label: 'Isométrico' }]} />
          <Field label="Ejercicio" style={{ flex: 1 }}><input type="text" list="it-ex" value={d.exercise} onChange={e => setD({ ...d, exercise: e.target.value })} placeholder={d.mode === '1rm' ? 'p. ej. sentadilla búlgara, extensión de rodilla…' : 'p. ej. isquiosurales 90°, aductores…'} /></Field>
          <datalist id="it-ex">{(d.mode === '1rm' ? ['Sentadilla búlgara', 'Prensa unilateral', 'Extensión de rodilla', 'Curl femoral', 'Hip thrust unilateral', 'Elevación de talones'] : ['Isquiosurales', 'Cuádriceps', 'Aductores', 'Abductores', 'Flexores de cadera', 'Sóleo / gemelo']).map(x => <option key={x} value={x} />)}</datalist>
          {d.mode === 'iso' && <Field label="Unidad"><select value={d.unit} onChange={e => setD({ ...d, unit: e.target.value })}><option value="kg">kg</option><option value="N">N</option></select></Field>}
        </div>
        <div className="it-sides">{['les', 'sano'].map(sd => <div key={sd} className="it-side"><b>{names[sd]}</b>
          {d.mode === '1rm' ? <><div className="inline-fields">
            <Field label="Peso (kg)"><input type="number" step="0.5" value={d[sd].peso} onChange={e => setD({ ...d, [sd]: { ...d[sd], peso: e.target.value } })} /></Field>
            <Field label="Repeticiones (1–10)"><input type="number" min="1" max="10" value={d[sd].reps} onChange={e => setD({ ...d, [sd]: { ...d[sd], reps: e.target.value } })} /></Field></div>
            <div className="small">1RM estimado: <b>{brz(num(d[sd].peso), num(d[sd].reps)) ? fmtNum(brz(num(d[sd].peso), num(d[sd].reps)), 1) + ' kg' : '—'}</b></div></>
            : <Field label={`Fuerza máxima (${d.unit})`}><input type="number" step="0.1" value={d[sd === 'les' ? 'isoL' : 'isoS'] ?? ''} onChange={e => setD({ ...d, [sd === 'les' ? 'isoL' : 'isoS']: e.target.value })} /></Field>}
        </div>)}</div>
        <div className="it-res"><Lsi v={d.mode === '1rm' ? lsi(brz(num(d.les.peso), num(d.les.reps)), brz(num(d.sano.peso), num(d.sano.reps))) : lsi(d.isoL, d.isoS)} /></div>
        {d.mode === '1rm' && <p className="small muted" style={{ margin: 0 }}>Brzycki (1993): 1RM = peso / (1,0278 − 0,0278 × repeticiones).</p>}
      </>}

      {kind === 'salto' && <>
        <input ref={recV} type="file" accept="video/*" capture="environment" hidden onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) setVid({ side: vidSide.current, file: f }); }} />
        <input ref={pickV} type="file" accept="video/*" hidden onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) setVid({ side: vidSide.current, file: f }); }} />
        <p className="small muted" style={{ margin: 0 }}>Altura del CMJ a una pierna (mejor de 3 intentos) en cada lado. Puedes escribirla o medirla con vídeo (tiempo de vuelo), como en los tests de salto del primer equipo.</p>
        <div className="it-sides">{['les', 'sano'].map(sd => <div key={sd} className="it-side"><b>{names[sd]}</b>
          <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}><Field label="Altura (cm)"><input type="number" min="0" max="100" step="0.1" value={d[sd]} onChange={e => setD({ ...d, [sd]: e.target.value })} style={{ maxWidth: 110 }} /></Field>
            <button className="btn sm primary" disabled={!!vid} onClick={() => { vidSide.current = sd; recV.current.click(); }}>🎥 Grabar</button>
            <button className="btn sm" disabled={!!vid} onClick={() => { vidSide.current = sd; pickV.current.click(); }}>Adjuntar vídeo</button></div></div>)}</div>
        {vid && <JumpAnalyzer key={vid.file.name + vid.side + vid.file.size} file={vid.file} slot={0} label={`CMJ · ${names[vid.side]}`} onCancel={() => setVid(null)}
          onDone={r => { setD(o => ({ ...o, [vid.side]: String(Math.round(r.h * 10) / 10), method: 'video' })); setVid(null); }} />}
        <div className="it-res"><Lsi v={lsi(d.les, d.sano)} /></div>
      </>}

      <Field label="Observaciones"><input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="dolor durante el test, compensaciones, condiciones…" /></Field>
      <ErrorBox error={err} />
    </div>
  </Modal>;
}

// Medición de un ángulo sobre una foto (la foto no se guarda: solo el ángulo)
//  knee: cadera (trocánter) → rodilla → tobillo (maléolo); flexión = 180° − ángulo interno
//  hip:  hombro/tronco → cadera (trocánter) → rodilla; flexión = 180° − ángulo interno
//  tibia: tobillo (maléolo) → rodilla (tuberosidad tibial); ángulo de la tibia con la vertical (WBLT)
const GUIDE = {
  knee: ['Trocánter mayor (cadera)', 'Epicóndilo lateral (rodilla)', 'Maléolo lateral (tobillo)'],
  hip: ['Línea media del tronco (hombro/axila)', 'Trocánter mayor (cadera)', 'Epicóndilo lateral (rodilla)'],
  tibia: ['Maléolo (tobillo)', 'Tuberosidad tibial (rodilla)'],
};
function AngleTool({ mode, title, onClose, onDone }) {
  const [src, setSrc] = useState(null);
  const [nat, setNat] = useState(null);
  const [pts, setPts] = useState([]);
  const box = useRef(null), cam = useRef(null), gal = useRef(null);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);
  const need = GUIDE[mode].length;
  const onFile = e => { const f = e.target.files[0]; e.target.value = ''; if (f) { setPts([]); setSrc(URL.createObjectURL(f)); } };
  const tap = e => {
    if (!nat) return;
    const r = box.current.getBoundingClientRect();
    const p = { x: (e.clientX - r.left) / r.width * nat.w, y: (e.clientY - r.top) / r.height * nat.h };
    setPts(o => (o.length >= need ? [p] : [...o, p]));
  };
  const angle = useMemo(() => {
    if (pts.length < need) return null;
    if (mode === 'tibia') { const [a, k] = pts; const dx = k.x - a.x, dy = a.y - k.y; return Math.abs(Math.atan2(dx, dy) * 180 / Math.PI); }
    const [a, b, c] = pts; const v1 = [a.x - b.x, a.y - b.y], v2 = [c.x - b.x, c.y - b.y];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2));
    return 180 - Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
  }, [pts, mode, need]);
  const sw = nat ? Math.max(2, nat.w / 250) : 2;
  return <Modal wide title={`Medir con foto · ${title}`} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={angle == null} onClick={() => onDone(angle)}>Usar {angle != null ? fmtNum(angle, 1) + '°' : ''}</button></>}>
    <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
    <input ref={gal} type="file" accept="image/*" hidden onChange={onFile} />
    <div className="stack" style={{ gap: 10 }}>
      {!src ? <div className="pc-opts">
        <button className="pc-opt" onClick={() => cam.current.click()}><span className="pc-ico">📷</span><b>Hacer foto</b><span className="small muted">Cámara del móvil o tablet</span></button>
        <button className="pc-opt" onClick={() => gal.current.click()}><span className="pc-ico">🖼️</span><b>Elegir foto</b><span className="small muted">De la galería</span></button>
      </div> : <>
        <p className="small" style={{ margin: 0 }}>Toca en orden: {GUIDE[mode].map((g, i) => <span key={i} className={'it-step' + (pts.length > i ? ' ok' : pts.length === i ? ' cur' : '')}>{i + 1}. {g}</span>)}</p>
        <div ref={box} className="it-photo" onClick={tap}>
          <img src={src} alt="" onLoad={e => setNat({ w: e.target.naturalWidth, h: e.target.naturalHeight })} />
          {nat && <svg viewBox={`0 0 ${nat.w} ${nat.h}`} preserveAspectRatio="none">
            {mode === 'tibia' && pts[0] && <line x1={pts[0].x} y1={pts[0].y} x2={pts[0].x} y2={0} stroke="#fff" strokeWidth={sw} strokeDasharray={`${sw * 4} ${sw * 3}`} />}
            {pts.length > 1 && <polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#e30613" strokeWidth={sw * 1.5} />}
            {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={sw * 4} fill="#e30613" stroke="#fff" strokeWidth={sw} />)}
          </svg>}
          {angle != null && <span className="it-ang">{fmtNum(angle, 1)}°</span>}
        </div>
        <div className="row" style={{ gap: 6 }}><button className="btn sm" onClick={() => setPts([])}>Volver a marcar</button><button className="btn sm ghost" onClick={() => { setSrc(null); setPts([]); }}>Otra foto</button></div>
        <p className="small muted" style={{ margin: 0 }}>{mode === 'tibia' ? 'Foto de lado, con el móvil totalmente vertical (nivelado): se mide la inclinación de la tibia respecto a la vertical.' : 'Foto de lado y perpendicular a la articulación. Ángulo de flexión = 180° − ángulo entre los dos segmentos (0° = extensión completa).'} La foto no se guarda.</p>
      </>}
    </div>
  </Modal>;
}

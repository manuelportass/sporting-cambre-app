import React, { useState } from 'react';
import { CATALOG, OTHER, ALL_REGIONS, ICONS, byKey, estimate, keyPoints, answered, GENERAL_Q } from '../lib/injuryCatalog';
import { fmtDate, todayISO } from '../lib/format';
const diffDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

// Botones-chip (una o varias opciones)
export function Chips({ options, value, onChange, multi }) {
  const sel = o => (multi ? (value || []).includes(o) : value === o);
  const click = o => {
    if (!multi) return onChange(value === o ? '' : o);
    const cur = value || [];
    onChange(cur.includes(o) ? cur.filter(x => x !== o) : [...cur, o]);
  };
  return <div className="chips">{options.map(o => <button type="button" key={o} className={'chip' + (sel(o) ? ' on' : '')} aria-pressed={sel(o)} onClick={() => click(o)}>{o}</button>)}</div>;
}

// Selector visual de lesión por región (catálogo + lesiones añadidas por el preparador)
export function InjuryPicker({ value, onChange, customs = [], onPickCustom, onDeleteCustom }) {
  const regions = ALL_REGIONS.filter(r => CATALOG.some(c => c.region === r) || customs.some(c => (c.region || 'Otras') === r));
  return <div className="injpick">
    {regions.map(r => <div key={r}><div className="injpick-r">{r}</div>
      <div className="injpick-g">{CATALOG.filter(c => c.region === r).map(c => <button type="button" key={c.key} className={'injpick-b' + (value === c.key ? ' on' : '')} onClick={() => onChange(c.key)}>
        <span>{c.icon}</span><b>{c.short}</b><small>{c.type} · con protocolo</small></button>)}
        {customs.filter(c => (c.region || 'Otras') === r).map(c => <div key={'c' + c.id} className="injpick-c">
          <button type="button" className="injpick-b custom" onClick={() => onPickCustom(c)}><span>{ICONS[c.region] || '🩹'}</span><b>{c.name}</b><small>{c.type || 'Lesión'} · añadida por ti</small></button>
          {onDeleteCustom && <button type="button" className="injpick-x" title="Quitar de la lista" aria-label={`Quitar ${c.name} de la lista`} onClick={() => onDeleteCustom(c)}>×</button>}</div>)}</div></div>)}
    <div><div className="injpick-r">¿No está en la lista?</div><div className="injpick-g"><button type="button" className={'injpick-b add' + (value === 'otra' ? ' on' : '')} onClick={() => onChange('otra')}><span>➕</span><b>Añadir otra lesión</b><small>Escribe su nombre y guárdala para la próxima vez</small></button></div></div>
  </div>;
}

export const LATS = [['derecha', 'Derecha'], ['izquierda', 'Izquierda'], ['bilateral', 'Bilateral']];
export function LatChips({ value, onChange }) {
  return <div className="chips">{LATS.map(([k, l]) => <button type="button" key={k} className={'chip' + (value === k ? ' on' : '')} onClick={() => onChange(value === k ? '' : k)}>{l}</button>)}</div>;
}

// Nombre corto de la lesión para listados
export const injName = i => (i.catalog_key && i.catalog_key !== 'otra' && byKey(i.catalog_key)?.short) || i.zone || i.diagnosis || 'Lesión';
export const shortGrade = g => (g ? g.replace(/\s*\(.*\)\s*$/, '') : g);
export const cap = t => (t ? t[0].toUpperCase() + t.slice(1) : t);
export const injSub = i => [injName(i), shortGrade(i.grade), cap(i.laterality)].filter(Boolean).join(' · ');

// Tarjeta de retorno estimado (solo con datos publicados para ese grado)
export function EstimateCard({ i }) {
  const e = estimate(i);
  const c = byKey(i.catalog_key);
  if (!e && !c?.timeNote) return null;
  const el = diffDays(i.injury_date, i.closed_at || todayISO());
  const max = e ? Math.max(e.days[1], el) * 1.1 : 0;
  return <div className="card est">
    <h3 style={{ margin: 0 }}>Plazo orientativo{e ? ` · ${shortGrade(i.grade)}` : ''}</h3>
    {e ? <>
      <div className="est-big">{e.days[0] === e.days[1] ? `≈ ${e.days[0]} días` : `${e.days[0]}–${e.days[1]} días`}<small>{e.days[0] === e.days[1] ? fmtDate(e.from, { day: 'numeric', month: 'short' }) : `${fmtDate(e.from, { day: 'numeric', month: 'short' })} – ${fmtDate(e.to, { day: 'numeric', month: 'short' })}`}</small></div>
      <div className="est-bar" aria-hidden="true"><i className="rng" style={{ left: (e.days[0] / max) * 100 + '%', width: Math.max(1.5, ((e.days[1] - e.days[0]) / max) * 100) + '%' }} /><i className="now" style={{ left: Math.min(100, (el / max) * 100) + '%' }} /></div>
      <div className="small muted">Día {el} desde la lesión · bibliografía: {e.ref}</div>
    </> : <div className="small muted" style={{ marginTop: 6 }}>Sin plazo publicado para este caso.</div>}
    {c?.timeNote && <p className="small" style={{ margin: '8px 0 0' }}>{c.timeNote}</p>}
    <p className="small muted" style={{ margin: '6px 0 0' }}>Es una referencia: la progresión se decide por criterios, no por fechas.</p>
  </div>;
}

// Checklist de criterios de una fase
export function CriteriaList({ items, checked = [], onToggle, readOnly }) {
  return <ul className="crit">{items.map((t, k) => {
    const on = checked.includes(k);
    return <li key={k}><label className={on ? 'on' : ''}><input type="checkbox" checked={on} disabled={readOnly} onChange={() => onToggle?.(k)} /><span>{t}</span></label></li>;
  })}</ul>;
}

// Tarjeta de la fase actual (objetivos, trabajo y criterios)
export function PhaseGuide({ i, curIdx, phaseCount, onToggle, onAdvance, compact }) {
  const c = byKey(i.catalog_key);
  const ph = c?.phases?.[curIdx];
  if (!ph) return null;
  const checked = i.criteria?.['p' + curIdx] || [];
  const done = checked.length >= ph.criteria.length;
  return <div className="card pguide">
    <div className="row between"><div><div className="small muted">Fase {curIdx + 1} de {phaseCount} · guía para {c.short.toLowerCase()}</div><h3 style={{ margin: '2px 0 0' }}>{ph.name}</h3></div>
      <span className={'tag' + (done ? ' ok' : '')}>{checked.length}/{ph.criteria.length} criterios</span></div>
    <div className={compact ? 'pg-grid one' : 'pg-grid'}>
      <div><div className="pg-h">🎯 Objetivos</div><ul>{ph.objectives.map(o => <li key={o}>{o}</li>)}</ul></div>
      <div><div className="pg-h">🏋️ Trabajo recomendado</div><ul>{ph.work.map(o => <li key={o}>{o}</li>)}</ul></div>
    </div>
    <div className="pg-h">✅ Criterios para pasar de fase</div>
    <CriteriaList items={ph.criteria} checked={checked} onToggle={k => onToggle(curIdx, k)} readOnly={i.status === 'completada'} />
    {ph.caution && <div className="alert warn small" style={{ marginTop: 8 }}><span>⚠</span><div>{ph.caution}</div></div>}
    {done && onAdvance && i.status !== 'completada' && curIdx < phaseCount - 1 && <button className="btn primary sm" style={{ marginTop: 10 }} onClick={onAdvance}>Criterios cumplidos · Pasar a la fase {curIdx + 2} ›</button>}
  </div>;
}

// Protocolo completo (todas las fases)
export function ProtocolView({ i, curIdx, onToggle }) {
  const c = byKey(i.catalog_key);
  const [open, setOpen] = useState(curIdx);
  if (!c || !c.phases.length) return <div className="card"><p style={{ marginTop: 0 }}><b>Sin protocolo predefinido.</b></p><p className="small muted" style={{ marginBottom: 0 }}>Elige la lesión del catálogo en «Editar datos» para ver la guía de fases, criterios de progresión y la anamnesis específica.</p></div>;
  return <div className="stack" style={{ gap: 10 }}>
    <div className="alert small"><span>ℹ</span><div>Guía de referencia elaborada a partir de la bibliografía citada abajo. No sustituye la valoración del médico o fisioterapeuta, y la fase solo cambia cuando tú lo decides.</div></div>
    <div className="proto">{c.phases.map((ph, k) => {
      const checked = i.criteria?.['p' + k] || [];
      const st = k < curIdx ? 'done' : k === curIdx ? 'cur' : '';
      return <div key={k} className={'proto-it ' + st}>
        <button className="proto-h" onClick={() => setOpen(open === k ? -1 : k)} aria-expanded={open === k}>
          <span className="proto-n">{k < curIdx ? '✓' : k + 1}</span><span className="proto-t"><b>{ph.name}</b><small>{ph.objectives.join(' · ')}</small></span>
          <span className="tag">{checked.length}/{ph.criteria.length}</span><span className="muted">{open === k ? '▴' : '▾'}</span></button>
        {open === k && <div className="proto-b">
          <div className="pg-grid"><div><div className="pg-h">🎯 Objetivos</div><ul>{ph.objectives.map(o => <li key={o}>{o}</li>)}</ul></div>
            <div><div className="pg-h">🏋️ Trabajo recomendado</div><ul>{ph.work.map(o => <li key={o}>{o}</li>)}</ul></div></div>
          <div className="pg-h">✅ Criterios para pasar de fase</div>
          <CriteriaList items={ph.criteria} checked={checked} onToggle={x => onToggle(k, x)} readOnly={i.status === 'completada'} />
          {ph.caution && <div className="alert warn small" style={{ marginTop: 8 }}><span>⚠</span><div>{ph.caution}</div></div>}
        </div>}
      </div>;
    })}</div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Bibliografía</h3><ul className="refs">{c.refs.map(r => <li key={r.u}><a href={r.u} target="_blank" rel="noreferrer">{r.t}</a></li>)}</ul></div>
  </div>;
}

// Puntos clave de la anamnesis
export function KeyPoints({ i, onOpen }) {
  const kp = keyPoints(i.catalog_key, i.anamnesis);
  const a = answered(i.catalog_key, i.anamnesis);
  return <div className="card">
    <div className="row between"><h3 style={{ margin: 0 }}>Anamnesis · puntos clave</h3><button className="btn sm ghost" onClick={onOpen}>{a.n ? `${a.n}/${a.total} respondidas ›` : 'Rellenar ›'}</button></div>
    {!a.n ? <p className="small muted" style={{ marginBottom: 0 }}>Aún sin rellenar. Son {a.total} preguntas rápidas, casi todas con opciones.</p> :
      !kp.length ? <p className="small muted" style={{ marginBottom: 0 }}>Ninguna respuesta requiere atención especial.</p> :
        <ul className="kp">{kp.map(k => <li key={k.id}>{k.text}</li>)}</ul>}
  </div>;
}

// Formulario de anamnesis
export function AnamnesisForm({ i, onSave }) {
  const c = byKey(i.catalog_key);
  const [ans, setAns] = useState(i.anamnesis || {});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (id, v) => { setAns(a => ({ ...a, [id]: v })); setDirty(true); };
  const kp = keyPoints(i.catalog_key, ans);
  const a = answered(i.catalog_key, ans);
  const group = (title, qs) => qs.length > 0 && <div className="card anam"><h3 style={{ marginTop: 0 }}>{title}</h3>
    {qs.map(q => {
      const flagged = kp.some(k => k.id === q.id);
      return <div key={q.id} className={'anam-q' + (flagged ? ' flag' : '')}>
        <div className="anam-l">{q.q}{q.why && <small>{q.why}</small>}</div>
        {q.type === 'yn' ? <Chips options={['Sí', 'No']} value={ans[q.id]} onChange={v => set(q.id, v)} /> :
          q.type === 'opt' ? (q.options.length <= 4 ? <Chips options={q.options} value={ans[q.id]} onChange={v => set(q.id, v)} /> :
            <select value={ans[q.id] || ''} onChange={e => set(q.id, e.target.value)}><option value="">—</option>{q.options.map(o => <option key={o}>{o}</option>)}</select>) :
            q.type === 'multi' ? <Chips multi options={q.options} value={ans[q.id]} onChange={v => set(q.id, v)} /> :
              q.type === 'num' ? <input type="number" inputMode="numeric" min={q.min} max={q.max} value={ans[q.id] ?? ''} onChange={e => set(q.id, e.target.value === '' ? '' : Number(e.target.value))} style={{ maxWidth: 120 }} /> :
                q.type === 'date' ? <input type="date" value={ans[q.id] || ''} onChange={e => set(q.id, e.target.value)} style={{ maxWidth: 180 }} /> :
                  <input type="text" value={ans[q.id] || ''} placeholder={q.placeholder || ''} onChange={e => set(q.id, e.target.value)} />}
        {flagged && <div className="anam-flag">⚑ {kp.find(k => k.id === q.id).text}</div>}
      </div>;
    })}</div>;
  return <div className="stack" style={{ gap: 12 }}>
    <div className="row between"><span className="small muted">{a.n} de {a.total} preguntas respondidas{kp.length ? ` · ${kp.length} puntos clave` : ''}</span>
      {<button className="btn primary" disabled={!dirty || saving} onClick={async () => { setSaving(true); try { await onSave(ans); setDirty(false); } finally { setSaving(false); } }}>{saving ? 'Guardando…' : dirty ? 'Guardar anamnesis' : 'Guardado'}</button>}</div>
    {group('Preguntas generales', GENERAL_Q)}
    {group(c && c.key !== 'otra' ? `Específicas · ${c.short}` : 'Específicas', c?.questions || [])}
    {(!c || c.key === 'otra') && <p className="small muted">Elige la lesión del catálogo en «Editar datos» para ver preguntas específicas.</p>}
    {dirty && <div className="sticky-save"><button className="btn primary" disabled={saving} onClick={async () => { setSaving(true); try { await onSave(ans); setDirty(false); } finally { setSaving(false); } }}>Guardar anamnesis</button></div>}
  </div>;
}

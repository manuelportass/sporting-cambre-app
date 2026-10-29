import React, { useEffect, useState } from 'react';
import { api, DEMO } from '../../api';
import { useClub } from '../../App';
import { Confirm, ErrorBox, Field, FileButton, Loading, Modal, PageHead, Tabs, useApi, useToast } from '../../components/ui';
import { Crest } from '../Login';
import { AuditList } from './PlayerProfile';
import { WEEKDAYS } from '../../lib/format';

export default function Settings() {
  const s = useApi('/settings');
  const [tab, setTab] = useState('club');
  return <div>
    <PageHead title="Configuración" />
    <Tabs value={tab} onChange={setTab} tabs={[{ key: 'club', label: 'Club' }, { key: 'gym', label: 'Gimnasio' }, { key: 'rehab', label: 'Readaptación' }, { key: 'load', label: 'Carga y colores' }, { key: 'wellness', label: 'Wellness' }, { key: 'avisos', label: 'Avisos al móvil' }, { key: 'forms', label: 'Formularios' }, { key: 'fields', label: 'Campos de jugador' }, { key: 'data', label: 'Copias y registro' }]} />
    {s.loading ? <Loading /> : s.error ? <ErrorBox error={s.error} /> : <>
      {tab === 'club' && <Club s={s.data} reload={s.reload} />}
      {tab === 'gym' && <Slots />}
      {tab === 'rehab' && <Rehab s={s.data} reload={s.reload} />}
      {tab === 'load' && <LoadCfg s={s.data} reload={s.reload} />}
      {tab === 'wellness' && <WellnessCfg s={s.data} reload={s.reload} />}
      {tab === 'avisos' && <PushCfg s={s.data} reload={s.reload} />}
      {tab === 'forms' && <Forms s={s.data} reload={s.reload} />}
      {tab === 'fields' && <CustomFields s={s.data} reload={s.reload} />}
      {tab === 'data' && <DataTab />}
    </>}
  </div>;
}

// Recordatorios al móvil (notificaciones push)
const KINDS = [['wellness', 'Wellness', 'Todos los días. Solo a quien no lo ha rellenado.'], ['rpe', 'RPE de la sesión', 'Solo los días de entrenamiento, a quien no lo ha registrado.'], ['eva', 'EVA (lesionados)', 'Solo los días de entrenamiento, a jugadores con una lesión abierta que no han registrado el dolor.']];
function PushCfg({ s, reload }) {
  const toast = useToast();
  const [v, setV] = useState(s.notifications || { enabled: true, wellness: { enabled: true, time: '17:00' }, rpe: { enabled: true, time: '22:00' }, eva: { enabled: true, time: '22:00' } });
  const sv = useSave('notifications', reload);
  const ov = useApi(window.__scpfDemo ? null : '/push/overview');
  const send = async kind => { try { const r = await api.post('/push/send', { kind }); toast(`Aviso enviado a ${r.users} jugador${r.users === 1 ? '' : 'es'}`); ov.reload(); } catch (e) { toast(e.message, 'err'); } };
  const days = (s.collectiveDays || []).map(d => WEEKDAYS[d].toLowerCase()).join(', ');
  return <div className="grid g2" style={{ alignItems: 'start' }}>
    <div className="card stack"><h3>Recordatorios automáticos</h3>
      <p className="small muted" style={{ margin: 0 }}>El wellness se recuerda todos los días; el RPE y el EVA, solo los días de entrenamiento colectivo ({days}). Hora de Madrid, solo a los jugadores con los avisos activados que aún no han hecho el registro.</p>
      <label className="check"><input type="checkbox" checked={v.enabled} onChange={e => setV({ ...v, enabled: e.target.checked })} /> Enviar recordatorios automáticos</label>
      {KINDS.map(([k, l, h]) => <div key={k} className="row" style={{ gap: 12, opacity: v.enabled ? 1 : 0.5 }}>
        <label className="check" style={{ minWidth: 170 }}><input type="checkbox" checked={v[k]?.enabled} onChange={e => setV({ ...v, [k]: { ...v[k], enabled: e.target.checked } })} /> {l}</label>
        <input type="time" value={v[k]?.time || ''} onChange={e => setV({ ...v, [k]: { ...v[k], time: e.target.value } })} style={{ width: 120 }} />
        <span className="small muted" style={{ flex: 1, minWidth: 180 }}>{h}</span></div>)}
      <ErrorBox error={sv.err} /><div className="row"><button className="btn primary" onClick={() => sv.save(v)}>Guardar</button><button className="btn ghost" onClick={sv.reset}>Restaurar</button></div>
    </div>
    <div className="card stack"><h3>Estado</h3>
      {window.__scpfDemo ? <p className="small muted" style={{ margin: 0 }}>En la versión de prueba no se envían avisos: funcionarán en la versión publicada (con https). Cada jugador los activa desde su móvil, en Inicio o en Perfil.</p> : ov.loading ? <Loading /> : ov.error ? <ErrorBox error={ov.error} /> : <>
        <div><b style={{ font: '700 30px var(--head)' }}>{ov.data.active}</b> <span className="muted">de {ov.data.players.length} jugadores con cuenta tienen los avisos activados</span></div>
        <div className="small">{ov.data.players.map(p => <span key={p.id} className={'tag' + (p.devices ? '' : ' warn')} style={{ margin: '0 4px 4px 0', display: 'inline-block' }}>{p.devices ? '🔔' : '🔕'} {p.display_name}</span>)}</div>
        <hr className="sep" /><h3>Enviar ahora</h3>
        <p className="small muted" style={{ margin: 0 }}>Envía el recordatorio en este momento a quien aún no lo ha hecho hoy.</p>
        <div className="row">{KINDS.map(([k, l]) => <button key={k} className="btn" onClick={() => send(k)}>{l} ({ov.data.pending[k]})</button>)}</div>
        {ov.data.log.length > 0 && <div className="small muted">Últimos envíos: {ov.data.log.slice(0, 5).map(x => `${x.kind} ${x.date.slice(8)}/${x.date.slice(5, 7)} (${x.sent})`).join(' · ')}</div>}
      </>}
    </div>
  </div>;
}

function useSave(key, reload) {
  const toast = useToast();
  const [err, setErr] = useState(null);
  const save = async value => { setErr(null); try { await api.put('/settings/' + key, { value }); toast('Configuración guardada'); reload(); } catch (e) { setErr(e.message); } };
  const reset = async () => { try { await api.post(`/settings/${key}/reset`); toast('Valores por defecto restaurados'); reload(); } catch (e) { setErr(e.message); } };
  return { save, reset, err };
}

function Club({ s, reload }) {
  const club = useClub();
  const toast = useToast();
  const [v, setV] = useState(s.club);
  const { save, err } = useSave('club', () => { reload(); club.refreshClub(); });
  const upload = async f => { try { await api.upload('/club/crest', f); toast('Escudo actualizado'); club.refreshClub(); reload(); } catch (e) { toast(e.message, 'err'); } };
  return <div className="grid g2" style={{ alignItems: 'start' }}>
    <div className="card stack"><h3>Identidad</h3>
      <Field label="Nombre del club"><input type="text" value={v.name} onChange={e => setV({ ...v, name: e.target.value })} /></Field>
      <Field label="Preparador físico (aparece en los informes)"><input type="text" value={v.coachName} onChange={e => setV({ ...v, coachName: e.target.value })} /></Field>
      <div className="inline-fields"><Field label="Color principal (blanco)"><input type="color" value={v.primary} onChange={e => setV({ ...v, primary: e.target.value })} style={{ height: 38, padding: 2 }} /></Field>
        <Field label="Color secundario (rojo)"><input type="color" value={v.accent} onChange={e => setV({ ...v, accent: e.target.value })} style={{ height: 38, padding: 2 }} /></Field></div>
      <p className="small muted" style={{ margin: 0 }}>Color principal: fondos de la barra lateral y cabeceras. Color secundario: botones, elementos activos y detalles. El color del texto se ajusta solo para mantener la legibilidad.</p>
      <ErrorBox error={err} />
      <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => save({ ...s.club, ...v, crestFileId: s.club.crestFileId })}>Guardar</button>
    </div>
    <div className="card stack" style={{ alignItems: 'flex-start' }}><h3>Escudo oficial</h3>
      <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 16 }}><Crest size={110} /></div>
      <div className="row"><FileButton className="btn" accept="image/png,image/jpeg,image/webp,image/svg+xml" onFile={upload}>Sustituir escudo</FileButton>
        {club.crestSource === 'subido' && <button className="btn ghost" onClick={async () => { await api.del('/club/crest'); toast('Escudo oficial restaurado'); club.refreshClub(); reload(); }}>Restaurar escudo oficial</button>}</div>
      <p className="small muted" style={{ margin: 0 }}>Escudo oficial incluido en la app{club.crestSource === 'subido' ? ' (ahora se usa uno subido manualmente)' : ''}.</p>
      <p className="small muted" style={{ margin: 0 }}>PNG con fondo transparente recomendado. En los PDF se inserta en formato PNG/JPG (los SVG no se incluyen en el PDF).</p>
    </div>
  </div>;
}

function Slots() {
  const toast = useToast();
  const slots = useApi('/gym/slots');
  const cats = useApi('/categories');
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  return <div className="stack">
    <div className="row"><p className="muted" style={{ margin: 0 }}>Franjas horarias del gimnasio. Puedes usar cualquier día de la semana; el control de asistencia muestra los días que tengan franjas.</p><span className="spacer" /><button className="btn primary" onClick={() => setEdit({ weekday: 2, start_time: '17:00', end_time: '18:00', label: '', category_id: '' })}>+ Franja</button></div>
    {slots.loading ? <Loading /> : !slots.data.length ? <div className="empty"><b>No hay franjas configuradas</b>Crea las franjas antes de importar el listado de jugadores para que se asignen automáticamente.</div> :
      <div className="table-wrap"><table className="t"><thead><tr><th>Día</th><th>Horario</th><th>Etiqueta</th><th>Categoría</th><th className="n">Asignados</th><th /></tr></thead>
        <tbody>{slots.data.map(s => <tr key={s.id}><td>{WEEKDAYS[s.weekday]}</td><td><b>{s.start_time}–{s.end_time}</b></td><td>{s.label || '—'}</td><td>{s.category_name || 'Mixta'}</td><td className="n">{s.assigned}</td>
          <td><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}><button className="btn sm" onClick={() => setEdit(s)}>Editar</button><button className="btn sm ghost" onClick={() => setDel(s)}>×</button></div></td></tr>)}</tbody></table></div>}
    {edit && <SlotForm s={edit} cats={cats.data || []} onClose={() => setEdit(null)} onSaved={() => { slots.reload(); toast('Franja guardada'); }} />}
    {del && <Confirm title="Eliminar franja" danger confirmText="Eliminar" message="Se quitará la asignación habitual de los jugadores de esta franja. Si tiene sesiones registradas, se desactivará conservando el historial." onConfirm={async () => { await api.del('/gym/slots/' + del.id); slots.reload(); }} onClose={() => setDel(null)} />}
  </div>;
}
function SlotForm({ s, cats, onClose, onSaved }) {
  const [v, setV] = useState({ ...s, category_id: s.category_id || '' });
  const [err, setErr] = useState(null);
  return <Modal title={s.id ? 'Editar franja' : 'Nueva franja'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={async () => {
    try { const b = { ...v, category_id: v.category_id || null }; if (s.id) await api.put('/gym/slots/' + s.id, b); else await api.post('/gym/slots', b); onSaved(); onClose(); } catch (e) { setErr(e.message); }
  }}>Guardar</button></>}>
    <div className="inline-fields">
      <Field label="Día"><select value={v.weekday} onChange={e => setV({ ...v, weekday: Number(e.target.value) })}>{WEEKDAYS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></Field>
      <Field label="Inicio"><input type="time" value={v.start_time} onChange={e => setV({ ...v, start_time: e.target.value })} /></Field>
      <Field label="Fin"><input type="time" value={v.end_time} onChange={e => setV({ ...v, end_time: e.target.value })} /></Field>
      <Field label="Categoría principal"><select value={v.category_id} onChange={e => setV({ ...v, category_id: e.target.value })}><option value="">Mixta</option>{cats.filter(c => c.code !== 'senior').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Etiqueta"><input type="text" value={v.label || ''} onChange={e => setV({ ...v, label: e.target.value })} placeholder="p. ej. Grupo A" /></Field>
    </div>
    <ErrorBox error={err} />
  </Modal>;
}

function Rehab({ s, reload }) {
  const toast = useToast();
  const ph = useApi('/injuries/phases');
  const [list, setList] = useState(null);
  const [pain, setPain] = useState(s.painScale);
  const ps = useSave('painScale', reload);
  useEffect(() => { if (ph.data) setList(ph.data.map(p => ({ ...p }))); }, [ph.data]);
  const [err, setErr] = useState(null);
  const move = (i, d) => setList(l => { const n = [...l]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n; });
  return <div className="grid g2" style={{ alignItems: 'start' }}>
    <div className="card stack"><h3>Fases de readaptación</h3>
      <p className="small muted" style={{ margin: 0 }}>Las fases no avanzan automáticamente con los días: las actualizas tú en cada proceso.</p>
      {!list ? <Loading /> : list.map((p, i) => <div key={p.id || 'n' + i} className="row" style={{ flexWrap: 'nowrap' }}>
        <b style={{ width: 22 }}>{i + 1}.</b><input type="text" value={p.name} onChange={e => setList(l => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
        <button className="btn sm ghost" disabled={i === 0} onClick={() => move(i, -1)}>↑</button><button className="btn sm ghost" disabled={i === list.length - 1} onClick={() => move(i, 1)}>↓</button>
        <button className="btn sm ghost" onClick={() => setList(l => l.filter((_, j) => j !== i))}>×</button></div>)}
      <div className="row"><button className="btn sm" onClick={() => setList(l => [...l, { name: '' }])}>+ Fase</button><span className="spacer" />
        <button className="btn primary" onClick={async () => { setErr(null); try { await api.put('/injuries/phases', { phases: list }); toast('Fases guardadas'); ph.reload(); } catch (e) { setErr(e.message); } }}>Guardar fases</button></div>
      <ErrorBox error={err} />
    </div>
    <div className="card stack"><h3>Escala de dolor</h3>
      <div className="inline-fields"><Field label="Mínimo"><input type="number" value={pain.min} onChange={e => setPain({ ...pain, min: Number(e.target.value) })} /></Field><Field label="Máximo"><input type="number" value={pain.max} onChange={e => setPain({ ...pain, max: Number(e.target.value) })} /></Field></div>
      <Field label="Descripción"><input type="text" value={pain.label} onChange={e => setPain({ ...pain, label: e.target.value })} /></Field>
      <ErrorBox error={ps.err} /><button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => ps.save(pain)}>Guardar</button>
    </div>
  </div>;
}

const parseRange = s => s.split(/[–-]/).map(x => Number(x.trim().replace(',', '.')));
function LoadCfg({ s, reload }) {
  const [l, setL] = useState(s.load);
  const [b, setB] = useState({ green: s.acwrBands.green.join('-'), yellow: s.acwrBands.yellow.map(r => r.join('-')).join(' ; '), orange: s.acwrBands.orange.map(r => r.join('-')).join(' ; '), note: s.acwrBands.note });
  const [w, setW] = useState(s.weeklyChangeBands);
  const [days, setDays] = useState(s.collectiveDays);
  const sl = useSave('load', reload), sb = useSave('acwrBands', reload), sw = useSave('weeklyChangeBands', reload), sd = useSave('collectiveDays', reload);
  const num = k => ({ value: l[k], onChange: e => setL({ ...l, [k]: Number(e.target.value) }), type: 'number', min: 0 });
  return <div className="grid g2" style={{ alignItems: 'start' }}>
    <div className="card stack"><h3>Método de cálculo</h3>
      <Field label="Método"><select value={l.method} onChange={e => setL({ ...l, method: e.target.value })}><option value="rolling">Ventanas móviles (aguda = suma 7 d; crónica = media semanal 28 d)</option><option value="ewma">EWMA (medias móviles exponencialmente ponderadas)</option></select></Field>
      <div className="inline-fields">
        <Field label="Ventana aguda (días)"><input {...num('acuteDays')} /></Field><Field label="Ventana crónica (días)"><input {...num('chronicDays')} /></Field>
        <Field label="Exposición mínima crónica (días)"><input {...num('minChronicDays')} /></Field>
        <Field label="RPE de los partidos" hint="carga = minutos × RPE"><input {...num('matchRpe')} max={10} /></Field><Field label="Pendientes tolerados en la crónica"><input {...num('maxMissingChronic')} /></Field>
        {l.method === 'ewma' && <><Field label="N EWMA aguda"><input {...num('ewmaAcuteDays')} /></Field><Field label="N EWMA crónica"><input {...num('ewmaChronicDays')} /></Field></>}
      </div>
      <ErrorBox error={sl.err} /><div className="row"><button className="btn primary" onClick={() => sl.save(l)}>Guardar método</button><button className="btn ghost" onClick={sl.reset}>Restaurar</button></div>
      <hr className="sep" /><h3>Días de entrenamiento colectivo</h3>
      <div className="row">{WEEKDAYS.slice(1).map((d, i) => <label key={d} className="check"><input type="checkbox" checked={days.includes(i + 1)} onChange={e => setDays(e.target.checked ? [...days, i + 1].sort() : days.filter(x => x !== i + 1))} />{d}</label>)}</div>
      <ErrorBox error={sd.err} /><button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => sd.save(days)}>Guardar días</button>
    </div>
    <div className="card stack"><h3>Umbrales del ACWR</h3>
      <p className="small muted" style={{ margin: 0 }}>Formato «mín-máx». Varios intervalos separados por «;». Rojo = cualquier valor fuera de los intervalos.</p>
      <Field label="Verde"><input type="text" value={b.green} onChange={e => setB({ ...b, green: e.target.value })} /></Field>
      <Field label="Amarillo"><input type="text" value={b.yellow} onChange={e => setB({ ...b, yellow: e.target.value })} /></Field>
      <Field label="Naranja"><input type="text" value={b.orange} onChange={e => setB({ ...b, orange: e.target.value })} /></Field>
      <Field label="Nota / referencia documental"><textarea value={b.note} onChange={e => setB({ ...b, note: e.target.value })} /></Field>
      <ErrorBox error={sb.err} />
      <div className="row"><button className="btn primary" onClick={() => sb.save({ green: parseRange(b.green), yellow: b.yellow.split(';').filter(x => x.trim()).map(parseRange), orange: b.orange.split(';').filter(x => x.trim()).map(parseRange), note: b.note })}>Guardar umbrales</button><button className="btn ghost" onClick={sb.reset}>Restaurar</button></div>
      <hr className="sep" /><h3>Variación semanal de la carga aguda (%)</h3>
      <div className="inline-fields">{['green', 'yellow', 'orange'].map(k => <Field key={k} label={`${{ green: 'Verde', yellow: 'Amarillo', orange: 'Naranja' }[k]} hasta ±`}><input type="number" value={w[k]} onChange={e => setW({ ...w, [k]: Number(e.target.value) })} /></Field>)}</div>
      <ErrorBox error={sw.err} /><button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => sw.save(w)}>Guardar</button>
    </div>
  </div>;
}

function WellnessCfg({ s, reload }) {
  const [v, setV] = useState(JSON.parse(JSON.stringify(s.wellness)));
  const { save, reset, err } = useSave('wellness', reload);
  const n = v.max - v.min + 1;
  const setItem = (i, k, val) => setV(o => ({ ...o, items: o.items.map((x, j) => (j === i ? { ...x, [k]: val } : x)) }));
  const resizeAnchors = (it) => Array.from({ length: n }, (_, k) => it.anchors?.[k] || '');
  return <div className="stack">
    <div className="card stack"><h3>Escala</h3>
      <div className="inline-fields"><Field label="Puntuación mínima"><input type="number" value={v.min} onChange={e => setV({ ...v, min: Number(e.target.value) })} /></Field><Field label="Puntuación máxima"><input type="number" value={v.max} onChange={e => setV({ ...v, max: Number(e.target.value) })} /></Field>
        <Field label="Verde desde (%)"><input type="number" value={v.bands.green} onChange={e => setV({ ...v, bands: { ...v.bands, green: Number(e.target.value) } })} /></Field>
        <Field label="Amarillo desde (%)"><input type="number" value={v.bands.yellow} onChange={e => setV({ ...v, bands: { ...v.bands, yellow: Number(e.target.value) } })} /></Field>
        <Field label="Naranja desde (%)"><input type="number" value={v.bands.orange} onChange={e => setV({ ...v, bands: { ...v.bands, orange: Number(e.target.value) } })} /></Field></div>
      <p className="small muted" style={{ margin: 0 }}>Cada ítem se convierte a % del estado más favorable según su dirección; los umbrales de color se aplican sobre ese %.</p></div>
    {v.items.map((it, i) => <div key={i} className="card stack">
      <div className="row"><Field label="Ítem" style={{ flex: 1 }}><input type="text" value={it.label} onChange={e => setItem(i, 'label', e.target.value)} /></Field>
        <Field label="Dirección"><select value={it.higherIsBetter ? 'h' : 'l'} onChange={e => setItem(i, 'higherIsBetter', e.target.value === 'h')}><option value="h">Puntuación alta = estado favorable</option><option value="l">Puntuación alta = estado desfavorable</option></select></Field>
        <button className="btn sm ghost" style={{ alignSelf: 'flex-end' }} onClick={() => setV(o => ({ ...o, items: o.items.filter((_, j) => j !== i) }))}>Quitar</button></div>
      <div className="inline-fields">{resizeAnchors(it).map((a, k) => <Field key={k} label={`Explicación de ${v.min + k}`}><input type="text" value={a} onChange={e => { const an = resizeAnchors(it); an[k] = e.target.value; setItem(i, 'anchors', an); }} /></Field>)}</div>
    </div>)}
    <div className="row"><button className="btn" onClick={() => setV(o => ({ ...o, items: [...o.items, { key: 'item' + Date.now().toString(36), label: '', higherIsBetter: true, anchors: [] }] }))}>+ Ítem</button><span className="spacer" />
      <button className="btn ghost" onClick={reset}>Restaurar valores por defecto</button><button className="btn primary" onClick={() => save({ ...v, items: v.items.map(it => ({ ...it, anchors: resizeAnchors(it) })) })}>Guardar wellness</button></div>
    <ErrorBox error={err} />
  </div>;
}

function ListEditor({ title, value, onSave, err }) {
  const [txt, setTxt] = useState(value.join('\n'));
  return <div className="card stack"><h3>{title}</h3><Field label="Una opción por línea"><textarea rows={7} value={txt} onChange={e => setTxt(e.target.value)} /></Field>
    <ErrorBox error={err} /><button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => onSave(txt.split('\n').map(x => x.trim()).filter(Boolean))}>Guardar</button></div>;
}
function Forms({ s, reload }) {
  const a = useSave('sessionTypes', reload), b = useSave('extraTypes', reload);
  return <div className="grid g2" style={{ alignItems: 'start' }}>
    <ListEditor title="Tipos de sesión colectiva" value={s.sessionTypes} onSave={v => a.save(v.filter(x => !/^partido|amistoso/i.test(x)))} err={a.err} />
    <ListEditor title="Tipos de entrenamiento adicional" value={s.extraTypes} onSave={b.save} err={b.err} />
  </div>;
}
function CustomFields({ s, reload }) {
  const [list, setList] = useState(s.playerCustomFields);
  const { save, err } = useSave('playerCustomFields', reload);
  return <div className="card stack" style={{ maxWidth: 720 }}><h3>Campos adicionales de la ficha de jugador</h3>
    {list.map((f, i) => <div key={i} className="row" style={{ flexWrap: 'nowrap' }}><input type="text" placeholder="Nombre del campo" value={f.label} onChange={e => setList(l => l.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
      <select value={f.type} onChange={e => setList(l => l.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))} style={{ maxWidth: 140 }}><option value="text">Texto</option><option value="number">Número</option><option value="date">Fecha</option></select>
      <button className="btn sm ghost" onClick={() => setList(l => l.filter((_, j) => j !== i))}>×</button></div>)}
    <div className="row"><button className="btn sm" onClick={() => setList(l => [...l, { key: 'c' + Date.now().toString(36), label: '', type: 'text' }])}>+ Campo</button><span className="spacer" />
      <button className="btn primary" onClick={() => save(list.filter(f => f.label.trim()))}>Guardar</button></div>
    <ErrorBox error={err} />
  </div>;
}
function DataTab() {
  const toast = useToast();
  const b = useApi('/admin/backups');
  const a = useApi('/audit?limit=200');
  const download = async () => {
    try { const res = await api.raw('POST', '/admin/backup', {}); const blob = await res.blob(); const el = document.createElement('a'); el.href = URL.createObjectURL(blob); el.download = `copia-sporting-cambre-${new Date().toISOString().slice(0, 10)}.db`; el.click(); b.reload(); }
    catch (e) { toast(e.message, 'err'); }
  };
  return <div className="stack" style={{ gap: 14 }}>
    {DEMO ? <div className="card stack"><h3>Copias de seguridad</h3><p className="small muted" style={{ margin: 0 }}>En la versión de prueba los datos se guardan solo en este navegador y no hay copias de seguridad. En la versión instalada, el servidor hace copias automáticas cada 24 horas.</p></div> :
    <div className="card stack"><h3>Copias de seguridad</h3>
      <p className="small muted" style={{ margin: 0 }}>El servidor hace una copia automática al arrancar y cada 24 horas, y conserva las 14 más recientes. Descarga una copia periódicamente y guárdala en un lugar seguro: contiene datos personales y de salud.</p>
      <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={download}>Crear y descargar copia ahora</button>
      {b.data?.length > 0 && <div className="small">Copias en el servidor: {b.data.map(x => x.name).join(' · ')}</div>}
    </div>}
    <div className="card"><h3>Registro de actividad (últimos 200 cambios)</h3>{a.loading ? <Loading /> : <AuditList rows={a.data} />}</div>
  </div>;
}

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fileUrl } from '../api';
import { COLOR_LABEL, COLOR_VAR, initials } from '../lib/format';

// ---------- Avisos ----------
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback((msg, type = 'ok') => {
    const id = Math.random();
    setList(l => [...l, { id, msg, type }]);
    setTimeout(() => setList(l => l.filter(t => t.id !== id)), type === 'err' ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">{list.map(t => <div key={t.id} className={'toast ' + t.type}>{t.msg}</div>)}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- Carga de datos ----------
export function useApi(url, deps = []) {
  const [state, set] = useState({ data: null, loading: true, error: null });
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) { set({ data: null, loading: false, error: null }); return; }
    const n = ++seq.current;
    set(s => ({ ...s, loading: true, error: null }));
    try { const d = await api.get(url); if (n === seq.current) set({ data: d, loading: false, error: null }); }
    catch (e) { if (n === seq.current) set({ data: null, loading: false, error: e.message }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, setData: d => set(s => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

export function Loading({ text = 'Cargando…' }) { return <div className="muted" style={{ padding: 20 }}>{text}</div>; }
export function ErrorBox({ error, retry }) {
  if (!error) return null;
  return <div className="alert err"><span>⚠</span><div>{error} {retry && <button className="btn sm" onClick={retry}>Reintentar</button>}</div></div>;
}
export function Empty({ title, children }) { return <div className="empty"><b>{title}</b>{children}</div>; }
export const Pending = ({ text = 'Pendiente de introducir' }) => <span className="pending">{text}</span>;
export const show = (v, suffix = '') => (v === null || v === undefined || v === '' ? <Pending /> : <>{v}{suffix}</>);

// ---------- Modales ----------
export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = e => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="x" onClick={onClose} aria-label="Cerrar">×</button></header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

// Confirmación explícita (opcionalmente escribiendo un texto)
export function Confirm({ title, message, confirmText = 'Confirmar', danger, requireText, onConfirm, onClose }) {
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const ok = !requireText || txt.trim().toLowerCase() === requireText.trim().toLowerCase();
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancelar</button>
      <button className={'btn ' + (danger ? 'danger solid' : 'primary')} disabled={!ok || busy} onClick={async () => {
        setBusy(true); setErr(null);
        try { await onConfirm(txt); onClose(); } catch (e) { setErr(e.message); setBusy(false); }
      }}>{confirmText}</button></>}>
      <div className="stack">
        <div>{message}</div>
        {requireText && <label className="field">Escribe «{requireText}» para confirmar<input type="text" value={txt} onChange={e => setTxt(e.target.value)} autoFocus /></label>}
        <ErrorBox error={err} />
      </div>
    </Modal>
  );
}

// ---------- Elementos ----------
export function Avatar({ name, fileId, size }) {
  const [broken, setBroken] = useState(false);
  return <span className={'avatar' + (size === 'lg' ? ' lg' : '')} aria-hidden="true">
    {fileId && !broken ? <img src={fileUrl(fileId)} alt="" onError={() => setBroken(true)} /> : initials(name)}
  </span>;
}
export function ColorBadge({ color, children, title }) {
  return <span className="badge" title={title || COLOR_LABEL[color]}><span className="sw" style={{ background: COLOR_VAR[color] || COLOR_VAR.gris }} />{children ?? COLOR_LABEL[color]}</span>;
}
export function Field({ label, required, hint, children, style }) {
  return <label className="field" style={style}><span>{label}{required && <span className="req"> *</span>}{hint && <span className="hint"> · {hint}</span>}</span>{children}</label>;
}
export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs" role="tablist">{tabs.map(t => <button key={t.key} role="tab" aria-selected={value === t.key} className={value === t.key ? 'on' : ''} onClick={() => onChange(t.key)}>{t.label}</button>)}</div>;
}
export function Seg({ options, value, onChange }) {
  return <div className="seg">{options.map(o => <button type="button" key={o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}
export function Legend() {
  return <div className="legend" aria-label="Leyenda de colores">
    {['verde', 'amarillo', 'naranja', 'rojo', 'gris'].map(c => <span key={c}><i style={{ background: COLOR_VAR[c] }} />{c[0].toUpperCase() + c.slice(1)} · {COLOR_LABEL[c]}</span>)}
  </div>;
}

// Selector de jugador con búsqueda (evita crear perfiles duplicados)
export function PlayerPicker({ players, value, onChange, placeholder = 'Buscar jugador…', exclude = [] }) {
  const [q, setQ] = useState('');
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = useMemo(() => players.filter(p => !exclude.includes(p.id) && norm(p.full_name || p.name).includes(norm(q))).slice(0, 40), [players, q, exclude]);
  return <div className="stack" style={{ gap: 6 }}>
    <input type="search" placeholder={placeholder} value={q} onChange={e => setQ(e.target.value)} autoFocus />
    <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
      {list.map(p => <button key={p.id} type="button" onClick={() => onChange(p)} className="row" style={{ width: '100%', padding: '7px 10px', border: 0, borderBottom: '1px solid var(--line)', background: value === p.id ? '#eef4fc' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
        <Avatar name={p.full_name || p.name} fileId={p.photo_file_id} /><span style={{ fontWeight: 600 }}>{p.full_name || p.name}</span><span className="muted small">{p.category_name || 'Sin categoría'}</span>
      </button>)}
      {!list.length && <div className="muted small" style={{ padding: 10 }}>Sin resultados</div>}
    </div>
  </div>;
}

// Formulario con estado de envío y error
export function useForm(initial) {
  const [v, setV] = useState(initial);
  const set = (k, val) => setV(o => ({ ...o, [k]: val }));
  const bind = (k, type = 'text') => ({
    value: v[k] ?? '', onChange: e => set(k, type === 'checkbox' ? e.target.checked : e.target.value),
    ...(type === 'checkbox' ? { checked: !!v[k] } : {}),
  });
  return { v, setV, set, bind };
}
export function useSubmit(fn) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (...a) => { setBusy(true); setError(null); try { return await fn(...a); } catch (e) { setError(e.message); throw e; } finally { setBusy(false); } };
  return { busy, error, run: (...a) => run(...a).catch(() => {}), setError };
}

export function FileButton({ accept, onFile, children, className = 'btn' }) {
  const ref = useRef();
  return <>
    <button type="button" className={className} onClick={() => ref.current.click()}>{children}</button>
    <input ref={ref} type="file" accept={accept} hidden onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) onFile(f); }} />
  </>;
}

export function KPI({ value, label, sub, color }) {
  return <div className="card kpi" style={color ? { borderTop: `4px solid ${COLOR_VAR[color]}` } : undefined}><span className="v">{value}</span><span className="l">{label}</span>{sub && <span className="s">{sub}</span>}</div>;
}

// ---------- Navegación por pantallas ----------
// Cabecera común: botón Volver + título + acciones (máx. 2)
export function PageHead({ title, eyebrow, sub, back, actions }) {
  const nav = useNavigate();
  return <div className="ph">
    {back && <button className="back" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))} aria-label="Volver">← Volver</button>}
    <div className="ph-row">
      <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{sub && <p className="ph-sub">{sub}</p>}</div>
      {actions && <div className="row">{actions}</div>}
    </div>
  </div>;
}
// Acceso grande a otra pantalla
export function Tile({ to, title, value, hint, color, onClick }) {
  const nav = useNavigate();
  return <button className="tile" onClick={onClick || (() => nav(to))} style={color ? { borderTopColor: COLOR_VAR[color] } : undefined}>
    <span className="tile-t">{title}</span>
    {value !== undefined && <span className="tile-v">{value}</span>}
    {hint && <span className="tile-h">{hint}</span>}
    <span className="tile-go" aria-hidden="true">›</span>
  </button>;
}
// Menú de acciones secundarias («⋯»)
export function MoreMenu({ items, label = 'Más opciones' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const h = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return <span className="more" ref={ref}>
    <button className="btn sm ghost" aria-label={label} aria-expanded={open} onClick={() => setOpen(o => !o)}>⋯</button>
    {open && <span className="more-menu" role="menu">{items.filter(Boolean).map((it, i) => <button key={i} role="menuitem" className={it.danger ? 'danger' : ''} onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>)}</span>}
  </span>;
}
// Fila de lista con acceso a una pantalla de detalle
export function ListRow({ onClick, left, title, sub, right }) {
  return <button className="lrow" onClick={onClick}>
    {left}<span className="lrow-main"><span className="lrow-t">{title}</span>{sub && <span className="lrow-s">{sub}</span>}</span>
    {right && <span className="lrow-r">{right}</span>}<span className="lrow-go" aria-hidden="true">›</span>
  </button>;
}

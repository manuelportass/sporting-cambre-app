import React, { useState } from 'react';
import { api, crestSrc, DEMO } from '../api';
import { useClub } from '../App';
import { ErrorBox, Field } from '../components/ui';

export function Crest({ size = 76 }) {
  const club = useClub();
  const [broken, setBroken] = useState(false);
  if (club.hasCrest && !broken) return <img src={crestSrc(club.v)} alt={`Escudo ${club.name}`} style={{ width: size, height: size, objectFit: 'contain' }} onError={() => setBroken(true)} />;
  const ini = (club.name || 'SC').split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase();
  return <span className="crest-ph" title="Escudo pendiente de subir" style={{ width: size, height: size }}>{size >= 60 ? 'Escudo pendiente' : ini}</span>;
}

export default function Login({ onDone }) {
  const club = useClub();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { await api.post('/auth/login', { name, pin }); await onDone(); }
    catch (x) { setErr(x.message); setBusy(false); }
  };
  return <div className="login">
    <form className="box stack" onSubmit={submit} style={{ gap: 14 }}>
      <div className="crest"><Crest size={110} /></div>
      <div style={{ textAlign: 'center' }}>
        <div className="eyebrow">{club.name}</div>
        <h1 style={{ fontSize: 26 }}>Preparación física</h1>
      </div>
      <Field label="Nombre completo"><input type="text" autoComplete="username" value={name} onChange={e => setName(e.target.value)} placeholder="Nombre y apellidos" required autoFocus /></Field>
      <Field label="PIN"><input type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={e => setPin(e.target.value)} required /></Field>
      <ErrorBox error={err} />
      <button className="btn primary lg" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      <p className="muted small" style={{ textAlign: 'center', margin: 0 }}>¿No tienes PIN o lo has olvidado? Pídeselo al preparador físico.</p>
      {DEMO && <div className="alert info small"><span>ℹ</span><div>Versión de prueba · Preparador: <b>{window.__scpfDemo.name}</b> · PIN <b>{window.__scpfDemo.pin}</b></div></div>}
    </form>
  </div>;
}

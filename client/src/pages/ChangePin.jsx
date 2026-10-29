import React, { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App';
import { ErrorBox, Field, useToast } from '../components/ui';

export default function ChangePin({ forced, onDone }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const [v, setV] = useState({ current: '', next: '', next2: '' });
  const [err, setErr] = useState(null);
  const min = user.role === 'admin' ? 6 : 4;
  const submit = async e => {
    e.preventDefault(); setErr(null);
    if (v.next !== v.next2) return setErr('Los PIN nuevos no coinciden.');
    try { await api.post('/auth/change-pin', { current: v.current, next: v.next }); toast('PIN actualizado'); setV({ current: '', next: '', next2: '' }); onDone?.(); }
    catch (x) { setErr(x.message); }
  };
  const form = <form className="box stack card" onSubmit={submit} style={{ gap: 12, maxWidth: 420 }}>
    <h2>{forced ? 'Crea tu PIN personal' : 'Cambiar PIN'}</h2>
    {forced && <p className="muted small" style={{ margin: 0 }}>Hola, {user.name}. Por seguridad, sustituye el PIN provisional por uno personal que solo conozcas tú.</p>}
    <Field label="PIN actual" required><input type="password" inputMode="numeric" value={v.current} onChange={e => setV({ ...v, current: e.target.value })} required /></Field>
    <Field label="PIN nuevo" hint={`mín. ${min} caracteres`} required><input type="password" inputMode="numeric" value={v.next} onChange={e => setV({ ...v, next: e.target.value })} required minLength={min} /></Field>
    <Field label="Repite el PIN nuevo" required><input type="password" inputMode="numeric" value={v.next2} onChange={e => setV({ ...v, next2: e.target.value })} required /></Field>
    <ErrorBox error={err} />
    <button className="btn primary lg">Guardar PIN</button>
    {forced && <button type="button" className="btn ghost" onClick={logout}>Salir</button>}
  </form>;
  return forced ? <div className="login">{form}</div> : <div><div className="page-head"><h1>Mi PIN</h1></div>{form}</div>;
}

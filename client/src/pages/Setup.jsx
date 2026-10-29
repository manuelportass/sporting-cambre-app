import React, { useState } from 'react';
import { api } from '../api';
import { ErrorBox, Field } from '../components/ui';

export default function Setup({ onDone }) {
  const [v, setV] = useState({ code: '', name: 'José Manuel Portas Vázquez', pin: '', pin2: '' });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = k => e => setV({ ...v, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault(); setErr(null);
    if (v.pin !== v.pin2) return setErr('Los PIN no coinciden.');
    setBusy(true);
    try { await api.post('/setup', { code: v.code, name: v.name, pin: v.pin }); await onDone(); }
    catch (x) { setErr(x.message); setBusy(false); }
  };
  return <div className="login">
    <form className="box stack" onSubmit={submit} style={{ gap: 12 }}>
      <div className="eyebrow">Configuración inicial</div>
      <h1 style={{ fontSize: 24 }}>Cuenta del preparador físico</h1>
      <p className="muted small" style={{ margin: 0 }}>Este paso solo se hace una vez. El código de configuración aparece en la consola del servidor al arrancarlo.</p>
      <Field label="Código de configuración" required><input type="text" inputMode="numeric" value={v.code} onChange={set('code')} required /></Field>
      <Field label="Nombre completo (será tu usuario)" required><input type="text" value={v.name} onChange={set('name')} required /></Field>
      <Field label="PIN o contraseña" hint="mín. 6 letras o números" required><input type="password" value={v.pin} onChange={set('pin')} required minLength={6} /></Field>
      <Field label="Repite el PIN" required><input type="password" value={v.pin2} onChange={set('pin2')} required /></Field>
      <ErrorBox error={err} />
      <button className="btn primary lg" disabled={busy}>Crear cuenta y entrar</button>
    </form>
  </div>;
}

import React, { useState } from 'react';
import { api, DEMO } from '../../api';
import { Avatar, Confirm, Empty, Loading, Modal, MoreMenu, PageHead, useApi, useToast } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';

export default function Accounts() {
  const toast = useToast();
  const players = useApi('/players?category=senior');
  const users = useApi('/users');
  const settings = useApi('/settings');
  const [cred, setCred] = useState(null);
  const [del, setDel] = useState(null);
  const [perm, setPerm] = useState(false);
  const reload = () => { players.reload(); users.reload(); };
  const byPlayer = new Map((users.data || []).filter(u => u.player_id).map(u => [u.player_id, u]));
  const create = async p => { try { const r = await api.post('/users', { player_id: p.id }); setCred(r); reload(); } catch (e) { toast(e.message, 'err'); } };
  const reset = async u => { try { const r = await api.post(`/users/${u.id}/reset-pin`); setCred(r); reload(); } catch (e) { toast(e.message, 'err'); } };
  const toggle = async u => { try { await api.patch('/users/' + u.id, { active: !u.active }); toast(u.active ? 'Acceso desactivado' : 'Acceso reactivado'); reload(); } catch (e) { toast(e.message, 'err'); } };
  const pv = settings.data?.playerView;
  const setPv = async (k, val) => { try { await api.put('/settings/playerView', { value: { ...pv, [k]: val } }); settings.reload(); toast('Permisos de visualización actualizados'); } catch (e) { toast(e.message, 'err'); } };
  return <div>
    <PageHead back="/primer-equipo" title="Cuentas" sub="Cada jugador entra con su nombre completo y su PIN" actions={<button className="btn" onClick={() => setPerm(true)}>Qué ve el jugador</button>} />
    <div style={{ maxWidth: 900 }}>
      {players.loading || users.loading ? <Loading /> : !players.data.length ? <Empty title="No hay jugadores en el primer equipo" /> :
        <div className="list">{players.data.map(p => { const u = byPlayer.get(p.id); return <div key={p.id} className="lrow" style={{ cursor: 'default' }}>
          <Avatar name={p.full_name} fileId={p.photo_file_id} />
          <span className="lrow-main"><span className="lrow-t">{p.full_name}</span><span className="lrow-s">{!u ? 'Sin cuenta' : !u.active ? 'Acceso desactivado' : u.must_change_pin ? 'PIN provisional (aún no ha entrado)' : `Último acceso: ${u.last_login ? fmtDateTime(u.last_login) : '—'}`}</span></span>
          {!u ? <button className="btn sm primary" onClick={() => create(p)}>Crear cuenta</button> :
            <MoreMenu items={[{ label: 'Generar nuevo PIN', onClick: () => reset(u) }, { label: u.active ? 'Desactivar acceso' : 'Activar acceso', onClick: () => toggle(u) }, { label: 'Eliminar cuenta', danger: true, onClick: () => setDel(u) }]} />}
        </div>; })}</div>}
    </div>
    {perm && <Modal title="Qué ve cada jugador" onClose={() => setPerm(false)}><div className="stack">
        <p className="small muted" style={{ margin: 0 }}>Siempre: sus formularios de RPE, wellness y entrenamientos adicionales y su historial. Nunca: datos médicos, fichas de lesión ni datos de compañeros.</p>
        {pv && [['showLoad', 'Su gráfico de carga diaria y semanal'], ['showAcwr', 'Su ACWR con colores'], ['showTests', 'Sus resultados de tests'], ['showStats', 'Sus estadísticas de partido']].map(([k, l]) =>
          <label key={k} className="check"><input type="checkbox" checked={!!pv[k]} onChange={e => setPv(k, e.target.checked)} /> {l}</label>)}
    </div></Modal>}
    {cred && <Modal title="Credenciales de acceso" onClose={() => setCred(null)} footer={<>{!DEMO && <button className="btn" onClick={() => window.print()}>Imprimir</button>}<button className="btn primary" onClick={() => setCred(null)}>Hecho</button></>}>
      <div className="stack" style={{ textAlign: 'center' }}>
        <p className="muted" style={{ margin: 0 }}>Entrégaselas al jugador en persona. El PIN no se volverá a mostrar; al entrar por primera vez deberá cambiarlo por uno personal.</p>
        <div className="card"><div className="small muted">Usuario</div><div style={{ font: '700 24px var(--head)' }}>{cred.username}</div>
          <div className="small muted" style={{ marginTop: 8 }}>PIN provisional</div><div style={{ font: '700 40px var(--head)', letterSpacing: '.2em' }}>{cred.pin}</div>
          <div className="small muted" style={{ marginTop: 8 }}>Dirección: {window.location.origin}</div></div>
        <button className="btn" onClick={() => navigator.clipboard?.writeText(`Usuario: ${cred.username}\nPIN: ${cred.pin}\n${window.location.origin}`).then(() => toast('Copiado'))}>Copiar</button>
      </div>
    </Modal>}
    {del && <Confirm title="Eliminar cuenta" danger confirmText="Eliminar cuenta" message={`Se eliminará el acceso de ${del.display_name}. Sus registros (RPE, wellness…) se conservan.`} onConfirm={async () => { await api.del('/users/' + del.id); reload(); }} onClose={() => setDel(null)} />}
  </div>;
}

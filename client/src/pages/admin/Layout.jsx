import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth, useClub } from '../../App';
import { Crest } from '../Login';

const L = ({ to, children, end }) => <NavLink to={to} end={end}><span className="dot" />{children}</NavLink>;

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const club = useClub();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return <div className="shell">
    <div className="topbar-mobile noprint">
      <button onClick={() => setOpen(true)} aria-label="Abrir menú">☰</button>
      <b style={{ fontFamily: 'var(--head)', textTransform: 'uppercase', fontSize: 18 }}>{club.name}</b>
    </div>
    <aside className={'side' + (open ? ' open' : '')}>
      <div className="brand"><Crest size={42} /><div><b>{club.name}</b><small>Preparación física</small></div></div>
      <nav className="nav stack" style={{ gap: 2 }}>
        <L to="/" end>Inicio</L>
        <L to="/jugadores">Jugadores</L>
        <div className="nav-group">Módulos</div>
        <L to="/gimnasio">Gimnasio</L>
        <L to="/lesiones">Lesiones</L>
        <L to="/primer-equipo">Primer equipo</L>
        <div className="nav-group">Sistema</div>
        <L to="/configuracion">Configuración</L>
      </nav>
      <div className="foot">
        <div style={{ fontWeight: 600 }}>{user.name}</div>
        <div>Preparador físico · <NavLink to="/mi-pin" style={{ color: '#fff' }}>PIN</NavLink> · <button onClick={logout}>Salir</button></div>
      </div>
    </aside>
    <main className="main"><Outlet /></main>
  </div>;
}

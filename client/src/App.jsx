import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api';
import { Loading } from './components/ui';
import Login from './pages/Login';
import Setup from './pages/Setup';
import AdminLayout from './pages/admin/Layout';
import Home from './pages/admin/Home';
import Players from './pages/admin/Players';
import PlayerProfile from './pages/admin/PlayerProfile';
import Settings from './pages/admin/Settings';
import ChangePin from './pages/ChangePin';
import Attendance from './pages/gym/Attendance';
import GymReport from './pages/gym/GymReport';
import SlotAttendance from './pages/gym/SlotAttendance';
import TeamHub from './pages/team/TeamHub';
import InjuryDashboard from './pages/injuries/InjuryDashboard';
import InjuryDetail from './pages/injuries/InjuryDetail';
import TeamDashboard from './pages/team/TeamDashboard';
import PostMatch from './pages/team/PostMatch';
import TeamPlayer from './pages/team/TeamPlayer';
import Sessions from './pages/team/Sessions';
import Matches from './pages/team/Matches';
import Tests from './pages/team/Tests';
import Accounts from './pages/team/Accounts';
import Methodology from './pages/team/Methodology';
import PlayerApp from './pages/player/PlayerApp';

// Texto negro o blanco según el contraste con el color de fondo (WCAG)
function inkFor(hex) {
  const c = String(hex).replace('#', '');
  if (c.length !== 6) return '#111511';
  const lum = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2];
  return L > 0.179 ? '#111511' : '#ffffff';
}

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);
const ClubCtx = createContext(null);
export const useClub = () => useContext(ClubCtx);

export default function App() {
  const [state, setState] = useState({ loading: true, user: null, needsSetup: false });
  const [club, setClub] = useState({ name: 'Sporting Cambre', hasCrest: true, primary: '#ffffff', accent: '#dc0b11', v: 0 });

  const refreshClub = useCallback(async () => {
    try { const c = await api.get('/public/club'); setClub(o => ({ ...c, v: o.v + 1 })); } catch { /* sin conexión */ }
  }, []);
  const refresh = useCallback(async () => {
    try {
      const [{ needsSetup }, { user }] = await Promise.all([api.get('/setup/status'), api.get('/auth/me')]);
      setState({ loading: false, user, needsSetup });
    } catch (e) { setState({ loading: false, user: null, needsSetup: false, error: e.message }); }
  }, []);
  useEffect(() => { refresh(); refreshClub(); }, [refresh, refreshClub]);
  useEffect(() => {
    const h = () => setState(s => ({ ...s, user: null }));
    window.addEventListener('scpf:logout', h);
    return () => window.removeEventListener('scpf:logout', h);
  }, []);
  useEffect(() => {
    const root = document.documentElement.style;
    const primary = club.primary || '#ffffff', accent = club.accent || '#dc0b11';
    root.setProperty('--primary', primary);
    root.setProperty('--primary-ink', inkFor(primary));
    root.setProperty('--accent', accent);
    root.setProperty('--accent-ink', inkFor(accent));
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', primary);
  }, [club]);

  const logout = async () => { await api.post('/auth/logout').catch(() => {}); setState(s => ({ ...s, user: null })); };

  if (state.loading) return <Loading />;
  if (state.error) return <div className="alert err" style={{ margin: 20 }}>{state.error}</div>;
  const ctx = { user: state.user, refresh, logout };
  return (
    <AuthCtx.Provider value={ctx}>
      <ClubCtx.Provider value={{ ...club, refreshClub }}>
        {state.needsSetup ? <Setup onDone={refresh} /> :
          !state.user ? <Login onDone={refresh} /> :
          state.user.mustChangePin ? <ChangePin forced onDone={refresh} /> :
          state.user.role === 'player' ? <Routes><Route path="*" element={<PlayerApp />} /></Routes> :
          <Routes>
            <Route element={<AdminLayout />}>
              <Route index element={<Home />} />
              <Route path="jugadores" element={<Players />} />
              <Route path="jugadores/:id" element={<PlayerProfile />} />
              <Route path="gimnasio" element={<Attendance />} />
              <Route path="gimnasio/informe" element={<GymReport />} />
              <Route path="gimnasio/franja/:slotId" element={<SlotAttendance />} />
              <Route path="lesiones" element={<InjuryDashboard />} />
              <Route path="lesiones/:id" element={<InjuryDetail />} />
              <Route path="primer-equipo" element={<TeamHub />} />
              <Route path="primer-equipo/jugadores" element={<TeamDashboard />} />
              <Route path="primer-equipo/martes" element={<PostMatch />} />
              <Route path="primer-equipo/plantilla" element={<Navigate to="/primer-equipo/jugadores" replace />} />
              <Route path="primer-equipo/jugador/:id" element={<TeamPlayer />} />
              <Route path="primer-equipo/sesiones" element={<Sessions />} />
              <Route path="primer-equipo/partidos" element={<Matches />} />
              <Route path="primer-equipo/tests" element={<Tests />} />
              <Route path="primer-equipo/cuentas" element={<Accounts />} />
              <Route path="primer-equipo/metodologia" element={<Methodology />} />
              <Route path="configuracion" element={<Settings />} />
              <Route path="mi-pin" element={<ChangePin />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>}
      </ClubCtx.Provider>
    </AuthCtx.Provider>
  );
}

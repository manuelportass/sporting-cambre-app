import React, { useEffect, useRef, useState } from 'react';
import introVideo from '../assets/intro.mp4';
import introWebm from '../assets/intro.webm';
import introAnim from '../assets/intro.webp';
import introPoster from '../assets/intro-poster.jpg';

// Intro animada del escudo al abrir la app (una vez por apertura). Empieza sola y se puede saltar con «Saltar».
// Algunos móviles no dejan reproducir vídeos solos (modo de ahorro de batería, navegadores dentro de otras apps…):
// en ese caso se muestra la misma animación como imagen animada, que siempre se reproduce sola.
const DUR = 8000;
export default function Intro() {
  const [show, setShow] = useState(() => {
    try { if (sessionStorage.getItem('scpf-intro')) return false; } catch { /* sin almacenamiento */ }
    return true;
  });
  const [leaving, setLeaving] = useState(false);
  const [mode, setMode] = useState('video'); // video | img
  const v = useRef(null), timer = useRef(null), started = useRef(false);
  const done = () => {
    setLeaving(l => {
      if (!l) { try { sessionStorage.setItem('scpf-intro', '1'); } catch { /* nada */ } setTimeout(() => setShow(false), 450); }
      return true;
    });
  };
  const arm = ms => { clearTimeout(timer.current); timer.current = setTimeout(done, ms); };
  const toImage = () => { if (started.current) return; started.current = true; setMode('img'); arm(DUR); };
  const onPlaying = () => { if (started.current && mode === 'img') return; started.current = true; arm(DUR + 1500); };
  useEffect(() => {
    if (!show) return;
    const el = v.current;
    if (el) { el.muted = true; const p = el.play?.(); if (p?.catch) p.catch(toImage); }
    const t = setTimeout(() => { if (!started.current) toImage(); }, 1200); // si el vídeo no ha empezado, imagen animada
    return () => { clearTimeout(t); clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);
  if (!show) return null;
  return <div className={'intro' + (leaving ? ' out' : '')} onClick={done} role="presentation">
    {mode === 'video' ? <video ref={v} poster={introPoster} autoPlay muted playsInline preload="auto" onPlaying={onPlaying} onEnded={done}>
      <source src={introVideo} type="video/mp4" />
      <source src={introWebm} type="video/webm" onError={toImage} />
    </video> : <img src={introAnim} alt="" />}
    <button className="intro-skip" onClick={e => { e.stopPropagation(); done(); }}>Saltar</button>
  </div>;
}

import React, { useEffect, useRef, useState } from 'react';
import introVideo from '../assets/intro.mp4';
import introWebm from '../assets/intro.webm';
import introPoster from '../assets/intro-poster.jpg';

// Intro animada del escudo al abrir la app (una vez por apertura). Se puede saltar tocando «Saltar».
// Si el navegador no deja reproducir el vídeo solo (p. ej. iPhone en modo de ahorro de batería),
// se muestra el escudo con un botón para verlo, en lugar de cerrarse sin enseñar nada.
export default function Intro() {
  const [show, setShow] = useState(() => {
    try { if (sessionStorage.getItem('scpf-intro')) return false; } catch { /* sin almacenamiento */ }
    return true;
  });
  const [leaving, setLeaving] = useState(false);
  const [blocked, setBlocked] = useState(false); // la reproducción automática no se ha permitido
  const v = useRef(null), timer = useRef(null);
  const done = () => {
    if (leaving) return;
    setLeaving(true);
    try { sessionStorage.setItem('scpf-intro', '1'); } catch { /* nada */ }
    setTimeout(() => setShow(false), 450);
  };
  const arm = ms => { clearTimeout(timer.current); timer.current = setTimeout(done, ms); };
  const play = () => {
    const el = v.current; if (!el) return;
    el.muted = true;
    const p = el.play?.();
    if (p?.then) p.then(() => { setBlocked(false); arm(9500); }).catch(() => { setBlocked(true); arm(6000); });
  };
  useEffect(() => {
    if (!show) return;
    arm(9500); // por si el vídeo no termina
    play();
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);
  if (!show) return null;
  return <div className={'intro' + (leaving ? ' out' : '')} onClick={() => (blocked ? play() : done())} role="presentation">
    <video ref={v} poster={introPoster} autoPlay muted playsInline preload="auto" onEnded={done} onPlaying={() => { setBlocked(false); arm(9500); }}>
      <source src={introVideo} type="video/mp4" />
      {/* si ningún formato se puede reproducir, se ve el escudo un momento y se cierra */}
      <source src={introWebm} type="video/webm" onError={() => { setBlocked(false); arm(1800); }} />
    </video>
    {blocked && <button className="intro-play" onClick={e => { e.stopPropagation(); play(); }}>▶ Ver la intro</button>}
    <button className="intro-skip" onClick={e => { e.stopPropagation(); done(); }}>Saltar</button>
  </div>;
}

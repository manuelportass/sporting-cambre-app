import React, { useEffect, useRef, useState } from 'react';
import introVideo from '../assets/intro.mp4';
import introPoster from '../assets/intro-poster.jpg';

// Intro animada del escudo al abrir la app (una vez por apertura). Se puede saltar tocando la pantalla.
export default function Intro() {
  const [show, setShow] = useState(() => {
    try {
      if (sessionStorage.getItem('scpf-intro')) return false;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    } catch { /* sin almacenamiento */ }
    return true;
  });
  const [leaving, setLeaving] = useState(false);
  const v = useRef(null);
  const done = () => {
    if (leaving) return;
    setLeaving(true);
    try { sessionStorage.setItem('scpf-intro', '1'); } catch { /* nada */ }
    setTimeout(() => setShow(false), 450);
  };
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(done, 9500); // por si el vídeo no termina o no se puede reproducir
    v.current?.play?.().catch(() => done());
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);
  if (!show) return null;
  return <div className={'intro' + (leaving ? ' out' : '')} onClick={done} role="presentation">
    <video ref={v} src={introVideo} poster={introPoster} autoPlay muted playsInline preload="auto" onEnded={done} onError={done} />
    <button className="intro-skip" onClick={e => { e.stopPropagation(); done(); }}>Saltar</button>
  </div>;
}

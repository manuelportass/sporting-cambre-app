import React from 'react';

// Aviso y progreso mientras se convierte un vídeo que el navegador no puede abrir
export default function VideoConvert({ src }) {
  if (src.state === 'ok') return src.converted ? <div className="alert small"><span>✔</span><div>Vídeo convertido en este dispositivo a un formato compatible (se mantienen los fotogramas y los tiempos).</div></div> : null;
  if (src.state === 'failed') return <div className="alert warn small"><span>⚠</span><div>{src.msg || 'No se ha podido convertir el vídeo.'} Puedes grabarlo en el iPhone con Ajustes › Cámara › Formatos › «Más compatible» (H.264) o abrir la app desde Safari, que sí lee estos vídeos. <button className="btn xs" onClick={src.convert}>Reintentar</button></div></div>;
  const p = src.prog;
  return <div className="card conv"><b className="small">Este navegador no puede abrir el vídeo directamente (formato HEVC/H.265 u otro). Convirtiéndolo en este dispositivo…</b>
    <span className="small muted">{p.stage === 'load' ? 'Preparando el conversor (la primera vez descarga unos 32 MB)…' : `Convirtiendo… ${Math.round(p.p * 100)} %`}</span>
    <div className="jl-bar"><i style={{ width: (p.stage === 'load' ? 3 : Math.max(3, p.p * 100)) + '%' }} /></div>
    <span className="small muted">El vídeo no se sube a ningún sitio. Un vídeo de 20 s a 120 fps puede tardar uno o dos minutos.</span></div>;
}

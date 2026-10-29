import React, { useState } from 'react';


// Aviso fijo de la versión de prueba
export default function DemoBar() {
  const [ask, setAsk] = useState(false);
  const [done, setDone] = useState(false);
  const persistent = window.__scpfDemo?.persistent;
  return <div className="demo-bar noprint" role="note">
    <b>Versión de prueba</b>
    <span>{persistent ? 'Los datos se guardan solo en este navegador.' : 'Este navegador no permite guardar: los datos se pierden al cerrar.'} Para que los jugadores entren desde su móvil hay que publicar la versión instalable.</span>
    {done ? <span>Datos borrados. Recarga la página.</span> : ask ?
      <span className="row" style={{ gap: 6 }}>¿Borrar todos los datos de prueba?
        <button onClick={async () => { await window.__scpfDemo.reset(); setDone(true); try { window.location.reload(); } catch { /* recarga manual */ } }}>Sí, borrar</button>
        <button onClick={() => setAsk(false)}>Cancelar</button></span> :
      <button onClick={() => setAsk(true)}>Empezar de cero</button>}
  </div>;
}

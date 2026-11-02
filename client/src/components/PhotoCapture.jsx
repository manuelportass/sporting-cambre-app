// Foto del jugador: cámara del dispositivo (tablet/móvil/portátil) o archivo de la galería.
// La imagen se recorta a 3:4 (600×800) igual que el resto de fotos antes de subirla.
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { normalizePlayerPhoto } from '../lib/files';
import { Avatar, Modal, useToast } from './ui';

const canLiveCamera = () => !!navigator.mediaDevices?.getUserMedia;

export default function PhotoCapture({ player, onClose, onSaved, queue }) {
  // queue: { index, total, next() } para el modo «fotos en serie»
  const toast = useToast();
  const [mode, setMode] = useState('choose'); // choose | camera | preview
  const [facing, setFacing] = useState('environment');
  const [camErr, setCamErr] = useState(null);
  const [shot, setShot] = useState(null); // { file, url }
  const [busy, setBusy] = useState(false);
  const video = useRef(null);
  const stream = useRef(null);
  const gallery = useRef(null);
  const nativeCam = useRef(null);

  const stop = () => { stream.current?.getTracks().forEach(t => t.stop()); stream.current = null; };
  useEffect(() => stop, []);
  useEffect(() => { setMode('choose'); setShot(null); setCamErr(null); stop(); }, [player.id]);
  useEffect(() => () => { if (shot?.url) URL.revokeObjectURL(shot.url); }, [shot]);

  const openCamera = async (face = facing) => {
    setCamErr(null);
    if (!canLiveCamera()) { nativeCam.current?.click(); return; }
    stop();
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: face }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      stream.current = s; setFacing(face); setMode('camera');
      requestAnimationFrame(() => { if (video.current) { video.current.srcObject = s; video.current.play?.().catch(() => {}); } });
    } catch (e) {
      setMode('choose');
      setCamErr(e?.name === 'NotAllowedError' ? 'No se ha dado permiso para usar la cámara. Actívalo en el navegador o usa «Elegir de la galería».' : 'No se ha podido abrir la cámara en este dispositivo.');
    }
  };

  const take = async () => {
    const v = video.current; if (!v?.videoWidth) return;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    const g = c.getContext('2d');
    if (facing === 'user') { g.translate(c.width, 0); g.scale(-1, 1); }
    g.drawImage(v, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
    stop();
    picked(new File([blob], 'camara.jpg', { type: 'image/jpeg' }));
  };

  const picked = async f => {
    try { const n = await normalizePlayerPhoto(f); setShot({ file: n, url: URL.createObjectURL(n) }); setMode('preview'); }
    catch { toast('No se ha podido leer la imagen', 'err'); }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.upload(`/players/${player.id}/photo`, shot.file);
      toast(`Foto de ${player.full_name} guardada`);
      onSaved?.();
      if (queue?.next) queue.next(); else onClose();
    } catch (e) { toast(e.message || 'No se pudo subir la foto', 'err'); }
    finally { setBusy(false); }
  };

  const fileInputs = <>
    <input ref={gallery} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) picked(f); }} />
    <input ref={nativeCam} type="file" accept="image/*" capture="environment" hidden onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) picked(f); }} />
  </>;

  const title = queue ? `Fotos en serie · ${queue.index + 1} de ${queue.total}` : 'Foto del jugador';
  const close = () => { stop(); onClose(); };

  return <Modal title={title} onClose={close} footer={<>
    {mode === 'camera' && <><button className="btn" onClick={() => { stop(); setMode('choose'); }}>Volver</button><button className="btn primary" onClick={take}>Hacer foto</button></>}
    {mode === 'preview' && <><button className="btn" disabled={busy} onClick={() => setMode('choose')}>Repetir</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : queue ? 'Guardar y siguiente' : 'Guardar foto'}</button></>}
    {mode === 'choose' && (queue ? <><button className="btn" onClick={close}>Terminar</button><button className="btn" onClick={queue.next}>Saltar jugador</button></> : <button className="btn" onClick={close}>Cancelar</button>)}
  </>}>
    {fileInputs}
    <div className="pc-who"><Avatar name={player.full_name} fileId={player.photo_file_id} /><div><b>{player.full_name}</b><div className="small muted">{player.category_name || 'Sin categoría'}{player.photo_file_id ? ' · ya tiene foto' : ''}</div></div></div>
    {mode === 'choose' && <div className="stack" style={{ gap: 10 }}>
      <div className="pc-opts">
        <button className="pc-opt" onClick={() => openCamera()}><span className="pc-ico">📷</span><b>Hacer foto</b><span className="small muted">Con la cámara de la tablet o el móvil</span></button>
        <button className="pc-opt" onClick={() => gallery.current.click()}><span className="pc-ico">🖼️</span><b>Elegir de la galería</b><span className="small muted">Una foto ya guardada</span></button>
      </div>
      {camErr && <div className="alert warn small"><span>⚠</span><div>{camErr} <button className="btn sm" style={{ marginTop: 6 }} onClick={() => nativeCam.current.click()}>Abrir la cámara del sistema</button></div></div>}
      <p className="small muted" style={{ margin: 0 }}>La foto se recorta sola en vertical (3:4), como las demás.</p>
    </div>}
    {mode === 'camera' && <div className="pc-cam">
      <video ref={video} playsInline muted autoPlay className={facing === 'user' ? 'mirror' : ''} />
      <div className="pc-frame" aria-hidden="true" />
      <button className="pc-flip" onClick={() => openCamera(facing === 'user' ? 'environment' : 'user')} aria-label="Cambiar de cámara">⟲ Cambiar cámara</button>
    </div>}
    {mode === 'preview' && shot && <div className="pc-prev"><img src={shot.url} alt="Vista previa" /></div>}
  </Modal>;
}

// Botón de cámara pequeño sobre el avatar (listas)
export function AvatarCam({ player, onClick }) {
  return <span className="avcam" role="button" tabIndex={0} title={player.photo_file_id ? 'Cambiar foto' : 'Añadir foto'}
    onClick={e => { e.stopPropagation(); onClick(); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onClick(); } }}>
    <Avatar name={player.full_name} fileId={player.photo_file_id} />
    <span className={'avcam-b' + (player.photo_file_id ? '' : ' nophoto')} aria-hidden="true">📷</span>
  </span>;
}

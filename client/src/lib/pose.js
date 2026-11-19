// Detección automática de puntos anatómicos en una foto con MediaPipe Pose (Google, licencia Apache-2.0).
// Todo se ejecuta en el propio dispositivo: la foto no sale del navegador. Los archivos del modelo
// se sirven desde /mediapipe/ (carpeta client/public/mediapipe) y solo se descargan la primera vez que se usa.
const base = () => (window.__scpfDemo ? new URL('mediapipe/', location.href.split('#')[0].replace(/[^/]*$/, '')).href : '/mediapipe/');

let loading = null;
function loadScript() {
  if (window.Pose) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = base() + 'pose.js'; s.async = true;
    s.onload = () => (window.Pose ? res() : rej(new Error('No se ha podido cargar el detector.')));
    s.onerror = () => { loading = null; rej(new Error('No se ha podido cargar el detector.')); };
    document.head.appendChild(s);
  });
  return loading;
}

let pose = null, queue = Promise.resolve();
async function getPose() {
  await loadScript();
  if (!pose) {
    // En la versión de prueba el modelo se sirve con extensión .wasm (el alojamiento solo admite algunos tipos de archivo)
    const name = f => (window.__scpfDemo ? f.replace(/\.(tflite|binarypb|data)$/, '.$1.wasm') : f);
    pose = new window.Pose({ locateFile: f => base() + name(f) });
    pose.setOptions({ staticImageMode: true, modelComplexity: 0, smoothLandmarks: false, enableSegmentation: false, minDetectionConfidence: 0.4 });
    await pose.initialize();
  }
  return pose;
}

// Devuelve los 33 puntos normalizados (x, y entre 0 y 1; visibility 0–1) o null si no se detecta a nadie
export function detectPose(img) {
  const run = async () => {
    const p = await getPose();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('El detector ha tardado demasiado.')), 30000);
      p.onResults(r => { clearTimeout(t); resolve(r.poseLandmarks || null); });
      p.send({ image: img }).catch(e => { clearTimeout(t); reject(e); });
    });
  };
  queue = queue.then(run, run);
  return queue;
}

// Índices de MediaPipe Pose
export const LM = {
  izquierda: { shoulder: 11, hip: 23, knee: 25, ankle: 27, heel: 29, foot: 31 },
  derecha: { shoulder: 12, hip: 24, knee: 26, ankle: 28, heel: 30, foot: 32 },
};
// Qué puntos necesita cada medición (en el orden en que se marcan)
export const NEED = { knee: ['hip', 'knee', 'ankle'], hip: ['shoulder', 'hip', 'knee'], tibia: ['ankle', 'knee'] };

// Lado más visible (el más cercano a la cámara en una foto de perfil)
export function bestSide(lms, mode) {
  const vis = s => NEED[mode].reduce((a, k) => a + (lms[LM[s][k]]?.visibility ?? 0), 0);
  return vis('derecha') >= vis('izquierda') ? 'derecha' : 'izquierda';
}
// Puntos (en píxeles de la imagen) para la medición y el lado indicados
export function pointsFor(lms, mode, side, w, h) {
  return NEED[mode].map(k => { const p = lms[LM[side][k]]; return { x: p.x * w, y: p.y * h, v: p.visibility ?? 0 }; });
}

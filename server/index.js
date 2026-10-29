'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const { backup } = require('./db');
const A = require('./auth');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', 1);

  // Cabeceras de seguridad
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'");
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  app.use(A.loadUser);

  // Protección CSRF básica: las peticiones que modifican datos deben venir del mismo origen
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin && new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Origen no permitido.' });
    if (req.get('x-requested-with') !== 'scpf') return res.status(403).json({ error: 'Petición no válida.' });
    next();
  });

  // Comprobación de estado para la plataforma de alojamiento
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  const core = require('./routes/core');
  app.use('/api', core.router);
  app.use('/api/gym', require('./routes/gym').router);
  app.use('/api/injuries', require('./routes/injuries').router);
  app.use('/api/team', require('./routes/team').router);
  app.use('/api/me', require('./routes/player').router);
  app.use('/api/push', require('./routes/push').router);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

  // Interfaz compilada
  const dist = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    // El service worker no se cachea para que las actualizaciones lleguen enseguida
    app.get('/sw.js', (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Service-Worker-Allowed', '/'); res.sendFile(path.join(dist, 'sw.js')); });
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.get('/', (req, res) => res.send('Interfaz no compilada. Ejecuta «npm run build».'));
  }

  // Errores → JSON en español
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    if (status >= 500) console.error(err);
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño máximo (15 MB).' : status >= 500 ? 'Error interno del servidor.' : err.message;
    res.status(status).json({ error: msg });
  });
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const app = createApp();
  app.listen(port, () => {
    console.log(`Sporting Cambre · Preparación física → http://localhost:${port}`);
    const code = A.ensureSetupCode();
    if (code) console.log(`\n  Configuración inicial pendiente. Código de configuración: ${code}\n`);
  });
  // Copia de seguridad al arrancar y cada 24 h; limpieza de sesiones caducadas
  backup().catch(e => console.error('Copia de seguridad fallida', e));
  require('./lib/push').start(); // recordatorios de wellness, RPE y EVA
  setInterval(() => { backup().catch(e => console.error(e)); A.purgeSessions(); }, 24 * 3600 * 1000).unref();
}

module.exports = { createApp };

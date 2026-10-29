/* Service worker de Sporting Cambre · Preparación física
   - Permite instalar la app en la pantalla de inicio.
   - Recibe los recordatorios (notificaciones push) y abre la pantalla correspondiente al tocarlos.
   No guarda datos de los jugadores en caché: la información siempre se pide al servidor. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
// Sin conexión: aviso sencillo en lugar de la pantalla de error del navegador
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:40px;text-align:center"><h2>Sin conexión</h2><p>Comprueba tu conexión a internet y vuelve a abrir la app.</p></body>', { headers: { 'content-type': 'text/html; charset=utf-8' } })));
});
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Sporting Cambre', {
    body: d.body || '', icon: '/icon-192.png', badge: '/badge-72.png', tag: d.tag, renotify: !!d.tag, data: { url: d.url || '/' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (new URL(c.url).origin === self.location.origin) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});

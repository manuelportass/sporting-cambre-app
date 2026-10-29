// Router mínimo compatible con lo que usa el servidor (Express)
function compile(path) {
  const keys = [];
  const re = new RegExp('^' + path.replace(/\/:([A-Za-z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
  return { re, keys };
}
export function Router() {
  const stack = [];
  const router = (req, res, out) => {
    let i = 0;
    const next = err => {
      const layer = stack[i++];
      if (!layer) return out(err);
      const path = req.path;
      if (layer.kind === 'use') {
        const p = layer.path;
        if (p !== '/' && !(path === p || path.startsWith(p + '/'))) return next(err);
        const fn = layer.fn;
        if (err) return fn.length === 4 ? call(() => fn(err, req, res, next)) : next(err);
        if (fn.length === 4) return next();
        if (p !== '/') {
          const saved = req.path; req.path = path.slice(p.length) || '/';
          return call(() => fn(req, res, e => { req.path = saved; next(e); }), () => { req.path = saved; });
        }
        return call(() => fn(req, res, next));
      }
      if (err) return next(err);
      if (layer.method !== req.method) return next();
      const m = layer.re.exec(path);
      if (!m) return next();
      req.params = Object.fromEntries(layer.keys.map((k, j) => [k, decodeURIComponent(m[j + 1])]));
      let h = 0;
      const step = e => { if (e) return next(e); const fn = layer.handlers[h++]; if (!fn) return next(); call(() => fn(req, res, step)); };
      step();
    };
    const call = (fn, onErr) => { try { const r = fn(); if (r && r.catch) r.catch(e => { onErr?.(); next(e); }); } catch (e) { onErr?.(); next(e); } };
    next();
  };
  router.use = (p, ...fns) => { if (typeof p === 'function') { fns.unshift(p); p = '/'; } fns.forEach(fn => stack.push({ kind: 'use', path: p, fn })); return router; };
  for (const m of ['get', 'post', 'put', 'patch', 'delete']) router[m] = (p, ...handlers) => { stack.push({ kind: 'route', method: m.toUpperCase(), ...compile(p), handlers }); return router; };
  return router;
}
const express = () => Router();
express.Router = Router;
express.json = () => (req, res, next) => next();
express.static = () => (req, res, next) => next();
export default express;

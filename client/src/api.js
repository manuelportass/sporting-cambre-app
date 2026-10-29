// Cliente HTTP: cookies de sesión + cabecera anti-CSRF
async function request(method, url, body, { raw } = {}) {
  const opts = { method, credentials: 'same-origin', headers: { 'x-requested-with': 'scpf' } };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch('/api' + url, opts); }
  catch { throw new Error('No hay conexión con el servidor. Revisa tu conexión a internet.'); }
  if (raw) { if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Error'); return res; }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    const err = new Error(data?.error || `Error ${res.status}`);
    err.status = res.status;
    if (res.status === 401 && !url.startsWith('/auth')) window.dispatchEvent(new Event('scpf:logout'));
    throw err;
  }
  return data;
}
export const api = {
  get: u => request('GET', u),
  post: (u, b) => request('POST', u, b ?? {}),
  put: (u, b) => request('PUT', u, b ?? {}),
  patch: (u, b) => request('PATCH', u, b ?? {}),
  del: (u, b) => request('DELETE', u, b),
  upload: (u, file) => { const f = new FormData(); f.append('file', file); return request('POST', u, f); },
  raw: (m, u, b) => request(m, u, b, { raw: true }),
};
export const DEMO = typeof window !== 'undefined' && !!window.__scpfDemo;
export const fileUrl = id => (!id ? null : window.__scpfDemo ? window.__scpfDemo.fileUrl(id) : `/api/files/${id}`);
export const crestSrc = v => (window.__scpfDemo ? window.__scpfDemo.crestSrc() : `/api/public/crest?v=${v}`);
export const qs = o => '?' + new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

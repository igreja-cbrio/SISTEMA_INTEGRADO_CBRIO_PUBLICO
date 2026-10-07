


















import { resolveApiBaseUrl } from './api-base';

const API = resolveApiBaseUrl(import.meta.env.VITE_API_URL);














export async function fetchPublicoComRetry(doFetch, { tentativas = 3, msg = 'Erro' } = {}) {
  const RETRIABLE = new Set([403, 429, 502, 503, 504]);
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await doFetch();
      if (r.ok) return await r.json().catch(() => ({}));
      if (!RETRIABLE.has(r.status) || i === tentativas - 1) {
        const data = await r.json().catch(() => ({}));
        const err = new Error(data.error || msg);
        err.status = r.status;
        err.dados = data;
        throw err;
      }
      ultimo = new Error(`http_${r.status}`);
    } catch (e) {
      ultimo = e;
      if (i === tentativas - 1) throw e;
    }

    await new Promise((res) => setTimeout(res, (500 * Math.pow(2, i)) + Math.random() * 400));
  }
  throw ultimo || new Error(msg);
}


export const censoPublico = {
  obter: (slug) =>
    fetchPublicoComRetry(
      () => fetch(`${API}/public/censo/${encodeURIComponent(slug)}`, { headers: { 'Content-Type': 'application/json' } }),
      { tentativas: 4, msg: 'Erro ao carregar o censo' },
    ),


  prefill: (slug, dados) =>
    fetchPublicoComRetry(
      () => fetch(`${API}/public/censo/${encodeURIComponent(slug)}/prefill`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
      }),
      { tentativas: 2, msg: 'Não foi possível verificar' },
    ),


  catalogo: (nome, q) =>
    fetchPublicoComRetry(
      () => fetch(`${API}/public/censo/catalogo/${encodeURIComponent(nome)}?q=${encodeURIComponent(q)}`,
        { headers: { 'Content-Type': 'application/json' } }),
      { tentativas: 2, msg: 'Erro na busca' },
    ),
  parcial: (slug, dados) =>
    fetchPublicoComRetry(
      () => fetch(`${API}/public/censo/${encodeURIComponent(slug)}/parcial`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
      }),
      { tentativas: 2, msg: 'Não foi possível salvar' },
    ),
  retomar: (slug, dados) =>
    fetchPublicoComRetry(
      () => fetch(`${API}/public/censo/${encodeURIComponent(slug)}/retomar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
      }),
      { tentativas: 2, msg: 'Não foi possível retomar' },
    ),
  responder: (slug, payload) =>
    fetchPublicoComRetry(
      () => fetch(`${API}/public/censo/${encodeURIComponent(slug)}/responder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      }),
      { tentativas: 3, msg: 'Erro ao enviar resposta' },
    ),


  responderBeacon: (slug, payload) => {
    try {
      if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
      const url = `${API}/public/censo/${encodeURIComponent(slug)}/responder`;
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      return navigator.sendBeacon(url, blob);
    } catch { return false; }
  },
};














export async function bairrosPublicos() {
  try {
    const res = await fetch(`${API}/public/membresia/bairros`);
    if (!res.ok) return { bairros: [] };
    return res.json();
  } catch {
    return { bairros: [] };
  }
}






















const MAX_POR_REQUEST = 100;


function projetoDe(t) {
  const p = typeof t.projeto_id === 'string' ? t.projeto_id.trim() : '';
  return p || null;
}













function lotesDePush(tokens, maxPorRequest = MAX_POR_REQUEST) {
  if (!Array.isArray(tokens) || !tokens.length) return [];
  const teto = Number.isFinite(maxPorRequest) && maxPorRequest >= 1
    ? Math.floor(maxPorRequest)
    : MAX_POR_REQUEST;

  const vistos = new Set();
  const porProjeto = new Map();
  const desconhecidos = [];

  for (const t of tokens) {
    const tok = t && typeof t.token === 'string' ? t.token.trim() : '';
    if (!tok || vistos.has(tok)) continue;
    vistos.add(tok);
    const proj = projetoDe(t);
    if (proj === null) { desconhecidos.push({ ...t, token: tok }); continue; }
    const lista = porProjeto.get(proj) || [];
    lista.push({ ...t, token: tok });
    porProjeto.set(proj, lista);
  }

  const lotes = [];
  for (const proj of [...porProjeto.keys()].sort()) {
    const lista = porProjeto.get(proj);
    for (let i = 0; i < lista.length; i += teto) lotes.push(lista.slice(i, i + teto));
  }
  for (const t of desconhecidos) lotes.push([t]);
  return lotes;
}










function tokenMorreu(errorCode) {
  return String(errorCode == null ? '' : errorCode).trim() === 'DeviceNotRegistered';
}

module.exports = { MAX_POR_REQUEST, lotesDePush, tokenMorreu };

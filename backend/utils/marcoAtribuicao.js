
















const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;










const MAX_RESPONSAVEIS = 12;








function normalizarResponsaveis(bruto) {
  const lista = Array.isArray(bruto) ? bruto : (bruto === undefined || bruto === null ? [] : [bruto]);
  const ids = [];
  const invalidos = [];
  const vistos = new Set();

  for (const item of lista) {



    const cru = typeof item === 'string' ? item
      : (item && typeof item === 'object' ? (item.profile_id ?? item.id) : null);
    const id = String(cru ?? '').trim();
    if (!UUID_RE.test(id)) { if (id) invalidos.push(id); continue; }
    const chave = id.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    ids.push(id);
  }

  const truncados = Math.max(0, ids.length - MAX_RESPONSAVEIS);
  return { ids: ids.slice(0, MAX_RESPONSAVEIS), invalidos, truncados };
}


function normalizarArea(bruto) {
  if (bruto === null || bruto === '' || bruto === undefined) return null;
  const n = Number(bruto);
  return Number.isInteger(n) && n > 0 ? n : null;
}









function diffResponsaveis(atuais, novos) {
  const norm = (l) => new Set((Array.isArray(l) ? l : []).map((x) => {
    const v = typeof x === 'string' ? x : (x?.profile_id ?? x?.id);
    return String(v ?? '').trim().toLowerCase();
  }).filter(Boolean));

  const a = norm(atuais);
  const b = norm(novos);
  return {
    adicionados: [...b].filter((x) => !a.has(x)),
    removidos: [...a].filter((x) => !b.has(x)),
    inalterados: [...b].filter((x) => a.has(x)),
  };
}











function destinatariosDoAviso({ adicionados = [], pessoasDaArea = [], autorId = null } = {}) {
  const fora = new Set([String(autorId ?? '').toLowerCase()].filter(Boolean));
  const nominais = adicionados.map((x) => String(x).toLowerCase()).filter((x) => !fora.has(x));
  if (nominais.length) return { ids: [...new Set(nominais)], via: 'pessoa' };

  const daArea = (Array.isArray(pessoasDaArea) ? pessoasDaArea : [])
    .map((p) => String(typeof p === 'string' ? p : (p?.profile_id ?? p?.id) ?? '').toLowerCase())
    .filter((x) => x && !fora.has(x));
  if (daArea.length) return { ids: [...new Set(daArea)], via: 'area' };

  return { ids: [], via: null };
}

module.exports = {
  MAX_RESPONSAVEIS,
  normalizarResponsaveis,
  normalizarArea,
  diffResponsaveis,
  destinatariosDoAviso,
};

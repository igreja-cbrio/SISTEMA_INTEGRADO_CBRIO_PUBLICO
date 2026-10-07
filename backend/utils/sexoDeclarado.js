


























const CANONICO = ['masculino', 'feminino'];












function normalizarSexo(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'm' || s === 'masculino') return 'masculino';
  if (s === 'f' || s === 'feminino') return 'feminino';
  return null;
}













function consolidarDeclaracoes(declaracoes) {
  const vistos = new Map();
  for (const d of declaracoes || []) {
    const s = normalizarSexo(d?.sexo);
    if (!s) continue;
    if (!vistos.has(s)) vistos.set(s, []);
    vistos.get(s).push(String(d.fonte || '?'));
  }
  if (vistos.size === 0) return { sexo: null, fontes: [], conflito: false };
  if (vistos.size > 1) {
    return {
      sexo: null,
      fontes: [...vistos.entries()].map(([s, fs]) => `${s}:${fs.join('/')}`),
      conflito: true,
    };
  }
  const [sexo, fontes] = [...vistos.entries()][0];
  return { sexo, fontes, conflito: false };
}








function primeiroNomeParaPalpite(nome) {
  const limpo = String(nome ?? '').trim().replace(/\s+/g, ' ');
  if (!limpo) return null;
  const t = limpo.split(' ')[0];

  if (t.replace(/\./g, '').length < 2) return null;
  return t;
}










function palpitesUsaveis(saidaDoModelo) {
  const out = [];






  if (saidaDoModelo && !Array.isArray(saidaDoModelo) && typeof saidaDoModelo === 'object') {
    for (const [chave, lista] of Object.entries(saidaDoModelo)) {
      const sexo = normalizarSexo(chave);
      if (!sexo || !Array.isArray(lista)) continue;
      for (const nome of lista) {
        const n = String(nome ?? '').trim();
        if (n) out.push({ nome: n, sexo });
      }
    }
    return out;
  }




  for (const p of Array.isArray(saidaDoModelo) ? saidaDoModelo : []) {
    const sexo = normalizarSexo(p?.sexo);
    const nome = String(p?.nome ?? '').trim();
    if (!sexo || !nome) continue;
    if (String(p?.confianca ?? '').trim().toLowerCase() !== 'alta') continue;
    out.push({ nome, sexo });
  }
  return out;
}









function casarPalpites(pessoas, palpites) {
  const chave = (s) => String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toLowerCase();

  const mapa = new Map();
  for (const p of palpites || []) mapa.set(chave(p.nome), p.sexo);

  const out = [];
  for (const pessoa of pessoas || []) {
    const pn = primeiroNomeParaPalpite(pessoa?.nome);
    if (!pn) continue;
    const sexo = mapa.get(chave(pn));
    if (!sexo) continue;
    out.push({ membro_id: pessoa.membro_id ?? pessoa.id, nome: pessoa.nome, primeiro_nome: pn, sexo });
  }
  return out;
}

module.exports = {
  CANONICO,
  normalizarSexo,
  consolidarDeclaracoes,
  primeiroNomeParaPalpite,
  palpitesUsaveis,
  casarPalpites,
};

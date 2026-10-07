

























function normalizar(t) {
  return String(t == null ? '' : t)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}








function camposAgrupaveis(campos) {
  if (!Array.isArray(campos)) return [];
  return campos.filter((c) => c && c.key && Array.isArray(c.opcoes) && c.opcoes.length >= 2);
}












function opcoesMarcadas(valor, opcoes) {
  const texto = normalizar(valor);
  if (!texto || !Array.isArray(opcoes)) return [];

  const porTamanho = opcoes
    .filter((o) => typeof o === 'string' && o.trim())
    .map((o) => ({ original: o, norm: normalizar(o) }))
    .filter((o) => o.norm)
    .sort((a, b) => b.norm.length - a.norm.length);

  let resto = texto;
  const achadas = new Set();
  for (const o of porTamanho) {
    if (!resto.includes(o.norm)) continue;
    achadas.add(o.original);


    resto = resto.split(o.norm).join(' ');
  }

  return opcoes.filter((o) => achadas.has(o));
}













function resumoPorOpcao(linhas, opcoes) {
  const idx = new Map((opcoes || []).map((o) => [o, { opcao: o, inscritos: 0, presentes: 0 }]));
  let semResposta = 0;
  let naoReconhecido = 0;
  let pessoas = 0;
  let presentesTotal = 0;

  for (const l of linhas || []) {
    if (!l) continue;
    pessoas += 1;
    if (l.presente) presentesTotal += 1;
    const marcadas = opcoesMarcadas(l.valor, opcoes);
    if (!marcadas.length) {
      if (normalizar(l.valor)) naoReconhecido += 1;
      else semResposta += 1;
      continue;
    }
    for (const m of marcadas) {
      const alvo = idx.get(m);
      if (!alvo) continue;
      alvo.inscritos += 1;
      if (l.presente) alvo.presentes += 1;
    }
  }

  return {

    porOpcao: [...idx.values()].filter((o) => o.inscritos > 0)
      .sort((a, b) => b.presentes - a.presentes || b.inscritos - a.inscritos),
    sem_resposta: semResposta,
    nao_reconhecido: naoReconhecido,
    pessoas,
    presentes: presentesTotal,
  };
}

module.exports = { normalizar, camposAgrupaveis, opcoesMarcadas, resumoPorOpcao };

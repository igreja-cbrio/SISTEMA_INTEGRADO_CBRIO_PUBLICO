






















const LIGACOES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);











function tokensDaBusca(termo) {
  return String(termo == null ? '' : termo)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !LIGACOES.has(t));
}


function dataDaDecisao(d) {



  const v = d?.decidiu_em || (typeof d?.registrado_em === 'string' ? d.registrado_em.slice(0, 10) : null);
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
}










function montarResultado({ criancas, decisoes, termo, teto = 25 } = {}) {
  const tokens = tokensDaBusca(termo);
  const lista = Array.isArray(criancas) ? criancas : [];

  const porCrianca = new Map();
  for (const d of Array.isArray(decisoes) ? decisoes : []) {
    const k = d?.kids_crianca_id;
    if (!k) continue;
    if (!porCrianca.has(k)) porCrianca.set(k, []);
    porCrianca.get(k).push(d);
  }

  const itens = lista.map((c) => {
    const ds = (porCrianca.get(c.id) || [])
      .map((d) => ({
        data: dataDaDecisao(d),
        culto: d?.culto_nome || null,
        responsavel: d?.responsavel_nome || null,
      }))
      .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')));

    const nomeNorm = String(c.nome_norm || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const tk = nomeNorm.split(/\s+/).filter(Boolean);

    return {
      crianca_id: c.id,
      nome: c.nome,
      data_nascimento: c.data_nascimento || null,


      ativa: c.ativo !== false,
      visitante: c.visitante === true,



      data_conversao_ficha: c.data_conversao || null,
      estado: ds.length ? 'com_decisao' : 'sem_decisao',
      total_decisoes: ds.length,
      primeira: ds[0]?.data || null,
      ultima: ds.length ? ds[ds.length - 1].data : null,
      decisoes: ds,
      _tokens_comuns: tokens.filter((t) => tk.some((x) => x === t)).length,
    };
  });

  itens.sort((a, b) =>
    b._tokens_comuns - a._tokens_comuns ||
    (b.ativa ? 1 : 0) - (a.ativa ? 1 : 0) ||
    String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));

  const truncado = itens.length > teto;
  return {
    termo: String(termo || '').trim(),
    tokens,
    itens: itens.slice(0, teto).map(({ _tokens_comuns, ...r }) => r),
    total: itens.length,


    truncado,
  };
}

module.exports = { LIGACOES, tokensDaBusca, dataDaDecisao, montarResultado };

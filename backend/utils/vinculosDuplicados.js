






























const RANK_FUNCAO = {
  coordenador: 7, supervisor: 6, lider: 5, co_lider: 4,
  lider_treinamento: 3, frequentador: 2, membro: 2, visitante: 1,
};

function rank(funcao) {
  return RANK_FUNCAO[String(funcao || '').toLowerCase()] || 0;
}


function tempo(v) {
  if (!v) return Infinity;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? Infinity : t;
}












function escolherLinhaAManter(linhas) {
  const lista = (linhas || []).filter(Boolean);
  if (!lista.length) return null;
  const ordenadas = [...lista].sort((a, b) => (
    (b.presencas || 0) - (a.presencas || 0)
    || rank(b.funcao) - rank(a.funcao)
    || tempo(a.entrou_em) - tempo(b.entrou_em)
    || tempo(a.created_at) - tempo(b.created_at)
    || String(a.id).localeCompare(String(b.id))
  ));
  return ordenadas[0];
}









function agruparDuplicados(rows) {
  const porPar = new Map();
  for (const r of rows || []) {
    if (!r?.membro_id || !r?.grupo_id) continue;
    const chave = `${r.membro_id}|${r.grupo_id}`;
    if (!porPar.has(chave)) porPar.set(chave, []);
    porPar.get(chave).push(r);
  }

  const casos = [];
  const pessoas = new Set();
  const grupos = new Set();
  let extras = 0;

  for (const [chave, linhas] of porPar) {
    if (linhas.length < 2) continue;
    const [membro_id, grupo_id] = chave.split('|');
    const manter = escolherLinhaAManter(linhas);

    const ordenadas = [...linhas].sort((a, b) => (
      (a.id === manter.id ? -1 : 0) - (b.id === manter.id ? -1 : 0)
      || (b.presencas || 0) - (a.presencas || 0)
      || String(a.id).localeCompare(String(b.id))
    ));

    const presencasFora = ordenadas
      .filter((l) => l.id !== manter.id)
      .reduce((acc, l) => acc + (l.presencas || 0), 0);

    casos.push({
      membro_id,
      grupo_id,
      linhas: ordenadas,
      sugestao_manter_id: manter.id,
      presencas_fora_da_sugestao: presencasFora,



      exige_atencao: ordenadas.filter((l) => (l.presencas || 0) > 0).length > 1,
    });
    pessoas.add(membro_id);
    grupos.add(grupo_id);
    extras += linhas.length - 1;
  }


  casos.sort((a, b) => (
    (b.exige_atencao ? 1 : 0) - (a.exige_atencao ? 1 : 0)
    || b.linhas.length - a.linhas.length
    || String(a.membro_id).localeCompare(String(b.membro_id))
  ));

  return {
    casos,
    total_linhas_extras: extras,
    pessoas_afetadas: pessoas.size,
    grupos_afetados: grupos.size,
  };
}










function validarResolucao(linhasVivas, manterId, removerIds) {
  const vivas = (linhasVivas || []).filter(Boolean);
  const ids = new Set(vivas.map((l) => String(l.id)));
  const manter = String(manterId || '');
  const remover = [...new Set((removerIds || []).map(String))];

  if (vivas.length < 2) return { ok: false, erro: 'nao_ha_duplicata' };
  if (!ids.has(manter)) return { ok: false, erro: 'manter_invalido' };
  if (!remover.length) return { ok: false, erro: 'nada_a_remover' };
  if (remover.includes(manter)) return { ok: false, erro: 'manter_na_lista_de_remover' };
  if (remover.some((id) => !ids.has(id))) return { ok: false, erro: 'linha_fora_do_caso' };








  if (remover.length >= vivas.length) return { ok: false, erro: 'removeria_todas' };

  return { ok: true, remover };
}

module.exports = {
  RANK_FUNCAO,
  escolherLinhaAManter,
  agruparDuplicados,
  validarResolucao,
};

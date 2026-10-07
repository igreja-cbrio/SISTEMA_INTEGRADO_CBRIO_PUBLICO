














const LIMITE_MAX = 100;
const LIMITE_PADRAO = 30;



const COLUNAS_LISTA = 'id, nome, telefone, email, status, foto_url, data_nascimento, bairro, cpf';











function janelaDaFaixa(faixa, hoje = new Date()) {
  const f = (anos) => {
    const a = hoje.getFullYear() - anos;
    const m = String(hoje.getMonth() + 1).padStart(2, '0');
    const d = String(hoje.getDate()).padStart(2, '0');
    return `${a}-${m}-${d}`;
  };
  if (faixa === 'crianca') return { gt: f(13) };
  if (faixa === 'adolescente') return { gt: f(18), lte: f(13) };
  if (faixa === 'jovem') return { gt: f(26), lte: f(18) };
  if (faixa === 'adulto') return { lte: f(26) };
  return null;
}









function planoDaPagina(query = {}, hoje = new Date()) {




  const limiteBruto = parseInt(query.limite, 10);
  const limite = Number.isFinite(limiteBruto)
    ? Math.min(Math.max(limiteBruto, 1), LIMITE_MAX)
    : LIMITE_PADRAO;

  const offsetBruto = parseInt(query.offset, 10);
  const offset = Number.isFinite(offsetBruto) ? Math.max(offsetBruto, 0) : 0;


  const ascending = String(query.ordem || '') !== 'nome_desc';



  const tokens = String(query.busca || '').trim().split(/\s+/).filter(Boolean).slice(0, 6);

  return {
    limite,
    offset,
    ascending,
    range: [offset, offset + limite - 1],
    status: query.status ? String(query.status) : null,
    semCpf: query.sem_cpf === '1' || query.sem_cpf === true || query.sem_cpf === 'true',





    comCpf: query.com_cpf === '1' || query.com_cpf === true || query.com_cpf === 'true',
    faixa: janelaDaFaixa(query.faixa, hoje),
    tokens,
  };
}












function montarResposta(linhas, { total, offset, limite }) {
  const itens = (linhas || []).map((m) => {
    const { cpf, ...resto } = m;
    return { ...resto, sem_cpf: !cpf };
  });
  const t = Number(total) || 0;
  return { itens, total: t, offset, limite, tem_mais: offset + itens.length < t };
}

module.exports = {
  planoDaPagina, montarResposta, janelaDaFaixa,
  LIMITE_MAX, LIMITE_PADRAO, COLUNAS_LISTA,
};

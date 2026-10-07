





















const LIMITE_ALCADA_PADRAO = 1000;


const CATEGORIAS_ALCADA = new Set(['compras']);





function temCotacaoRegistrada(sol) {



  const bruto = sol?.valor_cotado;
  if (bruto === null || bruto === undefined || bruto === '') return false;
  const valor = Number(bruto);
  return !!sol?.cotacao_em && Number.isFinite(valor) && valor >= 0;
}






function elegivelAlcada(sol, limite = LIMITE_ALCADA_PADRAO) {
  const teto = Number.isFinite(Number(limite)) ? Number(limite) : LIMITE_ALCADA_PADRAO;
  const base = { ok: false, motivo: null, valor: null, limite: teto };

  if (!sol || typeof sol !== 'object') return { ...base, motivo: 'sem_solicitacao' };
  if (sol.deleted_at) return { ...base, motivo: 'excluida' };
  if (!CATEGORIAS_ALCADA.has(sol.categoria)) return { ...base, motivo: 'categoria_fora' };



  const aguardando = sol.status === 'aguardando_aprovacao_financeira'
    && sol.precisa_aprovacao_financeira === true
    && !sol.aprovado_financeiro_em;
  if (!aguardando) return { ...base, motivo: 'nao_aguardando_financeiro' };

  if (!temCotacaoRegistrada(sol)) return { ...base, motivo: 'sem_cotacao' };

  const valor = Number(sol.valor_cotado);
  if (valor > teto) return { ...base, motivo: 'acima_do_limite', valor };

  return { ok: true, motivo: null, valor, limite: teto };
}

module.exports = {
  LIMITE_ALCADA_PADRAO,
  CATEGORIAS_ALCADA,
  elegivelAlcada,
  temCotacaoRegistrada,
};

'use strict';
































const T = require('./campanhaTemplates');

const EM_CURSO = new Set(['rascunho', 'ativa', 'pausada']);

const numero = (v) => {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? n : null;
};






function tipoDaCampanha(extra) {
  const t = T.templateDe({ template: extra?.template });
  return {
    id: t.id,
    nome: t.id === 'legado' ? 'Arrecadação' : t.nome,
    unidade: t.unidade,
    dinheiro: t.dinheiro === true,
  };
}







function resumoCampanhaMarketing(c, extra) {
  const tipo = extra === null ? null : tipoDaCampanha(extra);
  const metaCentavos = numero(c.meta_centavos);


  const temMetaEmReais = metaCentavos != null && metaCentavos > 0;



  const emDinheiro = tipo ? tipo.dinheiro : temMetaEmReais;

  return {
    id: c.id ?? c.campanha_id,
    nome: c.nome,
    slug: c.slug,
    status: c.status,
    em_curso: EM_CURSO.has(c.status),
    publica: c.publica === true,
    digito: c.digito || null,
    data_inicio: c.data_inicio || null,
    data_lancamento: c.data_lancamento || null,
    data_fim: c.data_fim || null,
    no_ar: c.no_ar === true,
    tipo,
    em_dinheiro: emDinheiro,
    tem_meta_em_reais: temMetaEmReais,
    meta_pessoas: numero(extra?.meta_pessoas),

    meta_centavos: metaCentavos,
    total_centavos: numero(c.total_centavos) ?? 0,
    falta_centavos: numero(c.falta_centavos),
    pct: numero(c.pct),
    pct_barra: numero(c.pct_barra),
    pct_conciliando: numero(c.pct_conciliando),
    bateu_meta: c.bateu_meta === true,
    por_domingo_centavos: numero(c.por_domingo_centavos),
    domingos_restantes: numero(c.domingos_restantes),


    engajamento: { status: 'em_definicao', contribuicoes: emDinheiro ? numero(c.total_lancamentos) : null },
    custo: { status: 'em_definicao' },
  };
}






function listaDaAba(lista, extrasPorId) {
  return (lista || [])
    .filter(c => c && c.status !== 'cancelada')
    .map(c => {
      if (extrasPorId === null) return resumoCampanhaMarketing(c, null);
      const id = c.id ?? c.campanha_id;
      return resumoCampanhaMarketing(c, extrasPorId?.get?.(id) || {});
    });
}

module.exports = { resumoCampanhaMarketing, listaDaAba, tipoDaCampanha, EM_CURSO };

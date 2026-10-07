































const { idsPresentes, idsBatizadoOutraIgreja } = require('./jornadaMarcadores');

const JANELA_MESES = 12;
const VALORES_CENSO = Object.freeze(['seguir', 'conectar', 'investir', 'servir', 'generosidade']);

function desdeDozeMeses(agora = new Date()) {
  const d = new Date(agora);
  d.setMonth(d.getMonth() - JANELA_MESES);
  return d.toISOString().slice(0, 10);
}






async function valoresDosRespondentes(membroIds, opts = {}) {
  const incluirGenerosidade = opts.incluirGenerosidade === true;
  const ids = [...new Set((membroIds || []).filter(Boolean))];
  const desde = desdeDozeMeses();
  const porMembro = new Map();
  if (!ids.length) return { porMembro, indisponiveis: [], desde };

  const sinais = [
    ['batismo', () => idsPresentes('batismo_inscricoes',
      (q) => q.is('deleted_at', null).eq('status', 'realizado'), ids)],
    ['batismo_outra', () => idsBatizadoOutraIgreja(ids)],
    ['next', () => idsPresentes('vw_next_formado_pessoa', (q) => q, ids)],
    ['decisao', () => idsPresentes('cultos_decisoes_pessoas', (q) => q.is('deleted_at', null), ids)],
    ['conectar', () => idsPresentes('mem_grupo_membros',
      (q) => q.is('deleted_at', null).or(`saiu_em.is.null,saiu_em.gte.${desde}`), ids)],
    ['investir', () => idsPresentes('mem_devocionais',
      (q) => q.is('deleted_at', null).eq('concluida', true).gte('data_devocional', desde), ids)],


    ['investir_plano', () => idsPresentes('devocional_inscricoes', (q) => q, ids)],
    ['investir_leitura', () => idsPresentes('devocional_leituras_planos',
      (q) => q.gte('data_leitura', desde), ids)],
    ['servir', () => idsPresentes('mem_voluntarios',
      (q) => q.is('deleted_at', null).or(`ate.is.null,ate.gte.${desde}`), ids)],
  ];

  if (incluirGenerosidade) {
    sinais.push(['generosidade', () => idsPresentes('mem_contribuicoes',
      (q) => q.is('deleted_at', null).in('tipo', ['dizimo', 'oferta']).gte('data', desde), ids)]);
  }

  const sets = {};
  const falhas = new Set();
  await Promise.all(sinais.map(async ([chave, ler]) => {
    try { sets[chave] = await ler(); } catch (e) {
      console.error(`[censoValores] sinal "${chave}" indisponível:`, e.message);
      sets[chave] = new Set();
      falhas.add(chave);
    }
  }));

  for (const id of ids) {
    const v = {
      seguir: !!(sets.batismo.has(id) || sets.batismo_outra.has(id) || sets.next.has(id) || sets.decisao.has(id)),
      conectar: sets.conectar.has(id),
      investir: !!(sets.investir.has(id) || sets.investir_plano.has(id) || sets.investir_leitura.has(id)),
      servir: sets.servir.has(id),
    };
    if (incluirGenerosidade) v.generosidade = sets.generosidade.has(id);
    porMembro.set(id, v);
  }



  const indisponiveis = [];
  const doSeguir = ['batismo', 'batismo_outra', 'next', 'decisao'];
  if (doSeguir.some((k) => falhas.has(k))) indisponiveis.push('seguir');
  if (['investir', 'investir_plano', 'investir_leitura'].some((k) => falhas.has(k))) indisponiveis.push('investir');
  for (const k of ['conectar', 'servir', 'generosidade']) if (falhas.has(k)) indisponiveis.push(k);
  return { porMembro, indisponiveis, desde };
}

module.exports = { valoresDosRespondentes, VALORES_CENSO, JANELA_MESES, desdeDozeMeses };

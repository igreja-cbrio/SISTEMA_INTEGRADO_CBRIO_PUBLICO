






















const { supabase } = require('../../../utils/supabase');
const { notificar } = require('../../notificar');

const origem_tipo = 'generosidade';




const TIPOS_CONTRIBUICAO = new Set(['dizimo', 'oferta', 'campanha']);









function dataBrt(iso) {
  const d = iso ? new Date(iso) : new Date();

  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

const reais = (centavos) => Number((Math.round(Number(centavos) || 0) / 100).toFixed(2));

const brl = (centavos) => reais(centavos).toLocaleString('pt-BR', {
  style: 'currency', currency: 'BRL',
});


function rotulo(meta) {
  const t = String(meta?.categoria || '').toLowerCase();
  if (t === 'dizimo') return 'Dízimo';
  if (t === 'campanha') return meta?.campanha ? `Campanha · ${meta.campanha}` : 'Campanha';
  return 'Oferta';
}








async function registrarNominal(cobranca) {
  const meta = cobranca.metadata || {};
  const tipo = TIPOS_CONTRIBUICAO.has(String(meta.categoria)) ? String(meta.categoria) : 'oferta';

  const { error } = await supabase.from('mem_contribuicoes').insert({
    membro_id: cobranca.membro_id,
    tipo,



    valor: reais(cobranca.valor_pago_centavos || cobranca.valor_centavos),
    data: dataBrt(cobranca.pago_em),
    campanha: tipo === 'campanha' ? (meta.campanha || null) : null,



    forma_pagamento: cobranca.metodo || null,
    origem: 'online',
    referencia_externa: `pag:${cobranca.id}`,
    area: meta.area || null,
  });


  if (error && error.code !== '23505') throw error;
  return !error;
}

async function aoPagar(cobranca) {
  const meta = cobranca.metadata || {};
  const valor = brl(cobranca.valor_pago_centavos || cobranca.valor_centavos);
  const quem = cobranca.pagador_nome || 'Doador não identificado';





  if (!cobranca.membro_id) {
    await notificar({
      modulo: 'financeiro',
      tipo: 'doacao_sem_cadastro',
      titulo: `Doação recebida sem cadastro vinculado · ${valor}`,
      mensagem: `${quem} doou ${valor} (${rotulo(meta)}) pelo site/app, mas não foi possível vincular a um cadastro `
        + `(sem CPF informado, ou CPF ainda não cadastrado). O dinheiro está registrado; só o razão nominal ficou sem a linha. `
        + `Se quiserem contar essa pessoa nos indicadores de doadores, cadastrem o CPF dela na Membresia.`,
      link: '/financeiro-v2',
      chaveDedup: `doacao_sem_cadastro_${cobranca.id}`,
    }).catch((e) => console.error('[pagamentos/generosidade] notificar:', e.message));
    return;
  }

  const gravouAgora = await registrarNominal(cobranca);


  if (!gravouAgora) return;

  await notificar({
    modulo: 'financeiro',
    tipo: 'doacao_recebida',
    titulo: `Doação recebida · ${valor}`,
    mensagem: `${quem} doou ${valor} (${rotulo(meta)}) pelo site/app`
      + `${cobranca.metodo ? ` via ${cobranca.metodo}` : ''}. Já lançada no razão nominal de contribuições.`,
    link: '/financeiro-v2',
    chaveDedup: `doacao_${cobranca.id}`,
  }).catch((e) => console.error('[pagamentos/generosidade] notificar:', e.message));
}








async function aoPagarParcial(cobranca) {
  await notificar({
    modulo: 'financeiro',
    tipo: 'doacao_parcial',
    titulo: `Doação com valor parcial · ${brl(cobranca.valor_pago_centavos)}`,
    mensagem: `${cobranca.pagador_nome || 'Um doador'} enviou ${brl(cobranca.valor_pago_centavos)} `
      + `de ${brl(cobranca.valor_centavos)}. NÃO foi lançada no razão nominal — confiram antes de registrar.`,
    link: '/financeiro-v2',
    chaveDedup: `doacao_parcial_${cobranca.id}`,
  }).catch((e) => console.error('[pagamentos/generosidade] notificar:', e.message));
}









async function aoEstornar(cobranca) {
  await notificar({
    modulo: 'financeiro',
    tipo: 'doacao_estornada',
    titulo: `Doação estornada/contestada · ${brl(cobranca.valor_centavos)}`,
    mensagem: `A doação de ${cobranca.pagador_nome || '(sem nome)'} (${brl(cobranca.valor_centavos)}) foi estornada ou `
      + `contestada. A contribuição NÃO foi removida automaticamente do razão nominal `
      + `(referência \`pag:${cobranca.id}\`) — decidam se ela sai.`,
    severidade: 'alerta',
    link: '/financeiro-v2',
    chaveDedup: `doacao_estorno_${cobranca.id}`,
  }).catch((e) => console.error('[pagamentos/generosidade] notificar:', e.message));
}

module.exports = {
  origem_tipo,
  aoPagar,
  aoPagarParcial,
  aoEstornar,

  dataBrt,
  TIPOS_CONTRIBUICAO,
};

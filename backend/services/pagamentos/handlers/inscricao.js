


















const { supabase } = require('../../../utils/supabase');
const { notificar } = require('../../notificar');
const { enviarConfirmacaoInscricao } = require('../../inscricaoWhatsapp');
const {
  enviarEmailInscricaoConfirmada,
  enviarEmailInscricaoExpirada,
} = require('../../inscricaoEmail');
const { emitirTokenComprovante } = require('../../inscricaoComprovante');
const { STATUS } = require('../tipos');

const origem_tipo = 'inscricao';




const STATUS_ESPELHO = Object.freeze({
  [STATUS.CRIADA]: 'pendente',
  [STATUS.AGUARDANDO]: 'aguardando',
  [STATUS.PAGO_PARCIAL]: 'aguardando',
  [STATUS.PAGO]: 'pago',
  [STATUS.EXPIRADA]: 'expirado',
  [STATUS.CANCELADA]: 'expirado',
  [STATUS.FALHOU]: 'expirado',
  [STATUS.ESTORNADO]: 'estornado',
  [STATUS.ESTORNADO_PARCIAL]: 'estornado',
  [STATUS.CHARGEBACK]: 'estornado',
});


async function espelhar(cobranca, extra = {}) {
  const patch = {
    status: STATUS_ESPELHO[cobranca.status] || 'pendente',
    ...extra,
  };
  if (cobranca.pago_em) patch.pago_em = cobranca.pago_em;


  if (cobranca.metodo) patch.metodo = cobranca.metodo;
  const { error } = await supabase.from('insc_pagamentos')
    .update(patch).eq('cobranca_id', cobranca.id);
  if (error) console.error('[pagamentos/inscricao] espelho insc_pagamentos:', error.message);
}


async function carregarInscricao(cobranca) {
  if (!cobranca.origem_id) return null;
  const { data, error } = await supabase.from('inscricoes')
    .select('id, evento_id, nome_completo, telefone, email, codigo, bolsa_tipo, valor_cobrado_centavos, whatsapp_optin, status, membro_id, evento:insc_eventos(id, nome, data, hora, local, slug)')
    .eq('id', cobranca.origem_id).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function aoPagar(cobranca) {
  const insc = await carregarInscricao(cobranca);
  if (!insc) {
    console.error(`[pagamentos/inscricao] cobrança ${cobranca.id} paga sem inscrição (origem_id ${cobranca.origem_id})`);
    return;
  }

  await espelhar(cobranca);





  const { data, error } = await supabase.from('inscricoes')
    .update({ status: 'confirmada' })
    .eq('id', insc.id).eq('status', 'recebida')
    .select('id');
  if (error) throw error;

  const confirmouAgora = Array.isArray(data) && data.length > 0;
  if (!confirmouAgora) {
    if (insc.status === 'cancelada') {


      await notificar({
        modulo: 'inscricoes', tipo: 'pagamento_apos_cancelamento',
        titulo: `Pagamento de inscrição já cancelada · ${insc.evento?.nome || 'evento'}`,
        mensagem: `${insc.nome_completo} pagou, mas a inscrição já estava cancelada (a vaga pode ter ido pra outra pessoa). Precisa de decisão: abrir exceção ou devolver.`,
        link: '/inscricoes',
      }).catch((e) => console.error('[pagamentos/inscricao] notificar:', e.message));
    }
    return;
  }

  await notificar({
    modulo: 'inscricoes', tipo: 'inscricao_paga',
    titulo: `Inscrição paga · ${insc.evento?.nome || 'evento'}`,
    mensagem: `${insc.nome_completo} pagou a inscrição (R$ ${(cobranca.valor_pago_centavos / 100).toFixed(2)}) e está confirmado(a).`,
    link: '/inscricoes',
  }).catch((e) => console.error('[pagamentos/inscricao] notificar:', e.message));






  enviarConfirmacaoInscricao({
    inscricaoId: insc.id, nome: insc.nome_completo, telefone: insc.telefone,
    optin: !!insc.whatsapp_optin, evento: insc.evento,
  }).catch((e) => console.error('[pagamentos/inscricao] confirmação WhatsApp:', e.message));





  (async () => {
    const token = await emitirTokenComprovante(insc.id, 'email_confirmacao').catch(() => null);
    await enviarEmailInscricaoConfirmada({
      inscricao: insc, evento: insc.evento, cobranca, comprovanteToken: token,
    });
  })().catch((e) => console.error('[pagamentos/inscricao] e-mail confirmação:', e.message));
}

async function aoPagarParcial(cobranca) {


  await espelhar(cobranca);
  const insc = await carregarInscricao(cobranca);
  await notificar({
    modulo: 'inscricoes', tipo: 'pagamento_parcial',
    titulo: `Pagamento parcial · ${insc?.evento?.nome || 'inscrição'}`,
    mensagem: `${insc?.nome_completo || 'Inscrito'} pagou R$ ${(cobranca.valor_pago_centavos / 100).toFixed(2)} de R$ ${(cobranca.valor_centavos / 100).toFixed(2)}. A vaga segue reservada — confira antes de confirmar.`,
    link: '/inscricoes',
  }).catch((e) => console.error('[pagamentos/inscricao] notificar:', e.message));
}


async function aoExpirar(cobranca, ctx = {}) {
  await espelhar(cobranca);




  if (ctx.preservar_inscricao) return;

  const insc = await carregarInscricao(cobranca).catch(() => null);




  const { data, error } = await supabase.from('inscricoes')
    .update({ status: 'cancelada' })
    .eq('id', cobranca.origem_id).eq('status', 'recebida')
    .select('id');
  if (error) throw error;

  const expirouAgora = Array.isArray(data) && data.length > 0;




  if (expirouAgora && insc && cobranca.status === STATUS.EXPIRADA) {
    enviarEmailInscricaoExpirada({ inscricao: insc, evento: insc.evento })
      .catch((e) => console.error('[pagamentos/inscricao] e-mail expirada:', e.message));
  }
}

async function aoCancelar(cobranca, ctx = {}) {
  await aoExpirar(cobranca, ctx);
}








async function aoEstornar(cobranca) {
  await espelhar(cobranca);
  const insc = await carregarInscricao(cobranca);
  await notificar({
    modulo: 'inscricoes', tipo: 'pagamento_estornado',
    titulo: `Pagamento estornado · ${insc?.evento?.nome || 'inscrição'}`,
    mensagem: `A inscrição de ${insc?.nome_completo || '(sem nome)'} teve o pagamento estornado/contestado. A inscrição NÃO foi cancelada automaticamente — decidam se mantém a vaga.`,
    link: '/inscricoes',
  }).catch((e) => console.error('[pagamentos/inscricao] notificar:', e.message));
}

module.exports = {
  origem_tipo,
  STATUS_ESPELHO,
  aoPagar,
  aoPagarParcial,
  aoExpirar,
  aoCancelar,
  aoEstornar,
};

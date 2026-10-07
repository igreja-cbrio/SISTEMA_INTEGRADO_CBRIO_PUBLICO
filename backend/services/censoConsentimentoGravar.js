




















const { supabase } = require('../utils/supabase');
const { consentimentosDaResposta, patchDoCadastro } = require('../utils/censoConsentimento');
const { registrarConsentimentos } = require('./inscricaoContrato');

const PORTA = 'censo';

















async function gravarConsentimentosDoCenso({
  respostaId, perguntas, respostas, membroId = null, userAgent = null,
}) {
  const { consentimentos, indefinidos } = consentimentosDaResposta(perguntas, respostas);
  if (!consentimentos.length) return { ok: true, gravados: 0, indefinidos, consentimentos };

  const { data: jaTem, error: eLer } = await supabase
    .from('inscricao_consentimentos')
    .select('tipo')
    .eq('porta', PORTA).eq('ref_id', respostaId).is('deleted_at', null);



  if (eLer) throw new Error(`consentimento_nao_lido: ${eLer.message}`);

  const tem = new Set((jaTem || []).map((l) => l.tipo));
  const faltam = consentimentos.filter((c) => !tem.has(c.tipo));
  if (!faltam.length) return { ok: true, gravados: 0, indefinidos, consentimentos };

  const out = await registrarConsentimentos({
    porta: PORTA,
    refId: respostaId,
    membroId,
    ip: null,
    userAgent,
    itens: faltam,
  });




  if (!out.ok) throw new Error('consentimento_nao_gravado');
  return { ok: true, gravados: out.gravados, indefinidos, consentimentos };
}












async function ligarOptinDoCenso({ membroId, consentimentos, em = null }) {
  if (!membroId) return { ligado: false, motivo: 'sem_membro' };
  const patch = patchDoCadastro(consentimentos, em);
  if (!patch) return { ligado: false, motivo: 'sem_aceite' };

  const { data, error } = await supabase
    .from('mem_membros')
    .update(patch)
    .eq('id', membroId)
    .or('whatsapp_optin.is.null,whatsapp_optin.eq.false')
    .select('id');
  if (error) throw new Error(`optin_nao_ligado: ${error.message}`);
  return { ligado: (data || []).length > 0, motivo: (data || []).length ? null : 'ja_tinha' };
}

module.exports = { PORTA, gravarConsentimentosDoCenso, ligarOptinDoCenso };

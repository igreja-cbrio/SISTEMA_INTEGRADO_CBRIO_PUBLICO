























const { supabase } = require('../utils/supabase');


function digitos(v) {
  return String(v || '').replace(/\D/g, '');
}














async function acharRespostaDaPessoa({ pesquisaId, membroId, cpf }) {
  if (!pesquisaId) return null;

  if (membroId) {
    const { data, error } = await supabase
      .from('cen_resposta').select('id, concluida_em')
      .eq('pesquisa_id', pesquisaId).eq('membro_id', membroId)
      .not('concluida_em', 'is', null).is('deleted_at', null)
      .order('concluida_em', { ascending: false }).limit(1).maybeSingle();



    if (error) console.error('[censo ja-respondeu] por membro:', error.message);
    if (data) return { ...data, por: 'membro' };
  }

  const doc = digitos(cpf);
  if (doc.length !== 11) return null;



  const { data, error: erroCpf } = await supabase
    .from('cen_resposta_item')
    .select('cen_resposta!inner(id, concluida_em, pesquisa_id, deleted_at)')
    .eq('pergunta_id', 'cpf').eq('valor_texto', doc)
    .eq('cen_resposta.pesquisa_id', pesquisaId)
    .not('cen_resposta.concluida_em', 'is', null)
    .is('cen_resposta.deleted_at', null)
    .limit(1).maybeSingle();

  if (erroCpf) console.error('[censo ja-respondeu] por CPF:', erroCpf.message);
  const r = data?.cen_resposta;
  return r ? { id: r.id, concluida_em: r.concluida_em, por: 'cpf' } : null;
}

module.exports = { acharRespostaDaPessoa, digitos };

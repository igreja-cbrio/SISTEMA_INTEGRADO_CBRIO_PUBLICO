










const { supabase } = require('../utils/supabase');
const { fluxoDaPorta, validarDesfecho } = require('../utils/portaFluxos');






async function acoesPorRef(porta, refIds) {
  const ids = [...new Set((refIds || []).filter(Boolean))];
  const mapa = {};
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const { data, error } = await supabase.from('flx_acoes')
      .select('ref_id, etapa, resultado, encaminhamento, observacao, feito_por, feito_por_nome, feito_em')
      .eq('porta', porta).in('ref_id', lote).is('deleted_at', null);
    if (error) throw error;
    for (const a of data || []) {
      if (!mapa[a.ref_id]) mapa[a.ref_id] = {};
      mapa[a.ref_id][a.etapa] = a;
    }
  }
  return mapa;
}









async function registrarDesfecho({ porta, refId, membroId, resultado, encaminhamento, observacao, usuario }) {
  const f = fluxoDaPorta(porta);
  if (!f) return { erro: 'Porta desconhecida.' };
  const v = validarDesfecho({ resultado, encaminhamento });
  if (!v.ok) return { erro: v.erro, campo: v.campo };

  const etapa = (f.etapas.find((e) => e.encerra) || {}).chave;
  if (!etapa) return { erro: 'Este fluxo não tem etapa de encerramento.' };

  const agora = new Date().toISOString();
  const linha = {
    porta, ref_tipo: f.refTipo, ref_id: refId, membro_id: membroId || null,
    etapa, resultado: v.resultado, encaminhamento: v.encaminhamento,
    observacao: String(observacao || '').trim().slice(0, 1000) || null,
    feito_por: usuario?.userId || usuario?.id || null,
    feito_por_nome: usuario?.nome || usuario?.name || null,
    feito_em: agora,
  };

  const { data: ja } = await supabase.from('flx_acoes')
    .select('id').eq('porta', porta).eq('ref_id', refId).eq('etapa', etapa)
    .is('deleted_at', null).maybeSingle();

  if (ja) {
    const { data, error } = await supabase.from('flx_acoes')
      .update({ ...linha, atualizado_em: agora }).eq('id', ja.id).select().maybeSingle();
    if (error) throw error;
    return { acao: data, corrigida: true };
  }
  const { data, error } = await supabase.from('flx_acoes').insert(linha).select().maybeSingle();
  if (error) throw error;
  return { acao: data, corrigida: false };
}


async function apagarDesfecho({ porta, refId }) {
  const f = fluxoDaPorta(porta);
  if (!f) return { erro: 'Porta desconhecida.' };
  const etapa = (f.etapas.find((e) => e.encerra) || {}).chave;
  const { data, error } = await supabase.from('flx_acoes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('porta', porta).eq('ref_id', refId).eq('etapa', etapa)
    .is('deleted_at', null).select('id');
  if (error) throw error;
  return { apagadas: data?.length || 0 };
}

module.exports = { acoesPorRef, registrarDesfecho, apagarDesfecho };

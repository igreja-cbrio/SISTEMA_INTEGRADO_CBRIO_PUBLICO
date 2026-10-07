












const { supabase } = require('../utils/supabase');
const { deveLimparCarimbo } = require('../utils/volIntegradoEm');














async function atualizarStatusInscricao(id, patch) {
  const statusNovo = patch?.status;


  const podeLimpar = deveLimparCarimbo('integrado', statusNovo)
    && !Object.prototype.hasOwnProperty.call(patch, 'integrado_em');

  if (podeLimpar) {
    const { data, error } = await supabase.from('vol_inscricoes')
      .update({ ...patch, integrado_em: null })
      .eq('id', id)
      .eq('status', 'integrado')
      .select();
    if (error) throw error;
    if (data && data.length) return data[0];


  }

  const { data, error } = await supabase.from('vol_inscricoes')
    .update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

module.exports = { atualizarStatusInscricao };
















const { supabase } = require('../utils/supabase');
const { bairroPorCep } = require('./geoBrasil');













async function canonizarBairro(texto) {
  const cru = String(texto ?? '').trim();
  if (!cru) return null;
  try {
    const { data, error } = await supabase.rpc('fn_dem_bairro_canonico', { p_texto: cru });
    if (error) throw error;
    const canon = typeof data === 'string' ? data.trim() : '';
    return canon || cru;
  } catch (e) {
    console.warn('[bairro] canonicalização falhou (mantém o digitado):', e.message);
    return cru;
  }
}
























async function normalizarEnderecoDoPayload(body, atual = null) {
  try {
    if (!body || typeof body !== 'object') return;


    const cep = String(body.cep || '').replace(/\D/g, '');
    if (cep.length === 8) {
      const bairroDefinido = String(body.bairro ?? atual?.bairro ?? '').trim();
      const cidadeDefinida = String(body.cidade ?? atual?.cidade ?? '').trim();
      if (!bairroDefinido || !cidadeDefinida) {
        const via = await bairroPorCep(cep);
        if (via) {
          if (!bairroDefinido && via.bairro) body.bairro = via.bairro;
          if (!cidadeDefinida && via.cidade) body.cidade = via.cidade;
        }
      }
    }


    if (body.bairro !== undefined && body.bairro !== null) {
      const canon = await canonizarBairro(body.bairro);


      body.bairro = canon;
    }
  } catch (e) {
    console.warn('[bairro] normalização do endereço falhou (segue como veio):', e.message);
  }
}

module.exports = { canonizarBairro, normalizarEnderecoDoPayload };

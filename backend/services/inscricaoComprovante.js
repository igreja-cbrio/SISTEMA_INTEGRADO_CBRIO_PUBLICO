














const crypto = require('crypto');

function segredo() {
  return process.env.INSC_QR_SECRET || process.env.CRON_SECRET || null;
}



function assinar(idNorm, sec) {
  return crypto.createHmac('sha256', sec)
    .update(`insc-comprovante:${idNorm}`).digest('hex').slice(0, 20);
}


function gerarTokenComprovante(inscricaoId) {
  const sec = segredo();
  const idNorm = String(inscricaoId || '').replace(/-/g, '').toLowerCase();
  if (!sec || !/^[0-9a-f]{32}$/.test(idNorm)) return null;
  return `${idNorm}.${assinar(idNorm, sec)}`;
}


function verificarTokenComprovante(token) {
  const sec = segredo();
  if (!sec) return null;
  const m = /^([0-9a-f]{32})\.([0-9a-f]{20})$/.exec(String(token || '').trim().toLowerCase());
  if (!m) return null;
  const esperado = assinar(m[1], sec);

  if (!crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(esperado))) return null;
  return `${m[1].slice(0, 8)}-${m[1].slice(8, 12)}-${m[1].slice(12, 16)}-${m[1].slice(16, 20)}-${m[1].slice(20)}`;
}





function extrairToken(texto) {
  const s = String(texto || '').trim();
  const m = /\/i\/c\/([0-9a-f]{32}\.[0-9a-f]{20})/i.exec(s);
  return (m ? m[1] : s).toLowerCase();
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}




async function emitirTokenComprovante(inscricaoId, canal = 'api') {
  const token = gerarTokenComprovante(inscricaoId);
  if (!token) return null;
  try {
    const { supabase } = require('../utils/supabase');
    if (!supabase) return token;
    const { error } = await supabase.rpc('fn_insc_qr_registrar', {
      p_inscricao_id: inscricaoId,
      p_token_hash: hashToken(token),
      p_canal: String(canal || 'api').slice(0, 40),
    });

    if (error && !['PGRST202', '42883'].includes(error.code)) {
      console.error('[inscricoes] inventário QR/emissão:', error.message);
    }
  } catch (e) {
    console.error('[inscricoes] inventário QR/emissão:', e.message);
  }
  return token;
}



async function verificarTokenComprovanteAtivo(token) {
  const inscricaoId = verificarTokenComprovante(token);
  if (!inscricaoId) return null;
  try {
    const { supabase } = require('../utils/supabase');
    if (!supabase) return inscricaoId;
    const { data, error } = await supabase.from('insc_qr_tokens')
      .select('revogado_em')
      .eq('inscricao_id', inscricaoId)
      .eq('token_hash', hashToken(String(token || '').trim().toLowerCase()))
      .maybeSingle();
    if (error) {
      if (!['PGRST205', '42P01'].includes(error.code)) {
        console.error('[inscricoes] inventário QR/validação:', error.message);
      }
      return inscricaoId;
    }
    return data?.revogado_em ? null : inscricaoId;
  } catch (e) {
    console.error('[inscricoes] inventário QR/validação:', e.message);
    return inscricaoId;
  }
}

module.exports = {
  gerarTokenComprovante,
  verificarTokenComprovante,
  verificarTokenComprovanteAtivo,
  emitirTokenComprovante,
  extrairToken,
  hashToken,
};

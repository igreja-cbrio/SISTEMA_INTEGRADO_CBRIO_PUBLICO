











const { supabase } = require('../utils/supabase');

function rpcArquiteturalIndisponivel(error) {
  return !!error && ['PGRST202', '42883'].includes(error.code);
}

async function marcarCheckinAuditavel({ inscricaoId, por, modo, overridePendente, motivo }) {
  const { data, error } = await supabase.rpc('fn_insc_checkin_marcar', {
    p_inscricao_id: inscricaoId,
    p_por: por,
    p_modo: modo,
    p_override_pendente: !!overridePendente,
    p_override_motivo: motivo || null,
  });
  if (!error) return data;
  if (!rpcArquiteturalIndisponivel(error)) throw error;



  const { data: marcado, error: erroLegado } = await supabase.from('insc_checkins')
    .insert({ inscricao_id: inscricaoId, por, modo })
    .select('em').single();
  if (erroLegado) {
    if (erroLegado.code !== '23505') throw erroLegado;
    const { data: existente } = await supabase.from('insc_checkins')
      .select('em').eq('inscricao_id', inscricaoId).maybeSingle();
    return { ok: true, ja_checkin: true, em: existente?.em || null };
  }
  return { ok: true, ja_checkin: false, em: marcado.em };
}

async function desfazerCheckinAuditavel({ eventoId, inscricaoId, por, motivo }) {
  const { data, error } = await supabase.rpc('fn_insc_checkin_desfazer', {
    p_evento_id: eventoId,
    p_inscricao_id: inscricaoId,
    p_por: por,
    p_motivo: motivo || null,
  });
  if (!error) return data;
  if (!rpcArquiteturalIndisponivel(error)) throw error;
  const { error: erroLegado } = await supabase.from('insc_checkins')
    .delete().eq('inscricao_id', inscricaoId);
  if (erroLegado) throw erroLegado;
  return { ok: true, auditoria_disponivel: false };
}

module.exports = { marcarCheckinAuditavel, desfazerCheckinAuditavel };

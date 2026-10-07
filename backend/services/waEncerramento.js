







const { supabase } = require('../utils/supabase');
const ENC = require('../utils/conversaEncerramento');
const { enviarPesquisaFinalizacao } = require('./waPesquisaFinal');

const TETO = 500;
const COLS = 'id, telefone, protocolo, phone_number_id, resolvida, encerrar_desde, last_inbound_at, last_message_at';

async function encerrarVencidas({ agoraMs = Date.now() } = {}) {
  try {


    const corteRetorno = new Date(agoraMs).toISOString();
    const corteInativ = new Date(agoraMs - ENC.DIAS_INATIVIDADE * 86_400_000).toISOString();
    const base = () => supabase.from('wa_conversas').select(COLS)
      .is('deleted_at', null).eq('resolvida', false).limit(TETO);
    const [r1, r2] = await Promise.all([
      base().not('encerrar_desde', 'is', null).lte('encerrar_desde', corteRetorno),
      base().lte('last_message_at', corteInativ),
    ]);
    const err = r1.error || r2.error;
    if (err) {
      if (err.code === '42703') return { ok: false, erro: 'migration 20260928120000 pendente' };
      return { ok: false, erro: err.message };
    }

    const porId = new Map();
    for (const c of [...(r1.data || []), ...(r2.data || [])]) porId.set(c.id, c);

    const fechadas = { finalizar: 0, inatividade: 0 };
    let pesquisas = 0;
    let puladas = 0;
    for (const c of porId.values()) {
      const motivo = ENC.motivoEncerramento(c, agoraMs);
      if (!motivo) continue;
      let q = supabase.from('wa_conversas').update({
        resolvida: true, encerrar_desde: null,
        finalizada_em: new Date(agoraMs).toISOString(), finalizada_motivo: motivo === 'finalizar' ? 'atendente' : motivo,
      }).eq('id', c.id).eq('resolvida', false);
      q = c.last_inbound_at ? q.eq('last_inbound_at', c.last_inbound_at) : q.is('last_inbound_at', null);
      const { data, error } = await q.select('id');
      if (error) return { ok: false, erro: error.message, fechadas };
      if (data?.length) {
        fechadas[motivo] += 1;
        if (motivo === 'finalizar' && ENC.pesquisaPermitida(c, agoraMs)) {
          if (await enviarPesquisaFinalizacao(c)) pesquisas += 1;
        }
      } else puladas += 1;
    }
    return { ok: true, fechadas, pesquisas, puladas, teto_atingido: (r1.data || []).length === TETO || (r2.data || []).length === TETO };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}

module.exports = { encerrarVencidas };

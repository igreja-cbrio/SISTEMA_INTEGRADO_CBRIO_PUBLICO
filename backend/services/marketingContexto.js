'use strict';







const { supabase } = require('../utils/supabase');
const regraSubtarefa = require('../utils/marketingChecklist');

function levelOf(req) {
  const modulePerms = req.user.granular?.modulePerms || {};
  const mkt = modulePerms.marketing || modulePerms.Marketing;
  if (!mkt) return 0;
  return Math.max(mkt.leitura || 0, mkt.escrita || 0);
}

async function contextoSubtarefa(req) {
  const { data, error } = await supabase
    .from('marketing_membros')
    .select('id, habilidade')
    .eq('profile_id', req.user.userId)
    .eq('ativo', true)
    .is('deleted_at', null);
  if (error) throw error;
  const membros = data || [];
  return {
    lider: regraSubtarefa.ehLider({ role: req.user.role, habilidades: membros.map(m => m.habilidade) }),
    nivel: levelOf(req),
    meusMembroIds: membros.map(m => m.id),
  };
}






const METODOS_DE_LEITURA = new Set(['GET', 'HEAD', 'OPTIONS']);




function exigirLiderNaEscritaCom(obterContexto, { mensagem = 'Só o líder do Marketing altera a configuração da equipe.' } = {}) {
  return async function exigirLiderNaEscrita(req, res, next) {
    if (METODOS_DE_LEITURA.has(req.method)) return next();
    let ctx;
    try {
      ctx = await obterContexto(req);
    } catch (e) {

      console.error('[MARKETING] conferir líder:', e.message);
      return res.status(503).json({ error: 'Não foi possível conferir quem é o líder do Marketing agora. Tente de novo.' });
    }
    if (!ctx || !ctx.lider) {
      return res.status(403).json({ error: mensagem });
    }
    return next();
  };
}

const exigirLiderNaEscrita = exigirLiderNaEscritaCom(contextoSubtarefa);

module.exports = { levelOf, contextoSubtarefa, exigirLiderNaEscrita, exigirLiderNaEscritaCom, METODOS_DE_LEITURA };

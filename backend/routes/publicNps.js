const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');



const { agendarSync } = require('../services/npsKpiSync');










const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_NPS_RATE_LIMIT_MAX) || 10000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
});

function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 32);
}


router.get('/:token', publicLimiter, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('nps_pesquisas')
      .select('id, titulo, valor, objetivo, perguntas, status, permite_publico, data_fim')
      .eq('link_publico_token', req.params.token)
      .is('deleted_at', null)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Pesquisa não encontrada' });
    if (!data.permite_publico) return res.status(403).json({ error: 'Link público desativado' });
    if (data.status !== 'ativa') return res.status(400).json({ error: 'Pesquisa não está ativa' });
    if (data.data_fim && new Date(data.data_fim) < new Date()) {
      return res.status(400).json({ error: 'Pesquisa encerrada' });
    }



    let turma = null;
    const turmaId = req.query.turma;
    if (turmaId && /^[0-9a-f-]{36}$/i.test(String(turmaId))) {
      const { data: t } = await supabase
        .from('next_turmas')
        .select('id, nome')
        .eq('id', turmaId)
        .is('deleted_at', null)
        .maybeSingle();
      if (t) turma = { id: t.id, nome: t.nome };
    }




    res.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
    res.json({ ...data, turma });
  } catch (e) {
    console.error('[publicNps] get:', e.message);
    res.status(500).json({ error: 'Erro ao buscar pesquisa' });
  }
});


router.post('/:token/responder', publicLimiter, async (req, res) => {
  try {
    const { nome, email, score, respostas, comentario, anonimo, turma_id } = req.body || {};
    if (!anonimo) {
      if (!nome || !email) {
        return res.status(400).json({ error: 'Nome e e-mail são obrigatórios' });
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) {
        return res.status(400).json({ error: 'E-mail inválido' });
      }
    }
    if (score === undefined || score === null) {
      return res.status(400).json({ error: 'Selecione uma nota' });
    }

    const { data: pesquisa, error: pErr } = await supabase
      .from('nps_pesquisas')
      .select('id, status, permite_publico, data_fim, perguntas')
      .eq('link_publico_token', req.params.token)
      .is('deleted_at', null)
      .single();
    if (pErr || !pesquisa) return res.status(404).json({ error: 'Pesquisa não encontrada' });
    if (!pesquisa.permite_publico) return res.status(403).json({ error: 'Link público desativado' });
    if (pesquisa.status !== 'ativa') return res.status(400).json({ error: 'Pesquisa não está ativa' });
    if (pesquisa.data_fim && new Date(pesquisa.data_fim) < new Date()) {
      return res.status(400).json({ error: 'Pesquisa encerrada' });
    }

    const maxNota = Number(pesquisa.perguntas?.pergunta_nps?.max) || 10;
    if (score < 0 || score > maxNota) {
      return res.status(400).json({ error: `score deve estar entre 0 e ${maxNota}` });
    }
    const score10 = Math.round((Number(score) / maxNota) * 10);

    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || '').trim();




    let turmaIdValida = null;
    if (turma_id && /^[0-9a-f-]{36}$/i.test(String(turma_id))) {
      const { data: t } = await supabase
        .from('next_turmas')
        .select('id')
        .eq('id', turma_id)
        .is('deleted_at', null)
        .maybeSingle();
      if (t) turmaIdValida = t.id;
    }

    const { error } = await supabase
      .from('nps_respostas')
      .insert({
        pesquisa_id: pesquisa.id,
        profile_id: null,
        turma_id: turmaIdValida,
        nome_publico: anonimo ? 'Anônimo' : String(nome).slice(0, 120),
        email_publico: anonimo ? null : String(email).toLowerCase().slice(0, 200),
        score: score10,

        respostas: (() => {
          if (!respostas || typeof respostas !== 'object') return {};
          const serialized = JSON.stringify(respostas);
          return serialized.length > 10000 ? {} : respostas;
        })(),
        comentario: comentario ? String(comentario).slice(0, 2000) : null,
        origem: 'publico',
        ip_hash: hashIp(ip),
        user_agent: (req.headers['user-agent'] || '').slice(0, 200),
      });
    if (error) throw error;



    agendarSync(pesquisa.id);

    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('[publicNps] responder:', e.message);
    res.status(500).json({ error: 'Erro ao registrar resposta' });
  }
});

module.exports = router;

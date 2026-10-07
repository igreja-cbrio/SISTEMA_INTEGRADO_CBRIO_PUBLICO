















const express = require('express');
const { semFalhar } = require('../utils/semFalhar');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { supabase } = require('../utils/supabase');
const { semCache } = require('../middleware/semCache');
const { calcularProgresso, estaNoAr, brl, brlRedondo } = require('../utils/campanhaProgresso');
const { valorComDigito } = require('../utils/digitoCampanha');
const adesaoSvc = require('../services/campanhaAdesao');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.CAMPANHA_PUBLIC_RATE_LIMIT_MAX, 10)
    || (process.env.NODE_ENV === 'production' ? 10000 : 20000),
  message: { error: 'Muitas requisições. Aguarde alguns minutos.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(limiter);



router.use(semCache);


function hojeBrt() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}







async function descadastrar(membroId) {
  const id = String(membroId || '').trim();



  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: true };
  await semFalhar(supabase.from('mem_membros')
    .update({ email_optout: true, email_optout_em: new Date().toISOString() })
    .eq('id', id).is('deleted_at', null)
    , '[campanha-optout]');
  return { ok: true };
}

router.get('/descadastrar', async (req, res) => {
  await descadastrar(req.query.m);

  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Pronto</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
  max-width:520px;margin:64px auto;padding:0 24px;color:#1a1a1a;line-height:1.6">
<h1 style="font-size:22px;margin:0 0 12px">Pronto, você saiu da lista</h1>
<p style="margin:0 0 12px">Não vamos mais te enviar e-mails de campanha.</p>
<p style="margin:0;font-size:14px;color:#666">Você continua recebendo o que for do
seu cadastro — comprovante de inscrição, recuperação de senha e avisos do que você
mesmo pediu. Se quiser voltar a receber as campanhas, fale com a secretaria.</p>
</body></html>`);
});

router.post('/descadastrar', async (req, res) => {
  await descadastrar(req.body?.membro_id || req.query.m);
  res.json({ ok: true });
});



router.get('/:slug', async (req, res) => {
  try {
    const { data: camp, error } = await supabase.from('camp_campanhas')
      .select('id, slug, nome, descricao_curta, descricao, digito, meta_centavos, status, publica, mostrar_valor, aceita_online, video_url, imagem_url, cor_destaque, data_inicio, data_lancamento, data_fim')
      .eq('slug', req.params.slug).is('deleted_at', null).maybeSingle();



    if (error) return res.status(503).json({ error: 'Não foi possível consultar a campanha agora.' });

    const hoje = hojeBrt();


    if (!camp || !camp.publica || !estaNoAr(camp, hoje)) {
      return res.status(404).json({ error: 'Campanha não encontrada' });
    }

    const { data: arr } = await supabase.from('vw_camp_arrecadacao')
      .select('*').eq('campanha_id', camp.id).maybeSingle();
    const p = calcularProgresso(arr || { meta_centavos: camp.meta_centavos });




    const corpo = {
      slug: camp.slug,
      nome: camp.nome,
      descricao_curta: camp.descricao_curta,
      descricao: camp.descricao,
      video_url: camp.video_url,
      imagem_url: camp.imagem_url,
      cor_destaque: camp.cor_destaque,
      data_lancamento: camp.data_lancamento,
      data_fim: camp.data_fim,
      pct: p.pct_barra,
      bateu_meta: p.bateu_meta,
      mostrar_valor: camp.mostrar_valor,



      digito: camp.digito,
      exemplo_com_digito: camp.digito ? brl(valorComDigito(10000, camp.digito)) : null,
      aceita_online: camp.aceita_online,
    };
    if (camp.mostrar_valor) {
      corpo.arrecadado = brlRedondo(p.total_centavos);
      corpo.meta = brlRedondo(p.meta_centavos);
      corpo.arrecadado_centavos = p.total_centavos;
      corpo.meta_centavos = p.meta_centavos;
    }


    try {
      const { data: extra } = await supabase.from('camp_campanhas')
        .select('template, evento_adesao_id, mostrar_adesoes, meta_pessoas')
        .eq('id', camp.id).maybeSingle();
      if (extra && extra.template && extra.template !== 'legado') {
        const full = { ...camp, ...extra };
        const a = await adesaoSvc.urlAdesao(full);
        if (a?.url) corpo.adesao = { url: a.url, porta: a.porta };
        if (extra.mostrar_adesoes) {
          const li = await adesaoSvc.listarInscritos(full);
          corpo.adesoes = (li.inscritos || []).length;
        }
      }
    } catch (e) {
      console.warn('[publicCampanha] adesão indisponível:', e.message);
    }



    res.json(corpo);
  } catch (e) {
    console.error('[publicCampanha]', e.message);
    res.status(503).json({ error: 'Não foi possível consultar a campanha agora.' });
  }
});

module.exports = router;

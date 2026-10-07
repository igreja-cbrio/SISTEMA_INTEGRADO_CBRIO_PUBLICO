



















const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const {
  validarFicha, normalizarFicha, semSegredos, ehContratada, estadoFicha,
} = require('../utils/fichaContratada');






const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.FICHA_CONTRATADA_RATE_LIMIT_MAX, 10) || 600,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});









async function acharPorToken(token) {
  const t = String(token || '');
  if (t.length < 16) return null;

  const { data, error } = await supabase
    .from('rh_funcionarios')
    .select('id, nome, cargo, tipo_contrato, status, ficha_contratada, ficha_contratada_preenchido_em, ficha_contratada_expira_em')
    .eq('ficha_contratada_token', t)
    .is('deleted_at', null)
    .maybeSingle();



  if (error) { const e = new Error(error.message); e.consulta = true; throw e; }
  if (!data) return null;
  if (!ehContratada(data.tipo_contrato)) return null;
  if (data.ficha_contratada_expira_em && new Date(data.ficha_contratada_expira_em) < new Date()) return null;
  return data;
}


router.get('/:token', limiter, async (req, res) => {
  try {
    const f = await acharPorToken(req.params.token);
    if (!f) return res.status(404).json({ error: 'Link inválido ou expirado.' });

    const estado = estadoFicha(f);
    res.json({
      nome: f.nome,
      cargo: f.cargo || null,
      ja_preenchido: !!f.ficha_contratada_preenchido_em,


      ficha: f.ficha_contratada ? semSegredos(f.ficha_contratada) : null,
      faltando: estado.faltando,
    });
  } catch (e) {
    if (e.consulta) {
      console.error('[public ficha-contratada] GET consulta:', e.message);
      return res.status(503).json({ error: 'Não consegui carregar agora. Tente de novo em instantes.' });
    }
    console.error('[public ficha-contratada] GET:', e.message);
    res.status(500).json({ error: 'Erro ao abrir a ficha.' });
  }
});


router.post('/:token', limiter, async (req, res) => {
  try {
    const f = await acharPorToken(req.params.token);
    if (!f) return res.status(404).json({ error: 'Link inválido ou expirado.' });

    const ficha = normalizarFicha(req.body || {});
    const { ok, erros } = validarFicha(ficha);
    if (!ok) return res.status(400).json({ error: 'Confira os campos destacados.', erros });





    const aceitou = req.body?.aceite === true && String(req.body?.aceite_texto || '').trim().length > 40;
    if (aceitou) {
      ficha.aceite_em = new Date().toISOString();
      ficha.aceite_texto = String(req.body.aceite_texto).slice(0, 4000);
      ficha.aceite_ip = String(req.ip || '').slice(0, 60) || null;
      ficha.aceite_user_agent = String(req.get('user-agent') || '').slice(0, 300) || null;
      ficha.aceite_nome_digitado = String(req.body?.aceite_nome || '').trim().slice(0, 200) || null;
    } else if (f.ficha_contratada?.aceite_em) {



      ficha.aceite_em = f.ficha_contratada.aceite_em;
      ficha.aceite_texto = f.ficha_contratada.aceite_texto || null;
      ficha.aceite_ip = f.ficha_contratada.aceite_ip || null;
      ficha.aceite_user_agent = f.ficha_contratada.aceite_user_agent || null;
      ficha.aceite_nome_digitado = f.ficha_contratada.aceite_nome_digitado || null;
      ficha.aceite_desatualizado = true;
    }

    const { error } = await supabase
      .from('rh_funcionarios')
      .update({
        ficha_contratada: ficha,
        ficha_contratada_preenchido_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', f.id);

    if (error) return res.status(400).json({ error: error.message });














    const estadoAgora = estadoFicha({ tipo_contrato: f.tipo_contrato, ficha_contratada: ficha });
    try {
      await notificar({
        modulo: 'rh',
        tipo: 'ficha_contratada_preenchida',
        titulo: `Ficha da contratada · ${f.nome}`,
        mensagem: estadoAgora.completa
          ? `${f.nome} enviou a ficha cadastral completa${aceitou ? ' e assinou a declaração' : ''}.`


          : `${f.nome} enviou a ficha, mas falta: ${estadoAgora.faltando.join(', ')}.`,
        link: '/rh',
        severidade: estadoAgora.completa ? 'info' : 'alerta',


        chaveDedup: `ficha_contratada:${f.id}:${new Date().toISOString().slice(0, 10)}`,
      });
    } catch (e) {


      console.error('[public ficha-contratada] aviso ao RH falhou:', e.message);
    }

    res.json({ ok: true, aceite_registrado: !!aceitou });
  } catch (e) {
    if (e.consulta) {
      console.error('[public ficha-contratada] POST consulta:', e.message);
      return res.status(503).json({ error: 'Não consegui salvar agora. Tente de novo em instantes.' });
    }
    console.error('[public ficha-contratada] POST:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a ficha.' });
  }
});

module.exports = router;

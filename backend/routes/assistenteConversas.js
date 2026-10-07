






const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { falhaInterna } = require('../utils/responderFalha');
const { registrarConversaVideo, resumoTemas } = require('../services/assistenteTemas');

router.use(authenticate);
router.use(requireSuperAdmin);

const registroLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: { error: 'Muitos registros de conversa. Aguarde alguns minutos.' },
});

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

router.post('/video', registroLimiter, async (req, res) => {
  const { conversa_id: conversaId, tela_rotulo: telaRotulo, duracao_s: duracaoS, turnos } = req.body || {};
  if (typeof conversaId !== 'string' || !conversaId.trim() || conversaId.length > 200) {
    return res.status(400).json({ error: 'Conversa sem identificador.' });
  }
  if (!Array.isArray(turnos) || turnos.length === 0) {
    return res.status(400).json({ error: 'Conversa sem falas.' });
  }
  try {


    const r = await registrarConversaVideo({ conversaId, telaRotulo, duracaoS, turnos, nomePessoa: req.user?.name || null });
    return res.json({ ok: true, status: r.status });
  } catch (e) {
    return falhaInterna(res, 'Erro ao registrar o tema da conversa', e);
  }
});

router.get('/temas', async (req, res) => {
  const { inicio, fim } = req.query;
  if ((inicio && !RE_DIA.test(inicio)) || (fim && !RE_DIA.test(fim))) {
    return res.status(400).json({ error: 'Período inválido (use AAAA-MM-DD).' });
  }
  try {
    return res.json(await resumoTemas({ inicio, fim }));
  } catch (e) {
    return falhaInterna(res, 'Erro ao carregar os temas das conversas', e);
  }
});

module.exports = router;

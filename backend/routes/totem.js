


















const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const servico = require('../services/totemEstacao');





const limiterPareamento = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.TOTEM_PAREAMENTO_RATE_LIMIT_MAX, 10) || 20,
  message: { error: 'Muitas tentativas de pareamento. Aguarde alguns minutos.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});







router.post('/parear', limiterPareamento, async (req, res) => {
  try {



    const r = await servico.parear({
      codigo: req.body?.codigo,
      tipo: 'agente',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      rotulo: req.body?.rotulo,
    });

    if (!r.ok) {


      const texto = r.motivo === 'estacao_indisponivel'
        ? 'Esta estação está desligada. Fale com a equipe.'
        : 'Código inválido ou expirado. Peça um novo à equipe.';
      return res.status(400).json({ error: texto, reason: r.motivo });
    }

    res.json({
      ok: true,
      token: r.segredo,
      linhagem: r.token.linhagem,
      expira_em: r.token.expira_em,
      estacao: r.estacao,
    });
  } catch (e) {
    console.error('[totem] parear:', e.message);
    res.status(500).json({ error: 'Erro ao parear o agente' });
  }
});

module.exports = router;






















const servico = require('../services/totemEstacao');



const MOTIVOS_LIMPAR = new Set(['token_invalido', 'token_expirado', 'estacao_revogada']);

const TEXTO = {
  token_ausente: 'Este dispositivo não está pareado.',
  token_invalido: 'Este dispositivo não está pareado.',
  token_expirado: 'O pareamento deste dispositivo expirou.',
  estacao_revogada: 'Este dispositivo foi desligado pela equipe.',



  ip_nao_permitido: 'Este dispositivo só funciona na rede da igreja.',
};

function extrairToken(req) {
  const h = req.headers['x-totem-token'];
  if (typeof h === 'string' && h.trim()) return h.trim();
  return null;
}


function autenticarEstacao(tipo = 'dispositivo') {
  return async function (req, res, next) {
    const token = extrairToken(req);
    if (!token) {
      return res.status(401).json({
        error: TEXTO.token_ausente, reason: 'token_ausente', limpar_credencial: true,
      });
    }

    let r;
    try {
      r = await servico.resolverToken(token, { ip: req.ip, tipo });
    } catch (e) {



      console.error('[totem-estacao] falha ao resolver token:', e.message);
      return res.status(503).json({ error: 'Instabilidade momentânea. Tente de novo.', reason: 'indisponivel' });
    }

    if (!r.ok) {
      return res.status(401).json({
        error: TEXTO[r.motivo] || TEXTO.token_invalido,
        reason: r.motivo,
        limpar_credencial: MOTIVOS_LIMPAR.has(r.motivo),
      });
    }

    req.estacaoInterna = r.estacao;
    req.estacaoToken = r.token;
    req.estacao = servico.publico(r.estacao);




    servico.heartbeat(r.estacao, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      versao: req.headers['x-totem-versao'],
    }).catch((e) => console.warn('[totem-estacao] heartbeat:', e.message));

    next();
  };
}

module.exports = { autenticarEstacao, extrairToken, MOTIVOS_LIMPAR };

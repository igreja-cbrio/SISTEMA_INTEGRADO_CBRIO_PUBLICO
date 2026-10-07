











const { requestRoute } = require('./errorHandler');
const { recordServerError } = require('../services/serverErrorTelemetry');
const { montarMensagemFalha } = require('../utils/motivoFalha');
const { falhaDbDaRequisicao } = require('../utils/contextoFalha');













function motivoDaResposta(res) {
  const daRota = res?.locals?.motivoFalha;
  if (daRota) return { motivo: daRota, codigo: res?.locals?.codigoFalha || '' };
  const doBanco = falhaDbDaRequisicao();
  if (doBanco?.motivo) return { motivo: doBanco.motivo, codigo: doBanco.codigo || '' };
  return {};
}

function criarTelemetria500({ recordError = recordServerError, logger = console } = {}) {
  return function telemetria500(req, res, next) {
    res.on('finish', () => {
      if (res.statusCode < 500 || res.locals._erro500Registrado) return;
      try {
        void Promise.resolve(recordError({
          user_id: req.user?.id || null,
          user_email: req.user?.email || null,
          metodo: req.method,
          rota: requestRoute(req),
          mensagem: montarMensagemFalha({ status: res.statusCode, ...motivoDaResposta(res) }),


          stack: res.locals?.stackFalha || null,
          status: res.statusCode,
          request_id: req.requestId,
          release: process.env.VERCEL_GIT_COMMIT_SHA || null,
          environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
        })).catch((e) => logger.warn?.('[app_erros_servidor]', e.message));
      } catch (_) {                                              }
    });
    next();
  };
}

module.exports = { criarTelemetria500, motivoDaResposta };

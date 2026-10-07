


























const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const pagamentos = require('../services/pagamentos');
const { AppError, ERROR_CODES } = require('../utils/appError');
const { captureHandledException } = require('../utils/sentry');
const { outcomeFromSteps, setSystemJobOutcome } = require('../services/systemJobOutcome');

const { isAuthorizedCron } = require('../utils/cronAuth');

function paymentCronError(error, publicMessage) {
  return new AppError(error?.message || publicMessage, {
    code: ERROR_CODES.PAYMENT_CRON_FAILED,
    publicMessage,
    cause: error,
    isOperational: false,
  });
}
function paymentWebhookError(error) {
  return new AppError(error?.message || 'Falha no webhook de pagamento', {
    code: ERROR_CODES.PAYMENT_WEBHOOK_FAILED,
    publicMessage: 'Falha no processamento do webhook de pagamento.',
    cause: error,
    isOperational: false,
  });
}



const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.PAG_WEBHOOK_RATE_LIMIT_MAX) || 600,
  message: { error: 'rate limit' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});












router.post('/:provider', limiter, async (req, res) => {
  try {
    const { http, corpo } = await pagamentos.processarWebhook({
      providerNome: req.params.provider,
      rawBody: req.rawBody,
      headers: req.headers,
      payload: req.body,


      query: req.query,
    });
    return res.status(http).json(corpo);
  } catch (e) {


    console.error('[pagamentosWebhook] falha não tratada:', e.message);
    captureHandledException(paymentWebhookError(e), req, 'payments.webhook.accepted_with_failure');
    return res.status(200).json({ ok: true, erro_registrado: false });
  }
});







router.get('/cron/tick', async (req, res) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'não autorizado' });
  const out = {};

  try {
    out.expirar = await pagamentos.expirarVencidas({ limite: 200 });
  } catch (e) {
    out.expirar = { erro: e.message };
    console.error('[pagamentosWebhook] tick/expirar:', e.message);
    captureHandledException(paymentCronError(e, 'Erro ao expirar cobranças.'), req, 'payments.tick.expire');
  }



  try {
    out.reconciliar = await pagamentos.reconciliar({ dias: 30, limite: 50 });
  } catch (e) {
    out.reconciliar = { erro: e.message };
    console.error('[pagamentosWebhook] tick/reconciliar:', e.message);
    captureHandledException(paymentCronError(e, 'Erro ao reconciliar cobranças.'), req, 'payments.tick.reconcile');
  }
  try {
    out.replay = await pagamentos.reprocessarWebhooksPendentes({ limite: 20 });
  } catch (e) {
    out.replay = { erro: e.message };
    console.error('[pagamentosWebhook] tick/replay:', e.message);
    captureHandledException(paymentCronError(e, 'Erro ao reprocessar eventos de pagamento.'), req, 'payments.tick.replay');
  }




  try {
    out.saude = await pagamentos.verificarSaude();
  } catch (e) {
    out.saude = { erro: e.message };
    console.error('[pagamentosWebhook] tick/saude:', e.message);
    captureHandledException(paymentCronError(e, 'Erro ao verificar a credencial de pagamento.'), req, 'payments.tick.credential_health');
  }
  setSystemJobOutcome(res, outcomeFromSteps(out, { errorCode: ERROR_CODES.PAYMENT_CRON_FAILED }));
  res.json({ ok: true, ...out });
});



router.get('/cron/expirar', async (req, res, next) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'não autorizado' });
  try {
    const r = await pagamentos.expirarVencidas({ limite: 200 });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[pagamentosWebhook] cron/expirar:', e.message);
    next(paymentCronError(e, 'Erro ao expirar cobranças.'));
  }
});



router.get('/cron/reconciliar', async (req, res, next) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'não autorizado' });
  try {
    const dias = Math.min(parseInt(req.query.dias) || 30, 180);
    const r = await pagamentos.reconciliar({ dias, limite: 200 });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[pagamentosWebhook] cron/reconciliar:', e.message);
    next(paymentCronError(e, 'Erro ao reconciliar cobranças.'));
  }
});



router.get('/cron/replay', async (req, res, next) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'não autorizado' });
  try {
    const r = await pagamentos.reprocessarWebhooksPendentes({ limite: 50 });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[pagamentosWebhook] cron/replay:', e.message);
    next(paymentCronError(e, 'Erro ao reprocessar eventos de pagamento.'));
  }
});



router.get('/cron/saude', async (req, res, next) => {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'não autorizado' });
  try {
    const r = await pagamentos.verificarSaude({ forcar: true });
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[pagamentosWebhook] cron/saude:', e.message);
    next(paymentCronError(e, 'Erro ao verificar a credencial de pagamento.'));
  }
});

module.exports = router;

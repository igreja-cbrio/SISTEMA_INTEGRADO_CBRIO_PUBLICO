



const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { isAuthorizedCron } = require('../utils/cronAuth');
const { analisar, alertar } = require('../services/agenteVoluntariado');
const fila = require('../services/whatsappFila');
const { avisarEscalasDaSemana, avisarVespera } = require('../services/escalaAviso');


async function cronChecar(req, res) {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const alertas = await alertar();








    let aviso = null;
    try {
      aviso = await avisarVespera();
    } catch (e) {
      console.error('[agente-voluntariado/cron] aviso de escala falhou:', e.message);
      aviso = { erro: e.message };
    }

    res.json({ ok: true, alertas, aviso });
  } catch (e) {
    console.error('[agente-voluntariado/cron]', e.message);
    res.status(500).json({ error: e.message });
  }
}
router.get('/cron/checar', cronChecar);
router.post('/cron/checar', cronChecar);



router.get('/', authenticate, authorizeModule('voluntariado', 1), async (_req, res) => {
  try {
    const r = await analisar();
    res.json(r);
  } catch (e) {
    console.error('[agente-voluntariado] analisar:', e.message);
    res.status(500).json({ error: 'Erro ao analisar as escalas' });
  }
});





const TETO_RODADA = 200;







































router.post('/avisar-semana', authenticate, authorizeModule('voluntariado', 2), async (req, res) => {
  try {



    const dias = Math.min(14, Math.max(1, parseInt(req.body?.dias, 10) || 2));
    const r = await avisarEscalasDaSemana({ dias });
    res.json(r);
  } catch (e) {
    console.error('[agente-voluntariado] avisar-semana:', e.message);
    res.status(500).json({ error: 'Erro ao avisar os escalados da semana' });
  }
});

router.post('/lembrar', authenticate, authorizeModule('voluntariado', 2), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.schedule_ids) ? req.body.schedule_ids : null;
    const templateName = process.env.WHATSAPP_TEMPLATE_ESCALA;

    const { confirmacoes_pendentes } = await analisar();
    const alvo = ids ? confirmacoes_pendentes.filter((p) => ids.includes(p.schedule_id)) : confirmacoes_pendentes;

    const comTelefone = alvo.filter((p) => p.telefone);
    const sem_telefone = alvo.length - comTelefone.length;
    const rodada = comTelefone.slice(0, TETO_RODADA);
    const adiados = comTelefone.length - rodada.length;




    if (!templateName) {
      return res.json({
        total: alvo.length, enfileirados: 0, sem_telefone, adiados,
        template_configurado: false,
        motivo: 'O template de escala ainda não está configurado (WHATSAPP_TEMPLATE_ESCALA) — nenhuma mensagem foi enviada. Lembre-se de que a Vercel só aplica variável de ambiente nova em deployment novo.',
      });
    }

    const r = await fila.enfileirarLote(rodada.map((p) => ({
      telefone: p.telefone,
      template: templateName,
      idioma: 'pt_BR',
      params: [p.funcao || 'Voluntariado', p.servico || 'culto', p.quando || ''],




      contexto: 'voluntariado.escala_lembrete',
      refId: p.schedule_id,
    })));

    res.json({
      total: alvo.length,
      enfileirados: r.queued || 0,
      sem_telefone,
      adiados,
      template_configurado: true,
      motivo: (r.queued || 0) === 0
        ? (r.motivo === 'disabled'
          ? 'O envio de WhatsApp está desligado (kill-switch) — nenhuma mensagem foi enviada.'
          : 'Nenhuma mensagem foi enfileirada.')
        : null,
    });
  } catch (e) {
    console.error('[agente-voluntariado] lembrar:', e.message);
    res.status(500).json({ error: 'Erro ao enviar lembretes' });
  }
});

module.exports = router;

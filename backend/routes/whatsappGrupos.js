














const router = require('express').Router();
const { requireCron } = require('../utils/cronAuth');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const svc = require('../services/whatsappGrupos');




router.get('/cron/diario', requireCron, async (req, res) => {
  try {
    const sync = await svc.sincronizarLideresGrupos();
    console.log('[whatsapp-grupos cron]', JSON.stringify({ sync }));
    res.json({ ok: true, sync });
  } catch (e) {
    console.error('[whatsapp-grupos cron]', e.message);
    res.status(500).json({ error: e.message });
  }
});


router.use(authenticate);
const podeGerir = authorizeModule('grupos', 3);



router.patch('/materiais/:docId/estudo-semana', podeGerir, async (req, res) => {
  try {
    const ativo = req.body?.ativo !== false;
    if (ativo) {
      await supabase.from('mem_grupo_documentos').update({ estudo_semana: false }).eq('estudo_semana', true);
    }
    const { data, error } = await supabase
      .from('mem_grupo_documentos')
      .update({ estudo_semana: ativo })
      .eq('id', req.params.docId)
      .select('id, nome, estudo_semana')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[whatsapp-grupos] estudo-semana', e.message);
    res.status(500).json({ error: 'Erro ao marcar estudo da semana' });
  }
});







router.post('/enviar-lembretes', podeGerir, async (req, res) => {
  try {
    const r = await svc.enviarLembretesEncontro();
    res.json({ ok: true, ...r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.post('/sincronizar-lideres', podeGerir, async (req, res) => {
  try {
    const r = await svc.sincronizarLideresGrupos();
    res.json({ ok: true, ...r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

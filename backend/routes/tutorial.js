







const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);


router.get('/progress', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('app_tutorial_progress')
      .select('tour_id, status')
      .eq('user_id', req.user.userId);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[tutorial] progress:', e.message);
    res.status(500).json({ error: 'Erro ao carregar progresso de tutoriais' });
  }
});


router.post('/complete', async (req, res) => {
  try {
    const { tour_id, status } = req.body || {};
    if (!tour_id) return res.status(400).json({ error: 'tour_id obrigatório' });
    const st = status === 'skipped' ? 'skipped' : 'completed';
    const { error } = await supabase
      .from('app_tutorial_progress')
      .upsert(
        { user_id: req.user.userId, tour_id, status: st, completed_at: new Date().toISOString() },
        { onConflict: 'user_id,tour_id' },
      );
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('[tutorial] complete:', e.message);
    res.status(500).json({ error: 'Erro ao salvar progresso do tutorial' });
  }
});


router.delete('/progress', async (req, res) => {
  try {
    const { tour_id } = req.query;
    let q = supabase.from('app_tutorial_progress').delete().eq('user_id', req.user.userId);
    if (tour_id) q = q.eq('tour_id', tour_id);
    const { error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('[tutorial] reset:', e.message);
    res.status(500).json({ error: 'Erro ao resetar tutorial' });
  }
});

module.exports = router;

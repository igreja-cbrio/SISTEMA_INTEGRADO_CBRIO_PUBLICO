








const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);


router.get('/minhas', async (req, res) => {
  try {
    const email = String(req.user?.email || '').toLowerCase().trim();
    if (!email) return res.json([]);
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('rh_cobertura')
      .select('id, titular_nome, data_inicio, data_fim, modulos_concedidos')
      .ilike('substituto_email', email)
      .eq('status', 'ativa')
      .gte('data_fim', hoje)
      .order('data_fim', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[coberturas/minhas]', e.message);
    res.status(500).json({ error: 'Erro ao buscar coberturas' });
  }
});

module.exports = router;

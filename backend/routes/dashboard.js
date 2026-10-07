const router = require('express').Router();
const { authenticate, apenasColaborador } = require('../middleware/auth');


const { supabase } = require('../utils/supabase');

router.use(authenticate);





router.use(apenasColaborador);


router.get('/pmo', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vw_pmo_kpis').select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao buscar KPIs' }); }
});


router.get('/workload', async (req, res) => {
  try {
    const { data, error } = await supabase.from('vw_workload').select('*');
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao buscar carga' }); }
});


module.exports = router;

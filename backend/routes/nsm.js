









const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);




router.get('/painel', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_nsm_painel')
      .select('*');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('nsm/painel:', e.message);
    res.status(500).json({ error: 'Erro ao buscar painel NSM' });
  }
});




router.get('/painel/:segmento', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_nsm_painel')
      .select('*')
      .eq('segmento', req.params.segmento)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Segmento não encontrado' });
    res.json(data);
  } catch (e) {
    console.error('nsm/painel/segmento:', e.message);
    res.status(500).json({ error: 'Erro ao buscar segmento' });
  }
});





router.post('/recalcular', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('recalcular_nsm');
    if (error) throw error;
    res.json({ ok: true, segmentos: data || [] });
  } catch (e) {
    console.error('nsm/recalcular:', e.message);
    res.status(500).json({ error: e.message });
  }
});





router.get('/eventos', async (req, res) => {
  try {
    const { segmento, valor } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 500);

    let q = supabase
      .from('nsm_eventos')
      .select('id, nome, cpf, valor_engajado, data_decisao, data_engajamento, dias_da_decisao, dentro_janela_60d, origem, igreja_id, created_at')
      .order('data_engajamento', { ascending: false })
      .limit(limit);

    if (valor) q = q.eq('valor_engajado', valor);


    if (segmento) {
      const { data: seg } = await supabase
        .from('nsm_estado')
        .select('segmento_filtro, segmento_tipo')
        .eq('segmento', segmento)
        .maybeSingle();

      if (seg?.segmento_tipo === 'igreja_tipo' && seg?.segmento_filtro?.tipo) {
        const { data: igrejas } = await supabase
          .from('igrejas')
          .select('id')
          .eq('tipo', seg.segmento_filtro.tipo)
          .eq('ativa', true);
        const ids = (igrejas || []).map(i => i.id);
        if (ids.length) q = q.in('igreja_id', ids);
        else q = q.eq('igreja_id', '00000000-0000-0000-0000-000000000000');
      }
    }

    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('nsm/eventos:', e.message);
    res.status(500).json({ error: 'Erro ao buscar eventos' });
  }
});

module.exports = router;

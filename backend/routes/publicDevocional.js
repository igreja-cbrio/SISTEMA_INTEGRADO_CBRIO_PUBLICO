







const router = require('express').Router();
const { supabase } = require('../utils/supabase');




























router.get('/hoje', async (req, res) => {
  try {

    const hoje = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());

    const { data, error } = await supabase
      .from('devocional_itens')
      .select('titulo, passagem, passagem_texto, data, devocional_planos!inner(ativo)')
      .eq('devocional_planos.ativo', true)
      .eq('data', hoje)
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    res.set('Cache-Control', 'public, max-age=1800, s-maxage=1800');
    if (!data) {
      return res.json({ tem: false, data: hoje });
    }
    res.json({
      tem: true,
      data: data.data,
      titulo: data.titulo,
      passagem: data.passagem,
      passagem_texto: data.passagem_texto,
    });
  } catch (e) {
    console.error('[PublicDevocional] hoje:', e.message);
    res.status(500).json({ error: 'Erro ao buscar devocional' });
  }
});

module.exports = router;

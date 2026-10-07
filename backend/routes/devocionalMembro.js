



const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);



async function resolveMembro(req) {
  const u = req.user;
  if (!u) return null;
  if (u.membro_id) {
    const { data: m } = await supabase
      .from('mem_membros')
      .select('id, nome, foto_url')
      .eq('id', u.membro_id)
      .maybeSingle();
    if (m) return m;
  }

  if (u.email) {
    const { data: m } = await supabase
      .from('mem_membros')
      .select('id, nome, foto_url')
      .ilike('email', u.email)
      .eq('active', true)
      .maybeSingle();
    if (m) {
      await supabase.from('profiles').update({ membro_id: m.id }).eq('id', u.id);
      return m;
    }
  }
  return null;
}






router.get('/hoje', async (req, res) => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const membro = await resolveMembro(req);


    const { data: itens, error } = await supabase
      .from('devocional_itens')
      .select('*, devocional_planos!inner(id, titulo, ativo, data_inicio, data_fim)')
      .eq('data', hoje)
      .eq('devocional_planos.ativo', true)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;

    const item = (itens || [])[0] || null;

    let concluido_hoje = false;
    let check_in_id = null;
    if (item && membro) {
      const { data: ck } = await supabase
        .from('mem_devocionais')
        .select('id')
        .eq('membro_id', membro.id)
        .eq('data_devocional', hoje)




        .eq('tipo', 'pessoal')



        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (ck) { concluido_hoje = true; check_in_id = ck.id; }
    }

    res.json({
      hoje,
      membro: membro ? { id: membro.id, nome: membro.nome, foto_url: membro.foto_url } : null,
      item,
      concluido_hoje,
      check_in_id,
    });
  } catch (e) {
    console.error('devocional-membro/hoje:', e.message);
    res.status(500).json({ error: 'Erro ao buscar devocional do dia' });
  }
});







router.post('/check-in', async (req, res) => {
  try {
    const membro = await resolveMembro(req);
    if (!membro) {
      return res.status(403).json({ error: 'Profile não linkado a um membro' });
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const { item_id, observacoes } = req.body || {};


    const { data: existente } = await supabase
      .from('mem_devocionais')
      .select('*')
      .eq('membro_id', membro.id)
      .eq('data_devocional', hoje)




      .eq('tipo', 'pessoal')



      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (existente) {

      const patch = {};
      if (item_id && !existente.devocional_item_id) patch.devocional_item_id = item_id;
      if (observacoes && !existente.observacoes) patch.observacoes = observacoes;
      if (Object.keys(patch).length) {
        const { data: upd } = await supabase
          .from('mem_devocionais')
          .update(patch)
          .eq('id', existente.id)
          .select()
          .single();
        return res.json({ ja_existia: true, registro: upd || existente });
      }
      return res.json({ ja_existia: true, registro: existente });
    }

    const novoCheckIn = {
      membro_id: membro.id,
      data_devocional: hoje,
      tipo: 'pessoal',
      topico: null,
      observacoes: observacoes || null,
      devocional_item_id: item_id || null,
      concluida: true,
      created_by: req.user?.userId || null,
    };

    const { data: novo, error } = await supabase
      .from('mem_devocionais')
      .insert(novoCheckIn)
      .select()
      .single();

    if (error) {





      if (error.code !== '23505') throw error;

      const { data: apagado } = await supabase
        .from('mem_devocionais')
        .select('id, deleted_at')
        .eq('membro_id', membro.id)
        .eq('data_devocional', hoje)
        .eq('tipo', 'pessoal')
        .limit(1)
        .maybeSingle();

      let revivido = null;
      if (apagado?.deleted_at) {
        const { data: upd, error: erroRevive } = await supabase
          .from('mem_devocionais')
          .update({ ...novoCheckIn, deleted_at: null })
          .eq('id', apagado.id)


          .not('deleted_at', 'is', null)
          .select()
          .maybeSingle();
        if (erroRevive) throw erroRevive;
        revivido = upd || null;
      }


      if (revivido) return res.status(201).json({ ja_existia: false, registro: revivido });



      const { data: vivo } = await supabase
        .from('mem_devocionais')
        .select('*')
        .eq('membro_id', membro.id)
        .eq('data_devocional', hoje)
        .eq('tipo', 'pessoal')
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (vivo) return res.json({ ja_existia: true, registro: vivo });
      throw error;
    }

    res.status(201).json({ ja_existia: false, registro: novo });
  } catch (e) {
    console.error('devocional-membro/check-in:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao registrar check-in' });
  }
});





router.get('/historico', async (req, res) => {
  try {
    const membro = await resolveMembro(req);
    if (!membro) return res.json({ data: [] });

    const { data, error } = await supabase
      .from('mem_devocionais')
      .select('id, data_devocional, observacoes, devocional_item_id, devocional_itens(id, titulo, passagem)')
      .eq('membro_id', membro.id)


      .is('deleted_at', null)
      .order('data_devocional', { ascending: false })
      .limit(30);
    if (error) throw error;

    res.json({ data: data || [] });
  } catch (e) {
    console.error('devocional-membro/historico:', e.message);
    res.status(500).json({ error: 'Erro ao listar histórico' });
  }
});

module.exports = router;

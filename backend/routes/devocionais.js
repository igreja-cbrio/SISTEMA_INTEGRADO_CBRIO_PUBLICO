




const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');




const { escapePostgrestValue } = require('../utils/sanitize');

router.use(authenticate);






const guardLerDeTerceiro   = authorizeModule('devocionais', 2);
const guardAgregado        = authorizeModule('devocionais', 1);
const guardGerirDeTerceiro = authorizeModule('devocionais', 3);










async function membroIdsDoUsuario(req) {







  const ids = new Set();
  if (req.user?.membro_id) ids.add(String(req.user.membro_id));
  const email = String(req.user?.email || '').trim().toLowerCase();
  if (!email) return [...ids];
  const { data, error } = await supabase
    .from('mem_membros')
    .select('id')



    .ilike('email', escapePostgrestValue(email))



    .is('deleted_at', null);


  if (error) throw error;
  for (const m of data || []) if (m.id) ids.add(String(m.id));
  return [...ids];
}




async function soDonoOuMatriz(req, res, next) {
  try {
    const alvo = req.params.id || req.query.membro_id || null;
    if (alvo) {
      const meus = await membroIdsDoUsuario(req);
      if (meus.includes(String(alvo))) return next();
    }
  } catch (e) {
    console.error('devocionais posse (leitura):', e.message);
  }
  return guardLerDeTerceiro(req, res, next);
}


async function escritaSoDoDono(req, res, next) {
  try {
    const meus = await membroIdsDoUsuario(req);
    const alvo = req.body?.membro_id ? String(req.body.membro_id) : null;





    if (meus.length === 1 && (!alvo || alvo === meus[0])) {
      req.devocionalMembroId = meus[0];
      return next();
    }



    if (meus.length > 1 && alvo && meus.includes(alvo)) return next();
  } catch (e) {
    console.error('devocionais posse (escrita):', e.message);
  }
  return guardGerirDeTerceiro(req, res, next);
}


async function registroSoDoDono(req, res, next) {
  let linha = null;
  try {
    const { data, error } = await supabase
      .from('mem_devocionais')
      .select('id, membro_id')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    linha = data;
    if (!linha) return res.status(404).json({ error: 'Devocional não encontrado' });



    const meus = await membroIdsDoUsuario(req);
    if (linha.membro_id && meus.includes(String(linha.membro_id))) return next();
  } catch (e) {
    console.error('devocionais posse (registro):', e.message);
  }
  return guardGerirDeTerceiro(req, res, next);
}






router.get('/', soDonoOuMatriz, async (req, res) => {
  try {
    const { membro_id, tipo, desde, ate, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let q = supabase
      .from('mem_devocionais')
      .select('*, mem_membros(nome, foto_url)', { count: 'exact' })
      .is('deleted_at', null)
      .order('data_devocional', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    if (membro_id) q = q.eq('membro_id', membro_id);
    if (tipo) q = q.eq('tipo', tipo);
    if (desde) q = q.gte('data_devocional', desde);
    if (ate) q = q.lte('data_devocional', ate);

    const { data, count, error } = await q;
    if (error) throw error;
    res.json({ data: data || [], total: count || 0 });
  } catch (e) {
    console.error('devocionais list:', e.message);
    res.status(500).json({ error: 'Erro ao listar devocionais' });
  }
});





router.get('/membro/:id', soDonoOuMatriz, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 90, 366);
    const { data, error } = await supabase
      .from('mem_devocionais')
      .select('*, devocional_itens(id, titulo, passagem)')
      .is('deleted_at', null)
      .eq('membro_id', req.params.id)
      .order('data_devocional', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const rows = data || [];


    const dias = new Set(rows.map(r => r.data_devocional));
    let streak = 0;
    const umDia = 86400000;
    let cursor = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    if (!dias.has(fmt(cursor))) cursor = new Date(cursor.getTime() - umDia);
    while (dias.has(fmt(cursor))) {
      streak++;
      cursor = new Date(cursor.getTime() - umDia);
    }

    const { count: total } = await supabase
      .from('mem_devocionais')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .eq('membro_id', req.params.id);

    const inicioMes = new Date();
    inicioMes.setDate(1);
    const noMes = rows.filter(r => r.data_devocional >= fmt(inicioMes)).length;

    res.json({ data: rows, resumo: { total: total || 0, streak, no_mes: noMes } });
  } catch (e) {
    console.error('devocionais membro:', e.message);
    res.status(500).json({ error: 'Erro ao buscar devocionais do membro' });
  }
});






router.get('/kpis', guardAgregado, async (req, res) => {
  try {
    const hoje = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const d30 = new Date(hoje.getTime() - 29 * 86400000);
    const m6 = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);


    const rows = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('mem_devocionais')
        .select('membro_id, data_devocional, tipo, mem_membros(familia_id)')
        .is('deleted_at', null)
        .gte('data_devocional', fmt(m6))
        .order('data_devocional', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }

    const inicioMesStr = fmt(inicioMes);
    const d30Str = fmt(d30);

    const mesAtual = { checkins: 0, pessoas: new Set(), familias: new Set() };
    const porDia = {};
    const porMes = {};
    for (const r of rows) {
      const mes = r.data_devocional.slice(0, 7);
      porMes[mes] = porMes[mes] || { checkins: 0, pessoas: new Set() };
      porMes[mes].checkins++;
      if (r.membro_id) porMes[mes].pessoas.add(r.membro_id);
      if (r.data_devocional >= d30Str) {
        porDia[r.data_devocional] = (porDia[r.data_devocional] || 0) + 1;
      }
      if (r.data_devocional >= inicioMesStr) {
        mesAtual.checkins++;
        if (r.membro_id) mesAtual.pessoas.add(r.membro_id);
        if (r.tipo === 'familiar' && r.mem_membros?.familia_id) mesAtual.familias.add(r.mem_membros.familia_id);
      }
    }

    const serieDiaria = [];
    for (let i = 29; i >= 0; i--) {
      const d = fmt(new Date(hoje.getTime() - i * 86400000));
      serieDiaria.push({ data: d, checkins: porDia[d] || 0 });
    }
    const serieMensal = Object.keys(porMes).sort().map(m => ({
      mes: m, checkins: porMes[m].checkins, pessoas: porMes[m].pessoas.size,
    }));


    const { data: kpis } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, descricao, periodicidade, meta_valor, valores, area, fonte_auto')
      .like('id', 'DEV-%')
      .eq('ativo', true);
    const ids = (kpis || []).map(k => k.id);
    let trajetoria = [];
    if (ids.length) {
      const { data: tr } = await supabase
        .from('vw_kpi_trajetoria_atual')
        .select('kpi_id, ultimo_valor, ultimo_periodo, status, percentual_meta')
        .in('kpi_id', ids);
      trajetoria = tr || [];
    }
    const trMap = new Map(trajetoria.map(t => [t.kpi_id, t]));


    const { data: objetivo } = await supabase
      .from('kpi_objetivos_gerais')
      .select('id, nome, meta_descricao')
      .eq('id', '576c04ec-88a2-40f3-6ba2-9d03fe65de96')
      .maybeSingle();
    const { data: krs } = await supabase
      .from('kpi_krs')
      .select('id, titulo, meta_valor, meta_texto, unidade, fonte_kpi_id, ativo, kr_pai_id')
      .eq('objetivo_geral_id', '576c04ec-88a2-40f3-6ba2-9d03fe65de96')
      .eq('ativo', true)
      .is('kr_pai_id', null);

    const diasNoMes = hoje.getDate();
    res.json({
      mes_atual: {
        checkins: mesAtual.checkins,
        pessoas: mesAtual.pessoas.size,
        familias: mesAtual.familias.size,
        media_dia: diasNoMes ? Math.round((mesAtual.checkins / diasNoMes) * 10) / 10 : 0,
      },
      serie_diaria: serieDiaria,
      serie_mensal: serieMensal,
      kpis: (kpis || []).map(k => ({ ...k, trajetoria: trMap.get(k.id) || null })),
      okr: {
        objetivo: objetivo || null,
        krs: (krs || []).map(k => {
          const t = k.fonte_kpi_id ? trMap.get(k.fonte_kpi_id) : null;
          return { ...k, realizado: t?.ultimo_valor ?? null, realizado_periodo: t?.ultimo_periodo ?? null, kr_status: t?.status ?? 'sem_dado' };
        }),
      },
    });
  } catch (e) {
    console.error('devocionais kpis:', e.message);
    res.status(500).json({ error: 'Erro ao calcular KPIs do devocional' });
  }
});






router.get('/stats', guardAgregado, async (req, res) => {
  try {
    const { desde, ate } = req.query;
    const hoje = new Date().toISOString().slice(0, 10);
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const inicio = desde || d30;
    const fim = ate || hoje;

    const { data } = await supabase
      .from('mem_devocionais')
      .select('membro_id, tipo, mem_membros(familia_id)')
      .is('deleted_at', null)
      .gte('data_devocional', inicio)
      .lte('data_devocional', fim);

    const rows = data || [];
    const familias = new Set();
    const membros = new Set();
    const porTipo = { pessoal: 0, familiar: 0, grupo: 0 };

    rows.forEach(r => {
      membros.add(r.membro_id);
      if (porTipo[r.tipo] !== undefined) porTipo[r.tipo]++;
      const fid = r.mem_membros?.familia_id;
      if (r.tipo === 'familiar' && fid) familias.add(fid);
    });

    res.json({
      periodo: { inicio, fim },
      total_registros: rows.length,
      familias_com_devocional_familiar: familias.size,
      membros_com_devocional: membros.size,
      por_tipo: porTipo,
    });
  } catch (e) {
    console.error('devocionais stats:', e.message);
    res.status(500).json({ error: 'Erro ao calcular stats' });
  }
});






router.post('/', escritaSoDoDono, async (req, res) => {
  try {
    const { data_devocional, tipo, topico, observacoes } = req.body || {};


    const membro_id = req.devocionalMembroId || req.body?.membro_id;
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatorio' });
    if (!tipo || !['pessoal', 'familiar', 'grupo'].includes(tipo)) {
      return res.status(400).json({ error: "tipo deve ser 'pessoal', 'familiar' ou 'grupo'" });
    }

    const payload = {
      membro_id,
      data_devocional: data_devocional || new Date().toISOString().slice(0, 10),
      tipo,
      topico: topico || null,
      observacoes: observacoes || null,
      created_by: req.user?.id || null,
    };

    const { data, error } = await supabase
      .from('mem_devocionais')
      .insert(payload)
      .select()
      .single();

    if (error) {

      if (error.code === '23505') {







        const { data: conflito } = await supabase
          .from('mem_devocionais')
          .select('id, deleted_at')
          .eq('membro_id', payload.membro_id)
          .eq('data_devocional', payload.data_devocional)
          .eq('tipo', payload.tipo)
          .limit(1)
          .maybeSingle();

        if (conflito?.deleted_at) {
          const { data: revivido, error: erroRevive } = await supabase
            .from('mem_devocionais')
            .update({
              deleted_at: null,
              topico: payload.topico,
              observacoes: payload.observacoes,
              created_by: payload.created_by,




              concluida: true,





              devocional_item_id: null,
            })
            .eq('id', conflito.id)


            .not('deleted_at', 'is', null)
            .select()
            .maybeSingle();
          if (erroRevive) throw erroRevive;

          if (revivido) return res.status(201).json(revivido);
        }


        return res.status(409).json({ error: 'Devocional já registrado para esse membro/dia/tipo' });
      }
      throw error;
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('devocionais create:', e.message);
    res.status(500).json({ error: 'Erro ao registrar devocional' });
  }
});





router.put('/:id', registroSoDoDono, async (req, res) => {
  try {
    const { tipo, topico, observacoes, concluida } = req.body || {};
    const patch = {};
    if (tipo !== undefined) {
      if (!['pessoal', 'familiar', 'grupo'].includes(tipo)) {
        return res.status(400).json({ error: 'tipo invalido' });
      }
      patch.tipo = tipo;
    }
    if (topico !== undefined) patch.topico = topico;
    if (observacoes !== undefined) patch.observacoes = observacoes;
    if (concluida !== undefined) patch.concluida = !!concluida;

    const { data, error } = await supabase
      .from('mem_devocionais')
      .update(patch)
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('devocionais update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar devocional' });
  }
});





router.delete('/:id', registroSoDoDono, async (req, res) => {
  try {


    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'mem_devocionais',
      p_row_id: req.params.id,
      p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    console.error('devocionais delete:', e.message);
    res.status(500).json({ error: 'Erro ao deletar devocional' });
  }
});

module.exports = router;












const { supabase } = require('../utils/supabase');

async function categoriaCampanhas() {
  const { data, error } = await supabase.from('event_categories').select('id, name, active')
    .or('name.ilike.campanhas,name.ilike.campanha').order('active', { ascending: false }).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

function diaD(camp) {
  const d = camp?.data_lancamento || camp?.data_inicio || null;
  return d ? String(d).slice(0, 10) : null;
}






async function criarCicloDaCampanha(camp, userId) {
  if (camp.evento_id) return { ok: false, motivo: 'ja_tem_evento', evento_id: camp.evento_id };
  const data = diaD(camp);
  if (!data) return { ok: false, motivo: 'sem_data', detalhe: 'Defina a data de lançamento (ou o início): o ciclo é contado em semanas antes dela.' };
  const cat = await categoriaCampanhas();
  if (!cat) return { ok: false, motivo: 'sem_categoria', detalhe: 'A categoria de evento "Campanhas" não existe — aplique a migration 20260930130000.' };

  const { data: ev, error } = await supabase.from('events').insert({
    name: camp.nome, date: data, category_id: cat.id,
    description: camp.descricao_curta || '', location: '', responsible: '',
    budget_planned: 0, expected_attendance: null, recurrence: 'unico',
    notes: `Evento gerado pela campanha ${camp.nome} (módulo Campanhas · ${camp.id}). O Dia D é o lançamento da campanha.`,
    project_id: null, created_by: userId || null,
  }).select('id').single();
  if (error) throw error;



  const { error: eUp } = await supabase.from('camp_campanhas').update({ evento_id: ev.id }).eq('id', camp.id);
  if (eUp) {
    if (eUp.code === '42703') return { ok: false, motivo: 'sem_coluna', evento_id: ev.id, detalhe: 'A migration 20260930130000 (camp_campanhas.evento_id) ainda não foi aplicada.' };
    throw eUp;
  }

  let cicloAtivado = false; let aviso = null;
  try {
    const { activateCycleForEvent } = require('../routes/cycles');
    await activateCycleForEvent(ev.id, userId);
    cicloAtivado = true;
  } catch (e) {
    aviso = `Evento criado, mas o ciclo não ativou: ${e.message}`;
    console.error('[campanhaCiclo] ativação do ciclo:', e.message);
  }
  return { ok: true, evento_id: ev.id, ciclo_ativado: cicloAtivado, aviso };
}


async function estadoDoCiclo(camp) {
  if (!camp?.evento_id) return null;
  const [ev, cy] = await Promise.all([
    supabase.from('events').select('id, name, date, status').eq('id', camp.evento_id).maybeSingle(),
    supabase.from('event_cycles').select('id, status, data_dia_d').eq('event_id', camp.evento_id).maybeSingle(),
  ]);
  return {
    evento_id: camp.evento_id, evento: ev.data || null, evento_apagado: !ev.error && !ev.data,
    ciclo: cy.data || null,
  };
}

module.exports = { criarCicloDaCampanha, estadoDoCiclo, diaD, categoriaCampanhas };

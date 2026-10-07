





















const { supabase } = require('../utils/supabase');


function mesDoEncontro(data) {
  const s = String(data || '');
  return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : null;
}



function chaveMesMembro(dataEncontro, membroId) {
  const mes = mesDoEncontro(dataEncontro);
  return mes && membroId ? `${mes}|${membroId}` : null;
}




async function resolverTurma(mes) {
  if (mes) {
    const { data } = await supabase.from('next_turmas')
      .select('id').eq('origem_mes', mes).is('deleted_at', null)
      .limit(1).maybeSingle();
    if (data?.id) return data.id;
  }
  const { data: aberta } = await supabase.from('next_turmas')
    .select('id').eq('status', 'aberta').is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return aberta?.id || null;
}





async function espelharMatriculaDoEncontro({
  membro, evento, nome, sobrenome, email, checkInAt = null, checkInBy = null, origem = 'app',
}) {
  try {
    if (!membro?.id || !evento?.data) return { ok: false, motivo: 'sem_membro_ou_encontro' };
    const chave = chaveMesMembro(evento.data, membro.id);
    if (!chave) return { ok: false, motivo: 'data_do_encontro_invalida' };

    const { data: ja } = await supabase.from('next_matriculas')
      .select('id, check_in_at').eq('origem_mes_key', chave).is('deleted_at', null)
      .limit(1).maybeSingle();
    if (ja) {


      if (checkInAt && !ja.check_in_at) {
        await supabase.from('next_matriculas')
          .update({ check_in_at: checkInAt, check_in_by: checkInBy, updated_at: new Date().toISOString() })
          .eq('id', ja.id);
      }
      return { ok: true, matricula_id: ja.id, criada: false };
    }

    const turmaId = await resolverTurma(mesDoEncontro(evento.data));
    const { data: nova, error } = await supabase.from('next_matriculas').insert({
      turma_id: turmaId,
      nome: nome || membro.nome || 'Membro',
      sobrenome: sobrenome || null,
      cpf: membro.cpf || null,
      telefone: membro.telefone || null,
      email: email || membro.email || null,
      data_nascimento: membro.data_nascimento || null,
      membro_id: membro.id,
      origem,
      origem_mes_key: chave,
      status: 'matriculado',
      check_in_at: checkInAt,
      check_in_by: checkInBy,
    }).select('id').single();

    if (error) {


      if (error.code === '23505') return { ok: true, criada: false, motivo: 'ja_existia' };
      throw error;
    }
    return { ok: true, matricula_id: nova.id, criada: true };
  } catch (e) {
    console.error('[nextMatricula] espelho da matrícula:', e.message);
    return { ok: false, motivo: e.message };
  }
}

module.exports = { espelharMatriculaDoEncontro, chaveMesMembro, mesDoEncontro };

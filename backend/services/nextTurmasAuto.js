










const { supabase } = require('../utils/supabase');
const { turmasPlanejadas, mesesAGarantir } = require('../utils/nextTurmas');









async function garantirTurmasDoMes(mes, agora = new Date()) {
  const plano = turmasPlanejadas(mes, agora);
  const criadas = [];
  const jaExistiam = [];
  const erros = [];

  for (const t of plano) {


    const { data: turma, error } = await supabase
      .from('next_turmas')
      .insert({ nome: t.nome, status: 'aberta', auto_domingo: t.data })
      .select('id, nome, auto_domingo')
      .single();

    if (error) {
      if (error.code === '23505') { jaExistiam.push(t.data); continue; }
      erros.push({ domingo: t.data, etapa: 'turma', motivo: error.message });
      continue;
    }







    const { error: encErr } = await supabase
      .from('next_encontros')
      .insert({ turma_id: turma.id, numero: t.encontros[0].numero, data: t.encontros[0].data });

    if (encErr) {
      await supabase.from('next_turmas').delete().eq('id', turma.id);
      erros.push({ domingo: t.data, etapa: 'encontro', motivo: encErr.message });
      continue;
    }

    criadas.push({ id: turma.id, nome: turma.nome, data: t.data });
  }

  return { mes, criadas, ja_existiam: jaExistiam, erros };
}









async function garantirTurmasAutomaticas(agora = new Date()) {
  const out = { meses: [], criadas: 0, ja_existiam: 0, erros: [] };
  for (const mes of mesesAGarantir(agora)) {
    const r = await garantirTurmasDoMes(mes, agora);
    out.meses.push({ mes, criadas: r.criadas.length, ja_existiam: r.ja_existiam.length });
    out.criadas += r.criadas.length;
    out.ja_existiam += r.ja_existiam.length;
    out.erros.push(...r.erros);
  }
  return out;
}

module.exports = { garantirTurmasDoMes, garantirTurmasAutomaticas };

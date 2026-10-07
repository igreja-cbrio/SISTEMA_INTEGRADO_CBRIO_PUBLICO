












const { supabase } = require('../utils/supabase');
const { fetchAllRows } = require('../utils/pagination');
const { escolherHorarioApresentacao } = require('../utils/apresentacaoHorario');





async function horariosConfigurados() {
  const { data, error } = await supabase
    .from('apresentacao_horarios')
    .select('id, horario, label, aberto, limite, ordem')
    .is('deleted_at', null)
    .order('ordem');
  if (error) {
    console.error('[apresentacaoHorarios] catálogo:', error.message);
    return null;
  }
  return data || [];
}





async function ocupacaoPorHorario(dataApresentacao) {
  const linhas = await fetchAllRows(() => supabase
    .from('apresentacao_criancas')
    .select('horario_culto')
    .eq('data_apresentacao', dataApresentacao)
    .is('deleted_at', null)
    .neq('status', 'cancelado'));
  const c = {};
  (linhas || []).forEach((i) => {
    if (i.horario_culto) c[i.horario_culto] = (c[i.horario_culto] || 0) + 1;
  });
  return c;
}









async function escolherHorarioPara(dataApresentacao) {
  try {
    const [configurados, ocupacao] = await Promise.all([
      horariosConfigurados(),
      ocupacaoPorHorario(dataApresentacao),
    ]);
    const r = escolherHorarioApresentacao(configurados, ocupacao);
    return { ...r, configurados, ocupacao };
  } catch (e) {
    console.error('[apresentacaoHorarios] escolher:', e.message);
    return { horario: null, label: null, transbordou: false, lotado: false, configurados: null, ocupacao: {} };
  }
}

module.exports = { horariosConfigurados, ocupacaoPorHorario, escolherHorarioPara };















const { supabase } = require('../utils/supabase');
const { DATAS_ABERTAS_PADRAO } = require('../utils/batismoData');
const { fetchAllRows } = require('../utils/pagination');







async function horariosConfigurados() {
  const { data, error } = await supabase
    .from('batismo_horarios')
    .select('horario, label, aberto, limite')
    .is('deleted_at', null)
    .order('ordem');
  if (error) {
    console.error('[batismoHorarios] catálogo:', error.message);
    return null;
  }
  return data || [];
}








async function ocupacaoPorHorario(dataBatismo) {
  const linhas = await fetchAllRows(() => supabase
    .from('batismo_inscricoes')
    .select('horario_culto')
    .eq('data_batismo', dataBatismo)
    .is('deleted_at', null)
    .not('status', 'in', '(cancelado,rejeitado)'));
  const c = {};
  linhas.forEach((i) => {
    if (i.horario_culto) c[i.horario_culto] = (c[i.horario_culto] || 0) + 1;
  });
  return c;
}







async function dataProximoBatismo() {





  const { data, error } = await supabase.rpc('fn_batismo_proxima_data');
  if (error) {
    console.error('[batismoHorarios] fn_batismo_proxima_data:', error.message);
    return null;
  }
  return data || null;
}








async function datasAbertas(n = DATAS_ABERTAS_PADRAO) {
  const { data, error } = await supabase.rpc('fn_batismo_datas_abertas', { p_n: n });
  if (error) {
    console.error('[batismoHorarios] fn_batismo_datas_abertas:', error.message);
    return null;
  }

  return (data || []).map((r) => (typeof r === 'string' ? r : r?.data)).filter(Boolean);
}

module.exports = { horariosConfigurados, ocupacaoPorHorario, dataProximoBatismo, datasAbertas };

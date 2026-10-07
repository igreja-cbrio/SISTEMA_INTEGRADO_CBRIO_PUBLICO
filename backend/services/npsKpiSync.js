








const { supabase } = require('../utils/supabase');








async function sincronizarKpi(pesquisaId) {
  const { data: pesquisa } = await supabase
    .from('nps_pesquisas')
    .select('id, contexto_kpi, area, data_inicio, status')
    .eq('id', pesquisaId)
    .single();
  if (!pesquisa || !pesquisa.contexto_kpi) return;


  if (pesquisa.status === 'arquivada') {
    await removerDadosBrutos(pesquisa.id);
    return;
  }

  const { data: stats } = await supabase
    .from('vw_nps_pesquisa_stats')
    .select('total_respostas, score_medio, nps_score')
    .eq('pesquisa_id', pesquisa.id)
    .single();
  if (!stats || !stats.total_respostas) return;

  const { data: tipo } = await supabase
    .from('tipos_dado_bruto')
    .select('id')
    .eq('id', pesquisa.contexto_kpi)
    .maybeSingle();
  if (!tipo) return;





  await removerDadosBrutos(pesquisa.id);

  await supabase
    .from('dados_brutos')
    .upsert(
      {
        tipo_id: pesquisa.contexto_kpi,
        area: pesquisa.area || 'geral',
        data: pesquisa.data_inicio,
        valor: Number(stats.score_medio) || 0,
        contexto: { pesquisa_id: pesquisa.id },
        origem: 'auto',
        observacao: `NPS automático: pesquisa ${pesquisa.id} · ${stats.total_respostas} resposta(s) · nps_score ${Number(stats.nps_score) || 0}`,
      },
      { onConflict: 'tipo_id,area,data,contexto' }
    );
}



async function removerDadosBrutos(pesquisaId) {
  await supabase
    .from('dados_brutos')
    .delete()
    .contains('contexto', { pesquisa_id: pesquisaId });
}









const _ultimoSync = new Map();
const JANELA_MS = 15 * 1000;
function agendarSync(pesquisaId) {
  const agora = Date.now();
  if (agora - (_ultimoSync.get(pesquisaId) || 0) < JANELA_MS) return;
  _ultimoSync.set(pesquisaId, agora);
  sincronizarKpi(pesquisaId).catch((err) =>
    console.warn('[npsKpiSync] sync falhou:', err.message)
  );
}





async function sincronizarPesquisasRecentes() {
  const corte = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const { data: pesquisas, error } = await supabase
    .from('nps_pesquisas')
    .select('id')
    .or(`status.eq.ativa,data_inicio.gte.${corte}`)
    .order('data_inicio', { ascending: false })
    .limit(100);
  if (error) return { error: error.message };
  let sincronizadas = 0;
  for (const p of pesquisas || []) {
    try {
      await sincronizarKpi(p.id);
      sincronizadas++;
    } catch (e) {
      console.warn('[npsKpiSync] recentes:', p.id, e.message);
    }
  }
  return { pesquisas: (pesquisas || []).length, sincronizadas };
}

module.exports = {
  sincronizarKpi,
  agendarSync,
  removerDadosBrutos,
  sincronizarPesquisasRecentes,
};

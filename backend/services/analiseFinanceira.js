





const { supabase } = require('../utils/supabase');




async function upsertAlerta(alerta) {
  const { data, error } = await supabase
    .from('fin_alertas')
    .upsert(alerta, { onConflict: 'tipo,chave_dedup', ignoreDuplicates: false })
    .select()
    .single();
  if (error) console.warn('[analise] upsert alerta:', error.message);
  return data;
}




async function detectarQuedaReceita({ thresholdQueda = 0.20 } = {}) {
  const { data: semanas } = await supabase
    .from('vw_fin_receita_semanal')
    .select('*')
    .order('semana_inicio', { ascending: false })
    .limit(2);

  if (!semanas || semanas.length < 2) return null;
  const [atual, anterior] = semanas;
  if (Number(anterior.receita_total) === 0) return null;
  const queda = (Number(anterior.receita_total) - Number(atual.receita_total)) / Number(anterior.receita_total);
  if (queda < thresholdQueda) return null;

  const dados = {
    semana_atual: atual,
    semana_anterior: anterior,
    queda_percentual: queda * 100,
  };

  return upsertAlerta({
    tipo: 'queda_receita',
    severidade: queda >= 0.40 ? 'critico' : queda >= 0.20 ? 'aviso' : 'info',
    titulo: `Receita caiu ${(queda * 100).toFixed(1)}% na semana ${atual.semana_label}`,
    mensagem: `Semana ${atual.semana_label}: ${fmtMoney(atual.receita_total)} vs semana ${anterior.semana_label}: ${fmtMoney(anterior.receita_total)} (queda de ${fmtMoney(anterior.receita_total - atual.receita_total)})`,
    dados,
    chave_dedup: `queda-${atual.semana_inicio}`,
  });
}




async function detectarContribuintesSumidos({ minDoacoes = 3, minDiasSemDoar = 60, limitAlertas = 20 } = {}) {
  const { data: sumidos } = await supabase
    .from('vw_fin_contribuintes_sumidos')
    .select('*')
    .limit(limitAlertas);

  if (!sumidos || sumidos.length === 0) return [];

  const criados = [];
  for (const s of sumidos) {
    if (s.doacoes_historico < minDoacoes || s.dias_sem_doar < minDiasSemDoar) continue;

    const a = await upsertAlerta({
      tipo: 'contribuinte_sumido',
      severidade: s.dias_sem_doar >= 120 ? 'aviso' : 'info',
      titulo: `${s.membro_nome} não doa ha ${s.dias_sem_doar} dias`,
      mensagem: `Doava em media ${fmtMoney(s.doacao_media)} (${s.doacoes_historico} doacoes nos últimos 6 meses). Total acumulado: ${fmtMoney(s.total_doado)}. Última doacao em ${s.ultima_doacao}.`,
      dados: s,
      chave_dedup: `sumido-${s.membro_id}-${monthKey()}`,
      membro_id: s.membro_id,
    });
    if (a) criados.push(a);
  }
  return criados;
}





async function detectarDespesasFixasAtrasadas({ tolerantes_dias = 7 } = {}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const limite = new Date(Date.now() + tolerantes_dias * 86400000).toISOString().slice(0, 10);

  const { data: recorrencias } = await supabase
    .from('fin_despesas_recorrentes')
    .select('*, plano:plano_contas_id(codigo, nome)')
    .eq('ativa', true)
    .eq('classe', 'fixa')
    .lt('proxima_estimada', hoje);

  if (!recorrencias) return [];

  const criados = [];
  for (const r of recorrencias) {

    const desdeUltima = new Date(r.ultima_ocorrencia);
    desdeUltima.setDate(desdeUltima.getDate() + r.cadencia_dias - 3);
    const desdeStr = desdeUltima.toISOString().slice(0, 10);

    const { count } = await supabase
      .from('fin_transacoes')
      .select('id', { count: 'exact', head: true })
      .eq('recorrencia_id', r.id)
      .gte('data_competencia', desdeStr);

    if (count && count > 0) continue;

    const diasAtraso = Math.floor((new Date() - new Date(r.proxima_estimada)) / 86400000);
    if (diasAtraso <= 0) continue;

    const a = await upsertAlerta({
      tipo: 'despesa_fixa_atrasada',
      severidade: diasAtraso >= 7 ? 'critico' : 'aviso',
      titulo: `${r.descricao} atrasada ha ${diasAtraso} dias`,
      mensagem: `Despesa fixa de ${fmtMoney(r.valor_medio)} estava prevista pra ${r.proxima_estimada}. Conta: ${r.plano?.codigo || ''} ${r.plano?.nome || ''}`,
      dados: { recorrencia: r, dias_atraso: diasAtraso },
      chave_dedup: `fixa-atrasada-${r.id}-${r.proxima_estimada}`,
      recorrencia_id: r.id,
    });
    if (a) criados.push(a);
  }
  return criados;
}




async function detectarPicoAnormal({ multiplicadorPico = 5 } = {}) {
  const { data: semanas } = await supabase
    .from('vw_fin_receita_semanal')
    .select('*')
    .order('semana_inicio', { ascending: false })
    .limit(8);

  if (!semanas || semanas.length < 4) return null;
  const atual = semanas[0];
  const historico = semanas.slice(1);
  const valores = historico.map(s => Number(s.receita_total)).sort((a, b) => a - b);
  const mediana = valores[Math.floor(valores.length / 2)];

  if (mediana === 0 || Number(atual.receita_total) < mediana * multiplicadorPico) return null;

  return upsertAlerta({
    tipo: 'pico_anormal',
    severidade: 'info',
    titulo: `Pico de receita: ${fmtMoney(atual.receita_total)} na semana ${atual.semana_label}`,
    mensagem: `Mediana das últimas 7 semanas: ${fmtMoney(mediana)}. Semana atual ${(Number(atual.receita_total) / mediana).toFixed(1)}x acima.`,
    dados: { semana_atual: atual, mediana },
    chave_dedup: `pico-${atual.semana_inicio}`,
  });
}





async function gerarForecast({ semanasAdiante = 4 } = {}) {
  const { data: semanas } = await supabase
    .from('vw_fin_receita_semanal')
    .select('*')
    .order('semana_inicio', { ascending: false })
    .limit(13);

  if (!semanas || semanas.length < 4) return null;

  const ordenadas = [...semanas].reverse();
  const ultimas4 = ordenadas.slice(-4).map(s => Number(s.receita_total));
  const media4 = ultimas4.reduce((s, v) => s + v, 0) / ultimas4.length;


  const ultimas12 = ordenadas.length >= 12 ? ordenadas.slice(-12).map(s => Number(s.receita_total)) : [];
  const mediaAnual = ultimas12.length ? ultimas12.reduce((s, v) => s + v, 0) / ultimas12.length : null;





  const serie = ordenadas.map(s => Number(s.receita_total));
  const n = serie.length;
  const xMedia = (n - 1) / 2;
  const yMedia = serie.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let k = 0; k < n; k++) { num += (k - xMedia) * (serie[k] - yMedia); den += (k - xMedia) ** 2; }
  const slope = den ? num / den : 0;
  let g = yMedia > 0 ? slope / yMedia : 0;
  g = Math.max(-0.15, Math.min(0.15, g));

  const previsoes = [];
  const lastDate = new Date(ordenadas[ordenadas.length - 1].semana_fim);

  for (let i = 1; i <= semanasAdiante; i++) {
    const inicio = new Date(lastDate);
    inicio.setDate(inicio.getDate() + 1 + (i - 1) * 7);
    const fim = new Date(inicio);
    fim.setDate(fim.getDate() + 6);


    const estimativa = Math.max(0, media4 * Math.pow(1 + g, i));


    previsoes.push({
      semana_inicio: inicio.toISOString().slice(0, 10),
      semana_fim: fim.toISOString().slice(0, 10),
      estimativa,
      minimo: estimativa * 0.8,
      maximo: estimativa * 1.2,
    });
  }

  return {
    base_media_4_semanas: media4,
    base_media_anual: mediaAnual,
    previsoes,
    historico: ordenadas.map(s => ({
      semana_inicio: s.semana_inicio,
      semana_fim: s.semana_fim,
      receita_total: Number(s.receita_total),
    })),
  };
}




async function rodarAnaliseDiaria() {
  const inicio = Date.now();
  const resultados = {};

  try { resultados.queda = await detectarQuedaReceita(); } catch (e) { resultados.queda_erro = e.message; }
  try { resultados.sumidos = await detectarContribuintesSumidos(); } catch (e) { resultados.sumidos_erro = e.message; }
  try { resultados.atrasadas = await detectarDespesasFixasAtrasadas(); } catch (e) { resultados.atrasadas_erro = e.message; }
  try { resultados.pico = await detectarPicoAnormal(); } catch (e) { resultados.pico_erro = e.message; }

  return { ok: true, duracao_ms: Date.now() - inicio, ...resultados };
}


function fmtMoney(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function monthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

module.exports = {
  detectarQuedaReceita,
  detectarContribuintesSumidos,
  detectarDespesasFixasAtrasadas,
  detectarPicoAnormal,
  gerarForecast,
  rodarAnaliseDiaria,
};

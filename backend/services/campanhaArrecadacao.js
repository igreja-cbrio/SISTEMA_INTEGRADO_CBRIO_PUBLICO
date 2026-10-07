













const { supabase } = require('../utils/supabase');
const { semFalhar } = require('../utils/semFalhar');
const { calcularProgresso, ritmoNecessario, estaNoAr } = require('../utils/campanhaProgresso');
const {
  extrairDigito, fimJanelaCredito, montarExtratoCaixa, CARENCIA_CREDITO_DIAS,
} = require('../utils/digitoCampanha');


function janelaCredito(c) {
  return { fim_credito: fimJanelaCredito(c?.data_fim), carencia_credito_dias: CARENCIA_CREDITO_DIAS };
}


function hojeBrt() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}








async function retrato(campanhaId) {
  const { data, error } = await supabase
    .from('vw_camp_arrecadacao')
    .select('*')
    .eq('campanha_id', campanhaId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const hoje = hojeBrt();
  const progresso = calcularProgresso(data);
  const ritmo = ritmoNecessario({
    total_centavos: progresso.total_centavos,
    meta_centavos: data.meta_centavos,
    hoje,





    data_inicio: data.data_inicio,
    data_fim: data.data_fim,
  });

  return {
    ...data,
    ...progresso,
    ...ritmo,
    no_ar: estaNoAr(data, hoje),


    ...janelaCredito(data),
    hoje,
  };
}


async function listar({ incluirEncerradas = true } = {}) {
  const q = supabase.from('vw_camp_arrecadacao').select('*').order('data_lancamento', { ascending: false });
  if (!incluirEncerradas) q.in('status', ['rascunho', 'ativa', 'pausada']);
  const { data, error } = await q;
  if (error) throw error;

  const hoje = hojeBrt();
  return (data || []).map((c) => ({
    ...c,
    ...calcularProgresso(c),
    ...ritmoNecessario({
      total_centavos: (c.caixa_confirmado_centavos || 0) + (c.caixa_conciliando_centavos || 0)
        + (c.online_pago_centavos || 0),
      meta_centavos: c.meta_centavos,
      hoje,
      data_inicio: c.data_inicio,
      data_fim: c.data_fim,
    }),
    no_ar: estaNoAr(c, hoje),
    ...janelaCredito(c),
  }));
}









async function lancamentos(campanhaId, { limite = Infinity } = {}) {
  const { data: camp, error: e0 } = await supabase
    .from('camp_campanhas')
    .select('id, digito, data_inicio, data_fim')
    .eq('id', campanhaId).is('deleted_at', null).maybeSingle();
  if (e0) throw e0;
  if (!camp) return [];


  const { data: vinculos, error: eV } = await supabase
    .from('camp_vinculos')
    .select('lancamento_bruto_id, transacao_id, incluir')
    .eq('campanha_id', campanhaId);
  if (eV) throw eV;
  const inclT = (vinculos || []).filter((v) => v.incluir === true && v.transacao_id).map((v) => v.transacao_id);
  const inclB = (vinculos || []).filter((v) => v.incluir === true && v.lancamento_bruto_id).map((v) => v.lancamento_bruto_id);



  const fimCredito = fimJanelaCredito(camp.data_fim);





  const COLS_T = 'id, tipo, valor, data_competencia, descricao, membro_id, lancamento_bruto_id, identificador_centavo';
  const transacoes = camp.digito
    ? await lerTudo(() => {
      let q = supabase.from('fin_transacoes').select(COLS_T).eq('tipo', 'receita')
        .order('data_competencia', { ascending: false }).order('id');
      if (camp.data_inicio) q = q.gte('data_competencia', camp.data_inicio);
      if (fimCredito) q = q.lte('data_competencia', fimCredito);
      return q;
    })
    : [];
  const jaLidasT = new Set(transacoes.map((t) => t.id));
  const faltaT = inclT.filter((id) => !jaLidasT.has(id));
  for (let i = 0; i < faltaT.length; i += 200) {
    const { data, error } = await supabase.from('fin_transacoes').select(COLS_T).in('id', faltaT.slice(i, i + 200));
    if (error) throw error;
    transacoes.push(...(data || []));
  }


  const COLS_B = 'id, valor, data_lancamento, memo, nome_contraparte, tipo_trn, membro_id';
  const brutosJanela = camp.digito
    ? await lerTudo(() => {
      let q = supabase.from('fin_lancamentos_brutos').select(COLS_B)
        .or('tipo_trn.eq.CREDIT,valor.gt.0')
        .order('data_lancamento', { ascending: false }).order('id');
      if (camp.data_inicio) q = q.gte('data_lancamento', camp.data_inicio);
      if (fimCredito) q = q.lte('data_lancamento', fimCredito);
      return q;
    })
    : [];


  const brutos = brutosJanela.filter((b) => extrairDigito(b.valor) === camp.digito);
  const jaLidosB = new Set(brutos.map((b) => b.id));
  const faltaB = inclB.filter((id) => !jaLidosB.has(id));
  for (let i = 0; i < faltaB.length; i += 200) {
    const { data, error } = await supabase.from('fin_lancamentos_brutos').select(COLS_B).in('id', faltaB.slice(i, i + 200));
    if (error) throw error;
    brutos.push(...(data || []));
  }
  const brutosComTransacao = new Set();
  const idsB = brutos.map((b) => b.id);
  for (let i = 0; i < idsB.length; i += 200) {
    const { data, error } = await supabase
      .from('fin_transacoes').select('lancamento_bruto_id').in('lancamento_bruto_id', idsB.slice(i, i + 200));
    if (error) throw error;
    for (const t of data || []) brutosComTransacao.add(t.lancamento_bruto_id);
  }

  const { confirmadas: ts, conciliando: bs } = montarExtratoCaixa({
    camp, transacoes, brutos, brutosComTransacao, vinculos: vinculos || [],
  });

  const confirmadas = ts.map((t) => ({
    origem: 'caixa', situacao: 'confirmado',
    transacao_id: t.id, lancamento_bruto_id: t.lancamento_bruto_id,
    valor_centavos: Math.round(Math.abs(Number(t.valor)) * 100),
    data: t.data_competencia, descricao: t.descricao, membro_id: t.membro_id,
  }));
  const conciliando = bs.map((b) => ({
    origem: 'caixa', situacao: 'em_conciliacao',
    lancamento_bruto_id: b.id, transacao_id: null,
    valor_centavos: Math.round(Math.abs(Number(b.valor)) * 100),
    data: b.data_lancamento,
    descricao: b.memo || b.nome_contraparte || 'Crédito sem descrição',
    membro_id: b.membro_id,
  }));


  const online = await lerTudo(() => supabase
    .from('pag_cobrancas')
    .select('id, valor_centavos, valor_pago_centavos, pago_em, metodo, membro_id, pagador_nome, metadata')
    .eq('origem_tipo', 'generosidade')
    .eq('status', 'pago')
    .is('deleted_at', null)
    .eq('metadata->>campanha_id', String(campanhaId))
    .order('pago_em', { ascending: false }).order('id'));

  const onlineDaCampanha = online
    .filter((p) => String(p.metadata?.campanha_id || '') === String(campanhaId))
    .map((p) => ({
      origem: 'online', situacao: 'confirmado',
      cobranca_id: p.id, transacao_id: null, lancamento_bruto_id: null,
      valor_centavos: p.valor_pago_centavos || p.valor_centavos,
      data: p.pago_em ? p.pago_em.slice(0, 10) : null,
      descricao: `Doação online${p.metodo ? ` via ${p.metodo}` : ''}`,
      membro_id: p.membro_id,
    }));

  const todas = [...confirmadas, ...conciliando, ...onlineDaCampanha]
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  return Number.isFinite(limite) ? todas.slice(0, limite) : todas;
}








async function lerTudo(build, { pagina = 1000 } = {}) {
  const out = [];
  for (;;) {
    const { data, error } = await build().range(out.length, out.length + pagina - 1);
    if (error) throw error;
    const linhas = data || [];
    out.push(...linhas);
    if (linhas.length < pagina) break;
  }
  return out;
}








async function pendentesDeConciliacao(campanhaId) {
  const linhas = await lancamentos(campanhaId);
  return linhas.filter((l) => l.situacao === 'em_conciliacao');
}

module.exports = {
  retrato,
  listar,
  lancamentos,
  pendentesDeConciliacao,
  hojeBrt,
};



















async function trocarDigito({ campanhaId, digitoNovo, motivo, autorId }) {
  const { data: camp, error: e0 } = await supabase.from('camp_campanhas')
    .select('id, nome, digito, data_inicio, data_fim')
    .eq('id', campanhaId).is('deleted_at', null).maybeSingle();
  if (e0) throw e0;
  if (!camp) return { ok: false, motivo: 'campanha_nao_encontrada' };

  const anterior = camp.digito || null;
  if (anterior === digitoNovo) return { ok: true, sem_mudanca: true, fixados: 0 };

  let fixados = 0;


  if (anterior) {

    const linhas = await lancamentos(campanhaId);
    const doCaixa = linhas.filter((l) => l.origem === 'caixa');

    const paraFixar = doCaixa.map((l) => ({
      campanha_id: campanhaId,
      lancamento_bruto_id: l.lancamento_bruto_id || null,
      transacao_id: l.transacao_id || null,
      incluir: true,
      motivo: `Dígito da campanha mudou de ${anterior} para ${digitoNovo}` +
        `${motivo ? ` · ${String(motivo).slice(0, 200)}` : ''}`,
      created_by: autorId || null,
    }));



    const brutos = paraFixar.filter((v) => v.lancamento_bruto_id && !v.transacao_id);
    const trans = paraFixar.filter((v) => v.transacao_id);

    for (const [lote, conflito] of [[brutos, 'campanha_id,lancamento_bruto_id'],
      [trans, 'campanha_id,transacao_id']]) {
      for (let i = 0; i < lote.length; i += 200) {
        const fatia = lote.slice(i, i + 200);
        if (!fatia.length) break;
        const { error } = await supabase.from('camp_vinculos')
          .upsert(fatia, { onConflict: conflito, ignoreDuplicates: true });
        if (error && error.code !== '23505') throw error;
        fixados += fatia.length;
      }
    }
  }

  const { error: eUp } = await supabase.from('camp_campanhas')
    .update({ digito: digitoNovo, updated_at: new Date().toISOString() })
    .eq('id', campanhaId).is('deleted_at', null);
  if (eUp) throw eUp;



  await semFalhar(supabase.from('camp_digito_historico').insert({
    campanha_id: campanhaId,
    digito_anterior: anterior,
    digito_novo: digitoNovo,
    lancamentos_fixados: fixados,
    motivo: motivo ? String(motivo).slice(0, 500) : null,
    created_by: autorId || null,
  }), '[campanhaArrecadacao] trilha do dígito:');

  return { ok: true, anterior, novo: digitoNovo, fixados };
}

module.exports.trocarDigito = trocarDigito;

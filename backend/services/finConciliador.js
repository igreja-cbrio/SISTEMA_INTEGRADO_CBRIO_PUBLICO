











const { supabase } = require('../utils/supabase');


const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();



function contraparteCasa(conta, bruto) {
  const alvo = norm(`${bruto.memo || ''} ${bruto.nome_contraparte || ''}`);
  if (!alvo) return false;
  const tokens = norm(`${conta.fornecedor || ''} ${conta.descricao || ''}`)
    .split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  return tokens.some((t) => alvo.includes(t));
}


async function fetchAll(builderFn) {
  const out = []; let from = 0; const page = 1000;
  while (true) {
    const { data, error } = await builderFn().range(from, from + page - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < page) break;
    from += page;
  }
  return out;
}


async function sugerirMatches({ janelaAntes = 5, janelaDepois = 10 } = {}) {
  const contas = await fetchAll(() => supabase.from('fin_contas_pagar')
    .select('id, descricao, fornecedor, valor, data_vencimento, plano_contas_id, centro_custo_id, conta_id, forma_pagamento, eh_salario, funcionario_id')
    .eq('status', 'pendente').is('deleted_at', null)
    .order('data_vencimento'));

  const brutos = await fetchAll(() => supabase.from('fin_lancamentos_brutos')
    .select('id, conta_id, valor, tipo_trn, data_lancamento, memo, nome_contraparte')
    .eq('ja_classificado', false)
    .order('data_lancamento'));
  const debitos = brutos.filter((b) => b.tipo_trn === 'DEBIT' || Number(b.valor) < 0);

  const DIA = 86400000;
  const pares = [];
  const brutoJaSugerido = new Set();

  for (const conta of contas) {
    const v = Math.abs(Number(conta.valor) || 0);
    if (!v || !conta.data_vencimento) continue;
    const venc = new Date(`${conta.data_vencimento}T12:00:00`).getTime();

    const candidatos = debitos.filter((b) => {
      if (Math.abs(Math.abs(Number(b.valor)) - v) > 0.01) return false;
      const d = new Date(`${b.data_lancamento}T12:00:00`).getTime();
      return d >= venc - janelaAntes * DIA && d <= venc + janelaDepois * DIA;
    });
    if (!candidatos.length) continue;

    if (candidatos.length === 1) {
      const b = candidatos[0];
      const casa = contraparteCasa(conta, b);
      const repetido = brutoJaSugerido.has(b.id);
      pares.push({
        conta, bruto: b,
        score: repetido ? 60 : (casa ? 100 : 85),
        motivo: repetido
          ? 'Valor e data batem, mas o mesmo débito serve pra outra conta — confira'
          : casa
            ? 'Valor exato, débito único e o fornecedor aparece no extrato'
            : 'Valor exato e débito único na janela do vencimento',
      });
      brutoJaSugerido.add(b.id);
    } else {

      const maisProximo = candidatos.slice().sort((a, bb) =>
        Math.abs(new Date(`${a.data_lancamento}T12:00:00`) - venc) - Math.abs(new Date(`${bb.data_lancamento}T12:00:00`) - venc))[0];
      pares.push({
        conta, bruto: maisProximo, score: 60,
        motivo: `Valor exato, mas ${candidatos.length} débitos possíveis na janela — escolha manual`,
        candidatos_total: candidatos.length,
      });
    }
  }

  pares.sort((a, b) => b.score - a.score);
  return {
    pares,
    resumo: {
      contas_pendentes: contas.length,
      debitos_soltos: debitos.length,
      seguras: pares.filter((p) => p.score >= 85).length,
    },
  };
}


async function aplicarMatch({ contaId, brutoId, userId = null, score = null, origem = 'conciliacao_lote' }) {

  const { data: conta } = await supabase.from('fin_contas_pagar')
    .select('*').eq('id', contaId).eq('status', 'pendente').is('deleted_at', null).maybeSingle();
  if (!conta) return { erro: 'Conta não está mais pendente' };
  const { data: bruto } = await supabase.from('fin_lancamentos_brutos')
    .select('*').eq('id', brutoId).eq('ja_classificado', false).maybeSingle();
  if (!bruto) return { erro: 'Débito do extrato já foi classificado' };
  if (Math.abs(Math.abs(Number(bruto.valor)) - Math.abs(Number(conta.valor))) > 0.01) {
    return { erro: 'Valores não batem mais' };
  }

  const { data: transacao, error } = await supabase.from('fin_transacoes')
    .insert({
      conta_id: bruto.conta_id || conta.conta_id,
      tipo: 'despesa',
      descricao: conta.descricao || bruto.memo || 'Conta a pagar',
      valor: Math.abs(Number(conta.valor)),
      data_competencia: conta.data_vencimento,
      data_pagamento: bruto.data_lancamento,
      status: 'conciliado',
      referencia: bruto.fitid || bruto.end_to_end_id || null,
      plano_contas_id: conta.plano_contas_id || null,
      centro_custo_id: conta.centro_custo_id || null,
      forma_pagamento: conta.forma_pagamento || null,
      lancamento_bruto_id: bruto.id,
      classificacao_origem: origem,
      classificacao_confianca: 1.0,
      created_by: userId,
    })
    .select('id, descricao, valor, data_pagamento').single();
  if (error) return { erro: error.message };


  try {
    await supabase.from('fin_lancamentos_brutos').update({ ja_classificado: true }).eq('id', bruto.id);
    await supabase.from('fin_fila_classificacao')
      .update({ status: 'ignorado', decidido_em: new Date().toISOString(), decidido_por: userId })
      .eq('lancamento_bruto_id', bruto.id).eq('status', 'pendente');
  } catch (e) { console.error('[FIN-CONC] marcar bruto:', e.message); }

  const { error: errBaixa } = await supabase.from('fin_contas_pagar')
    .update({
      status: 'pago',
      data_pagamento: bruto.data_lancamento,
      fin_transacao_id: transacao.id,
      vinculo_status: 'confirmada',
      vinculo_score: score,
      vinculo_em: new Date().toISOString(),
      vinculo_por: userId,
    })
    .eq('id', conta.id);
  if (errBaixa) console.error('[FIN-CONC] baixa da conta:', errBaixa.message);

  return { transacao, conta_id: conta.id, bruto_id: bruto.id };
}





async function baixaAutomaticaPorTransacao(transacao, userId = null) {
  try {
    if (!transacao || transacao.tipo !== 'despesa') return null;
    const v = Math.abs(Number(transacao.valor) || 0);
    if (!v) return null;
    const dataRef = transacao.data_pagamento || transacao.data_competencia;
    if (!dataRef) return null;
    const DIA = 86400000;
    const ini = new Date(new Date(`${dataRef}T12:00:00`).getTime() - 10 * DIA).toISOString().slice(0, 10);
    const fim = new Date(new Date(`${dataRef}T12:00:00`).getTime() + 10 * DIA).toISOString().slice(0, 10);

    const { data: candidatas } = await supabase.from('fin_contas_pagar')
      .select('id, valor, data_vencimento')
      .eq('status', 'pendente').is('deleted_at', null)
      .gte('data_vencimento', ini).lte('data_vencimento', fim);
    const exatas = (candidatas || []).filter((c) => Math.abs(Math.abs(Number(c.valor)) - v) <= 0.01);
    if (exatas.length !== 1) return null;

    const conta = exatas[0];
    const { error } = await supabase.from('fin_contas_pagar')
      .update({
        status: 'pago',
        data_pagamento: dataRef,
        fin_transacao_id: transacao.id,
        vinculo_status: 'auto',
        vinculo_em: new Date().toISOString(),
        vinculo_por: userId,
      })
      .eq('id', conta.id).eq('status', 'pendente');
    if (error) { console.error('[FIN-CONC] baixa auto:', error.message); return null; }
    return conta.id;
  } catch (e) {
    console.error('[FIN-CONC] baixa auto:', e.message);
    return null;
  }
}

module.exports = { sugerirMatches, aplicarMatch, baixaAutomaticaPorTransacao };

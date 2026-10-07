














const { supabase } = require('../utils/supabase');
const { nomesPodemSerMesmaPessoa } = require('./duplicidadePolicy');
const { extractNomeContraparte } = require('./ofxParser');
const { nomeNormalizado, normalizarCpf, registrarObservacaoSegura } = require('./identidadeProgressiva');
const { resolverMembroPorDocumento } = require('./financeiroClassificador');

async function mapLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

async function fetchAll(table, cols, applyFilter) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    let q = supabase.from(table).select(cols).range(offset, offset + 999);
    q = applyFilter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const chaveVD = (valor, data) => `${Number(valor).toFixed(2)}|${String(data).slice(0, 10)}`;




async function resolverNomesPorDoc(docs) {
  const map = new Map();
  const unicos = [...new Set(docs.filter((d) => d && (d.length === 11 || d.length === 14)))];
  for (let i = 0; i < unicos.length; i += 150) {
    const lote = unicos.slice(i, i + 150);
    const { data, error } = await supabase.from('mem_membros')
      .select('id, nome, cpf, cnpj')
      .or(`cpf.in.(${lote.join(',')}),cnpj.in.(${lote.join(',')})`)
      .is('deleted_at', null);
    if (error) { console.warn('[conciliacaoOfx] resolverNomes · %s', error.message); continue; }
    for (const m of (data || [])) {
      const doc = String(m.cpf || m.cnpj || '');
      if (!doc) continue;
      const placeholder = /^contribuinte\s/i.test(m.nome || '');
      map.set(doc, { membro_id: m.id, nome: m.nome, placeholder });
    }
  }
  return map;
}



function dedupCandidatos(cands) {
  const porDoc = new Map();
  for (const c of cands) {
    const ex = porDoc.get(c.documento);
    if (!ex || (!ex.hora && c.hora)) porDoc.set(c.documento, c);
  }
  return [...porDoc.values()];
}




async function indexarOfx(inicio, fim) {
  const brutos = await fetchAll(
    'fin_lancamentos_brutos',
    'id, valor, data_lancamento, hora_lancamento, documento_contraparte, memo, tipo_trn',
    (q) => q.eq('tipo_trn', 'CREDIT').not('documento_contraparte', 'is', null)
      .gte('data_lancamento', inicio).lte('data_lancamento', fim),
  );
  const porVD = new Map();
  for (const b of brutos) {
    const cpf = normalizarCpf(b.documento_contraparte);
    const doc = String(b.documento_contraparte).replace(/\D/g, '');
    const ehCnpj = doc.length === 14;
    if (!cpf && !ehCnpj) continue;
    const nome = extractNomeContraparte(b.memo);
    const item = {
      bruto_id: b.id, valor: Number(b.valor), data: String(b.data_lancamento).slice(0, 10),
      hora: b.hora_lancamento || null, documento: doc, cpf, ehCnpj,
      nome_limpo: nome, nome_norm: nome ? nomeNormalizado(nome) : null,
    };
    const k = chaveVD(b.valor, b.data_lancamento);
    if (!porVD.has(k)) porVD.set(k, []);
    porVD.get(k).push(item);
  }
  return porVD;
}



function escolherCandidato(balNomeNorm, cands, disputantes = 1) {
  if (!cands || !cands.length) return null;






  if (cands.length === 1 && disputantes <= 1) return { cand: cands[0], via: 'valor_data' };
  if (balNomeNorm) {


    const porMembro = cands.filter((c) => c.membro_nome_norm && c.membro_nome_norm === balNomeNorm);
    if (porMembro.length === 1) return { cand: porMembro[0], via: 'valor_data_membro' };

    const porNome = cands.filter((c) => c.nome_norm && c.nome_norm === balNomeNorm);
    if (porNome.length === 1) return { cand: porNome[0], via: 'valor_data_nome' };








    const parecidos = candidatosParecidos(balNomeNorm, cands);
    if (parecidos.length === 1) return { cand: parecidos[0], via: 'valor_data_nome_parecido' };
  }
  return null;
}











function candidatosParecidos(balNomeNorm, cands) {
  if (!balNomeNorm) return [];
  return (cands || []).filter((c) => {
    const alvo = c.membro_nome || c.nome_limpo || '';
    return alvo && nomesPodemSerMesmaPessoa(balNomeNorm, alvo);
  });
}












async function conciliar({ inicio, fim, dryRun = false, userId = null, criarAvulso = false } = {}) {
  if (!inicio || !fim) throw new Error('inicio e fim são obrigatórios');

  const porVD = await indexarOfx(inicio, fim);



  const todosDocs = [];
  for (const arr of porVD.values()) for (const it of arr) todosDocs.push(it.documento);
  const nomesPorDoc = await resolverNomesPorDoc(todosDocs);
  for (const arr of porVD.values()) for (const it of arr) {
    const m = nomesPorDoc.get(it.documento);
    if (m && !m.placeholder) {
      it.membro_nome = m.nome;
      it.membro_nome_norm = nomeNormalizado(m.nome);
    }
  }


  const balanco = await fetchAll(
    'fin_transacoes',
    'id, valor, data_competencia, descricao, referencia',
    (q) => q.not('codigo_legado', 'is', null).eq('tipo', 'receita')
      .is('membro_id', null).is('conciliacao_ofx', null)
      .gte('data_competencia', inicio).lte('data_competencia', fim)
      .or('forma_pagamento.ilike.%pix%,forma_pagamento.is.null'),
  );



  const disputaPorVD = new Map();
  for (const b of balanco) {
    const k = chaveVD(b.valor, b.data_competencia);
    disputaPorVD.set(k, (disputaPorVD.get(k) || 0) + 1);
  }

  const stats = { balanco_analisado: balanco.length, ofx_creditos: [...porVD.values()].reduce((s, a) => s + a.length, 0), auto: 0, revisao: 0, sem_match: 0, avulsos_criados: 0, casou_cpf_sem_cadastro: 0 };
  const paraVincular = [];
  const revisao = [];

  for (const b of balanco) {
    const nomeNorm = nomeNormalizado(b.descricao || b.referencia || '');
    const chave = chaveVD(b.valor, b.data_competencia);
    const cands = dedupCandidatos(porVD.get(chave) || []);
    const escolha = escolherCandidato(nomeNorm, cands, disputaPorVD.get(chave) || 1);
    if (escolha) {
      paraVincular.push({ transacao_id: b.id, cand: escolha.cand, via: escolha.via });
    } else if (cands.length >= 1) {





      const parecidos = candidatosParecidos(nomeNorm, cands);
      if (!parecidos.length) {
        stats.sem_match++;
        stats.sem_match_nome_nao_bate = (stats.sem_match_nome_nao_bate || 0) + 1;
        continue;
      }
      stats.revisao++;
      if (revisao.length < 500) revisao.push({
        transacao_id: b.id, nome: b.descricao || b.referencia, valor: Number(b.valor), data: String(b.data_competencia).slice(0, 10),


        candidatos: [...parecidos, ...cands.filter((c) => !parecidos.includes(c))].map((c) => ({
          bruto_id: c.bruto_id, cpf: c.cpf,
          nome: c.membro_nome || c.nome_limpo || null,
          ja_membro: !!c.membro_nome, hora: c.hora,
          nome_parecido: parecidos.includes(c),
        })),
      });
    } else {
      stats.sem_match++;
    }
  }
  stats.auto = paraVincular.length;

  if (dryRun) return { stats, revisao };


  const cpfsUnicos = [...new Set(paraVincular.map((p) => p.cand.documento))];
  const membroPorDoc = new Map();
  await mapLimit(cpfsUnicos, 8, async (doc) => {
    const cand = paraVincular.find((p) => p.cand.documento === doc)?.cand;
    try {
      const r = await resolverMembroPorDocumento(doc, cand?.nome_limpo || null, { criarSemNome: false, criar: criarAvulso });
      if (r?.membro_id) {
        membroPorDoc.set(doc, r.membro_id);
        if (r.criado_novo) stats.avulsos_criados++;
      }
      if (cand?.cpf) await registrarObservacaoSegura({ origem: 'financeiro_ofx', origemId: cand.cpf, cpf: cand.cpf, nome: cand.nome_limpo || null });
    } catch (e) {
      console.warn('[conciliacaoOfx] resolver doc falhou · %s', e.message);
    }
  });













  let vinculados = 0;
  await mapLimit(paraVincular, 8, async (p) => {
    const membro_id = membroPorDoc.get(p.cand.documento);
    const marca = { bruto_id: p.cand.bruto_id, cpf: p.cand.cpf, via: p.via, em: new Date().toISOString() };
    if (!membro_id) {
      const { error } = await supabase.from('fin_transacoes').update({
        hora_real: p.cand.hora || undefined,
        conciliacao_ofx: { ...marca, status: 'sem_cadastro' },
      }).eq('id', p.transacao_id).is('membro_id', null).is('conciliacao_ofx', null);
      if (!error) stats.casou_cpf_sem_cadastro++;
      return;
    }
    const { error } = await supabase.from('fin_transacoes').update({
      membro_id,
      hora_real: p.cand.hora || undefined,
      conciliacao_ofx: { ...marca, status: 'auto' },
    }).eq('id', p.transacao_id).is('membro_id', null);
    if (!error) vinculados++;
  });
  stats.vinculados = vinculados;

  return { stats, revisao };
}


async function listarRevisao({ inicio, fim } = {}) {
  const { revisao } = await conciliar({ inicio, fim, dryRun: true });
  return revisao;
}


async function confirmarVinculo({ transacaoId, brutoId, userId = null }) {
  const { data: bruto } = await supabase.from('fin_lancamentos_brutos')
    .select('documento_contraparte, hora_lancamento, memo').eq('id', brutoId).maybeSingle();
  if (!bruto) throw new Error('Lançamento OFX não encontrado');
  const cpf = normalizarCpf(bruto.documento_contraparte);
  const doc = String(bruto.documento_contraparte || '').replace(/\D/g, '');
  const nome = extractNomeContraparte(bruto.memo);




  const r = await resolverMembroPorDocumento(doc, nome);
  if (!r?.membro_id) {
    throw new Error(
      nome
        ? 'Não consegui resolver o membro do CPF'
        : 'O extrato não traz o nome do pagador. Cadastre a pessoa na Membresia com este CPF e confirme o vínculo depois — não vou criar cadastro sem nome.',
    );
  }
  if (cpf) await registrarObservacaoSegura({ origem: 'financeiro_ofx', origemId: cpf, cpf, nome });
  const { error } = await supabase.from('fin_transacoes').update({
    membro_id: r.membro_id,
    hora_real: bruto.hora_lancamento || undefined,
    conciliacao_ofx: { status: 'confirmado', bruto_id: brutoId, cpf, via: 'manual', por: userId, em: new Date().toISOString() },
  }).eq('id', transacaoId);
  if (error) throw new Error(error.message);
  return { ok: true, membro_id: r.membro_id, avulso: !!r.criado_novo };
}













async function listarIdentificados({ inicio, fim, limite = 500 } = {}) {
  if (!inicio || !fim) throw new Error('inicio e fim são obrigatórios');

  const linhas = await fetchAll(
    'fin_transacoes',
    'id, valor, data_competencia, descricao, referencia, membro_id, conciliacao_ofx',
    (q) => q.not('membro_id', 'is', null).not('conciliacao_ofx', 'is', null)
      .gte('data_competencia', inicio).lte('data_competencia', fim),
  );
  if (!linhas.length) return { total: 0, divergentes: 0, itens: [] };


  const ids = [...new Set(linhas.map((l) => l.membro_id))];
  const nomePorId = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('mem_membros')
      .select('id, nome, status').in('id', ids.slice(i, i + 200));
    for (const m of data || []) nomePorId.set(m.id, m);
  }

  const primeiro = (n) => nomeNormalizado(n || '').split(' ')[0] || '';
  const itens = linhas.map((l) => {
    const m = nomePorId.get(l.membro_id) || {};
    const nomeBal = l.descricao || l.referencia || '';
    const diverge = !!(nomeBal && m.nome && primeiro(nomeBal) !== primeiro(m.nome));
    return {
      transacao_id: l.id,
      valor: Number(l.valor),
      data: String(l.data_competencia).slice(0, 10),
      nome_balanco: nomeBal,
      membro_id: l.membro_id,
      membro_nome: m.nome || null,
      membro_status: m.status || null,
      cpf: l.conciliacao_ofx?.cpf || null,
      via: l.conciliacao_ofx?.via || null,
      nome_diverge: diverge,
    };
  });


  itens.sort((a, b) => (Number(b.nome_diverge) - Number(a.nome_diverge)) || (b.valor - a.valor));

  return {
    total: itens.length,
    divergentes: itens.filter((i) => i.nome_diverge).length,
    pessoas: new Set(itens.map((i) => i.membro_id)).size,
    valor_total: Number(itens.reduce((a, i) => a + i.valor, 0).toFixed(2)),
    truncado: itens.length > limite,
    itens: itens.slice(0, limite),
  };
}








async function desfazerVinculo({ transacaoId }) {
  const { error } = await supabase.from('fin_transacoes')
    .update({ membro_id: null, conciliacao_ofx: null })
    .eq('id', transacaoId).not('conciliacao_ofx', 'is', null);
  if (error) throw new Error(error.message);
  return { ok: true };
}


async function ignorarVinculo({ transacaoId, userId = null }) {
  const { error } = await supabase.from('fin_transacoes').update({
    conciliacao_ofx: { status: 'ignorado', por: userId, em: new Date().toISOString() },
  }).eq('id', transacaoId).is('membro_id', null);
  if (error) throw new Error(error.message);
  return { ok: true };
}

module.exports = { conciliar, listarRevisao, confirmarVinculo, ignorarVinculo, listarIdentificados, desfazerVinculo };

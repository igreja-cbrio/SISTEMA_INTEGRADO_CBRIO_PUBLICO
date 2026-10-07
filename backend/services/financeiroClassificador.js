










const { supabase } = require('../utils/supabase');
const { acharOuCriarGuardado } = require('./membroMatch');




function extractCentavo(valor) {
  if (valor === null || valor === undefined) return null;
  const abs = Math.abs(Number(valor));
  const cent = Math.round((abs % 1) * 100);
  return String(cent).padStart(2, '0');
}




function normalize(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim();
}





async function classificarLancamento(lancamento) {
  const {
    valor, tipo_trn, memo, documento_contraparte, nome_contraparte, banco_origem,
  } = lancamento;

  const ehCredito = tipo_trn === 'CREDIT' || valor > 0;
  const aplicaA = ehCredito ? 'credito' : 'debito';




  if (ehCredito) {
    const centavo = extractCentavo(valor);
    if (centavo && centavo !== '00') {
      const { data: ident } = await supabase
        .from('fin_identificadores_centavo')
        .select('id, centavo, plano_contas_id, centro_custo_id, descricao')
        .eq('centavo', centavo)
        .eq('ativo', true)
        .maybeSingle();

      if (ident) {



        return {
          plano_contas_id: ident.plano_contas_id || null,
          centro_custo_id: ident.centro_custo_id,
          identificador_centavo: centavo,
          origem: 'centavo',
          confianca: ident.plano_contas_id ? 1.0 : 0.5,
          explicacao: ident.plano_contas_id
            ? `Centavo ${centavo} -> ${ident.descricao}`
            : `Centavo ${centavo} -> ${ident.descricao} (escolher conta)`,
        };
      }
    }
  }





  let memChave = null;
  let memTipo = null;
  if (documento_contraparte) {
    memChave = documento_contraparte;
    memTipo = 'documento';
  } else if (nome_contraparte) {
    memChave = normalize(nome_contraparte);
    memTipo = 'nome';
  }

  if (memChave) {
    const { data: mem } = await supabase
      .from('fin_memoria_classificacao')
      .select('plano_contas_id, centro_custo_id, ocorrencias')
      .eq('chave_contraparte', memChave)
      .eq('tipo_chave', memTipo)
      .order('ocorrencias', { ascending: false })
      .limit(1);

    if (mem && mem.length > 0 && mem[0].ocorrencias >= 2) {
      return {
        plano_contas_id: mem[0].plano_contas_id,
        centro_custo_id: mem[0].centro_custo_id,
        origem: 'memoria',
        confianca: Math.min(0.95, 0.5 + mem[0].ocorrencias * 0.1),
        explicacao: `Aprendido de ${mem[0].ocorrencias} classificacoes anteriores`,
      };
    }
  }




  const { data: regras } = await supabase
    .from('fin_regras_classificacao')
    .select('id, nome, tipo_regra, pattern, case_insensitive, plano_contas_id, centro_custo_id, prioridade')
    .eq('ativo', true)
    .in('aplica_a', [aplicaA, 'ambos'])
    .order('prioridade', { ascending: true });

  for (const regra of regras || []) {
    let matched = false;
    if (regra.tipo_regra === 'regex_memo') {
      try {
        const flags = regra.case_insensitive ? 'i' : '';
        const re = new RegExp(regra.pattern, flags);
        matched = re.test(memo || '');
      } catch (_) { matched = false; }
    } else if (regra.tipo_regra === 'palavra_chave') {
      const h = regra.case_insensitive ? normalize(memo || '') : memo || '';
      const p = regra.case_insensitive ? normalize(regra.pattern) : regra.pattern;
      matched = h.includes(p);
    } else if (regra.tipo_regra === 'cnpj_contraparte') {
      matched = (documento_contraparte || '') === regra.pattern.replace(/\D/g, '');
    } else if (regra.tipo_regra === 'titularidade_pix') {
      matched = (banco_origem || '').toLowerCase().includes(regra.pattern.toLowerCase());
    }

    if (matched) {
      return {
        plano_contas_id: regra.plano_contas_id,
        centro_custo_id: regra.centro_custo_id,
        origem: 'regra',
        confianca: 0.9,
        explicacao: `Regra: ${regra.nome}`,
      };
    }
  }


  return null;
}




async function aprenderClassificacao({ documento, nome, plano_contas_id, centro_custo_id }) {
  if (!plano_contas_id) return;

  const chaves = [];
  if (documento) chaves.push({ chave: documento, tipo: 'documento' });
  if (nome) chaves.push({ chave: normalize(nome), tipo: 'nome' });

  for (const { chave, tipo } of chaves) {

    const { data: existing } = await supabase
      .from('fin_memoria_classificacao')
      .select('id, ocorrencias')
      .eq('chave_contraparte', chave)
      .eq('tipo_chave', tipo)
      .eq('plano_contas_id', plano_contas_id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('fin_memoria_classificacao')
        .update({
          ocorrencias: existing.ocorrencias + 1,
          ultimo_uso: new Date().toISOString(),
          centro_custo_id,
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('fin_memoria_classificacao')
        .insert({
          chave_contraparte: chave,
          tipo_chave: tipo,
          plano_contas_id,
          centro_custo_id,
          ocorrencias: 1,
        });
    }
  }
}















async function resolverMembroPorDocumento(documento, nome, { criarSemNome = false, criar = true } = {}) {
  if (!documento) return null;
  const cleanDoc = documento.replace(/\D/g, '');
  if (cleanDoc.length !== 11 && cleanDoc.length !== 14) return null;






  const { data: existente } = await supabase
    .from('mem_membros')
    .select('id, nome, status')
    .or(`cpf.eq.${cleanDoc},cnpj.eq.${cleanDoc}`)
    .is('deleted_at', null)
    .maybeSingle();

  if (existente) {
    return { membro_id: existente.id, criado_novo: false };
  }







  if (!criar) return null;




  const nomeReal = String(nome || '').trim();
  if (!criarSemNome && !nomeReal) return null;

  if (cleanDoc.length === 11) {
    const resultado = await acharOuCriarGuardado({
      cpf: cleanDoc, nome: nomeReal || `Contribuinte ${cleanDoc.substring(0, 6)}...`,
      status: 'contribuinte_avulso', origem: 'financeiro_documento',
    });
    return { membro_id: resultado.membro_id, criado_novo: !!resultado.created };
  }


  const insertPayload = {
    nome: nome || `Contribuinte ${cleanDoc.substring(0, 6)}...`,
    status: 'contribuinte_avulso',
  };
  if (cleanDoc.length === 11) insertPayload.cpf = cleanDoc;
  else insertPayload.cnpj = cleanDoc;

  const { data: novo, error } = await supabase
    .from('mem_membros')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error || !novo) return null;
  return { membro_id: novo.id, criado_novo: true };
}








async function matchOfxPix({ uploadId, conta_id } = {}) {

  const queryLanc = supabase
    .from('fin_lancamentos_brutos')
    .select('id, data_lancamento, valor, tipo_trn, documento_contraparte, memo')
    .is('hora_lancamento', null);

  if (uploadId) queryLanc.eq('upload_id', uploadId);
  if (conta_id) queryLanc.eq('conta_id', conta_id);

  const { data: lancamentos } = await queryLanc;
  if (!lancamentos || lancamentos.length === 0) return { matched: 0, ambiguous: 0 };

  let matched = 0;
  let ambiguous = 0;

  for (const lanc of lancamentos) {

    if (lanc.tipo_trn !== 'CREDIT' || lanc.valor <= 0) continue;


    const { data: candidatos } = await supabase
      .from('fin_pix_detalhe')
      .select('id, end_to_end_id, datetime_brt, hora, valor, pagador_documento, pagador_nome, culto_slot_id')
      .eq('data', lanc.data_lancamento)
      .eq('valor', Math.abs(lanc.valor))
      .is('lancamento_bruto_id', null);

    if (!candidatos || candidatos.length === 0) continue;

    let escolhido = null;
    if (candidatos.length === 1) {
      escolhido = candidatos[0];
    } else {

      if (lanc.documento_contraparte) {
        const porDoc = candidatos.find(c => c.pagador_documento === lanc.documento_contraparte);
        if (porDoc) escolhido = porDoc;
      }

      if (!escolhido && lanc.memo) {
        const memoNorm = normalize(lanc.memo);
        const porNome = candidatos.find(c => c.pagador_nome && memoNorm.includes(normalize(c.pagador_nome)));
        if (porNome) escolhido = porNome;
      }
      if (!escolhido) {
        ambiguous++;
        continue;
      }
    }


    const score = candidatos.length === 1 ? 1.0 : 0.85;
    await Promise.all([
      supabase
        .from('fin_lancamentos_brutos')
        .update({
          hora_lancamento: escolhido.hora,
          hora_origem: 'pix_match',
          end_to_end_id: escolhido.end_to_end_id,
        })
        .eq('id', lanc.id),
      supabase
        .from('fin_pix_detalhe')
        .update({
          lancamento_bruto_id: lanc.id,
          match_score: score,
          match_status: 'matched',
        })
        .eq('id', escolhido.id),
    ]);
    matched++;
  }

  return { matched, ambiguous, total: lancamentos.length };
}





async function classificarBatch({ uploadId } = {}) {
  const q = supabase
    .from('fin_lancamentos_brutos')
    .select('*')
    .eq('ja_classificado', false)
    .limit(500);
  if (uploadId) q.eq('upload_id', uploadId);

  const { data: lancamentos } = await q;
  if (!lancamentos || lancamentos.length === 0) return { processados: 0, sugeridos: 0 };

  let sugeridos = 0;

  for (const lanc of lancamentos) {
    const sugestao = await classificarLancamento(lanc);
    if (!sugestao) continue;


    let membro_id = null;
    if (lanc.documento_contraparte) {
      const res = await resolverMembroPorDocumento(lanc.documento_contraparte, lanc.nome_contraparte, { criarSemNome: false });
      if (res) membro_id = res.membro_id;
    }


    await supabase
      .from('fin_fila_classificacao')
      .upsert({
        lancamento_bruto_id: lanc.id,
        sugestao_plano_contas_id: sugestao.plano_contas_id,
        sugestao_centro_custo_id: sugestao.centro_custo_id,
        sugestao_membro_id: membro_id,
        sugestao_origem: sugestao.origem,
        sugestao_confianca: sugestao.confianca,
        sugestao_explicacao: sugestao.explicacao,
        status: 'pendente',
      }, { onConflict: 'lancamento_bruto_id' });

    sugeridos++;
  }

  return { processados: lancamentos.length, sugeridos };
}





async function sugerirLoteIA({ maxItens = 40 } = {}) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic();
  const MODEL = 'claude-haiku-4-5-20251001';


  const { data: fila } = await supabase
    .from('fin_fila_classificacao')
    .select('id, lancamento_bruto_id, lancamento:lancamento_bruto_id(id, valor, tipo_trn, memo, nome_contraparte, documento_contraparte, data_lancamento)')
    .eq('status', 'pendente')
    .is('sugestao_plano_contas_id', null)
    .limit(maxItens);
  if (!fila || !fila.length) return { processados: 0, com_sugestao: 0, restantes: 0 };


  const { data: planos } = await supabase.from('fin_plano_contas')
    .select('id, codigo, nome, tipo').eq('aceita_lancamento', true).eq('ativo', true).order('codigo');
  const { data: centros } = await supabase.from('fin_centros_custo')
    .select('id, codigo, nome').eq('aceita_lancamento', true).eq('ativo', true).order('codigo');

  const catalogoPlanos = (planos || []).map((p) => `${p.id} | ${p.codigo} ${p.nome} (${p.tipo})`).join('\n');
  const catalogoCentros = (centros || []).map((c) => `${c.id} | ${c.codigo} ${c.nome}`).join('\n');

  let comSugestao = 0;
  const LOTE = 20;
  for (let i = 0; i < fila.length; i += LOTE) {
    const chunk = fila.slice(i, i + LOTE).filter((f) => f.lancamento);
    if (!chunk.length) continue;
    const linhas = chunk.map((f) => {
      const l = f.lancamento;
      const sinal = (l.tipo_trn === 'CREDIT' || Number(l.valor) > 0) ? 'ENTRADA' : 'SAÍDA';
      return `${f.id} | ${sinal} | R$ ${Math.abs(Number(l.valor)).toFixed(2)} | ${l.data_lancamento} | ${l.memo || ''} | ${l.nome_contraparte || ''}`;
    }).join('\n');

    try {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Você classifica lançamentos bancários de uma igreja (CBRio) no plano de contas.

PLANO DE CONTAS (id | código nome (tipo)):
${catalogoPlanos}

CENTROS DE CUSTO (id | código nome):
${catalogoCentros}

LANÇAMENTOS (fila_id | sentido | valor | data | memo | contraparte):
${linhas}

Pra cada lançamento escolha o plano de contas mais provável (ENTRADA→tipo receita, SAÍDA→tipo despesa) e, se evidente, o centro de custo. Se não der pra inferir com razoável confiança, omita o item.
Responda SÓ um JSON array: [{"fila_id":"...","plano_contas_id":"...","centro_custo_id":"..."|null,"confianca":0.0-1.0,"motivo":"curto"}]`,
        }],
      });
      const texto = resp.content?.[0]?.text || '[]';
      const json = JSON.parse(texto.slice(texto.indexOf('['), texto.lastIndexOf(']') + 1));
      const validPlano = new Set((planos || []).map((p) => p.id));
      const validCentro = new Set((centros || []).map((c) => c.id));
      for (const s of json) {
        if (!s?.fila_id || !validPlano.has(s.plano_contas_id)) continue;
        const { error } = await supabase.from('fin_fila_classificacao')
          .update({
            sugestao_plano_contas_id: s.plano_contas_id,
            sugestao_centro_custo_id: validCentro.has(s.centro_custo_id) ? s.centro_custo_id : null,
            sugestao_origem: 'ia',
            sugestao_confianca: Math.max(0, Math.min(1, Number(s.confianca) || 0.6)),
            sugestao_explicacao: `IA: ${String(s.motivo || 'classificação por contexto').slice(0, 160)}`,
          })
          .eq('id', s.fila_id).eq('status', 'pendente');
        if (!error) comSugestao++;
      }
    } catch (e) {
      console.error('[FIN-CLASS] IA lote:', e.message);
    }
  }

  const { count } = await supabase.from('fin_fila_classificacao')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pendente').is('sugestao_plano_contas_id', null);

  return { processados: fila.length, com_sugestao: comSugestao, restantes: count || 0 };
}

module.exports = {
  classificarLancamento,
  aprenderClassificacao,
  resolverMembroPorDocumento,
  matchOfxPix,
  classificarBatch,
  sugerirLoteIA,
  extractCentavo,
};

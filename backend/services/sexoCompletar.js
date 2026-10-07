
























const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../utils/supabase');




const { registrarObservacaoSegura, nomeNormalizado } = require('./identidadeProgressiva');
const {
  normalizarSexo,
  consolidarDeclaracoes,
  primeiroNomeParaPalpite,
  palpitesUsaveis,
  casarPalpites,
} = require('../utils/sexoDeclarado');

const LOTE_IN = 200;
const PAGINA = 1000;
const TETO_PALPITE = 150;

function clienteAnthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  return new Anthropic();
}


async function lerPaginado(tabela, colunas, aplicarFiltros) {
  let todas = [];
  let offset = 0;
  for (;;) {
    let q = supabase.from(tabela).select(colunas).range(offset, offset + PAGINA - 1);
    if (aplicarFiltros) q = aplicarFiltros(q);
    const { data, error } = await q;
    if (error) throw error;
    todas = todas.concat(data || []);
    if (!data || data.length < PAGINA) break;
    offset += PAGINA;
  }
  return todas;
}








async function pessoasSemSexo({ apenasIds = null } = {}) {




  const linhas = await lerPaginado(
    'mem_membros',
    'id, nome',
    q => q.is('deleted_at', null).is('genero', null).order('id'),
  );
  const filtradas = apenasIds ? linhas.filter(m => apenasIds.has(m.id)) : linhas;
  return filtradas.filter(m => m.nome);
}













async function colherDeclaracoes({ aplicar = false, apenasIds = null } = {}) {
  const alvo = await pessoasSemSexo({ apenasIds });
  const ids = alvo.map(p => p.id);
  const porPessoa = new Map(ids.map(id => [id, []]));








  const FONTES = [
    { fonte: 'voluntariado', tabela: 'vol_inscricoes',     soft: true },
    { fonte: 'next',         tabela: 'next_matriculas',    soft: false },
    { fonte: 'batismo',      tabela: 'batismo_inscricoes', soft: true },
  ];

  const avisos = [];
  for (const f of FONTES) {
    const coluna = f.coluna || 'sexo';
    const chave = f.chave || 'membro_id';
    try {
      for (let i = 0; i < ids.length; i += LOTE_IN) {
        const bloco = ids.slice(i, i + LOTE_IN);
        let q = supabase.from(f.tabela).select(`${chave}, ${coluna}`).in(chave, bloco).not(coluna, 'is', null);
        if (f.soft) q = q.is('deleted_at', null);
        const { data, error } = await q;
        if (error) throw error;
        for (const linha of data || []) {
          const alvoId = linha[chave];
          if (porPessoa.has(alvoId)) porPessoa.get(alvoId).push({ fonte: f.fonte, sexo: linha[coluna] });
        }
      }
    } catch (e) {
      avisos.push(`${f.fonte}: ${e.message}`);
      console.error(`[sexoCompletar] fonte ${f.fonte} falhou:`, e.message);
    }
  }

  const aplicaveis = [];
  const conflitos = [];
  for (const p of alvo) {
    const r = consolidarDeclaracoes(porPessoa.get(p.id) || []);
    if (r.conflito) { conflitos.push({ membro_id: p.id, nome: p.nome, fontes: r.fontes }); continue; }
    if (r.sexo) aplicaveis.push({ membro_id: p.id, nome: p.nome, sexo: r.sexo, fontes: r.fontes });
  }

  let gravados = 0;
  if (aplicar) {
    for (const a of aplicaveis) {



      const { data, error } = await supabase
        .from('mem_membros')
        .update({ genero: a.sexo })
        .eq('id', a.membro_id)
        .is('deleted_at', null)
        .is('genero', null)
        .select('id');
      if (error) { console.error('[sexoCompletar] gravar declaração:', error.message); continue; }
      if (data && data.length) {
        gravados += 1;
        await registrarObservacaoSegura({
          membroId: a.membro_id,
          origem: 'sexo_colhido_porta',
          origemId: a.fontes.join(','),
          nome: a.nome,
          dados: { genero: a.sexo, fontes: a.fontes },
        });
      }
    }
  }

  return {
    sem_sexo: alvo.length,
    aplicaveis: aplicaveis.length,
    conflitos,
    gravados,
    avisos,
    exemplos: aplicaveis.slice(0, 10).map(a => `${a.nome} → ${a.sexo} (${a.fontes.join(', ')})`),
  };
}









const PROMPT = `Você recebe uma lista de PRIMEIROS NOMES brasileiros.

Responda SOMENTE este JSON, sem texto em volta e sem quebras de linha:
{"masculino":["..."],"feminino":["..."]}

REGRAS:
- Inclua um nome APENAS se ele for inequivocamente masculino ou feminino no Brasil.
- OMITA (não coloque em nenhuma das listas) nomes unissex (Alex, Ariel, Darci, Jean, Yuri, Nicola, Lindomar), nomes estrangeiros que você não conhece, apelidos, iniciais e qualquer caso em que você hesitaria.
- Na dúvida, OMITA. Um palpite errado aqui vai para o cadastro de uma pessoa real e decide em qual grupo ela pode entrar — errar é pior do que não responder.
- Copie o nome exatamente como veio. Não invente nomes fora da lista.`;












async function sugerirPorNome({ limite = TETO_PALPITE, offset = 0, apenasIds = null } = {}) {
  const todas = await pessoasSemSexo({ apenasIds });
  const inicio = Math.max(0, Number(offset) || 0);
  const tamanho = Math.max(1, Math.min(Number(limite) || TETO_PALPITE, TETO_PALPITE));
  const alvo = todas.slice(inicio, inicio + tamanho);

  const nomes = new Set();
  for (const p of alvo) {
    const pn = primeiroNomeParaPalpite(p.nome);
    if (pn) nomes.add(pn);
  }
  const base = {
    total: todas.length,
    offset: inicio,
    proximo_offset: inicio + alvo.length < todas.length ? inicio + alvo.length : null,
    sem_sexo: alvo.length,
  };
  if (!nomes.size) return { ...base, sugestoes: [], nomes_perguntados: 0, sem_sugestao: alvo.length };

  const lista = [...nomes];
  const client = clienteAnthropic();
  let palpites = [];




  for (let i = 0; i < lista.length; i += 60) {
    const bloco = lista.slice(i, i + 60);
    const r = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(bloco) }],
    });
    const texto = (r.content || []).map(c => c.text || '').join('');
    try {
      const json = JSON.parse(texto.replace(/```json|```/g, '').trim());
      palpites = palpites.concat(palpitesUsaveis(json));
    } catch (e) {


      console.error('[sexoCompletar] resposta do modelo não parseou:', e.message);
    }
  }

  const sugestoes = casarPalpites(alvo, palpites);
  return {
    ...base,
    sugestoes,
    nomes_perguntados: lista.length,
    sem_sexo: alvo.length,


    sem_sugestao: alvo.length - sugestoes.length,
  };
}








async function confirmarSexos(itens, { por = null } = {}) {
  const lista = Array.isArray(itens) ? itens : [];
  const recusados = [];













  const porSexo = { masculino: [], feminino: [] };
  for (const item of lista) {
    const sexo = normalizarSexo(item?.sexo);
    const id = item?.membro_id;
    if (!id || !sexo) { recusados.push({ membro_id: id || null, motivo: 'sexo_invalido' }); continue; }
    porSexo[sexo].push(id);
  }

  const gravadosPorId = new Map();
  for (const [sexo, ids] of Object.entries(porSexo)) {
    for (let i = 0; i < ids.length; i += LOTE_IN) {
      const bloco = ids.slice(i, i + LOTE_IN);



      const { data, error } = await supabase
        .from('mem_membros')
        .update({ genero: sexo })
        .in('id', bloco)
        .is('deleted_at', null)
        .is('genero', null)
        .select('id, nome');
      if (error) {
        bloco.forEach(id => recusados.push({ membro_id: id, motivo: error.message }));
        continue;
      }
      (data || []).forEach(m => gravadosPorId.set(m.id, { nome: m.nome, sexo }));
    }
  }


  for (const ids of Object.values(porSexo)) {
    for (const id of ids) if (!gravadosPorId.has(id)) recusados.push({ membro_id: id, motivo: 'ja_tinha_sexo' });
  }








  const observacoes = [...gravadosPorId.entries()].map(([id, m]) => ({
    membro_id: id,
    origem: 'sexo_inferido_ia',
    nome: m.nome ? String(m.nome).trim().slice(0, 250) : null,
    nome_normalizado: nomeNormalizado(m.nome) || null,
    dados: { genero: m.sexo, confirmado_por: por || null },
  })).filter(o => o.nome);

  for (let i = 0; i < observacoes.length; i += LOTE_IN) {
    const { error } = await supabase
      .from('mem_identidade_observacoes')
      .insert(observacoes.slice(i, i + LOTE_IN));
    if (error) console.error('[sexoCompletar] observações não registradas:', error.message);
  }

  return { gravados: gravadosPorId.size, recusados };
}

module.exports = { colherDeclaracoes, sugerirPorNome, confirmarSexos, pessoasSemSexo };

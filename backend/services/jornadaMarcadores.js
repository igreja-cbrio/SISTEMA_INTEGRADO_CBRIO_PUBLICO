































const { supabase } = require('../utils/supabase');
const {
  montarMarcadores, marcadoresVazios, podeVerMarcadorSensivel,
} = require('../utils/jornadaMarcadores');

const JANELA_ATIVIDADE_DIAS = 90;
const LOTE = 200;
const PAGINA = 1000;



const LIMITE_MODO_LOTE = 600;

function diasAtras(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}









async function idsPresentes(tabela, filtro, ids) {
  const alvo = new Set();

  const varrer = async (lote) => {
    for (let from = 0; ; from += PAGINA) {

      let q = supabase.from(tabela).select('membro_id');
      if (lote) q = q.in('membro_id', lote);
      const { data, error } = await filtro(q).range(from, from + PAGINA - 1);
      if (error) throw error;
      for (const r of data || []) if (r.membro_id) alvo.add(r.membro_id);
      if (!data || data.length < PAGINA) break;
    }
  };

  if (!ids) {
    await varrer(null);
    return alvo;
  }
  const lotes = [];
  for (let i = 0; i < ids.length; i += LOTE) lotes.push(ids.slice(i, i + LOTE));
  await Promise.all(lotes.map(varrer));
  return alvo;
}


async function idsBatizadoOutraIgreja(ids) {




  const alvo = new Set();
  const varrer = async (lote) => {
    for (let from = 0; ; from += PAGINA) {
      let q = supabase.from('mem_membros').select('id')
        .eq('batizado_outra_igreja', true).is('deleted_at', null);
      if (lote) q = q.in('id', lote);
      const { data, error } = await q.range(from, from + PAGINA - 1);
      if (error) throw error;
      for (const r of data || []) if (r.id) alvo.add(r.id);
      if (!data || data.length < PAGINA) break;
    }
  };
  if (!ids) { await varrer(null); return alvo; }
  const lotes = [];
  for (let i = 0; i < ids.length; i += LOTE) lotes.push(ids.slice(i, i + LOTE));
  await Promise.all(lotes.map(varrer));
  return alvo;
}









async function marcadoresDeMembros(membroIds, opts = {}) {
  const incluirSensiveis = opts.incluirSensiveis === true;
  const ids = [...new Set((membroIds || []).filter(Boolean))];
  const porMembro = new Map();
  if (!ids.length) return { porMembro, indisponiveis: [] };


  const alvo = ids.length > LIMITE_MODO_LOTE ? null : ids;
  const desde = diasAtras(JANELA_ATIVIDADE_DIAS);

  const sinais = [
    ['batismo_cbrio', () => idsPresentes('batismo_inscricoes',
      (q) => q.is('deleted_at', null).eq('status', 'realizado'), alvo)],
    ['batismo_outra', () => idsBatizadoOutraIgreja(alvo)],

    ['next', () => idsPresentes('vw_next_formado_pessoa', (q) => q, alvo)],
    ['grupo', () => idsPresentes('mem_grupo_membros',
      (q) => q.is('deleted_at', null).is('saiu_em', null), alvo)],
    ['servir', () => idsPresentes('mem_voluntarios',
      (q) => q.is('deleted_at', null).is('ate', null), alvo)],
    ['devocional', () => idsPresentes('mem_devocionais',
      (q) => q.is('deleted_at', null).eq('concluida', true).gte('data_devocional', desde), alvo)],
  ];


  if (incluirSensiveis) {
    sinais.push(['generosidade', () => idsPresentes('mem_contribuicoes',
      (q) => q.is('deleted_at', null).in('tipo', ['dizimo', 'oferta']).gte('data', desde), alvo)]);
  }

  const indisponiveis = [];
  const sets = {};
  await Promise.all(sinais.map(async ([chave, ler]) => {
    try {
      sets[chave] = await ler();
    } catch (e) {


      console.error(`[jornadaMarcadores] sinal "${chave}" indisponível:`, e.message);
      sets[chave] = new Set();
      indisponiveis.push(chave);
    }
  }));

  for (const id of ids) {
    porMembro.set(id, montarMarcadores({
      batismo_cbrio: sets.batismo_cbrio?.has(id),
      batismo_outra: sets.batismo_outra?.has(id),
      next: sets.next?.has(id),
      grupo: sets.grupo?.has(id),
      servir: sets.servir?.has(id),
      devocional: sets.devocional?.has(id),
      generosidade: sets.generosidade?.has(id),
    }, { incluirSensiveis }));
  }


  const idx = indisponiveis.indexOf('batismo_outra');
  if (idx >= 0 && !indisponiveis.includes('batismo_cbrio')) indisponiveis.splice(idx, 1);

  return { porMembro, indisponiveis: [...new Set(indisponiveis)] };
}









async function anexarMarcadores(linhas, pegarId, opts = {}) {
  const lista = linhas || [];
  if (!lista.length) return { linhas: lista, indisponiveis: [] };





  const carimbar = (alvo, indisponiveis) => {
    if (indisponiveis.length) alvo.indisponiveis = indisponiveis;
    return alvo;
  };
  try {
    const { porMembro, indisponiveis } = await marcadoresDeMembros(lista.map(pegarId), opts);
    for (const l of lista) {
      const id = pegarId(l);
      const m = (id && porMembro.get(id)) || marcadoresVazios(opts);
      l.marcadores = carimbar({ ...m }, indisponiveis);
    }
    return { linhas: lista, indisponiveis };
  } catch (e) {
    console.error('[jornadaMarcadores] anexar:', e.message);
    for (const l of lista) l.marcadores = carimbar(marcadoresVazios(opts), ['todos']);
    return { linhas: lista, indisponiveis: ['todos'] };
  }
}

module.exports = {
  marcadoresDeMembros,
  anexarMarcadores,
  podeVerMarcadorSensivel,
  JANELA_ATIVIDADE_DIAS,


  idsPresentes,
  idsBatizadoOutraIgreja,
};

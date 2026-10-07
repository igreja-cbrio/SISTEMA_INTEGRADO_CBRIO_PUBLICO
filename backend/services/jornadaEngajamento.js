























const { supabase } = require('../utils/supabase');
const { ANO_INICIAL, diaLocal } = require('../utils/janelaPeriodo');

const VALORES = ['seguir', 'conectar', 'investir', 'servir', 'generosidade'];


const JANELAS = { mes: 30, '3m': 90, '6m': 180, '12m': 365, atual: null };
const JANELA_PADRAO = '3m';

function janelaDias(janela) {
  return Object.prototype.hasOwnProperty.call(JANELAS, janela) ? JANELAS[janela] : JANELAS[JANELA_PADRAO];
}


function normalizaJanela(janela) {
  if (ehJanelaAno(janela)) return String(janela);
  return Object.prototype.hasOwnProperty.call(JANELAS, janela) ? janela : JANELA_PADRAO;
}
function ehJanelaAno(janela) {
  if (typeof janela !== 'string' || !/^ano:\d{4}$/.test(janela)) return false;
  const n = Number(janela.slice(4));
  return n >= ANO_INICIAL && n <= new Date().getFullYear();
}




function recorteJanela(janela) {
  if (ehJanelaAno(janela)) {
    const n = Number(String(janela).slice(4));
    const fimDoAno = new Date(n, 11, 31, 12);
    const fim = fimDoAno.getTime() <= Date.now() ? fimDoAno : new Date();
    return { dias: null, ano: n, desde: `${n}-01-01`, ate: diaLocal(fim) };
  }
  const dias = janelaDias(janela);
  return { dias, ano: null, desde: dias == null ? null : daysAgo(dias), ate: null };
}
function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }


async function fetchAllRows(table, build) {
  const page = 1000; let from = 0; const out = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await build(supabase.from(table)).range(from, from + page - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return out;
}



async function fetchMembroSet(table, build) {
  const rows = await fetchAllRows(table, (q) => build(q.select('membro_id')));
  return new Set(rows.map((r) => r.membro_id).filter(Boolean));
}




async function computeJornada(janelaIn = JANELA_PADRAO) {
  const janela = normalizaJanela(janelaIn);
  const rec = recorteJanela(janela);
  const dias = rec.dias;



  const comJanela = (q, col) => {
    let out = q;
    if (rec.desde) out = out.gte(col, rec.desde);
    if (rec.ate) out = out.lte(col, rec.ate);
    return out;
  };

  const membros = await fetchAllRows('mem_membros', (q) =>
    q.select('id, nome, email, telefone, foto_url, status')
      .is('deleted_at', null).eq('active', true).eq('status', 'membro_ativo'));



  const [batismoSet, nextSet, grupoSet, investirSet, servirSet, genSet] = await Promise.all([

    fetchMembroSet('batismo_inscricoes', (q) => q.is('deleted_at', null).eq('status', 'realizado')),









    fetchMembroSet('vw_next_formado_pessoa', (q) => q.not('membro_id', 'is', null)),

    fetchMembroSet('mem_grupo_membros', (q) => q.is('deleted_at', null).is('saiu_em', null)),

    fetchMembroSet('mem_devocionais', (q) => comJanela(q.is('deleted_at', null).eq('concluida', true), 'data_devocional')),

    fetchMembroSet('mem_voluntarios', (q) => q.is('deleted_at', null).is('ate', null)),

    fetchMembroSet('mem_contribuicoes', (q) => comJanela(q.is('deleted_at', null).in('tipo', ['dizimo', 'oferta']), 'data')),
  ]);

  const lista = membros.map((m) => {

    const v = {
      seguir: batismoSet.has(m.id) || nextSet.has(m.id),
      conectar: grupoSet.has(m.id),
      investir: investirSet.has(m.id),
      servir: servirSet.has(m.id),
      generosidade: genSet.has(m.id),
    };
    const total_valores = VALORES.reduce((acc, k) => acc + (v[k] ? 1 : 0), 0);
    return {
      id: m.id, nome: m.nome, email: m.email, telefone: m.telefone,
      foto_url: m.foto_url, status: m.status,
      valores: v, total_valores, engajado: total_valores >= 1,
    };
  });

  return { janela, dias, ano: rec.ano, desde: rec.desde, ate: rec.ate, total_base: lista.length, membros: lista };
}


function agregar(lista) {
  const total = lista.length;
  const denom = total || 1;
  const por_valor = {};
  for (const k of VALORES) {
    const n = lista.reduce((acc, m) => acc + (m.valores[k] ? 1 : 0), 0);
    por_valor[k] = { total: n, pct: Math.round((n / denom) * 100) };
  }
  const eng = lista.reduce((acc, m) => acc + (m.engajado ? 1 : 0), 0);
  return {
    total_membros: total,
    engajados: { total: eng, pct: Math.round((eng / denom) * 100) },
    valores: por_valor,
  };
}

module.exports = {
  computeJornada, agregar, VALORES, JANELAS, JANELA_PADRAO,
  janelaDias, normalizaJanela, ehJanelaAno, recorteJanela,
};

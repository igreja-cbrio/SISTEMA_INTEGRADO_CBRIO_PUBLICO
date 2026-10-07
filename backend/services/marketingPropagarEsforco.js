'use strict';




const { supabase } = require('../utils/supabase');
const P = require('../utils/marketingPropagacao');

const LOTE = 200;

async function lerPaginado(montar) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar().range(de, de + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

async function emLotes(ids, fn) {
  const out = [];
  for (let i = 0; i < ids.length; i += LOTE) out.push(...(await fn(ids.slice(i, i + LOTE))));
  return out;
}

async function propagarEsforcoDoPadrao(antigo, novo) {
  if (!P.esforcoMudou(antigo, novo) || !(Number(novo.esforco_valor) > 0)) return { atualizadas: 0 };


  const cards = await lerPaginado(() => {
    let q = supabase.from('marketing_kanban_cards').select('id, culto, estado, event_id')
      .eq('origem', 'evento').not('event_phase_id', 'is', null).is('deleted_at', null)
      .neq('estado', 'concluido').order('id');
    if (antigo.culto) q = q.eq('culto', antigo.culto);
    return q;
  });
  if (!cards.length) return { atualizadas: 0 };

  const eventIds = [...new Set(cards.map(c => c.event_id).filter(Boolean))];
  const eventos = await emLotes(eventIds, async (lote) => {
    const { data, error } = await supabase.from('events').select('id, category_id').in('id', lote);
    if (error) throw error;
    return data || [];
  });
  const catDoEvento = Object.fromEntries(eventos.map(e => [e.id, e.category_id || null]));
  const comCategoria = cards.map(c => ({ ...c, category_id: catDoEvento[c.event_id] ?? null }));

  let categoriasComListaPropria = new Set();
  if (!antigo.category_id) {
    const { data, error } = await supabase.from('marketing_ciclo_itens_padrao').select('category_id')
      .eq('ativo', true).eq('nome_fase', antigo.nome_fase).not('category_id', 'is', null);
    if (error) throw error;
    categoriasComListaPropria = new Set((data || []).map(r => r.category_id));
  }

  const itens = await emLotes(comCategoria.map(c => c.id), async (lote) => {
    const { data, error } = await supabase.from('marketing_card_checklist')
      .select('id, card_id, grupo, texto, feito, esforco_valor, esforco_unidade')
      .in('card_id', lote).eq('grupo', antigo.nome_fase).eq('texto', antigo.texto).eq('feito', false);
    if (error) throw error;
    return data || [];
  });

  const ids = P.alvosDaPropagacao({ antigo, novo, cards: comCategoria, itens, categoriasComListaPropria });
  if (!ids.length) return { atualizadas: 0 };



  const vAntigo = Number(antigo.esforco_valor) || 0;
  const uAntiga = antigo.esforco_unidade === 'dias' ? 'dias' : 'horas';
  const aindaSegue = vAntigo > 0
    ? `esforco_valor.is.null,esforco_valor.eq.0,and(esforco_valor.eq.${vAntigo},esforco_unidade.eq.${uAntiga})`
    : 'esforco_valor.is.null,esforco_valor.eq.0';
  const gravadas = await emLotes(ids, async (lote) => {
    const { data, error } = await supabase.from('marketing_card_checklist')
      .update({ esforco_valor: Number(novo.esforco_valor), esforco_unidade: novo.esforco_unidade === 'dias' ? 'dias' : 'horas' })
      .in('id', lote).eq('feito', false).or(aindaSegue)
      .select('id');
    if (error) throw error;
    return data || [];
  });
  return { atualizadas: gravadas.length };
}

module.exports = { propagarEsforcoDoPadrao };

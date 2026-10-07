






const { supabase } = require('../utils/supabase');
const R = require('./rotinasRegras');

function hojeSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

async function gerarTarefasDeRotinas({ hoje = hojeSaoPaulo(), dias = 7, itemIds = null } = {}) {
  let q = supabase.from('rotina_itens')
    .select('id, titulo, descricao, frequencia, dia_semana, dia_mes, responsavel_id, inicio, rotina_id, rotinas(nome, area, ativa, deleted_at, acompanhamento_ativo)')
    .eq('ativo', true);
  if (itemIds) q = q.in('id', itemIds);
  const { data: itens, error } = await q;
  if (error) throw error;

  const ate = R.somarDias(hoje, dias - 1);
  const linhas = [];
  (itens || []).forEach((it) => {
    const rot = it.rotinas;

    if (!rot || !rot.ativa || rot.deleted_at || rot.acompanhamento_ativo === false) return;
    R.ocorrenciasDoItem(it, hoje, ate).forEach((data) => {
      linhas.push({
        titulo: it.titulo,
        descricao: [`Rotina: ${rot.nome}`, it.descricao].filter(Boolean).join('\n'),
        data,
        area: rot.area,
        tipo: 'planejada',
        status: 'a_fazer',
        done: false,
        prioridade: 'media',
        recorrencia: 'unica',
        rotina_item_id: it.id,
        created_by: it.responsavel_id,
        responsavel_id: it.responsavel_id,
      });
    });
  });

  let geradas = 0;
  for (let i = 0; i < linhas.length; i += 500) {
    const { data, error: e } = await supabase.from('tarefas_pessoais')
      .upsert(linhas.slice(i, i + 500), { onConflict: 'rotina_item_id,data', ignoreDuplicates: true })
      .select('id');
    if (e) throw e;
    geradas += (data || []).length;
  }
  return { itens: (itens || []).length, previstas: linhas.length, geradas };
}




async function limparFuturas(itemIds, hoje = hojeSaoPaulo()) {
  if (!itemIds?.length) return 0;
  const { data, error } = await supabase.from('tarefas_pessoais').delete()
    .in('rotina_item_id', itemIds).gte('data', hoje).neq('status', 'concluida')
    .select('id');
  if (error) throw error;
  return (data || []).length;
}

module.exports = { gerarTarefasDeRotinas, limparFuturas, hojeSaoPaulo };

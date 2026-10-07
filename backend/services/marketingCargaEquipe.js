'use strict';







const { supabase } = require('../utils/supabase');
const L = require('../utils/marketingLinha');
const CP = require('../utils/marketingCargaPessoa');

const CARD_COLS = 'id, estado, atribuido_a, origem, event_id, campanha_id, solicitacao_id, data_fim, prazo_producao, prazo_confirmado, prazo_preliminar';
const ITEM_COLS = 'id, card_id, feito, membro_id, esforco_valor, esforco_unidade, prazo';



async function lerTudo(montar) {
  const out = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar().range(de, de + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

async function lerEmLotes(tabela, cols, coluna, valores) {
  const unicos = [...new Set((valores || []).filter(Boolean))];
  const out = [];
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await supabase.from(tabela).select(cols).in(coluna, unicos.slice(i, i + 200));
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...(data || []));
  }
  return out;
}

const ehTabelaAusente = (e) => e && (e.code === '42P01' || e.code === 'PGRST205');

async function lerCargaEquipe({ hoje } = {}) {
  const dia = hoje || L.dataSP(new Date());
  const semanas = L.semanasDoAno(Number(dia.slice(0, 4)));
  const semanaAtual = Math.max(1, L.semanaDe(dia, semanas) || 1);

  const [membrosRaw, cards] = await Promise.all([
    lerTudo(() => supabase.from('marketing_membros')
      .select('id, nome_display, habilidade, horas_semanais, ativo').is('deleted_at', null).order('id')),
    lerTudo(() => supabase.from('marketing_kanban_cards')
      .select(CARD_COLS).is('deleted_at', null).neq('estado', 'concluido').order('id')),
  ]);
  const ativos = membrosRaw.filter(m => m.ativo !== false);
  const membros = ativos.map(m => ({
    id: m.id, nome: m.nome_display || 'Sem nome', habilidade: m.habilidade, horas_semanais: m.horas_semanais,
  }));



  const noAno = [];
  for (const c of cards) {
    const prazo = L.prazoDoCard(c);
    const semana = prazo ? L.semanaDe(prazo, semanas) : null;
    if (prazo && semana == null) continue;
    noAno.push({ c, semana });
  }
  const itens = await lerEmLotes('marketing_card_checklist', ITEM_COLS, 'card_id', noAno.map(x => x.c.id));
  const porCard = {};
  for (const i of itens) (porCard[i.card_id] ||= []).push(i);
  const tarefas = noAno.map(({ c, semana }) => {
    const its = porCard[c.id] || [];
    return {
      id: c.id, frente: L.frenteDoCard(c), atribuido_a: c.atribuido_a, semana,
      aberta: L.tarefaAberta({ estado: c.estado, papel: null, itens: its }), itens: its,
    };
  });




  const comp = await lerTudo(() => supabase.from('marketing_compromissos_recorrentes')
    .select('id, dia_semana, hora_inicio, duracao_h, descricao, created_at')
    .is('deleted_at', null).eq('ativo', true).order('id'));
  const parts = await lerEmLotes('marketing_recorrentes_participantes', 'compromisso_id, membro_id', 'compromisso_id', comp.map(c => c.id));
  const partPor = {};
  for (const p of parts) (partPor[p.compromisso_id] ||= []).push(p.membro_id);
  const rotina = L.tarefasDaRotina({
    compromissos: comp.map(c => ({ ...c, participantes_ids: partPor[c.id] || [] })),
    execucoes: [], semanas, ctx: { lider: true, meusMembroIds: [] },
  });


  const w = semanas.find(s => s.n === semanaAtual);
  let folgas = [];
  if (w) {
    const { data: ov, error } = await supabase.from('marketing_capacidade_override')
      .select('membro_id, semana_inicio, horas_disponiveis, motivo')
      .is('deleted_at', null).gte('semana_inicio', w.inicio).lte('semana_inicio', w.fim);
    if (error && !ehTabelaAusente(error)) throw error;
    folgas = (ov || []).map(o => ({ ...o, semana: L.semanaDe(o.semana_inicio, semanas) })).filter(o => o.semana != null);
  }

  const carga = CP.cargaPorPessoa({
    membros, tarefas, rotina, folgas,
    semanaAtual, horizonte: 1, ultimaSemana: semanas.length,
    semanaDoItem: CP.semanaDoItemPor((d) => L.semanaDe(d, semanas)),
  });
  const coordenacao = ativos.filter(m => m.habilidade === 'coordenador').map(m => m.id);
  return { hoje: dia, semanas, semanaAtual, carga, coordenacao };
}

module.exports = { lerCargaEquipe };















const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { contextoSubtarefa } = require('../services/marketingContexto');
const L = require('../utils/marketingLinha');
const P = require('../utils/marketingPainel');
const { anotarAreaDasTarefas } = require('../services/marketingAreaTarefa');

router.use(authenticate);

const CARD_COLS = 'id, estado, origem, culto, atribuido_a, event_id, campanha_id, solicitacao_id, data_fim, prazo_producao, prazo_confirmado, prazo_preliminar';
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

router.get('/', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const hoje = L.dataSP(new Date());
    const avisos = [];
    const resposta = {
      hoje,
      semana: { inicio: P.inicioDaSemana(hoje), fim: P.fimDaSemana(hoje) },
      perfil: { lider: false },
      topo: null,
      horizonte: null,
      ciclos: null,
      pedidos: null,
      prontidao: null,
      kpis: null,
      avisos,
    };



    try {
      resposta.perfil.lider = !!(await contextoSubtarefa(req)).lider;
    } catch (e) {
      avisos.push('Não deu para conferir se você é o líder do Marketing: os títulos dos pedidos ficaram ocultos.');
    }


    let cards = null;
    let tarefas = null;
    let pecas = null;
    try {
      cards = await lerTudo(() => supabase.from('marketing_kanban_cards').select(CARD_COLS).is('deleted_at', null).order('id'));


      await anotarAreaDasTarefas(cards, supabase);
      const abertos = cards.filter(c => c.estado !== 'concluido').map(c => c.id);
      const itens = await lerEmLotes('marketing_card_checklist', ITEM_COLS, 'card_id', abertos);
      const porCard = {};
      for (const i of itens) (porCard[i.card_id] ||= []).push(i);
      tarefas = P.montarTarefas(cards, porCard);
      pecas = P.pecasAbertas(tarefas);
      resposta.horizonte = P.horizonteDePecas(pecas, hoje);
    } catch (e) {
      cards = null;
      tarefas = null;
      pecas = null;
      avisos.push(`As demandas não carregaram: ${e.message}`);
    }


    let pontos = null;
    if (cards) {
      try {
        const [camps, sols] = await Promise.all([
          lerTudo(() => supabase.from('marketing_campanhas')
            .select('id, titulo, solicitacao_id, status, created_at').is('deleted_at', null).order('id')),
          lerTudo(() => supabase.from('solicitacoes')
            .select('id, titulo, status, created_at, data_necessaria, area_cliente, eh_urgente')
            .eq('categoria', 'marketing').is('deleted_at', null).order('id')),
        ]);
        const abertos = L.pedidosAbertos({ solicitacoes: sols, campanhas: camps, cards });
        const fila = P.filaDePedidos(abertos, hoje, { comTitulo: resposta.perfil.lider });


        const solsDasCamps = await lerEmLotes('solicitacoes', 'id, status, deleted_at', 'id', camps.map(c => c.solicitacao_id));
        const semViva = P.pedidosSemSolicitacaoViva({
          campanhas: camps, cards,
          solicitacoesPorId: Object.fromEntries(solsDasCamps.map(s => [s.id, s])),
        });
        resposta.pedidos = {
          ...fila,
          sem_solicitacao_viva: { total: semViva.length, itens: resposta.perfil.lider ? semViva : [] },
        };
        pontos = fila.pontos;
      } catch (e) {
        avisos.push(`A fila de pedidos não carregou: ${e.message}`);
      }
    }
    if (tarefas) resposta.topo = P.resumoDoTopo({ tarefas, pecas, pedidos: pontos, hoje });


    if (tarefas) {
      try {
        const { data, error } = await supabase.from('event_cycles')
          .select('event_id, data_dia_d, events(id, name, status, date)').eq('status', 'ativo');
        if (error) throw error;
        const ciclos = (data || [])
          .filter(c => c.events && c.events.status !== 'concluido')
          .map(c => ({ event_id: c.event_id, nome: c.events.name, dia_d: c.data_dia_d || c.events.date || null }));
        resposta.ciclos = P.andamentoDosCiclos({ ciclos, tarefas, hoje });
      } catch (e) {
        avisos.push(`O andamento dos ciclos não carregou: ${e.message}`);
      }
    }


    let membros = null;
    let matriz = null;
    let rotina = null;
    try {
      membros = await lerTudo(() => supabase.from('marketing_membros')
        .select('id, habilidade, horas_semanais, ativo').is('deleted_at', null).order('id'));
    } catch (e) {
      avisos.push(`A capacidade da equipe não carregou: ${e.message}`);
    }
    try {
      const itensMatriz = await lerTudo(() => supabase.from('marketing_ciclo_itens_padrao')
        .select('id, ativo, esforco_valor, esforco_unidade').order('id'));
      matriz = itensMatriz.filter(i => i.ativo !== false);
    } catch (e) {
      avisos.push(`A matriz do ciclo não carregou: ${e.message}`);
    }
    try {


      const comp = await lerTudo(() => supabase.from('marketing_compromissos_recorrentes')
        .select('id, dia_semana, hora_inicio, duracao_h, descricao, created_at')
        .is('deleted_at', null).eq('ativo', true).order('id'));
      const parts = await lerEmLotes('marketing_recorrentes_participantes', 'compromisso_id, membro_id', 'compromisso_id', comp.map(c => c.id));
      const partPor = {};
      for (const p of parts) (partPor[p.compromisso_id] ||= []).push(p.membro_id);
      const compostos = comp.map(c => ({ ...c, participantes_ids: partPor[c.id] || [] }));
      const semanas = L.semanasDoAno(Number(hoje.slice(0, 4)));
      const semana = semanas.find(w => w.n === L.semanaDe(hoje, semanas));
      const { data: execs, error: eExec } = await supabase.from('marketing_rotina_execucoes')
        .select('compromisso_id, membro_id, semana_inicio').eq('semana_inicio', L.domingoDe(hoje));
      if (eExec && !ehTabelaAusente(eExec)) throw eExec;

      const daSemana = semana
        ? L.tarefasDaRotina({ compromissos: compostos, execucoes: execs || [], semanas: [semana], ctx: { lider: true, meusMembroIds: [] } })
        : [];
      const itensRotina = daSemana.flatMap(t => t.itens || []);
      rotina = { compromissos: comp.length, esperadas: itensRotina.length, marcadas: itensRotina.filter(i => i.feito).length };
    } catch (e) {
      avisos.push(`A rotina da semana não carregou: ${e.message}`);
    }
    if (pecas) resposta.prontidao = P.prontidaoDoDado({ pecas, membros, matriz, rotina });


    try {
      const [inds, regs] = await Promise.all([
        supabase.from('kpi_indicadores_taticos')
          .select('id, indicador, unidade, meta_valor, sentido_meta').in('id', P.KPIS_MKT),
        supabase.from('kpi_registros')
          .select('indicador_id, periodo_referencia, valor_realizado, observacoes, data_preenchimento')
          .in('indicador_id', P.KPIS_MKT).gte('periodo_referencia', P.MARCO_ZERO_KPI),
      ]);
      if (inds.error) throw inds.error;
      if (regs.error) throw regs.error;
      resposta.kpis = P.kpisEmCalibracao({ indicadores: inds.data || [], registros: regs.data || [], hoje });
    } catch (e) {
      avisos.push(`Os indicadores não carregaram: ${e.message}`);
    }

    res.json(resposta);
  } catch (e) {
    console.error('[MARKETING-PAINEL] get:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar o Dashboard do Marketing', detalhe: e.message });
  }
});

module.exports = router;

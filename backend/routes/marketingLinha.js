











const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { contextoSubtarefa } = require('../services/marketingContexto');
const L = require('../utils/marketingLinha');
const A = require('../utils/marketingAlocacao');
const CP = require('../utils/marketingCargaPessoa');
const regraSubtarefa = require('../utils/marketingChecklist');
const GS = require('../utils/marketingSolicitacaoGestao');
const { concluirSolicitacaoMarketing } = require('../services/marketingConclusao');
const { anotarAreaDasTarefas, MIGRATION_AREA_TAREFA } = require('../services/marketingAreaTarefa');
const { notificar } = require('../services/notificar');


const HORIZONTE_CARGA = 4;
const { avisarAtribuidos, avisarPrazoAjustado, avisarSeChecklistConcluiu, avisarEntregue, carimbarEntrega } = require('../services/marketingAvisos');

const E = require('../utils/marketingEntregaArquivo');
const SE = require('../services/marketingEntregaArquivo');

const RP = require('../utils/marketingRedesPlano');
const MIGRATION_REDES = '20261005180000_mkt_redes_rotinas_mensais.sql';

router.use(authenticate);

const CARD_COLS = [
  'id', 'titulo', 'descricao', 'origem', 'estado', 'culto', 'visibilidade', 'prioridade',
  'atribuido_a', 'event_id', 'event_phase_id', 'campanha_id', 'solicitacao_id',
  'data_inicio', 'data_fim', 'prazo_producao', 'prazo_confirmado', 'prazo_preliminar',
  'concluido_em', 'created_at',
].join(', ');
const ITEM_COLS = 'id, card_id, texto, grupo, ordem, feito, membro_id, esforco_valor, esforco_unidade, prazo, exige_registro, registro, concluido_em';



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
const ehColunaAusente = (e) => e && (e.code === '42703' || e.code === 'PGRST204');




async function areasDaRotina(ids, avisos) {
  const out = {};
  const unicos = [...new Set((ids || []).filter(Boolean))];
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await supabase.from('marketing_compromissos_recorrentes')
      .select('id, area').in('id', unicos.slice(i, i + 200));
    if (error) {
      if (!ehColunaAusente(error)) throw error;
      avisos.push('O quadrado Redes ainda não separa a rotina: falta aplicar a migration 20261001140000 (toda a rotina aparece em Institucionais).');
      return {};
    }
    for (const r of data || []) out[r.id] = r.area;
  }
  return out;
}



async function postsDasSubtarefas(ids) {
  const unicos = [...new Set((ids || []).filter(Boolean))];
  const out = new Map();
  for (const coluna of ['subtarefa_producao_id', 'subtarefa_postagem_id']) {
    for (let i = 0; i < unicos.length; i += 200) {
      const { data, error } = await supabase.from('marketing_redes_plano_posts')
        .select('id, dia_provavel, ref_url, ref_arquivos, descricao, subtarefa_producao_id, subtarefa_postagem_id')
        .in(coluna, unicos.slice(i, i + 200));
      if (error) {
        if (ehTabelaAusente(error)) return [];
        throw error;
      }
      for (const p of data || []) out.set(p.id, p);
    }
  }
  return [...out.values()];
}




async function frequenciaDaRotina(ids) {
  const out = {};
  const unicos = [...new Set((ids || []).filter(Boolean))];
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await supabase.from('marketing_compromissos_recorrentes')
      .select('id, frequencia, semana_do_mes, tipo, responsavel_execucao_membro_id').in('id', unicos.slice(i, i + 200));
    if (error) {
      if (ehColunaAusente(error)) return {};
      throw error;
    }
    for (const r of data || []) out[r.id] = r;
  }
  return out;
}







const podeCriarItem = (card, papel, ctx) => papel !== 'dono' && card.estado !== 'concluido'
  && regraSubtarefa.podeEditarItem({ lider: ctx.lider, nivel: ctx.nivel, card });

router.get('/', authorizeModule('marketing', 1), async (req, res) => {
  const avisos = [];
  try {
    const hoje = L.dataSP(new Date());
    const anoHoje = Number(hoje.slice(0, 4));
    const pedido = Number(req.query.ano);
    const ano = Number.isInteger(pedido) && pedido >= 2024 && pedido <= anoHoje + 2 ? pedido : anoHoje;
    const semanas = L.semanasDoAno(ano);

    const semanaAtual = ano < anoHoje ? semanas.length + 1 : ano > anoHoje ? 0 : L.semanaDe(hoje, semanas);



    const ctxReal = await contextoSubtarefa(req);
    let ctx = ctxReal;

    const [cards, membros] = await Promise.all([
      lerTudo(() => supabase.from('marketing_kanban_cards').select(CARD_COLS).is('deleted_at', null).order('id')),
      lerTudo(() => supabase.from('marketing_membros').select('id, profile_id, nome_display, habilidade, slots_dia, horas_semanais, ativo')
        .is('deleted_at', null).order('id')),
    ]);


    const avisoArea = await anotarAreaDasTarefas(cards, supabase);
    if (avisoArea) avisos.push(avisoArea);


    const profIds = membros.map(m => m.profile_id).filter(Boolean);
    const profs = profIds.length ? await lerEmLotes('profiles', 'id, name', 'id', profIds) : [];
    const nomeProf = Object.fromEntries(profs.map(p => [p.id, p.name]));
    const membrosOut = membros.filter(m => m.ativo !== false).map(m => ({
      id: m.id, nome: nomeProf[m.profile_id] || m.nome_display || 'Sem nome',
      habilidade: m.habilidade, slots_dia: m.slots_dia, horas_semanais: m.horas_semanais,
    }));


    let verComo = null;
    if (req.query.ver_como) {


      const candidato = membros.find(m => String(m.id) === String(req.query.ver_como));
      let role = null;
      if (ctxReal.lider && candidato && candidato.profile_id) {
        const { data: prof, error: eProf } = await supabase.from('profiles')
          .select('role').eq('id', candidato.profile_id).maybeSingle();
        if (eProf) throw eProf;
        role = prof ? prof.role : null;
      }
      const r = L.contextoVerComo({ ctxReal, membros, membroId: req.query.ver_como, role });
      if (r.erro === 'so_lider') {
        return res.status(403).json({ error: 'Só o líder do Marketing pode ver a linha do tempo como outra pessoa' });
      }
      if (r.erro) return res.status(404).json({ error: 'Esta pessoa não está ativa na equipe do Marketing' });
      ctx = r.ctx;
      const doAlvo = membrosOut.find(m => m.id === r.alvo.id);
      verComo = { membro_id: r.alvo.id, nome: doAlvo ? doAlvo.nome : 'Sem nome' };
    }


    const noAno = [];
    for (const c of cards) {
      const prazo = L.prazoDoCard(c);
      const semana = prazo ? L.semanaDe(prazo, semanas) : null;
      if (prazo && semana == null) continue;
      if (semana === 0 && c.estado === 'concluido') continue;
      noAno.push({ card: c, prazo, semana });
    }

    const itens = await lerEmLotes('marketing_card_checklist', ITEM_COLS, 'card_id', noAno.map(x => x.card.id));
    const itensPorCard = {};
    for (const i of itens) (itensPorCard[i.card_id] ||= []).push(i);
    for (const k of Object.keys(itensPorCard)) itensPorCard[k].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));



    const respCulto = {};
    for (const { card: c } of noAno) {
      if (c.event_id && c.culto && c.atribuido_a && (c.visibilidade || 'equipe') === 'equipe') {
        (respCulto[`${c.event_id}|${c.culto}`] ||= new Set()).add(c.atribuido_a);
      }
    }

    const eventIds = noAno.map(x => x.card.event_id);
    const faseIds = noAno.map(x => x.card.event_phase_id);
    const campIds = noAno.map(x => x.card.campanha_id);
    const [eventos, fases, campanhas] = await Promise.all([
      lerEmLotes('events', 'id, name, date, status', 'id', eventIds),
      lerEmLotes('event_cycle_phases', 'id, event_id, nome_fase, numero_fase, data_inicio_prevista, data_fim_prevista', 'id', faseIds),
      lerEmLotes('marketing_campanhas', 'id, titulo, dor_descricao, prazo_entrega, solicitacao_id, status', 'id', campIds),
    ]);




    const solIds = [...noAno.map(x => x.card.solicitacao_id), ...campanhas.map(c => c.solicitacao_id)];
    const solics = (await lerEmLotes('solicitacoes', 'id, titulo, descricao, data_necessaria, status, deleted_at', 'id', solIds))
      .filter(s => !s.deleted_at);
    const evPorId = Object.fromEntries(eventos.map(e => [e.id, e]));
    const fasePorId = Object.fromEntries(fases.map(f => [f.id, f]));
    const campPorId = Object.fromEntries(campanhas.map(c => [c.id, c]));
    const solPorId = Object.fromEntries(solics.map(s => [s.id, s]));

    const tarefas = [];
    for (const { card: c, prazo, semana } of noAno) {
      const recorte = L.recortarCard({
        card: c, itens: itensPorCard[c.id] || [], ctx,
        responsaveisDoCulto: [...(respCulto[`${c.event_id}|${c.culto}`] || [])],
      });
      if (!recorte) continue;
      const camp = campPorId[c.campanha_id] || null;
      const sol = solPorId[c.solicitacao_id] || solPorId[camp?.solicitacao_id] || null;
      tarefas.push({
        id: c.id, frente: L.frenteDoCard(c), titulo: c.titulo, descricao: c.descricao,
        estado: c.estado, culto: c.culto, visibilidade: c.visibilidade || 'equipe', prioridade: c.prioridade,
        atribuido_a: c.atribuido_a, prazo, semana, papel: recorte.papel,
        aberta: L.tarefaAberta({ estado: c.estado, papel: recorte.papel, itens: recorte.itens }),
        event_id: c.event_id, event_phase_id: c.event_phase_id,
        entrega_final: camp?.prazo_entrega || null,
        pedido: sol ? { titulo: sol.titulo, descricao: sol.descricao, data_necessaria: sol.data_necessaria }
          : camp ? { titulo: camp.titulo, descricao: camp.dor_descricao } : null,
        itens: recorte.itens,
        pode_criar_item: podeCriarItem(c, recorte.papel, ctx),


        solicitacao_id: sol?.id || null,
        solicitacao_status: sol?.status || null,


        origem_req: L.frenteDoCard(c) === 'sis' ? L.origemRequisicao(c, camp) : null,


        tem_entrega_final: !!camp,


        pode_trocar_quadro: L.ehTarefaInterna(c),
      });
    }


    const series = {};
    for (const t of tarefas.filter(x => x.frente === 'ins')) {
      const ev = evPorId[t.event_id] || {};
      const s = (series[t.event_id || 'sem_evento'] ||= {
        event_id: t.event_id, nome: ev.name || 'Evento sem nome', data: ev.date || null, etapas: {},
      });
      const fase = fasePorId[t.event_phase_id] || null;
      const chave = t.event_phase_id || `solta-${t.id}`;
      const e = (s.etapas[chave] ||= {
        event_phase_id: t.event_phase_id, nome_fase: fase?.nome_fase || t.titulo,
        numero_fase: fase?.numero_fase ?? null, semana: t.semana, faixas: [],
      });
      e.faixas.push(t);
      if (t.semana != null && (e.semana == null || t.semana < e.semana)) e.semana = t.semana;
    }
    const listaSeries = Object.values(series).map(s => {
      const etapas = Object.values(s.etapas).sort((a, b) => (a.numero_fase ?? 99) - (b.numero_fase ?? 99));
      const abertas = etapas.flatMap(e => e.faixas).filter(t => t.aberta && t.semana != null);
      return { ...s, etapas, proxima_pendencia: abertas.length ? Math.min(...abertas.map(t => t.semana)) : null };
    }).sort((a, b) => (a.proxima_pendencia ?? 999) - (b.proxima_pendencia ?? 999) || String(a.data).localeCompare(String(b.data)));




    let rotina = [];
    let rotinaInst = [];
    let rotinaRedes = [];
    let rotinaDisponivel = true;
    try {



      const comp = await lerTudo(() => supabase.from('marketing_compromissos_recorrentes')
        .select('id, dia_semana, hora_inicio, duracao_h, descricao, created_at')
        .is('deleted_at', null).eq('ativo', true).order('id'));
      const parts = await lerEmLotes('marketing_recorrentes_participantes', 'compromisso_id, membro_id', 'compromisso_id', comp.map(c => c.id));
      const partPor = {};
      for (const p of parts) (partPor[p.compromisso_id] ||= []).push(p.membro_id);
      const freq = await frequenciaDaRotina(comp.map(c => c.id));
      const compostos = comp.map(c => ({
        ...c, participantes_ids: partPor[c.id] || [],
        frequencia: freq[c.id]?.frequencia || 'semanal', semana_do_mes: freq[c.id]?.semana_do_mes ?? null,
        tipo: freq[c.id]?.tipo || 'comum',
      }));
      const { data: execs, error: eExec } = await supabase.from('marketing_rotina_execucoes')
        .select('compromisso_id, membro_id, semana_inicio')
        .gte('semana_inicio', semanas[0].inicio).lte('semana_inicio', semanas[semanas.length - 1].fim);
      if (eExec) {
        if (!ehTabelaAusente(eExec)) throw eExec;
        rotinaDisponivel = false;
        avisos.push('A rotina da semana ainda não pode ser marcada: falta aplicar a migration da Fase 3.');
      }



      const areaDe = await areasDaRotina(compostos.map(c => c.id), avisos);
      const daArea = (frente) => compostos.filter(c => L.frenteDaArea(areaDe[c.id]) === frente);
      const base = { execucoes: execs || [], semanas, ctx };
      rotinaInst = L.tarefasDaRotina({ ...base, compromissos: daArea('rot'), frente: 'rot' });
      rotinaRedes = L.tarefasDaRotina({ ...base, compromissos: daArea('red'), frente: 'red' });
      rotina = [...rotinaInst, ...rotinaRedes];
    } catch (e) {
      rotina = null;
      avisos.push(`Não deu para carregar a rotina: ${e.message}`);
    }






    try {
      const daRotina = rotina || [];
      const itemIds = tarefas.flatMap(t => (t.itens || []).map(i => i.id));
      const compIds = daRotina.flatMap(t => (t.itens || []).map(i => i.compromisso_id));
      const arquivos = await SE.arquivosDasEntregas({ itemIds, compromissoIds: compIds });
      if (arquivos) {
        const exigeArquivo = await SE.exigeArquivoDosCompromissos(compIds);
        E.anotarEntregas({ cards: tarefas, rotina: daRotina, arquivos, exigeArquivo });
      }
    } catch (e) {
      avisos.push(`Os arquivos das entregas não carregaram: ${e.message}`);
    }




    try {
      const subIds = tarefas.filter(t => t.frente === 'prd').flatMap(t => (t.itens || []).map(i => i.id));
      const posts = await postsDasSubtarefas(subIds);
      if (posts.length) RP.anotarPostagens(tarefas, posts);
    } catch (e) {
      avisos.push(`As referências do planejamento de postagens não carregaram: ${e.message}`);
    }





    let carga = {};
    let pessoasCarga = null;
    if (ctx.lider) {
      const [camps, sols] = await Promise.all([
        lerTudo(() => supabase.from('marketing_campanhas')
          .select('id, titulo, dor_descricao, publico_alvo, solicitacao_id, sugerido_membro_id, status, created_at')
          .is('deleted_at', null).order('id')),
        lerTudo(() => supabase.from('solicitacoes')
          .select('id, titulo, descricao, data_necessaria, solicitante_id, status, created_at')
          .eq('categoria', 'marketing').is('deleted_at', null).order('id')),
      ]);

      const abertos = L.pedidosAbertos({ solicitacoes: sols, campanhas: camps, cards });
      const solicitantes = await lerEmLotes('profiles', 'id, name', 'id', abertos.map(x => x.sol.solicitante_id));
      const nomeSolicitante = Object.fromEntries(solicitantes.map(p => [p.id, p.name]));
      const mais7 = (d) => (d ? new Date(Date.parse(d + 'T12:00:00Z') + 7 * 864e5).toISOString().slice(0, 10) : null);
      for (const { sol, campanha: c, status: pedidoStatus } of abertos) {
        const quando = L.dataSP(sol.data_necessaria) || mais7(L.dataSP(sol.created_at));
        const semana = L.semanaDe(quando, semanas);
        if (semana == null) continue;
        tarefas.push({
          id: c?.id || sol.id, frente: 'sis', tipo: 'pedido', pedido_status: pedidoStatus,
          campanha_id: c?.id || null, solicitacao_id: sol.id, origem_req: 'externa',
          titulo: sol.titulo || c?.titulo, descricao: sol.descricao || c?.dor_descricao || null,
          publico_alvo: c?.publico_alvo || null, data_necessaria: L.dataSP(sol.data_necessaria) || null,
          prazo: quando, semana: Math.max(1, semana), aberta: true, atrasada: semana === 0,
          sugerido_membro_id: c?.sugerido_membro_id || null,
          solicitante: nomeSolicitante[sol.solicitante_id] || null, itens: [],
        });
      }

      const prazoDaTarefa = Object.fromEntries(noAno.map(x => [x.card.id, x.prazo]));
      carga = A.cargaPorSemana(itens, { prazoDaTarefa, semanaDe: (d) => L.semanaDe(d, semanas) });



      const janela = CP.semanasDaJanela(Math.max(1, semanaAtual), HORIZONTE_CARGA, semanas.length);
      let folgas = [];
      if (janela.length) {
        const wIni = semanas.find(w => w.n === janela[0]);
        const wFim = semanas.find(w => w.n === janela[janela.length - 1]);
        const { data: ov, error: eOv } = await supabase.from('marketing_capacidade_override')
          .select('membro_id, semana_inicio, horas_disponiveis, motivo')
          .is('deleted_at', null).gte('semana_inicio', wIni.inicio).lte('semana_inicio', wFim.fim);
        if (eOv && !ehTabelaAusente(eOv)) throw eOv;
        folgas = (ov || []).map(o => ({ ...o, semana: L.semanaDe(o.semana_inicio, semanas) })).filter(o => o.semana != null);
      }
      if (rotina == null) avisos.push('A carga por pessoa está sem a rotina (ela não carregou).');
      pessoasCarga = CP.cargaPorPessoa({
        membros: membrosOut, tarefas, rotina: rotina || [], folgas,
        semanaAtual: Math.max(1, semanaAtual), horizonte: HORIZONTE_CARGA, ultimaSemana: semanas.length,
        semanaDoItem: CP.semanaDoItemPor((d) => L.semanaDe(d, semanas)),
      });
    }





    let minhaSemana = null;
    if (semanaAtual >= 1 && semanaAtual <= semanas.length) {
      try {
        minhaSemana = CP.minhaSemana({
          membros: membrosOut, tarefas, rotina: rotina || [],
          semanaAtual, ultimaSemana: semanas.length,
          semanaDoItem: CP.semanaDoItemPor((d) => L.semanaDe(d, semanas)),
          meusIds: ctx.meusMembroIds,
        });
      } catch (e) {
        avisos.push(`Não deu para contar as demandas da sua semana: ${e.message}`);
      }
    }

    const porFrente = (f) => tarefas.filter(t => t.frente === f);


    const frenteRotina = (lista) => (rotina == null
      ? { status: 'indisponivel', pendentes: null, semanas_atrasadas: [], tarefas: [], marcavel: false }
      : { ...L.statusFrente(lista, semanaAtual), tarefas: lista, marcavel: rotinaDisponivel });
    const frentes = {
      ins: { ...L.statusFrente(porFrente('ins'), semanaAtual), series: listaSeries },
      sis: { ...L.statusFrente(porFrente('sis'), semanaAtual), tarefas: porFrente('sis') },
      rot: frenteRotina(rotinaInst),
      red: frenteRotina(rotinaRedes),
      prd: { ...L.statusFrente(porFrente('prd'), semanaAtual), tarefas: porFrente('prd') },
    };

    res.json({
      ano, hoje, semana_atual: semanaAtual, semanas,
      perfil: {
        lider: ctx.lider,
        meus_membro_ids: ctx.meusMembroIds,


        pode_ver_como: ctxReal.lider,
        ver_como: verComo,
        ver_como_opcoes: L.opcoesVerComo(ctxReal, membrosOut),
      },
      membros: membrosOut,
      carga,
      pessoas_carga: pessoasCarga,
      minha_semana: minhaSemana,
      frentes,
      sem_data: tarefas.filter(t => t.semana == null).length,
      avisos,
    });
  } catch (e) {
    console.error('[MARKETING-LINHA] get:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar a linha do tempo', detalhe: e.message });
  }
});



async function autorizarRotina(req, res) {
  const { compromissoId, semanaInicio } = req.params;
  const membroId = (req.body && req.body.membro_id) || req.query.membro_id;
  return autorizarRotinaDe({ compromissoId, semanaInicio, membroId }, req, res);
}


async function autorizarRotinaDe({ compromissoId, semanaInicio, membroId }, req, res) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semanaInicio) || L.domingoDe(semanaInicio) !== semanaInicio) {
    res.status(400).json({ error: 'semana_inicio tem que ser o domingo da semana (YYYY-MM-DD)' });
    return null;
  }
  if (!membroId) { res.status(400).json({ error: 'membro_id obrigatório' }); return null; }
  const ctx = await contextoSubtarefa(req);
  if (!ctx.lider && !ctx.meusMembroIds.includes(membroId)) {
    res.status(403).json({ error: 'Só a própria pessoa ou o líder do Marketing marca esta rotina' });
    return null;
  }
  const { data: comp, error } = await supabase.from('marketing_compromissos_recorrentes')
    .select('id, descricao').eq('id', compromissoId).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!comp) { res.status(404).json({ error: 'Compromisso não encontrado' }); return null; }
  const { data: p, error: eP } = await supabase.from('marketing_recorrentes_participantes')
    .select('membro_id').eq('compromisso_id', compromissoId).eq('membro_id', membroId).maybeSingle();
  if (eP) throw eP;
  if (!p) { res.status(400).json({ error: 'Esta pessoa não participa deste compromisso' }); return null; }
  return { compromissoId, semanaInicio, membroId, descricao: comp.descricao };
}

router.put('/rotina/:compromissoId/:semanaInicio', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const a = await autorizarRotina(req, res);
    if (!a) return;


    const exige = (await SE.exigeArquivoDosCompromissos([a.compromissoId]))[a.compromissoId] === true;
    if (exige && (await SE.contarArquivos({ compromissoId: a.compromissoId, membroId: a.membroId, semanaInicio: a.semanaInicio })) === 0) {
      return res.status(400).json({ error: 'Este compromisso pede o arquivo: use "Enviar arquivo".', codigo: 'arquivo_obrigatorio' });
    }


    if ((await frequenciaDaRotina([a.compromissoId]))[a.compromissoId]?.tipo === 'planejamento_postagens') {
      return res.status(400).json({ error: 'Este card fica feito ao salvar o planejamento de postagens: abra o card e salve.', codigo: 'planejamento_obrigatorio' });
    }
    const { error } = await supabase.from('marketing_rotina_execucoes').upsert({
      compromisso_id: a.compromissoId, membro_id: a.membroId, semana_inicio: a.semanaInicio,
      concluido_por: req.user.userId,
    }, { onConflict: 'compromisso_id,membro_id,semana_inicio', ignoreDuplicates: true });
    if (error) {
      if (ehTabelaAusente(error)) return res.status(503).json({ error: 'Falta aplicar a migration da Fase 3 (marketing_rotina_execucoes)' });
      throw error;
    }
    res.json({ ok: true, feito: true });
  } catch (e) {
    console.error('[MARKETING-LINHA] rotina put:', e.message);
    res.status(500).json({ error: 'Não foi possível marcar a rotina', detalhe: e.message });
  }
});

router.delete('/rotina/:compromissoId/:semanaInicio', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const a = await autorizarRotina(req, res);
    if (!a) return;
    const { error } = await supabase.from('marketing_rotina_execucoes').delete()
      .eq('compromisso_id', a.compromissoId).eq('membro_id', a.membroId).eq('semana_inicio', a.semanaInicio);
    if (error) {
      if (ehTabelaAusente(error)) return res.status(503).json({ error: 'Falta aplicar a migration da Fase 3 (marketing_rotina_execucoes)' });
      throw error;
    }
    res.json({ ok: true, feito: false });
  } catch (e) {
    console.error('[MARKETING-LINHA] rotina delete:', e.message);
    res.status(500).json({ error: 'Não foi possível reabrir a rotina', detalhe: e.message });
  }
});









const UUID_ENTREGA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CARD_ENTREGA_COLS = 'id, titulo, origem, estado, culto, atribuido_a, visibilidade, event_id, event_phase_id, '
  + 'solicitacao_id, campanha_id, data_fim, prazo_producao, prazo_confirmado, prazo_preliminar, created_at';

const hojeBRT = () => L.dataSP(new Date().toISOString());


async function areaDaTarefa(cardId) {
  const { data, error } = await supabase.from('marketing_kanban_cards').select('area').eq('id', cardId).maybeSingle();
  if (error) {
    if (SE.ehColunaAusente(error)) return null;
    throw error;
  }
  return (data && data.area) || null;
}



async function destinoDaEntrega(req, res) {
  const alvo = (req.body && req.body.alvo) || {};
  if (alvo.item_id) {
    if (!UUID_ENTREGA.test(String(alvo.item_id))) { res.status(400).json({ error: 'Subtarefa inválida' }); return null; }
    const { data: item, error } = await supabase.from('marketing_card_checklist')
      .select('id, card_id, texto, feito, membro_id, exige_registro, registro').eq('id', alvo.item_id).maybeSingle();
    if (error) throw error;
    if (!item) { res.status(404).json({ error: 'Subtarefa não encontrada' }); return null; }
    const { data: card, error: eCard } = await supabase.from('marketing_kanban_cards')
      .select(CARD_ENTREGA_COLS).eq('id', item.card_id).is('deleted_at', null).maybeSingle();
    if (eCard) throw eCard;
    if (!card) { res.status(404).json({ error: 'Tarefa não encontrada' }); return null; }
    const ctx = await contextoSubtarefa(req);
    if (!regraSubtarefa.podeMarcarItem({ ...ctx, item, card })) {
      res.status(403).json({ error: card.visibilidade === 'equipe'
        ? 'Só quem faz esta subtarefa ou o responsável da tarefa pode enviar o arquivo'
        : 'Nesta etapa quem entrega é o líder do Marketing' });
      return null;
    }
    const tipo = E.tipoDaTarefa(card, L.frenteDoCard({ ...card, area: await areaDaTarefa(card.id) }));
    let calculada;
    if (tipo.origem === 'ciclo') {
      const [ev, fase] = await Promise.all([
        supabase.from('events').select('name, date').eq('id', card.event_id).maybeSingle(),
        card.event_phase_id
          ? supabase.from('event_cycle_phases').select('numero_fase, nome_fase').eq('id', card.event_phase_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (ev.error) throw ev.error;
      if (fase.error) throw fase.error;
      calculada = E.pastaDaEntrega({
        tipo: 'ciclo',
        evento: { nome: ev.data?.name, data: ev.data?.date },
        fase: fase.data ? { numero: fase.data.numero_fase, nome: fase.data.nome_fase } : null,
      }, hojeBRT());
    } else {
      calculada = E.pastaDaEntrega({
        tipo: 'tarefa', categoria: tipo.categoria, titulo: card.titulo,
        dia: L.prazoDoCard(card) || L.dataSP(card.created_at),
      }, hojeBRT());
    }
    const destino = await SE.destinoDosArquivos();
    const pasta = E.pastaFixada(calculada.pasta, await SE.pastaJaUsadaPelaTarefa({ cardId: card.id, driveId: destino.driveId }));
    return {
      ...tipo, item, card, driveId: destino.driveId, pasta,

      nome: { tipo: tipo.origem === 'ciclo' ? 'ciclo' : 'tarefa', entregavel: item.texto, culto: card.culto, tarefa: card.titulo },
    };
  }
  if (alvo.compromisso_id) {
    if (!UUID_ENTREGA.test(String(alvo.compromisso_id)) || !UUID_ENTREGA.test(String(alvo.membro_id || ''))) {
      res.status(400).json({ error: 'Subtarefa inválida' });
      return null;
    }
    const a = await autorizarRotinaDe({
      compromissoId: alvo.compromisso_id, semanaInicio: String(alvo.semana_inicio || ''), membroId: alvo.membro_id,
    }, req, res);
    if (!a) return null;
    const exige = (await SE.exigeArquivoDosCompromissos([a.compromissoId]))[a.compromissoId] === true;
    const { data: m } = await supabase.from('marketing_membros').select('nome_display').eq('id', a.membroId).maybeSingle();
    const destino = await SE.destinoDosArquivos();
    return {
      origem: 'rotina', categoria: 'rotina', exige, rotina: a, driveId: destino.driveId,
      pasta: E.pastaDaEntrega({ tipo: 'rotina', semanaInicio: a.semanaInicio, compromisso: a.descricao }, hojeBRT()).pasta,
      nome: { tipo: 'rotina', semanaInicio: a.semanaInicio, pessoa: m?.nome_display || '' },
    };
  }
  res.status(400).json({ error: 'Diga qual subtarefa recebe o arquivo' });
  return null;
}



async function recursoDeEntregaPronto(res) {
  if (!SE.sharepointPronto()) { res.status(503).json({ error: 'O SharePoint não está configurado neste servidor.' }); return false; }
  if (!(await SE.recursoDisponivel())) { res.status(409).json({ error: `Falta aplicar a migration ${SE.MIGRATION}.` }); return false; }
  return true;
}

const MSG_FALTA_ARVORE = `Para anexar arquivo em Requisições e Redes · Produção, falta aplicar a migration ${SE.MIGRATION_ARQUIVOS}.`;

router.post('/entregas/sessao', authorizeModule('marketing', 1), async (req, res) => {
  try {
    if (!(await recursoDeEntregaPronto(res))) return;
    const d = await destinoDaEntrega(req, res);
    if (!d) return;

    if (d.origem === 'tarefa' && !(await SE.arvoreNovaDisponivel())) return res.status(409).json({ error: MSG_FALTA_ARVORE });
    const v = E.validarArquivo({ nome: req.body?.nome_arquivo, tamanho: req.body?.tamanho_bytes });
    if (!v.ok) return res.status(400).json({ error: v.erro });


    const base = E.baseDoNome(E.partesDoNome({ pasta: d.pasta, ...d.nome }));
    const versao = E.proximaVersao(await SE.nomesNaPasta({ pasta: d.pasta }), base);
    const nomeArquivo = E.nomePadrao({ base, versao, original: req.body.nome_arquivo });
    const { uploadUrl } = await SE.criarSessaoDeEnvio({ driveId: d.driveId, pasta: d.pasta, nomeArquivo });
    res.json({ upload_url: uploadUrl, drive_id: d.driveId, pasta: d.pasta, nome_arquivo: nomeArquivo });
  } catch (e) {
    console.error('[MARKETING-LINHA] entrega sessao:', e.message);
    res.status(500).json({ error: 'Não foi possível abrir o envio do arquivo', detalhe: e.message });
  }
});

router.post('/entregas', authorizeModule('marketing', 1), async (req, res) => {
  try {
    if (!(await recursoDeEntregaPronto(res))) return;
    const d = await destinoDaEntrega(req, res);
    if (!d) return;
    const spItemId = String(req.body?.sharepoint_item_id || '');
    if (!spItemId || String(req.body?.drive_id || '') !== String(d.driveId)) {
      return res.status(400).json({ error: 'Arquivo inválido: envie de novo.' });
    }

    const sp = await SE.lerItemDoDrive({ driveId: d.driveId, itemId: spItemId });
    if (!sp || !E.itemNaPasta({ driveItem: sp, driveId: d.driveId, pasta: d.pasta })) {
      return res.status(409).json({ error: 'O arquivo não está na pasta desta subtarefa. Envie de novo por aqui.' });
    }
    const linha = {
      origem: d.origem,
      nome_arquivo: sp.name, tipo_mime: sp.file?.mimeType || null, tamanho_bytes: Number(sp.size) || 0,
      drive_id: d.driveId, sharepoint_item_id: sp.id, web_url: sp.webUrl, pasta: d.pasta,
      enviado_por: req.user.userId,
      ...(d.origem === 'rotina'
        ? { compromisso_id: d.rotina.compromissoId, membro_id: d.rotina.membroId, semana_inicio: d.rotina.semanaInicio }
        : { checklist_item_id: d.item.id, card_id: d.card.id, event_id: d.card.event_id || null, event_phase_id: d.card.event_phase_id || null }),


      ...(d.origem === 'tarefa' ? { categoria: d.categoria } : {}),
    };
    let { data: arquivo, error } = await supabase.from(SE.TABELA).insert(linha).select('*').single();
    if (error) {
      if (error.code === '23514' || SE.ehColunaAusente(error)) return res.status(409).json({ error: MSG_FALTA_ARVORE });

      if (error.code !== '23505') throw error;
      ({ data: arquivo, error } = await supabase.from(SE.TABELA).select('*')
        .eq('drive_id', d.driveId).eq('sharepoint_item_id', sp.id).is('deleted_at', null).maybeSingle());
      if (error) throw error;
    }



    let marcou = false;
    let faltaRegistro = false;
    if (d.exige && d.origem === 'ciclo') {
      marcou = true;
      if (!d.item.feito) {
        if (regraSubtarefa.faltaRegistro({ exigeRegistro: d.item.exige_registro, feito: true, registro: d.item.registro })) {
          marcou = false;
          faltaRegistro = true;
        } else {
          const { error: eUp } = await supabase.from('marketing_card_checklist')
            .update({ feito: true, concluido_por: req.user.userId, updated_at: new Date().toISOString() })
            .eq('id', d.item.id).eq('feito', false);
          if (eUp) throw eUp;

          await avisarSeChecklistConcluiu(d.card.id, d.card.estado);
        }
      }
    } else if (d.exige && d.origem === 'rotina') {
      const { error: eEx } = await supabase.from('marketing_rotina_execucoes').upsert({
        compromisso_id: d.rotina.compromissoId, membro_id: d.rotina.membroId, semana_inicio: d.rotina.semanaInicio,
        concluido_por: req.user.userId,
      }, { onConflict: 'compromisso_id,membro_id,semana_inicio', ignoreDuplicates: true });
      if (eEx) throw eEx;
      marcou = true;
    }
    res.status(201).json({ arquivo: E.resumoDoArquivo(arquivo), feito: marcou, falta_registro: faltaRegistro });
  } catch (e) {
    console.error('[MARKETING-LINHA] entrega registrar:', e.message);
    res.status(500).json({ error: 'O arquivo subiu, mas não foi registrado. Tente de novo.', detalhe: e.message });
  }
});


async function itemEhEntregaDeCiclo(itemId) {
  const { data: item, error } = await supabase.from('marketing_card_checklist').select('card_id').eq('id', itemId).maybeSingle();
  if (error) throw error;
  if (!item) return false;
  const { data: card, error: eCard } = await supabase.from('marketing_kanban_cards')
    .select('origem, event_phase_id').eq('id', item.card_id).maybeSingle();
  if (eCard) throw eCard;
  return E.ehEntregaDeCiclo(card);
}

router.delete('/entregas/:id', authorizeModule('marketing', 1), async (req, res) => {
  try {
    if (!UUID_ENTREGA.test(req.params.id)) return res.status(400).json({ error: 'Arquivo inválido' });
    const { data: a, error } = await supabase.from(SE.TABELA).select('*')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) {
      if (SE.ehTabelaAusente(error)) return res.status(409).json({ error: `Falta aplicar a migration ${SE.MIGRATION}.` });
      throw error;
    }
    if (!a) return res.status(404).json({ error: 'Arquivo não encontrado (talvez já tenha sido tirado).' });
    const ctx = await contextoSubtarefa(req);
    if (!ctx.lider && a.enviado_por !== req.user.userId) {
      return res.status(403).json({ error: 'Só quem enviou o arquivo ou o líder do Marketing pode tirá-lo.' });
    }
    const agora = new Date().toISOString();
    const { error: eDel } = await supabase.from(SE.TABELA)
      .update({ deleted_at: agora, removido_por: req.user.userId }).eq('id', a.id).is('deleted_at', null);
    if (eDel) throw eDel;




    let reaberta = false;
    if (a.origem === 'ciclo' && a.checklist_item_id) {
      if ((await itemEhEntregaDeCiclo(a.checklist_item_id))
        && (await SE.contarArquivos({ itemId: a.checklist_item_id })) === 0) {
        const { data: it, error: eIt } = await supabase.from('marketing_card_checklist')
          .update({ feito: false, updated_at: agora }).eq('id', a.checklist_item_id).eq('feito', true).select('id');
        if (eIt) throw eIt;
        reaberta = (it || []).length > 0;
      }
    } else if (a.origem === 'rotina' && a.compromisso_id) {
      const exige = (await SE.exigeArquivoDosCompromissos([a.compromisso_id]))[a.compromisso_id] === true;
      if (exige
        && (await SE.contarArquivos({ compromissoId: a.compromisso_id, membroId: a.membro_id, semanaInicio: a.semana_inicio })) === 0) {
        const { data: ex, error: eEx } = await supabase.from('marketing_rotina_execucoes').delete()
          .eq('compromisso_id', a.compromisso_id).eq('membro_id', a.membro_id).eq('semana_inicio', a.semana_inicio).select('id');
        if (eEx) throw eEx;
        reaberta = (ex || []).length > 0;
      }
    }
    res.json({ ok: true, reaberta });
  } catch (e) {
    console.error('[MARKETING-LINHA] entrega remover:', e.message);
    res.status(500).json({ error: 'Não foi possível tirar o arquivo', detalhe: e.message });
  }
});






async function exigirLider(req, res) {
  const ctx = await contextoSubtarefa(req);
  if (!ctx.lider) { res.status(403).json({ error: 'Só o líder do Marketing aloca e edita tarefas' }); return null; }
  return ctx;
}

async function membrosAtivos(ids) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return true;
  const { data, error } = await supabase.from('marketing_membros').select('id')
    .in('id', unicos).eq('ativo', true).is('deleted_at', null);
  if (error) throw error;
  return (data || []).length === unicos.length;
}

const prazoProducao = (dataFim) => (dataFim ? new Date(dataFim + 'T18:00:00-03:00').toISOString() : null);



const MSG_AREA_TAREFA_SEM_MIGRATION = `A tarefa de Redes · Produção ainda não pode ser gravada: falta aplicar a migration ${MIGRATION_AREA_TAREFA}.`;


async function criarTarefa({ card, itens, extras, userId }) {
  const { data: novo, error } = await supabase.from('marketing_kanban_cards').insert({
    origem: 'interna', estado: 'backlog', visibilidade: 'equipe',
    ...card, ...extras,
    data_inicio: L.dataSP(new Date()),
    prazo_producao: prazoProducao(card.data_fim),
    criado_por: userId,
  }).select(CARD_COLS).single();
  if (error) throw error;
  const { error: eItens } = await supabase.from('marketing_card_checklist')
    .insert(itens.map(i => ({ ...i, card_id: novo.id, feito: false })));
  if (eItens) {
    await supabase.from('marketing_kanban_cards').update({ deleted_at: new Date().toISOString() }).eq('id', novo.id);
    throw eItens;
  }
  return novo;
}


router.post('/pendentes/:campanhaId/alocar', authorizeModule('marketing', 1), async (req, res) => {
  try {
    if (!(await exigirLider(req, res))) return;
    const v = A.validarNovaTarefa(req.body, { modo: 'pendente' });
    if (v.erro) return res.status(400).json({ error: v.erro });
    if (!(await membrosAtivos([v.card.atribuido_a, ...v.itens.map(i => i.membro_id)]))) {
      return res.status(400).json({ error: 'Alguém escolhido não está ativo na equipe do Marketing' });
    }


    let { data: camp, error: eCamp } = await supabase.from('marketing_campanhas')
      .update({ status: 'ativa', triada_por: req.user.userId, prazo_entrega: v.prazo_entrega, updated_at: new Date().toISOString() })
      .eq('id', req.params.campanhaId).eq('status', 'triagem').is('deleted_at', null)
      .select('id, titulo, status, solicitacao_id, solicitante_id, prazo_entrega').maybeSingle();
    if (eCamp) throw eCamp;
    const saiuDaTriagem = !!camp;
    if (!camp) {


      const { data: ativa, error: eAtiva } = await supabase.from('marketing_campanhas')
        .select('id, titulo, status, solicitacao_id, solicitante_id, prazo_entrega')
        .eq('id', req.params.campanhaId).eq('status', 'ativa').is('deleted_at', null).maybeSingle();
      if (eAtiva) throw eAtiva;
      if (ativa) {
        const { count, error: eCont } = await supabase.from('marketing_kanban_cards')
          .select('id', { count: 'exact', head: true }).eq('campanha_id', ativa.id).is('deleted_at', null);
        if (eCont) throw eCont;
        if (!count) camp = ativa;
      }
    }
    if (!camp) return res.status(409).json({ error: 'Este pedido não está mais esperando alocação (já foi alocado ou removido)' });
    if (!saiuDaTriagem && v.prazo_entrega !== camp.prazo_entrega) {
      const { error: ePrazo } = await supabase.from('marketing_campanhas')
        .update({ prazo_entrega: v.prazo_entrega, updated_at: new Date().toISOString() }).eq('id', camp.id);
      if (ePrazo) throw ePrazo;
      camp = { ...camp, prazo_entrega: v.prazo_entrega };
    }

    let card;
    try {
      card = await criarTarefa({ card: v.card, itens: v.itens, extras: { campanha_id: camp.id }, userId: req.user.userId });
    } catch (e) {

      if (saiuDaTriagem) {
        await supabase.from('marketing_campanhas')
          .update({ status: 'triagem', triada_por: null, triada_em: null, prazo_entrega: null }).eq('id', camp.id);
      }
      throw e;
    }
    await avisarAtribuidos(card, [card.atribuido_a, ...v.itens.map(i => i.membro_id)]);
    await avisarPrazoAjustado(camp);
    res.status(201).json({ ok: true, card_id: card.id });
  } catch (e) {
    console.error('[MARKETING-LINHA] alocar:', e.message);
    res.status(500).json({ error: 'Não foi possível alocar o pedido', detalhe: e.message });
  }
});


router.post('/tarefas', authorizeModule('marketing', 1), async (req, res) => {
  try {
    if (!(await exigirLider(req, res))) return;
    const v = A.validarNovaTarefa(req.body, { modo: 'interna' });
    if (v.erro) return res.status(400).json({ error: v.erro });

    const va = L.validarAreaTarefa(req.body?.area);
    if (va.erro) return res.status(400).json({ error: va.erro });
    if (!(await membrosAtivos([v.card.atribuido_a, ...v.itens.map(i => i.membro_id)]))) {
      return res.status(400).json({ error: 'Alguém escolhido não está ativo na equipe do Marketing' });
    }
    let card;
    try {
      card = await criarTarefa({ card: v.card, itens: v.itens, extras: va.area ? { area: va.area } : {}, userId: req.user.userId });
    } catch (e) {
      if (va.area && ehColunaAusente(e)) return res.status(409).json({ error: MSG_AREA_TAREFA_SEM_MIGRATION });
      throw e;
    }
    await avisarAtribuidos(card, [card.atribuido_a, ...v.itens.map(i => i.membro_id)]);
    res.status(201).json({ ok: true, card_id: card.id });
  } catch (e) {
    console.error('[MARKETING-LINHA] nova tarefa:', e.message);
    res.status(500).json({ error: 'Não foi possível criar a tarefa', detalhe: e.message });
  }
});


router.patch('/tarefas/:id', authorizeModule('marketing', 1), async (req, res) => {
  try {
    if (!(await exigirLider(req, res))) return;
    const { data: card, error: eCard } = await supabase.from('marketing_kanban_cards')
      .select(CARD_COLS).eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (eCard) throw eCard;
    if (!card) return res.status(404).json({ error: 'Tarefa não encontrada' });
    const { data: itensAtuais, error: eIt } = await supabase.from('marketing_card_checklist')
      .select(ITEM_COLS).eq('card_id', card.id);
    if (eIt) throw eIt;
    let camp = null;
    if (card.campanha_id) {
      const { data, error } = await supabase.from('marketing_campanhas')
        .select('id, titulo, solicitacao_id, solicitante_id, prazo_entrega').eq('id', card.campanha_id).maybeSingle();
      if (error) throw error;
      camp = data;
    }
    if (req.body?.prazo_entrega !== undefined && !camp) {
      return res.status(400).json({ error: 'Só pedido do formulário tem entrega final' });
    }

    const v = A.validarEdicao(req.body, {
      itens: itensAtuais || [], atribuido_a: card.atribuido_a,
      prazo_entrega: camp?.prazo_entrega ? L.dataSP(camp.prazo_entrega) : null,
    });
    if (v.erro) return res.status(400).json({ error: v.erro });


    const va = L.validarAreaTarefa(req.body?.area);
    if (va.erro) return res.status(400).json({ error: va.erro });
    if (!va.ausente && !L.ehTarefaInterna(card)) {
      return res.status(400).json({ error: 'Só demanda interna troca entre Requisições e Redes · Produção' });
    }
    const pessoas = [v.card.atribuido_a, ...v.atualizar.map(a => a.campos.membro_id), ...v.novos.map(n => n.membro_id)];
    if (!(await membrosAtivos(pessoas))) {
      return res.status(400).json({ error: 'Alguém escolhido não está ativo na equipe do Marketing' });
    }



    if (!va.ausente) {
      const { error: eArea } = await supabase.from('marketing_kanban_cards')
        .update({ area: va.area, atualizado_por: req.user.userId }).eq('id', card.id);
      if (eArea) {
        if (ehColunaAusente(eArea)) return res.status(409).json({ error: MSG_AREA_TAREFA_SEM_MIGRATION });
        throw eArea;
      }
    }

    const estadoAntes = card.estado;
    if (Object.keys(v.card).length) {
      const upd = { ...v.card, atualizado_por: req.user.userId };
      if (v.card.data_fim !== undefined) upd.prazo_producao = prazoProducao(v.card.data_fim);
      const { error } = await supabase.from('marketing_kanban_cards').update(upd).eq('id', card.id);
      if (error) throw error;
    }
    for (const a of v.atualizar) {
      if (!Object.keys(a.campos).length) continue;
      const { error } = await supabase.from('marketing_card_checklist').update(a.campos).eq('id', a.id).eq('card_id', card.id);
      if (error) throw error;
    }
    if (v.novos.length) {
      const base = Math.max(-1, ...(itensAtuais || []).map(i => i.ordem ?? 0)) + 1;
      const { error } = await supabase.from('marketing_card_checklist')
        .insert(v.novos.map((n, k) => ({ ...n, card_id: card.id, feito: false, ordem: base + k })));
      if (error) throw error;
    }
    if (v.remover.length) {
      const { error } = await supabase.from('marketing_card_checklist').delete().in('id', v.remover).eq('card_id', card.id);
      if (error) throw error;

      await avisarSeChecklistConcluiu(card.id, estadoAntes);
    }
    if (v.prazo_entrega !== undefined && camp) {
      const { data: c2, error } = await supabase.from('marketing_campanhas')
        .update({ prazo_entrega: v.prazo_entrega, updated_at: new Date().toISOString() })
        .eq('id', camp.id).select('id, titulo, solicitacao_id, solicitante_id, prazo_entrega').single();
      if (error) throw error;
      if (L.dataSP(camp.prazo_entrega) !== v.prazo_entrega) await avisarPrazoAjustado(c2);
    }


    const antes = new Set([card.atribuido_a, ...(itensAtuais || []).map(i => i.membro_id)].filter(Boolean));
    const entraram = pessoas.filter(p => p && !antes.has(p));
    if (entraram.length) await avisarAtribuidos({ ...card, ...v.card }, entraram);
    res.json({ ok: true });
  } catch (e) {
    console.error('[MARKETING-LINHA] editar tarefa:', e.message);
    res.status(500).json({ error: 'Não foi possível salvar a tarefa', detalhe: e.message });
  }
});








const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOL_COLS = [
  'id', 'titulo', 'descricao', 'status', 'categoria', 'data_necessaria', 'created_at', 'concluido_em',
  'solicitante_id', 'area_cliente', 'eh_urgente', 'justificativa_urgencia', 'nps_nota', 'nps_comentario',
  'aprovacao_origem_status', 'aprovacao_origem_em', 'observacoes',
].join(', ');
const CAMP_COLS = 'id, titulo, dor_descricao, publico_alvo, status, prazo_entrega, triada_em, concluida_em, sugerido_membro_id, solicitacao_id, solicitante_id, created_at';
const CARD_GESTAO_COLS = `${CARD_COLS}, entregue_em, tem_revisao, motivo_revisao`;



async function lerSolicitacaoMarketing(id) {
  if (!UUID_RE.test(String(id || ''))) return null;
  const { data: sol, error } = await supabase.from('solicitacoes').select(SOL_COLS)
    .eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!sol || sol.categoria !== 'marketing') return null;
  const { data: camps, error: eC } = await supabase.from('marketing_campanhas').select(CAMP_COLS)
    .eq('solicitacao_id', sol.id).is('deleted_at', null).order('created_at', { ascending: false });
  if (eC) throw eC;
  const lista = camps || [];

  const campanha = lista.find(c => c.status !== 'cancelada') || lista[0] || null;
  const campIds = lista.map(c => c.id);
  let q = supabase.from('marketing_kanban_cards').select(CARD_GESTAO_COLS).is('deleted_at', null);
  q = campIds.length ? q.or(`solicitacao_id.eq.${sol.id},campanha_id.in.(${campIds.join(',')})`) : q.eq('solicitacao_id', sol.id);
  const { data: cards, error: eK } = await q.order('created_at');
  if (eK) throw eK;
  return { sol, campanha, cards: cards || [] };
}

router.get('/solicitacoes/:id', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const ctx = await contextoSubtarefa(req);
    const lido = await lerSolicitacaoMarketing(req.params.id);
    if (!lido) return res.status(404).json({ error: 'Solicitação não encontrada' });
    const { sol, campanha, cards } = lido;

    const itens = await lerEmLotes('marketing_card_checklist', ITEM_COLS, 'card_id', cards.map(c => c.id));
    const itensPorCard = {};
    for (const i of itens) (itensPorCard[i.card_id] ||= []).push(i);
    for (const k of Object.keys(itensPorCard)) itensPorCard[k].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));



    const tarefas = [];
    for (const c of cards) {
      const recorte = L.recortarCard({ card: c, itens: itensPorCard[c.id] || [], ctx, responsaveisDoCulto: [] });
      if (!recorte) continue;
      tarefas.push({
        id: c.id, frente: 'sis', titulo: c.titulo, descricao: c.descricao, estado: c.estado, culto: c.culto,
        visibilidade: c.visibilidade || 'equipe', prioridade: c.prioridade, atribuido_a: c.atribuido_a,
        prazo: L.prazoDoCard(c), papel: recorte.papel,
        aberta: L.tarefaAberta({ estado: c.estado, papel: recorte.papel, itens: recorte.itens }),
        entrega_final: campanha?.prazo_entrega || null,
        entregue_em: c.entregue_em || null, concluido_em: c.concluido_em || null,
        tem_revisao: !!c.tem_revisao, motivo_revisao: c.motivo_revisao || null,
        itens: recorte.itens, pode_criar_item: podeCriarItem(c, recorte.papel, ctx),
        solicitacao_id: sol.id, solicitacao_status: sol.status,
        origem_req: 'externa', tem_entrega_final: !!c.campanha_id,
      });
    }
    if (!ctx.lider && !tarefas.length) {
      return res.status(403).json({ error: 'Esta solicitação não está entre as suas tarefas' });
    }

    const { data: prof, error: eP } = sol.solicitante_id
      ? await supabase.from('profiles').select('name').eq('id', sol.solicitante_id).maybeSingle()
      : { data: null, error: null };
    if (eP) throw eP;

    const etapa = GS.etapaDaSolicitacao({ solicitacao: sol, campanha, cards });
    const acoes = GS.acoesPermitidas({ etapa, lider: ctx.lider, campanha, cards });
    res.json({
      solicitacao: {
        id: sol.id, titulo: sol.titulo, descricao: sol.descricao, status: sol.status,
        data_necessaria: L.dataSP(sol.data_necessaria) || null, created_at: sol.created_at,
        concluido_em: sol.concluido_em, solicitante: prof?.name || null, area: sol.area_cliente || null,
        eh_urgente: !!sol.eh_urgente, justificativa_urgencia: sol.justificativa_urgencia || null,
        nps_nota: sol.nps_nota ?? null, nps_comentario: sol.nps_comentario || null,
      },
      campanha: campanha ? {
        id: campanha.id, status: campanha.status, titulo: campanha.titulo, dor_descricao: campanha.dor_descricao,
        publico_alvo: campanha.publico_alvo, prazo_entrega: L.dataSP(campanha.prazo_entrega) || null,
        triada_em: campanha.triada_em, sugerido_membro_id: campanha.sugerido_membro_id || null,
      } : null,
      tarefas,
      etapa,
      etapa_rotulo: GS.ETAPAS[etapa]?.rotulo || etapa,
      acoes: acoes.map(a => ({ acao: a, descricao: GS.ACOES[a] })),
      linha_do_tempo: GS.linhaDoTempo({ solicitacao: sol, campanha, cards }),
      subtarefas_abertas: GS.subtarefasAbertas(tarefas),
      lider: ctx.lider,
    });
  } catch (e) {
    console.error('[MARKETING-LINHA] solicitação:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar a solicitação', detalhe: e.message });
  }
});

router.post('/solicitacoes/:id/acao', authorizeModule('marketing', 1), async (req, res) => {
  try {
    if (!(await exigirLider(req, res))) return;
    const v = GS.validarAcao(req.body);
    if (v.erro) return res.status(400).json({ error: v.erro });
    if (v.acao === 'alocar') return res.status(400).json({ error: 'Alocar é pelo editor do pedido' });
    const lido = await lerSolicitacaoMarketing(req.params.id);
    if (!lido) return res.status(404).json({ error: 'Solicitação não encontrada' });
    const { sol, campanha, cards } = lido;


    const etapa = GS.etapaDaSolicitacao({ solicitacao: sol, campanha, cards });
    if (!GS.acoesPermitidas({ etapa, lider: true, campanha, cards }).includes(v.acao)) {
      return res.status(409).json({
        error: `Esta ação não vale mais: a solicitação está em "${GS.ETAPAS[etapa]?.rotulo || etapa}". Recarregue.`,
        etapa,
      });
    }
    const agora = new Date().toISOString();
    const userId = req.user.userId;
    let afetadas = 0;

    if (v.acao === 'entregar') {



      for (const c of cards.filter(x => x.estado !== 'concluido')) {
        const { data: upd, error } = await supabase.from('marketing_kanban_cards')
          .update({ estado: 'concluido', atualizado_por: userId })
          .eq('id', c.id).neq('estado', 'concluido').is('deleted_at', null)
          .select('id, campanha_id, solicitacao_id').maybeSingle();
        if (error) throw error;
        if (!upd) continue;
        afetadas += 1;
        await carimbarEntrega(upd.id);
        await avisarEntregue(upd, { solicitante_id: sol.solicitante_id, titulo_solicitacao: sol.titulo });
      }
    } else if (v.acao === 'reabrir') {
      for (const c of cards.filter(x => x.estado === 'concluido')) {
        const { data: upd, error } = await supabase.from('marketing_kanban_cards')
          .update({ estado: 'producao', atualizado_por: userId })
          .eq('id', c.id).eq('estado', 'concluido').is('deleted_at', null).select('id').maybeSingle();
        if (error) throw error;
        if (upd) afetadas += 1;
      }
    } else if (v.acao === 'encerrar') {
      const r = await concluirSolicitacaoMarketing({
        campanha, solicitacao: sol, cards,
        porCoordenacao: sol.solicitante_id !== userId, observacao: v.observacao,
      });
      afetadas = r.solicitacao_concluida ? 1 : 0;
    } else if (v.acao === 'fechar_tarefa') {




      const quando = sol.concluido_em || agora;
      for (const c of cards.filter(x => x.estado !== 'concluido')) {
        const { data: upd, error } = await supabase.from('marketing_kanban_cards')
          .update({ estado: 'concluido', atualizado_por: userId, ...(c.entregue_em ? {} : { entregue_em: quando }) })
          .eq('id', c.id).neq('estado', 'concluido').is('deleted_at', null).select('id').maybeSingle();
        if (error) throw error;
        if (upd) afetadas += 1;
      }
      if (campanha && !['concluida', 'cancelada'].includes(campanha.status)) {
        const { error } = await supabase.from('marketing_campanhas')
          .update({ status: 'concluida', updated_at: agora }).eq('id', campanha.id).neq('status', 'concluida');
        if (error) throw error;
      }
    } else if (v.acao === 'recusar') {

      const nota = `Recusada pelo Marketing em ${L.dataSP(new Date()).split('-').reverse().join('/')}: ${v.motivo}`;
      const { data: s2, error } = await supabase.from('solicitacoes')
        .update({ status: 'rejeitado', observacoes: [sol.observacoes, nota].filter(Boolean).join('\n\n') })
        .eq('id', sol.id).not('status', 'in', '("concluido","avaliado","rejeitado","cancelado")')
        .select('id, titulo, solicitante_id').maybeSingle();
      if (error) throw error;
      if (!s2) return res.status(409).json({ error: 'A solicitação mudou de status enquanto isso. Recarregue.' });
      afetadas = 1;
      if (campanha && ['triagem', 'ativa'].includes(campanha.status)) {
        const { error: eC } = await supabase.from('marketing_campanhas')
          .update({ status: 'cancelada', updated_at: agora }).eq('id', campanha.id).in('status', ['triagem', 'ativa']);
        if (eC) throw eC;
      }
      if (s2.solicitante_id) {
        await notificar({
          modulo: 'marketing', tipo: 'solicitacao_status',
          titulo: `Solicitação não atendida: ${s2.titulo}`,
          mensagem: `O Marketing não vai atender este pedido — "${v.motivo}"`,
          link: '/solicitacoes', severidade: 'alta',
          chaveDedup: `solicitacao_status_${s2.id}_rejeitado`, targetIds: [s2.solicitante_id],
        }).catch(err => console.error('[MARKETING-LINHA] notify recusa:', err.message));
      }
    }
    res.json({ ok: true, acao: v.acao, afetadas });
  } catch (e) {
    console.error('[MARKETING-LINHA] ação na solicitação:', e.message);
    res.status(500).json({ error: 'Não foi possível concluir a ação', detalhe: e.message });
  }
});








async function compromissosDePlanejamento() {
  const { data, error } = await supabase.from('marketing_compromissos_recorrentes')
    .select('id, semana_do_mes, responsavel_execucao_membro_id')
    .eq('tipo', 'planejamento_postagens').eq('ativo', true).is('deleted_at', null);
  if (error) {
    if (ehColunaAusente(error)) return null;
    throw error;
  }
  const ids = (data || []).map(c => c.id);
  const parts = ids.length ? await lerEmLotes('marketing_recorrentes_participantes', 'compromisso_id, membro_id', 'compromisso_id', ids) : [];
  return (data || []).map(c => ({ ...c, participantes_ids: parts.filter(p => p.compromisso_id === c.id).map(p => p.membro_id) }));
}


async function lerPlano(mes) {
  const { data: plano, error } = await supabase.from('marketing_redes_planos').select('*')
    .eq('mes', `${mes}-01`).is('deleted_at', null).maybeSingle();
  if (error) {
    if (ehTabelaAusente(error)) return null;
    throw error;
  }
  if (!plano) return { plano: null, posts: [] };
  const { data: posts, error: eP } = await supabase.from('marketing_redes_plano_posts').select('*')
    .eq('plano_id', plano.id).order('semana').order('ordem');
  if (eP) throw eP;
  return { plano, posts: posts || [] };
}

async function podeEditarPlano(req, comps) {
  const ctx = await contextoSubtarefa(req);
  const participantes = new Set((comps || []).flatMap(c => c.participantes_ids));
  return { ctx, pode: ctx.lider || ctx.meusMembroIds.some(id => participantes.has(id)) };
}

const postParaTela = (p) => ({
  id: p.id, semana: p.semana, ordem: p.ordem, dia_provavel: p.dia_provavel, nome: p.nome,
  ref_url: p.ref_url || '', descricao: p.descricao || '', responsavel_membro_id: p.responsavel_membro_id,
  ref_arquivos: Array.isArray(p.ref_arquivos) ? p.ref_arquivos : [],
});

router.get('/redes/planos/:mes', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { mes } = req.params;
    if (!RP.mesValido(mes)) return res.status(400).json({ error: 'Mês inválido' });
    const comps = await compromissosDePlanejamento();
    const lido = comps === null ? null : await lerPlano(mes);
    if (comps === null || lido === null) return res.status(409).json({ error: `Falta aplicar a migration ${MIGRATION_REDES}.` });
    const { pode } = await podeEditarPlano(req, comps);
    const padrao = lido.plano?.responsavel_membro_id
      || comps.find(c => c.responsavel_execucao_membro_id)?.responsavel_execucao_membro_id || null;
    res.json({
      mes, nome_mes: RP.nomeDoMes(mes),
      semanas: RP.semanasDoMes(mes).map(s => ({ ...s, producao: RP.semanaDeProducao(mes, s.n) })),
      plano: lido.plano ? { id: lido.plano.id, gerado_em: lido.plano.gerado_em, updated_at: lido.plano.updated_at } : null,
      responsavel_membro_id: padrao,
      posts: lido.plano ? lido.posts.map(postParaTela) : RP.planoEmBranco(mes, padrao),
      pode_editar: pode,
    });
  } catch (e) {
    console.error('[MARKETING-LINHA] plano get:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar o planejamento', detalhe: e.message });
  }
});

router.post('/redes/planos/:mes/ref/sessao', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { mes } = req.params;
    if (!RP.mesValido(mes)) return res.status(400).json({ error: 'Mês inválido' });
    if (!SE.sharepointPronto()) return res.status(503).json({ error: 'O SharePoint não está configurado neste servidor.' });
    const comps = await compromissosDePlanejamento();
    if (comps === null) return res.status(409).json({ error: `Falta aplicar a migration ${MIGRATION_REDES}.` });
    if (!(await podeEditarPlano(req, comps)).pode) {
      return res.status(403).json({ error: 'Só quem faz o planejamento de postagens ou o líder do Marketing envia referências.' });
    }
    const v = E.validarArquivo({ nome: req.body?.nome_arquivo, tamanho: req.body?.tamanho_bytes });
    if (!v.ok) return res.status(400).json({ error: v.erro });
    const { driveId } = await SE.destinoDosArquivos();
    const pasta = E.pastaDaEntrega({ tipo: 'planejamento', mes }).pasta;
    const nomeArquivo = E.nomeDoArquivo(req.body.nome_arquivo, []);
    const { uploadUrl } = await SE.criarSessaoDeEnvio({ driveId, pasta, nomeArquivo });
    res.json({ upload_url: uploadUrl, drive_id: driveId, pasta, nome_arquivo: nomeArquivo });
  } catch (e) {
    console.error('[MARKETING-LINHA] plano ref sessao:', e.message);
    res.status(500).json({ error: 'Não foi possível abrir o envio do arquivo', detalhe: e.message });
  }
});

router.put('/redes/planos/:mes', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { mes } = req.params;
    if (!RP.mesValido(mes)) return res.status(400).json({ error: 'Mês inválido' });
    const comps = await compromissosDePlanejamento();
    const lido = comps === null ? null : await lerPlano(mes);
    if (comps === null || lido === null) return res.status(409).json({ error: `Falta aplicar a migration ${MIGRATION_REDES}.` });
    const { ctx, pode } = await podeEditarPlano(req, comps);
    if (!pode) return res.status(403).json({ error: 'Só quem faz o planejamento de postagens ou o líder do Marketing salva o planejamento.' });

    const v = RP.validarPlano(req.body || {}, { mes });
    if (!v.ok) return res.status(400).json({ error: v.erro });
    if (!v.posts.length) return res.status(400).json({ error: 'O planejamento não tem nenhuma postagem.' });
    if (!(await membrosAtivos([v.responsavel_membro_id, ...v.posts.map(p => p.responsavel_membro_id)]))) {
      return res.status(400).json({ error: 'Alguém escolhido não está ativo na equipe do Marketing' });
    }
    const antigos = new Map(lido.posts.map(p => [p.id, p]));
    if (v.posts.some(p => p.id && !antigos.has(p.id))) return res.status(400).json({ error: 'Postagem que não é deste planejamento.' });



    const pasta = E.pastaDaEntrega({ tipo: 'planejamento', mes }).pasta;
    let driveId = null;
    const refsNovas = [];
    for (const p of v.posts) {
      const { manter, conferir } = RP.separarRefs(p.ref_arquivos, p.id ? antigos.get(p.id).ref_arquivos : []);
      const novos = [];
      for (const r of conferir) {
        driveId ||= (await SE.destinoDosArquivos()).driveId;
        const sp = r.drive_id === driveId ? await SE.lerItemDoDrive({ driveId, itemId: r.sharepoint_item_id }) : null;
        if (!sp || !E.itemNaPasta({ driveItem: sp, driveId, pasta })) {
          return res.status(409).json({ error: `Semana ${p.semana} · ${p.nome}: um arquivo de referência não está na pasta do planejamento. Envie de novo por aqui.` });
        }
        novos.push({ nome: sp.name, web_url: sp.webUrl, item_id: sp.id });
        refsNovas.push(sp);
      }
      p.ref_arquivos = [...manter, ...novos];
    }

    const agora = new Date().toISOString();

    let plano = lido.plano;
    const compId = (comps.find(c => c.participantes_ids.some(id => ctx.meusMembroIds.includes(id))) || comps[0] || {}).id || null;
    if (!plano) {
      const { data, error } = await supabase.from('marketing_redes_planos').insert({
        mes: `${mes}-01`, compromisso_id: compId, responsavel_membro_id: v.responsavel_membro_id,
        created_by: req.user.userId, updated_by: req.user.userId,
      }).select('*').single();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Outra pessoa acabou de salvar este planejamento. Abra de novo.' });
        throw error;
      }
      plano = data;
    } else {
      const { error } = await supabase.from('marketing_redes_planos')
        .update({ responsavel_membro_id: v.responsavel_membro_id, updated_by: req.user.userId, updated_at: agora })
        .eq('id', plano.id);
      if (error) throw error;
    }


    const salvos = [];
    for (const p of v.posts) {
      const campos = {
        semana: p.semana, ordem: p.ordem, dia_provavel: p.dia_provavel, nome: p.nome, ref_url: p.ref_url,
        ref_arquivos: p.ref_arquivos, descricao: p.descricao, responsavel_membro_id: p.responsavel_membro_id, updated_at: agora,
      };
      if (p.id) {
        const { data, error } = await supabase.from('marketing_redes_plano_posts').update(campos)
          .eq('id', p.id).eq('plano_id', plano.id).select('*').single();
        if (error) throw error;
        salvos.push(data);
      } else {
        const { data, error } = await supabase.from('marketing_redes_plano_posts')
          .insert({ ...campos, plano_id: plano.id }).select('*').single();
        if (error) throw error;
        salvos.push(data);
      }
    }


    const ficaram = new Set(salvos.map(p => p.id));
    for (const p of lido.posts.filter(x => !ficaram.has(x.id))) {
      for (const sub of [p.subtarefa_producao_id, p.subtarefa_postagem_id].filter(Boolean)) {
        const { error } = await supabase.from('marketing_card_checklist').delete().eq('id', sub).eq('feito', false);
        if (error) throw error;
      }
      const { error } = await supabase.from('marketing_redes_plano_posts').delete().eq('id', p.id);
      if (error) throw error;
    }


    const desejado = RP.tarefasDoPlano({ mes, posts: salvos, responsavel_membro_id: v.responsavel_membro_id });
    const { data: links, error: eL } = await supabase.from('marketing_redes_plano_cards').select('*').eq('plano_id', plano.id);
    if (eL) throw eL;
    const cardsLig = links?.length ? await lerEmLotes('marketing_kanban_cards', 'id, estado, deleted_at', 'id', links.map(l => l.card_id)) : [];
    const cardPorId = new Map(cardsLig.map(c => [c.id, c]));
    const linkPor = new Map((links || []).map(l => [`${l.semana}|${l.etapa}`, l]));
    const subIds = salvos.flatMap(p => [p.subtarefa_producao_id, p.subtarefa_postagem_id]).filter(Boolean);
    const subs = subIds.length ? await lerEmLotes('marketing_card_checklist', 'id, card_id, feito', 'id', subIds) : [];
    const subPorId = new Map(subs.map(s => [s.id, s]));
    let criados = 0;
    let atualizados = 0;
    const usados = new Set();
    for (const d of desejado) {
      const chave = `${d.semana}|${d.etapa}`;
      usados.add(chave);
      const link = linkPor.get(chave);
      let card = link ? cardPorId.get(link.card_id) : null;
      if (card && card.deleted_at) card = null;
      const camposCard = {
        titulo: d.titulo, descricao: d.descricao, atribuido_a: d.atribuido_a,
        data_inicio: d.data_inicio, data_fim: d.data_fim, prazo_producao: prazoProducao(d.data_fim),
      };
      if (!card) {
        const { data: novo, error } = await supabase.from('marketing_kanban_cards').insert({
          origem: 'interna', estado: 'backlog', visibilidade: 'equipe', area: 'redes', prioridade: 'normal',
          ...camposCard, criado_por: req.user.userId,
        }).select('id, estado').single();
        if (error) {
          if (ehColunaAusente(error)) return res.status(409).json({ error: MSG_AREA_TAREFA_SEM_MIGRATION });
          throw error;
        }
        card = novo;
        criados += 1;
        const { error: eLink } = await supabase.from('marketing_redes_plano_cards')
          .upsert({ plano_id: plano.id, semana: d.semana, etapa: d.etapa, card_id: card.id }, { onConflict: 'plano_id,semana,etapa' });
        if (eLink) throw eLink;
      } else if (card.estado !== 'concluido') {
        const { error } = await supabase.from('marketing_kanban_cards').update({ ...camposCard, updated_at: agora }).eq('id', card.id);
        if (error) throw error;
        atualizados += 1;
      }
      let ganhouAberta = false;
      for (const it of d.itens) {
        const coluna = d.etapa === 'producao' ? 'subtarefa_producao_id' : 'subtarefa_postagem_id';
        const sub = it.post[coluna] ? subPorId.get(it.post[coluna]) : null;
        const camposSub = { texto: it.texto, membro_id: it.membro_id, prazo: it.prazo };
        if (sub && sub.feito) continue;
        if (sub) {
          const { error } = await supabase.from('marketing_card_checklist')
            .update({ ...camposSub, card_id: card.id, updated_at: agora }).eq('id', sub.id).eq('feito', false);
          if (error) throw error;
          if (sub.card_id !== card.id) ganhouAberta = true;
        } else {
          const { data: nova, error } = await supabase.from('marketing_card_checklist')
            .insert({ ...camposSub, card_id: card.id, feito: false }).select('id').single();
          if (error) throw error;
          const { error: eP } = await supabase.from('marketing_redes_plano_posts').update({ [coluna]: nova.id }).eq('id', it.post.id);
          if (eP) throw eP;
          ganhouAberta = true;
        }
      }

      if (ganhouAberta && card.estado === 'concluido') {
        const { error } = await supabase.from('marketing_kanban_cards').update({ estado: 'producao', updated_at: agora }).eq('id', card.id);
        if (error) throw error;
      }
    }


    for (const [chave, link] of linkPor) {
      if (usados.has(chave)) continue;
      const card = cardPorId.get(link.card_id);
      if (!card || card.deleted_at || card.estado === 'concluido') continue;
      const { count, error } = await supabase.from('marketing_card_checklist')
        .select('id', { count: 'exact', head: true }).eq('card_id', card.id);
      if (error) throw error;
      if (!count) {
        const { error: eDel } = await supabase.from('marketing_kanban_cards').update({ deleted_at: agora }).eq('id', card.id);
        if (eDel) throw eDel;
        const { error: eLk } = await supabase.from('marketing_redes_plano_cards').delete()
          .eq('plano_id', plano.id).eq('semana', link.semana).eq('etapa', link.etapa);
        if (eLk) throw eLk;
      }
    }


    const semanasAnt = RP.semanasDoMes(RP.mesAnterior(mes));
    for (const c of comps) {
      const alvo = Number(c.semana_do_mes);
      const sem = alvo > 0 ? semanasAnt[alvo - 1] : semanasAnt[semanasAnt.length + alvo];
      if (!sem) continue;
      const linhas = c.participantes_ids.map(m => ({ compromisso_id: c.id, membro_id: m, semana_inicio: sem.inicio, concluido_por: req.user.userId }));
      if (!linhas.length) continue;
      const { error } = await supabase.from('marketing_rotina_execucoes')
        .upsert(linhas, { onConflict: 'compromisso_id,membro_id,semana_inicio', ignoreDuplicates: true });
      if (error && !ehTabelaAusente(error)) throw error;
    }
    const { error: eG } = await supabase.from('marketing_redes_planos').update({ gerado_em: agora }).eq('id', plano.id);
    if (eG) throw eG;



    let aviso = null;
    for (const sp of refsNovas) {
      const { error: eArq } = await supabase.from(SE.TABELA).insert({
        origem: 'planejamento', plano_id: plano.id, nome_arquivo: sp.name, tipo_mime: sp.file?.mimeType || null,
        tamanho_bytes: Number(sp.size) || 0, drive_id: driveId, sharepoint_item_id: sp.id, web_url: sp.webUrl,
        pasta, enviado_por: req.user.userId,
      });
      if (eArq && eArq.code !== '23505') {
        console.error('[MARKETING-LINHA] referência na página Arquivos:', eArq.message);
        aviso = (eArq.code === '23514' || SE.ehColunaAusente(eArq))
          ? `O planejamento foi salvo, mas as referências só entram na página Arquivos depois da migration ${SE.MIGRATION_ARQUIVOS}.`
          : 'O planejamento foi salvo, mas as referências não entraram na página Arquivos.';
        break;
      }
    }
    res.json({ ok: true, plano_id: plano.id, postagens: salvos.length, cards_criados: criados, cards_atualizados: atualizados, ...(aviso ? { aviso } : {}) });
  } catch (e) {
    console.error('[MARKETING-LINHA] plano salvar:', e.message);
    res.status(500).json({ error: 'Não foi possível salvar o planejamento', detalhe: e.message });
  }
});

module.exports = router;

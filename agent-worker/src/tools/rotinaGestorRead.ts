









import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { supabase } from "../supabase.js";



import {
  hojeBRT,
  diaDaSemanaBRT,
  somarDias,
  blocoDoDia,
  tituloDoBloco,
  proximaQuarta,
  ehUltimaSextaDoMes,
  NOME_DO_DIA,
} from "../utils/rotinaDia.js";

export { hojeBRT, diaDaSemanaBRT, blocoDoDia, proximaQuarta, ehUltimaSextaDoMes };
export type { BlocoDaRotina } from "../utils/rotinaDia.js";

const ok = (p: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(p, null, 2) }] });
const fail = (m: string) => ({ content: [{ type: "text" as const, text: `ERRO: ${m}` }], isError: true as const });

export const obterDiaDaRotina = tool(
  "obter_dia_da_rotina",
  "Diz que dia é hoje (BRT), qual bloco da rotina roda, qual ritual de governança cai na próxima quarta e se hoje é o fechamento mensal. SEMPRE chamar primeiro.",
  {},
  async () => {
    const hoje = hojeBRT();
    const dow = diaDaSemanaBRT();
    const bloco = blocoDoDia(dow);
    const quarta = proximaQuarta(hoje);





    const { data: reuniaoQuarta, error: eR } = await supabase
      .from("governance_meetings")
      .select("id, date, status, pauta, ata, governance_meeting_types(sigla, nome, semana)")
      .eq("date", quarta)
      .is("deleted_at", null)
      .limit(5);

    return ok({
      hoje,
      dia_semana: NOME_DO_DIA[dow],
      bloco,
      bloco_titulo: tituloDoBloco(bloco),
      fechamento_mensal: ehUltimaSextaDoMes(hoje),
      proxima_quarta: quarta,


      reuniao_da_quarta: eR ? null : (reuniaoQuarta || []),
      reuniao_da_quarta_erro: eR?.message || null,
      sem_reuniao_na_quarta: !eR && (reuniaoQuarta || []).length === 0,
    });
  }
);

export const listarEventosPendentes = tool(
  "listar_eventos_pendentes",
  "PILAR EVENTOS: eventos que vêm aí sem dono, sem data, ou com tarefa de ciclo criativo atrasada.",
  { dias_a_frente: z.number().int().min(7).max(180).default(60), limit: z.number().int().min(1).max(60).default(40) },
  async ({ dias_a_frente, limit }) => {
    const hoje = hojeBRT();
    const limite = somarDias(hoje, dias_a_frente);

    const [evRes, tarefaRes] = await Promise.all([





      supabase
        .from("events")
        .select("id, name, date, status, responsible, category_id")
        .gte("date", hoje)
        .lte("date", limite)
        .not("status", "in", '("concluido","cancelado")')
        .order("date")
        .limit(limit),

      supabase
        .from("cycle_phase_tasks")
        .select("id, titulo, prazo, status, area, responsavel_nome, responsavel_id")
        .lt("prazo", hoje)
        .not("status", "in", '("concluida","cancelada")')
        .order("prazo")
        .limit(limit),
    ]);

    if (evRes.error) return fail(`events: ${evRes.error.message}`);

    const eventos = (evRes.data || []).map((e) => ({
      ...e,





      sem_dono: !e.responsible,
      responsavel_texto: e.responsible || null,
      sem_data: !e.date,
      dias_ate: e.date ? Math.round((new Date(`${e.date}T12:00:00`).getTime() - new Date(`${hoje}T12:00:00`).getTime()) / 86400000) : null,
    }));

    return ok({
      janela: `${hoje} a ${limite} (${dias_a_frente} dias)`,
      total_eventos: eventos.length,
      eventos,
      sem_dono: eventos.filter((e) => e.sem_dono),

      proximos_14d_sem_dono: eventos.filter((e) => e.sem_dono && e.dias_ate !== null && e.dias_ate <= 14),
      tarefas_de_ciclo_atrasadas: tarefaRes.error ? [] : (tarefaRes.data || []),
      tarefas_erro: tarefaRes.error?.message || null,
    });
  }
);

export const listarReunioesPendentes = tool(
  "listar_reunioes_pendentes",
  "PILAR REUNIÕES: reuniões já realizadas sem ata registrada, reuniões próximas sem pauta, e se há transcrição (Plaud) anexada.",
  { dias_atras: z.number().int().min(7).max(180).default(60), limit: z.number().int().min(1).max(60).default(40) },
  async ({ dias_atras, limit }) => {
    const hoje = hojeBRT();
    const desde = somarDias(hoje, -dias_atras);

    const { data: reunioes, error } = await supabase
      .from("governance_meetings")
      .select("id, date, status, pauta, ata, deliberacoes, governance_meeting_types(sigla, nome)")
      .gte("date", desde)
      .lte("date", somarDias(hoje, 21))
      .is("deleted_at", null)
      .order("date", { ascending: false })
      .limit(limit);
    if (error) return fail(`governance_meetings: ${error.message}`);

    const ids = (reunioes || []).map((r) => r.id);


    const { data: docs } = ids.length
      ? await supabase
          .from("governance_meeting_docs")
          .select("meeting_id, tipo, nome_arquivo")
          .in("meeting_id", ids)
          .eq("tipo", "transcricao")
          .is("deleted_at", null)
      : { data: [] as Array<{ meeting_id: string; tipo: string; nome_arquivo: string }> };

    const comTranscricao = new Set((docs || []).map((d) => d.meeting_id));

    const enriquecidas = (reunioes || []).map((r) => ({
      id: r.id,
      data: r.date,
      sigla: (r.governance_meeting_types as any)?.sigla || null,
      nome: (r.governance_meeting_types as any)?.nome || null,
      status: r.status,
      tem_pauta: !!r.pauta,
      tem_ata: !!r.ata,
      tem_deliberacoes_texto: !!r.deliberacoes,
      tem_transcricao: comTranscricao.has(r.id),
      passou: !!r.date && r.date < hoje,
    }));

    return ok({
      janela: `${desde} a ${somarDias(hoje, 21)}`,
      total: enriquecidas.length,
      reunioes: enriquecidas,

      realizadas_sem_ata: enriquecidas.filter((r) => r.passou && r.status !== "cancelada" && !r.tem_ata),


      sem_ata_com_transcricao: enriquecidas.filter((r) => r.passou && !r.tem_ata && r.tem_transcricao),
      proximas_sem_pauta: enriquecidas.filter((r) => !r.passou && r.status !== "cancelada" && !r.tem_pauta),
    });
  }
);

export const listarCompromissos = tool(
  "listar_compromissos",
  "PILAR COMPROMISSOS: deliberações e demandas de reunião em aberto, com idade e degrau de escalonamento (N1/N2/N3).",
  { limit: z.number().int().min(1).max(200).default(120) },
  async ({ limit }) => {
    const hoje = hojeBRT();

    const { data: tasks, error } = await supabase
      .from("governance_tasks")
      .select("id, meeting_id, titulo, responsavel, prazo, status, prioridade, origem, created_at")
      .in("status", ["pendente", "em_andamento"])
      .order("prazo", { ascending: true, nullsFirst: false })
      .limit(limit);
    if (error) return fail(`governance_tasks: ${error.message}`);

    const ids = [...new Set((tasks || []).map((t) => t.meeting_id).filter(Boolean))];
    const { data: mtgs } = ids.length
      ? await supabase
          .from("governance_meetings")
          .select("id, date, governance_meeting_types(sigla)")
          .in("id", ids)
      : { data: [] as any[] };
    const porMtg = Object.fromEntries((mtgs || []).map((m: any) => [m.id, { data: m.date, sigla: m.governance_meeting_types?.sigla || null }]));

    const itens = (tasks || []).map((t) => {
      const atrasoDias = t.prazo
        ? Math.round((new Date(`${hoje}T12:00:00`).getTime() - new Date(`${t.prazo}T12:00:00`).getTime()) / 86400000)
        : null;
      return {
        id: t.id,
        titulo: t.titulo,




        responsavel_texto: t.responsavel || null,
        sem_dono: !t.responsavel,
        prazo: t.prazo,
        sem_prazo: !t.prazo,
        status: t.status,
        prioridade: t.prioridade,



        eh_deliberacao: t.origem === "deliberacao",
        origem: t.origem,
        reuniao: porMtg[t.meeting_id] || null,
        atraso_dias: atrasoDias !== null && atrasoDias > 0 ? atrasoDias : null,
        vence_em_dias: atrasoDias !== null && atrasoDias < 0 ? -atrasoDias : null,
      };
    });

    const deliberacoes = itens.filter((i) => i.eh_deliberacao);
    const vencidas = itens.filter((i) => i.atraso_dias !== null);

    return ok({
      hoje,
      total_em_aberto: itens.length,
      deliberacoes_em_aberto: deliberacoes.length,
      demandas_de_preparo_em_aberto: itens.length - deliberacoes.length,




      escalonamento: {
        n1_no_prazo_ou_vencendo: itens.filter((i) => i.atraso_dias === null),
        n2_vencidas_ate_7d: vencidas.filter((i) => (i.atraso_dias as number) <= 7),
        n3_vencidas_mais_de_7d: vencidas.filter((i) => (i.atraso_dias as number) > 7),
      },
      sem_dono: itens.filter((i) => i.sem_dono),
      sem_prazo: itens.filter((i) => i.sem_prazo),
      itens,
    });
  }
);

export const listarSaudeIndicadores = tool(
  "listar_saude_indicadores",
  "CHECAGEM DE QUALIDADE: KPIs ativos sem dado nos últimos 60 dias, os que calculam NULO, e os sem dono. Base das mensagens de cobrança.",
  { dias: z.number().int().min(15).max(180).default(60) },
  async ({ dias }) => {
    const hoje = hojeBRT();
    const corte = somarDias(hoje, -dias);

    const { data: kpis, error } = await supabase
      .from("kpi_indicadores_taticos")
      .select("id, indicador, area, lider_funcionario_id, periodicidade, tipo_calculo")
      .eq("ativo", true)


      .is("deleted_at", null);
    if (error) return fail(`kpi_indicadores_taticos: ${error.message}`);








    const [regsRes, calcRes] = await Promise.all([
      supabase.from("kpi_registros").select("indicador_id").gte("data_preenchimento", corte),
      supabase.from("kpi_valores_calculados").select("kpi_id, valor_calculado").gte("periodo_referencia", corte),
    ]);

    const fontesOk = !regsRes.error && !calcRes.error;
    const comDado = new Set<string>();
    (regsRes.data || []).forEach((r: any) => comDado.add(r.indicador_id));
    const calculamNulo = new Set<string>();
    (calcRes.data || []).forEach((v: any) => {

      if (v.valor_calculado === null || v.valor_calculado === undefined) calculamNulo.add(v.kpi_id);
      else comDado.add(v.kpi_id);
    });

    const todos = kpis || [];
    const semDadoNenhum = todos.filter((k) => !comDado.has(k.id));
    const semDado = semDadoNenhum.filter((k) => !calculamNulo.has(k.id));
    const nulos = semDadoNenhum.filter((k) => calculamNulo.has(k.id));
    const semDono = todos.filter((k) => !k.lider_funcionario_id);



    const porArea: Record<string, { total: number; sem_dono: number }> = {};
    todos.forEach((k) => {
      const a = String(k.area || "(sem área)").toLowerCase();
      porArea[a] = porArea[a] || { total: 0, sem_dono: 0 };
      porArea[a].total++;
      if (!k.lider_funcionario_id) porArea[a].sem_dono++;
    });
    const areasSemDono = Object.entries(porArea)
      .filter(([, v]) => v.sem_dono > 0)
      .map(([area, v]) => ({ area, ...v, cem_por_cento: v.sem_dono === v.total }))
      .sort((a, b) => b.sem_dono - a.sem_dono);

    return ok({
      janela_dias: dias,
      desde: corte,
      fontes_lidas: ["kpi_registros", "kpi_valores_calculados"],


      incompleto: !fontesOk,
      aviso_incompleto: fontesOk
        ? null
        : `Leitura incompleta (${[regsRes.error && "kpi_registros", calcRes.error && "kpi_valores_calculados"].filter(Boolean).join(", ")}). NÃO cobrar ninguém com estes números.`,
      total_ativos: todos.length,
      sem_dado_nenhum: { total: semDado.length, itens: semDado.slice(0, 40) },



      calculam_nulo: { total: nulos.length, itens: nulos.slice(0, 40) },

      sem_dono: { total: semDono.length, itens: semDono.slice(0, 40) },
      areas_sem_dono: areasSemDono,
    });
  }
);

export const rotinaGestorReadTools = [
  obterDiaDaRotina,
  listarEventosPendentes,
  listarReunioesPendentes,
  listarCompromissos,
  listarSaudeIndicadores,
];
export const rotinaGestorReadToolNames = rotinaGestorReadTools.map((t) => `mcp__rotina__${t.name}`);

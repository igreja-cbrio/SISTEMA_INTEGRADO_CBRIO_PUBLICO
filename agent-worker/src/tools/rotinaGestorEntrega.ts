










import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const Mensagem = z.object({
  para: z.string().describe("Nome de quem recebe, como está cadastrado. NUNCA inventar nome."),
  assunto: z.string().describe("Do que se trata, em 3-6 palavras. Ex: 'KPIs de agosto da Sede'."),
  degrau: z.enum(["N1", "N2", "N3"]).describe("N1 = 1º pedido, tom neutro. N2 = já venceu, nomeado no documento. N3 = vai pro líder da área."),
  texto: z.string().describe("A mensagem pronta pra copiar e colar no WhatsApp. Curta, direta, com o PRAZO explícito. Sem 'espero que esteja bem'."),
  porque: z.string().describe("Por que esta pessoa está sendo cobrada. O fato que sustenta, com número."),
});

const Item = z.object({
  titulo: z.string().describe("Uma frase. O que precisa acontecer."),
  detalhe: z.string().optional().describe("O número, o prazo, o dono — o que sustenta o item."),
  onde: z.string().optional().describe("Onde no sistema se resolve. Ex: '/governanca' ou '/gestao?aba=saude'."),
  dono: z.string().optional().describe("Quem resolve, se houver cadastrado. Sem inventar."),
});

const schema = {
  dia: z.string().describe("Data BRT, YYYY-MM-DD."),
  dia_semana: z.string(),
  bloco: z.enum(["abastecer", "decidir", "fechar", "fora"]).describe("O bloco da rotina que roda hoje."),
  bloco_titulo: z.string(),


  abertura: z.string().describe("Uma frase: o que muda hoje. Com número quando houver."),

  ressalva: z
    .string()
    .optional()
    .describe("Aviso que abre o bloco quando algum número não pode ser lido ao pé da letra (leitura incompleta, fonte que falhou). Vazio se não houver."),

  agora: z.array(Item).max(6).describe("O que fazer HOJE, na ordem. Vazio se o dia estiver limpo — e aí o texto diz isso."),


  eventos: z.array(Item).max(8).default([]).describe("PILAR EVENTOS: sem dono, sem data, tarefa de ciclo atrasada."),
  reunioes: z.array(Item).max(8).default([]).describe("PILAR REUNIÕES: ata em aberto (SLA 24h), pauta faltando."),
  compromissos: z.array(Item).max(10).default([]).describe("PILAR COMPROMISSOS: deliberação vencida, sem dono, sem prazo."),

  mensagens: z
    .array(Mensagem)
    .max(12)
    .default([])
    .describe("Mensagens prontas pra copiar. Só pra quem TEM nome cadastrado. Sem nome, o item vai em `sem_a_quem_cobrar`."),



  sem_a_quem_cobrar: z
    .array(z.string())
    .max(12)
    .default([])
    .describe("Pendências reais sem responsável cadastrado. Diga a ÁREA, pra a cobrança ir ao líder dela."),


  pauta_marketing: z
    .array(z.string())
    .max(6)
    .default([])
    .describe("Só na SEGUNDA. Pauta fixa de 15 min com o Pedro: o que mudou de fase, o que está parado, as 3 coisas da semana, prazo faltando."),
  pauta_sistema: z
    .array(z.string())
    .max(8)
    .default([])
    .describe("Só na SEGUNDA. Novidades a apresentar ao ministerial, no formato 'o que muda na SUA tela · onde clicar · o que preciso que você confirme'."),


  fechamento_mensal: z
    .array(Item)
    .max(6)
    .default([])
    .describe("Só na ÚLTIMA SEXTA do mês: taxa de deliberação cumprida, KPIs que não mediram no mês, ciclo do mês seguinte, retro do processo."),



  taxa_deliberacao_cumprida: z
    .string()
    .optional()
    .describe("Ex: '7 de 12 (58%) no mês'. Só quando houver base pra calcular; senão vazio."),

  nada_a_fazer: z
    .boolean()
    .default(false)
    .describe("true quando o dia está genuinamente limpo. Inventar tarefa pra o e-mail não parecer vazio é o que faz a pessoa parar de ler."),
};

export function createEntregaRotinaTool() {
  const capturado: { payload: z.infer<z.ZodObject<typeof schema>> | null } = { payload: null };

  const entregar = tool(
    "entregar_rotina",
    "Entrega o bloco do dia. Chamar UMA vez, no fim, depois de ler os 3 pilares.",
    schema,
    async (input) => {
      capturado.payload = input as z.infer<z.ZodObject<typeof schema>>;
      return { content: [{ type: "text" as const, text: "Bloco do dia recebido." }] };
    }
  );

  return { entregar, capturado, toolName: "mcp__rotina__entregar_rotina" };
}

export type RotinaPayload = NonNullable<ReturnType<typeof createEntregaRotinaTool>["capturado"]["payload"]>;































const Anthropic = require('@anthropic-ai/sdk');



const {
  TIPOS_PARA_IA, ehTextoDeOpiniao, prepararMaterial,
  MAX_TEXTOS_POR_PERGUNTA, MAX_CHARS_POR_TEXTO,
} = require('../utils/censoIaFiltro');


const MODEL = 'claude-opus-5';




const SYSTEM = `Você lê as respostas abertas de um censo de uma igreja evangélica no Rio de Janeiro e escreve uma síntese para a liderança decidir o que fazer.

REGRAS DE HONESTIDADE (as mais importantes):
- Só afirme o que está nos textos. Não complete lacuna com o que "costuma ser verdade em igrejas".
- Quantifique quando puder ("cerca de um terço menciona…") e diga quando NÃO puder ("poucos textos tocam nisso, não dá para concluir").
- Se um tema aparece 2 ou 3 vezes em centenas de respostas, diga que é raro. Um comentário isolado não é tendência — mas pode ser importante, e aí diga que é isolado E importante.
- Preserve a discordância. Se metade elogia e metade critica a mesma coisa, isso é o achado; não faça média.
- Nunca cite nome de pessoa, ainda que apareça no texto.

TOM: direto, sem elogio à igreja e sem suavizar crítica. Quem lê precisa do que está ruim, não de conforto. Escreva em português do Brasil.

O QUE ENTREGAR: para cada pergunta, os temas que realmente aparecem, com peso relativo e uma citação curta e representativa por tema (verbatim, entre aspas, sem nome). Depois, uma leitura geral: o que a comunidade está pedindo, o que já está funcionando, e o que merece atenção agora.`;

const ESQUEMA = {
  type: 'object',
  properties: {
    por_pergunta: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pergunta_id: { type: 'string' },
          pergunta_texto: { type: 'string' },
          respostas_lidas: { type: 'integer' },
          temas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tema: { type: 'string' },
                peso: {
                  type: 'string',
                  enum: ['maioria', 'muitos', 'alguns', 'poucos', 'isolado'],
                  description: 'Peso relativo do tema no conjunto lido. "isolado" = 1 ou 2 menções.',
                },
                mencoes: { type: 'integer' },
                sintese: { type: 'string' },
                citacao: { type: 'string', description: 'Trecho verbatim curto, sem nome.' },
              },
              required: ['tema', 'peso', 'mencoes', 'sintese', 'citacao'],
              additionalProperties: false,
            },
          },
        },
        required: ['pergunta_id', 'pergunta_texto', 'respostas_lidas', 'temas'],
        additionalProperties: false,
      },
    },
    leitura_geral: {
      type: 'object',
      properties: {
        pedindo: {
          type: 'array', items: { type: 'string' },
          description: 'O que a comunidade está pedindo, em frases acionáveis.',
        },
        funcionando: { type: 'array', items: { type: 'string' } },
        atencao: {
          type: 'array', items: { type: 'string' },
          description: 'O que merece atenção agora, inclusive o desconfortável.',
        },
        ressalvas: {
          type: 'array', items: { type: 'string' },
          description: 'Onde os dados NÃO sustentam conclusão. Obrigatório dizer isso quando for o caso.',
        },
      },
      required: ['pedindo', 'funcionando', 'atencao', 'ressalvas'],
      additionalProperties: false,
    },
  },
  required: ['por_pergunta', 'leitura_geral'],
  additionalProperties: false,
};












async function lerRespostasAbertas(itens, { agora } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const { blocos, total_textos, truncadas } = prepararMaterial(itens);
  if (!blocos.length) return null;

  const material = blocos.map((b) => [
    `### ${b.pergunta_texto}`,
    `(id: ${b.pergunta_id} · ${b.textos.length} respostas${b.total > b.textos.length ? ` de ${b.total}, amostradas` : ''})`,
    ...b.textos.map((t) => `- ${t}`),
  ].join('\n')).join('\n\n');

  const client = new Anthropic();


  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: ESQUEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: `Respostas abertas do censo:\n\n${material}` }],
  });
  const msg = await stream.finalMessage();

  if (msg?.stop_reason === 'refusal') return null;
  const texto = (msg?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let dados;
  try { dados = JSON.parse(texto); } catch { return null; }

  return {
    modelo: MODEL,
    geradas_em: agora || new Date().toISOString(),
    respostas_lidas: total_textos,
    truncadas,
    por_pergunta: dados.por_pergunta || [],
    leitura_geral: dados.leitura_geral || null,
    uso: {
      entrada: msg?.usage?.input_tokens ?? null,
      saida: msg?.usage?.output_tokens ?? null,
    },
  };
}

module.exports = {
  ehTextoDeOpiniao,
  TIPOS_PARA_IA, lerRespostasAbertas, prepararMaterial, MODEL, ESQUEMA, MAX_TEXTOS_POR_PERGUNTA };

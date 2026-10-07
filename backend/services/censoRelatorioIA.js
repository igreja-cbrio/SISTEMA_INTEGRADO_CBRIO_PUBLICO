

























const Anthropic = require('@anthropic-ai/sdk');



const {
  filtrarRecomendacoes, MINIMO_POR_CELULA, materialDoPerfil, materialDosCruzamentos,
} = require('../utils/censoRelatorioDados');


const MODEL = 'claude-opus-5';

const SYSTEM = `Você é analista de pesquisa e está escrevendo o relatório de um censo de uma igreja evangélica no Rio de Janeiro, para a liderança decidir o que fazer nos próximos meses.

O QUE VOCÊ RECEBE: tabelas JÁ CALCULADAS — perfil dos respondentes e cruzamentos escolhidos antes de olhar o resultado, cada um com o motivo pelo qual a igreja quis saber aquilo.

REGRAS DE HONESTIDADE (as mais importantes):
- NÃO refaça conta. Os números do material são a verdade; cite-os como estão. Se quiser uma conta que não está lá, diga que não está.
- Correlação não é causa, e diga isso onde importa. Se duas coisas andam juntas, ofereça a explicação alternativa mais forte (auto-seleção, tempo de casa) e diga qual evidência decidiria entre elas — ainda que ela não exista.
- Quando um corte tiver poucas respostas, não use. O material já descartou célula com menos de ${MINIMO_POR_CELULA}; não reconstrua a partir de outras.
- Diga o que o censo NÃO responde. Um relatório que só afirma é um relatório que não foi conferido.
- Nunca cite pessoa. Você não recebe nome, e não deve inventar exemplo individual.

TOM: direto, sem elogiar a igreja e sem suavizar o que está ruim. Quem lê precisa decidir, não ser consolado. Português do Brasil, frases curtas.

QUANTIDADE: de 3 a 6 pontos no resumo; de 3 a 8 achados; de 2 a 8 recomendações; ao menos 1 limite do censo. Se não houver material para o mínimo, entregue menos e diga por quê — número de itens não é meta.

SOBRE AS RECOMENDAÇÕES: cada uma precisa nascer de um número do material, e você tem de informar esse número em \`base_numerica\`. Recomendação sem âncora é descartada automaticamente antes de chegar em quem lê — então não gaste item com conselho genérico de igreja. Prefira poucas recomendações fortes a muitas plausíveis.`;








const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['resumo_executivo', 'achados', 'recomendacoes', 'o_que_o_censo_nao_responde'],
  properties: {

    resumo_executivo: {
      type: 'object',
      additionalProperties: false,
      required: ['paragrafo', 'pontos'],
      properties: {
        paragrafo: { type: 'string', description: 'Um parágrafo. O retrato da igreja segundo este censo.' },
        pontos: {
          type: 'array',
          items: { type: 'string', description: 'Uma frase com número.' },
        },
      },
    },
    achados: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'o_que_os_dados_mostram', 'forca', 'ressalva'],
        properties: {
          titulo: { type: 'string' },
          o_que_os_dados_mostram: { type: 'string', description: 'Com os números do material.' },
          forca: {
            type: 'string', enum: ['forte', 'moderado', 'sugestivo'],
            description: 'forte = diferença grande e consistente entre cortes; sugestivo = aparece mas pode ser outra coisa.',
          },



          ressalva: { type: 'string', description: 'A explicação alternativa mais forte, ou o que faltaria para confirmar.' },
        },
      },
    },
    recomendacoes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'tipo', 'porque', 'base_numerica', 'como_medir'],
        properties: {
          titulo: { type: 'string' },
          tipo: {
            type: 'string',
            enum: ['serie_pregacao', 'evento', 'processo', 'comunicacao', 'cuidado'],
          },
          porque: { type: 'string', description: 'O número do censo que sustenta isto.' },
          base_numerica: {
            type: 'number',
            description: 'O valor exato do material que ancora esta recomendação (contagem ou porcentagem).',
          },

          como_medir: { type: 'string', description: 'Como saber, daqui a alguns meses, se deu certo.' },
        },
      },
    },
    o_que_o_censo_nao_responde: {
      type: 'array',
      items: { type: 'string' },
    },
  },
};







async function gerarRelatorio(dados, { agora } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const perfil = dados?.perfil || [];
  const cruzamentos = dados?.cruzamentos || [];


  if (!perfil.length) return null;

  const material = [
    `Censo com ${dados?.respostas ?? 0} respostas.`,
    '',
    '## PERFIL DOS RESPONDENTES',
    materialDoPerfil(perfil),
    '',
    '## CRUZAMENTOS',
    cruzamentos.length
      ? materialDosCruzamentos(cruzamentos)
      : '(nenhum cruzamento teve célula grande o suficiente para ser calculado)',
  ].join('\n');

  const client = new Anthropic();


  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: ESQUEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: material }],
  });
  const msg = await stream.finalMessage();

  if (msg?.stop_reason === 'refusal') return null;
  const texto = (msg?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let out;
  try { out = JSON.parse(texto); } catch { return null; }


  const { mantidas, descartadas } = filtrarRecomendacoes(out.recomendacoes, perfil, cruzamentos);

  return {
    modelo: MODEL,
    gerado_em: agora || new Date().toISOString(),
    respostas_lidas: dados?.respostas ?? 0,
    resumo_executivo: out.resumo_executivo || null,
    achados: out.achados || [],
    recomendacoes: mantidas,


    recomendacoes_descartadas: descartadas,
    o_que_o_censo_nao_responde: out.o_que_o_censo_nao_responde || [],
    uso: {
      entrada: msg?.usage?.input_tokens ?? null,
      saida: msg?.usage?.output_tokens ?? null,
    },
  };
}





module.exports = { gerarRelatorio, MODEL, ESQUEMA, materialDoPerfil, materialDosCruzamentos };

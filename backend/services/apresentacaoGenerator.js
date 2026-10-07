
















const Anthropic = require('@anthropic-ai/sdk');
const { getContextoCompleto } = require('./apresentacaoContextoCbrio');





const SONNET_IDS = [
  process.env.APRESENTACOES_MODEL,
  'claude-sonnet-4-6',
  'claude-sonnet-4-6-20250101',
  'claude-sonnet-4-5',
  'claude-sonnet-4-20250514',
].filter(Boolean);

const MODEL_DEFAULT = SONNET_IDS[0] || 'claude-sonnet-4-6';
const MODEL_PREMIUM = 'claude-opus-4-7';


const PRICING = {
  'claude-sonnet-4-6':            { input: 3,  output: 15 },
  'claude-sonnet-4-6-20250101':   { input: 3,  output: 15 },
  'claude-sonnet-4-5':            { input: 3,  output: 15 },
  'claude-sonnet-4-20250514':     { input: 3,  output: 15 },
  'claude-opus-4-7':              { input: 15, output: 75 },
};



const MAX_TOKENS_BY_MODEL = {
  'claude-sonnet-4-6':            16000,
  'claude-sonnet-4-6-20250101':   16000,
  'claude-sonnet-4-5':            16000,
  'claude-sonnet-4-20250514':     16000,
  'claude-opus-4-7':              14000,
};




const SYSTEM_PROMPT = `Voce gera decks HTML premium estilo Claude Design / Apple Keynote · slides 1920x1080.

# Estrutura

Saida vai dentro de <deck-stage>. Voce retorna **css** + **html** (varios <section class="slide">). NUNCA inclua <html>, <head>, <body>, <script>.

Cada slide:
- class="slide" · 1920x1080 · overflow:hidden · padding 60-100px
- UMA ideia central · max 7 itens visiveis
- data-screen-label="NN Titulo"

# Animacoes (ja implementadas no deck-stage)

Adicione a class em qualquer elemento:
- \`.anim\` fade-up com blur (default)
- \`.anim-fade\` so opacidade
- \`.anim-clip\` clip-path reveal lateral (cards grandes)
- \`.anim-line\` scaleX (dividers, progress)
- \`.anim-bar\` scaleY (colunas chart)
- \`.anim-ring\` scale bounce (avatares)

Stagger: \`.d-0\` a \`.d-14\` (cada N = 80ms delay). Ex: \`<h1 class="anim d-0">\`, \`<p class="anim d-2">\`.

# Tipografia (importar via @import no css)

\`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');\`

Use 1 fonte display (Space Grotesk, Fraunces, Manrope) + 1 body (Inter, Manrope) + mono pra labels/numeros (JetBrains Mono). Display sempre com letter-spacing negativo (-0.02em a -0.05em).

# Tamanhos

H1 cover 100-160px · H2 slide 64-96px · H3 36-56px · body grande 22-28px · body 16-20px · mono labels 11-14px UPPERCASE letter-spacing 0.1-0.2em.

# Paleta · escolha UMA identidade

Dark (premium · fundos #0A0E14-#141A24) · Light (clean · #FAFAF7-#FFF) · Vibrante (1 cor + neutros). Use OKLCH pra destaques: \`oklch(0.82 0.13 215)\` ciano, \`oklch(0.78 0.13 65)\` ambar, \`oklch(0.78 0.13 155)\` verde, \`oklch(0.78 0.13 0)\` rosa.

# Componentes

Chrome (tag mono topo/baixo com num slide) · bento grid 12 cols · big numbers 120-280px · tables limpas mono nos numeros · progress bars 6-12px com glow · stack badges com glyph.

# Nunca

Emojis decorativos (use ★ → ↳ ● ▲ ◆) · drop shadows pesadas · border-radius >16px em cards grandes · mais de 2 fontes display · conteudo amontoado.

# Estrutura sugerida (8-12 slides)

Cover · Resumo/agenda · 5-8 conteudo (1 ideia/slide) · Fechamento/CTA.

# OUTPUT · use tags delimitadoras (NAO use JSON · CSS/HTML quebram JSON.parse)

Retorne EXATAMENTE neste formato, sem mais nada antes ou depois:

<TITULO>texto curto do titulo</TITULO>
<SLIDES_COUNT>numero inteiro</SLIDES_COUNT>
<CSS>
todo o CSS aqui · pode ter newlines, aspas, qualquer coisa
</CSS>
<HTML>
<section class="slide" data-screen-label="01 Cover">...</section>
<section class="slide" data-screen-label="02 ...">...</section>
... (continua pra todos os slides)
</HTML>

Capricho > completude. Vai pra diretoria.`;




async function buildUserPrompt({ titulo, prompt, tom, arquivos, contextoCerebro }) {

  const contexto = await getContextoCompleto();
  const tomDescricoes = {
    executivo:  'tom corporativo serio, focado em decisão · paleta dark premium · números grandes · bento grids',
    comercial:  'tom comercial atrativo, focado em vendas · paleta vibrante · CTAs claros · destaques visuais',
    relatorio:  'tom analitico, denso em dados · paleta neutra · tabelas e gráficos · tipografia precisa',
    criativo:   'tom criativo expressivo, focado em conceito · paleta arriscada · tipografia grande · espaco em branco',
  };

  let p = '';




  if (contexto && contexto.length > 0) {
    p += `# Contexto da organização (CBRio · use isso como fonte de verdade)\n\n`;
    p += `Quando o briefing mencionar algo dessa lista, use exatamente esses dados · NUNCA invente fatos sobre a organização.\n\n`;
    for (const c of contexto) {
      p += `## ${c.titulo}\n\n${c.conteudo}\n\n`;
    }
    p += `---\n\n`;
  }

  p += `# Apresentacao a gerar\n\n`;
  p += `**Titulo sugerido:** ${titulo}\n\n`;
  p += `**Tom:** ${tom || 'executivo'} · ${tomDescricoes[tom] || tomDescricoes.executivo}\n\n`;
  p += `**Briefing:**\n${prompt}\n\n`;

  if (contextoCerebro && contextoCerebro.textoCompleto) {
    p += `# Contexto institucional CBRio (Cerebro CBRio)\n\n`;
    p += `Abaixo estão ${contextoCerebro.notasIncluidas} notas resumidas da base de conhecimento da Igreja CBRio`;
    if (contextoCerebro.truncado) p += ` (de ${contextoCerebro.totalNotas} totais · truncadas as mais antigas)`;
    p += `. Use como fonte de verdade pra fatos, nomes, processos, números e narrativa institucional. `;
    p += `Se o briefing acima for vago, escolha os recortes mais relevantes desta base pra montar a apresentação. NÃO invente dados que não apareçam aqui ou nos arquivos anexados.\n`;
    p += contextoCerebro.textoCompleto;
    p += `\n\n---\n\n`;
  }

  if (arquivos && arquivos.length > 0) {
    p += `# Material de referência (anexado pelo usuário)\n\n`;
    p += `Use o conteúdo abaixo como fonte de verdade pra dados e narrativa. NÃO invente números.\n\n`;
    arquivos.forEach((a, i) => {
      const trecho = (a.texto_extraido || '').slice(0, 3500);
      p += `## Arquivo ${i + 1}: ${a.nome}\n\n${trecho}\n\n---\n\n`;
    });
  }

  p += `\n# Tarefa\n\nGere uma apresentação de 8 a 14 slides seguindo TODAS as diretrizes do system prompt. Capriche no design · esta apresentação será mostrada pra diretoria.`;

  return p;
}





function extractTag(text, tag) {



  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function parseOutput(text) {

  const cleaned = text
    .replace(/^```(?:html|xml|markdown|md)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const titulo = extractTag(cleaned, 'TITULO');
  const slidesCountRaw = extractTag(cleaned, 'SLIDES_COUNT');
  const css = extractTag(cleaned, 'CSS');
  const html = extractTag(cleaned, 'HTML');

  if (!css && !html) {

    try {
      const j = JSON.parse(cleaned);
      if (j && j.css && j.html) return {
        titulo: j.titulo || null,
        slides_count: j.slides_count || null,
        css: j.css,
        html: j.html,
      };
    } catch (e) {              }
    return null;
  }

  return {
    titulo,
    slides_count: slidesCountRaw ? parseInt(slidesCountRaw, 10) : null,
    css: css || '',
    html: html || '',
  };
}




function estimarCusto(modelo, tokens_input, tokens_output) {
  const p = PRICING[modelo] || PRICING[MODEL_DEFAULT];
  const inp = (tokens_input  / 1_000_000) * p.input;
  const out = (tokens_output / 1_000_000) * p.output;
  return Math.round((inp + out) * 10000) / 10000;
}





function isModelError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('not_found') || msg.includes('not found')
      || msg.includes('invalid_request')
      || msg.includes('does not exist') || msg.includes('unknown model')
      || msg.includes('model:');
}

async function callAnthropic({ client, model, maxTokens, system, userPrompt }) {
  return client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: userPrompt }],
  });
}

async function gerarApresentacao({ titulo, prompt, tom, arquivos, modelo, contextoCerebro }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY não configurada no ambiente');
  }

  const client = new Anthropic();
  const t0 = Date.now();



  const modelosATentar = modelo && PRICING[modelo]
    ? [modelo]
    : SONNET_IDS;

  const userPrompt = await buildUserPrompt({ titulo, prompt, tom, arquivos, contextoCerebro });

  let resp = null;
  let modeloFinal = null;
  let ultimoErro = null;

  for (const m of modelosATentar) {
    const maxTokens = MAX_TOKENS_BY_MODEL[m] || 10000;
    try {
      console.log(`[apresentacoes] tentando modelo: ${m}`);
      resp = await callAnthropic({ client, model: m, maxTokens, system: SYSTEM_PROMPT, userPrompt });
      modeloFinal = m;
      console.log(`[apresentacoes] modelo ${m} respondeu ok`);
      break;
    } catch (err) {
      ultimoErro = err;
      console.warn(`[apresentacoes] modelo ${m} falhou: ${err.message}`);


      if (!isModelError(err)) throw err;
    }
  }

  if (!resp) {
    throw new Error(
      `Nenhum modelo aceito pela API. Último erro: ${ultimoErro?.message || 'desconhecido'}. ` +
      `Tentados: ${modelosATentar.join(', ')}. ` +
      `Defina APRESENTACOES_MODEL no Vercel com um ID valido.`
    );
  }

  const duracao_ms = Date.now() - t0;

  const text = (resp.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  const tokens_input  = resp.usage?.input_tokens  || 0;
  const tokens_output = resp.usage?.output_tokens || 0;
  const custo_usd     = estimarCusto(modeloFinal, tokens_input, tokens_output);


  const parsed = parseOutput(text);
  if (!parsed) {
    const preview = text.slice(0, 800);
    throw new Error('IA retornou formato invalido. Início: ' + preview);
  }
  if (!parsed.html) throw new Error('IA nao retornou <HTML> dos slides');
  if (!parsed.css)  throw new Error('IA nao retornou <CSS> da apresentacao');


  const slidesCount = (parsed.html.match(/<section\s+class="slide"/g) || []).length;
  const slides_count = parsed.slides_count || slidesCount;

  return {
    titulo: String(parsed.titulo || titulo).slice(0, 200),
    slides_count,
    css: parsed.css,
    html: parsed.html,
    tokens_input,
    tokens_output,
    custo_usd,
    duracao_ms,
    modelo: modeloFinal,
  };
}

module.exports = { gerarApresentacao, SYSTEM_PROMPT, MODEL_DEFAULT, MODEL_PREMIUM, PRICING };

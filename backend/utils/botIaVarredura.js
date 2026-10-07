



























const TZ = 'America/Sao_Paulo';
const RE_PERIODO = /^(\d{4})-(0[1-9]|1[0-2])$/;


const HORA_INICIO_BRT = 6;
const TETO_TEMAS = 15;
const TETO_EXEMPLOS = 5;
const TETO_LACUNAS = 15;
const TETO_AMOSTRA_PADRAO = 400;
const MAX_CHARS_PADRAO = 280;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];








function partesBrt(agoraMs) {
  const d = new Date(Number(agoraMs));
  if (!Number.isFinite(d.getTime())) {
    throw new Error(`botIaVarredura.partesBrt: instante inválido (${String(agoraMs)})`);
  }
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  });
  const p = {};
  for (const x of fmt.formatToParts(d)) p[x.type] = x.value;
  return { ano: Number(p.year), mes: Number(p.month), dia: Number(p.day), hora: Number(p.hour) % 24 };
}


function periodoAnterior(agoraMs = Date.now()) {
  const { ano, mes } = partesBrt(agoraMs);
  const a = mes === 1 ? ano - 1 : ano;
  const m = mes === 1 ? 12 : mes - 1;
  return `${a}-${String(m).padStart(2, '0')}`;
}

function periodoValido(periodo) {
  return typeof periodo === 'string' && RE_PERIODO.test(periodo);
}









function limitesUtcDoPeriodo(periodo) {
  const m = RE_PERIODO.exec(String(periodo || ''));
  if (!m) throw new Error(`botIaVarredura.limitesUtcDoPeriodo: período inválido (${String(periodo)})`);
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const proxAno = mes === 12 ? ano + 1 : ano;
  const proxMes = mes === 12 ? 1 : mes + 1;
  const mm = (n) => String(n).padStart(2, '0');
  return {
    inicioIso: `${ano}-${mm(mes)}-01T03:00:00.000Z`,
    fimIso: `${proxAno}-${mm(proxMes)}-01T03:00:00.000Z`,
  };
}

function rotuloPeriodo(periodo) {
  const m = RE_PERIODO.exec(String(periodo || ''));
  if (!m) return String(periodo || '');
  return `${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}







function deveRodarAgora({ agoraMs = Date.now(), jaExiste = false } = {}) {
  if (jaExiste) return false;
  const { hora } = partesBrt(agoraMs);
  return hora >= HORA_INICIO_BRT;
}



function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}








const PALAVRAS_PASTORAIS = Object.freeze([

  'oracao', 'oracoes', 'orar*', 'orem', 'orando', 'orei', 'ore', 'interced*', 'intercess*',

  'sos', 'aconselh*', 'pastor*',

  'luto', 'enlutad*', 'falec*', 'obito*', 'morreu', 'velorio',

  'depress*', 'suicid*', 'ansied*', 'ansios*',

  'hospital*', 'doenca*', 'doente*', 'enfermidade*', 'cirurgi*',

  'separacao', 'separacoes', 'divorci*', 'traicao', 'traid*', 'traiu',

  'vicio*', 'viciad*',
]);

const PASTORAIS_PALAVRA = new Set(PALAVRAS_PASTORAIS.filter(p => !p.endsWith('*')));
const PASTORAIS_PREFIXO = PALAVRAS_PASTORAIS.filter(p => p.endsWith('*')).map(p => p.slice(0, -1));

function ehPastoral(texto) {
  const palavras = normalizar(texto).split(/[^a-z0-9]+/).filter(Boolean);
  for (const w of palavras) {
    if (PASTORAIS_PALAVRA.has(w)) return true;
    if (PASTORAIS_PREFIXO.some(r => w.startsWith(r))) return true;
  }
  return false;
}



const RE_DATA_ISO = /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?\b/g;


const RE_UUID_G = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const RE_URL = /(?:https?:\/\/|www\.)[^\s<>"')\]]+/gi;
const RE_EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
const RE_CPF = /\b\d{3}\.\d{3}\.\d{3}-?\d{2}\b/g;

const RE_NUMERO = /\(?\+?\d[\d\s().-]*\d/g;

const RE_TEL_SEM_DDD = /^\(?9?\d{4}-\d{4}$/;

function soDigitos(v) { return String(v || '').replace(/\D+/g, ''); }

function marcador(i) {
  let s = '';
  let n = i;
  do { s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } while (n > 0);
  return `\u0000${s}\u0000`;
}










function mascararPII(texto, { telefoneConversa = null } = {}) {
  let t = String(texto || '');
  if (!t) return '';
  const datas = [];
  const proteger = (m) => { datas.push(m); return marcador(datas.length - 1); };
  t = t.replace(RE_UUID_G, proteger);
  t = t.replace(RE_DATA_ISO, proteger);
  t = t.replace(RE_URL, '[link]');
  t = t.replace(RE_EMAIL, '[email]');
  t = t.replace(RE_CPF, '[cpf]');
  const conv = soDigitos(telefoneConversa);
  t = t.replace(RE_NUMERO, (m) => {
    const d = soDigitos(m);
    if (conv.length >= 8 && d.length >= 8 && (conv.endsWith(d) || d.endsWith(conv.slice(-8)))) return '[telefone]';
    if (d.length >= 14) return '[número]';
    if (d.length >= 10) return '[telefone]';
    if (RE_TEL_SEM_DDD.test(m.trim())) return '[telefone]';
    return m;
  });
  datas.forEach((d, i) => { t = t.split(marcador(i)).join(d); });
  return t;
}



function cortar(texto, max) {
  if (texto.length <= max) return texto;
  const corte = texto.lastIndexOf(' ', max);
  return texto.slice(0, corte > max * 0.6 ? corte : max).trim() + '…';
}











function prepararAmostra(mensagens, { teto = TETO_AMOSTRA_PADRAO, maxChars = MAX_CHARS_PADRAO } = {}) {
  const lim = Number.isInteger(teto) && teto > 0 ? teto : TETO_AMOSTRA_PADRAO;
  const maxC = Number.isInteger(maxChars) && maxChars > 20 ? maxChars : MAX_CHARS_PADRAO;
  const vistos = new Set();
  const unicos = [];
  let total = 0;
  for (const m of Array.isArray(mensagens) ? mensagens : []) {
    const texto = String(m?.texto || '').replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    total += 1;
    const chave = normalizar(texto).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    unicos.push({
      ordem: unicos.length, id: m.id ?? null, conversa_id: m.conversa_id ?? null,
      area: m.area ?? null, texto: cortar(texto, maxC),
    });
  }
  const primeiros = [];
  const resto = [];
  const conversas = new Set();
  for (const u of unicos) {
    const k = u.conversa_id || `sem-conversa:${u.ordem}`;
    if (conversas.has(k)) resto.push(u);
    else { conversas.add(k); primeiros.push(u); }
  }
  const selecao = primeiros.slice(0, lim);
  if (selecao.length < lim) selecao.push(...resto.slice(0, lim - selecao.length));
  selecao.sort((a, b) => a.ordem - b.ordem);
  return {
    itens: selecao.map((u, i) => ({ idx: i + 1, id: u.id, conversa_id: u.conversa_id, area: u.area, texto: u.texto })),
    total,
    distintas: unicos.length,
    truncado: unicos.length > selecao.length,
  };
}










const TOOL_AGRUPAR = Object.freeze({
  name: 'agrupar_temas',
  description: 'Agrupa as mensagens recebidas no WhatsApp da igreja em temas e aponta o que o bot de IA não saberia responder com o conhecimento atual de cada área.',
  input_schema: {
    type: 'object',
    properties: {
      temas: {
        type: 'array',
        maxItems: TETO_TEMAS,
        items: {
          type: 'object',
          properties: {
            tema: { type: 'string', description: 'Nome curto e genérico do assunto (até 60 caracteres). NUNCA nome de pessoa.' },
            area_sugerida: { type: 'string', description: 'Nome EXATO de uma das áreas listadas, ou "Geral".' },
            o_bot_saberia: { type: 'boolean', description: 'true só se o conhecimento escrito da área (no prompt) já responde este assunto.' },
            lacuna: { type: 'string', description: 'O que faltaria no conhecimento para responder. Vazio quando o_bot_saberia = true.' },
            mensagens: { type: 'array', items: { type: 'integer' }, description: 'TODOS os números [n] das mensagens deste tema. Cada número em no máximo um tema.' },
            exemplos: { type: 'array', items: { type: 'integer' }, maxItems: TETO_EXEMPLOS, description: 'Até 5 números [n] representativos, dentre os de `mensagens`.' },
          },
          required: ['tema', 'area_sugerida', 'o_bot_saberia', 'mensagens'],
        },
      },
      lacunas_gerais: {
        type: 'array',
        maxItems: TETO_LACUNAS,
        items: {
          type: 'object',
          properties: {
            area: { type: 'string', description: 'Nome EXATO de uma das áreas listadas, ou "Geral".' },
            lacuna: { type: 'string', description: 'O que as pessoas perguntaram e o bot não saberia responder.' },
            sugestao_conhecimento: { type: 'string', description: 'O texto (ou o assunto) que a equipe deveria escrever no conhecimento da área.' },
          },
          required: ['area', 'lacuna'],
        },
      },
    },
    required: ['temas', 'lacunas_gerais'],
  },
});

function montarSystemPrompt({ areas = [], conhecimentoPorArea = {} } = {}) {
  const nomes = (Array.isArray(areas) ? areas : []).map(a => String(a || '').trim()).filter(Boolean);
  const blocos = nomes.map((a) => {
    const c = String((conhecimentoPorArea || {})[a] || '').trim();
    return `### ${a}\n${c ? c.slice(0, 1500) : '(nenhum conhecimento escrito ainda)'}`;
  });
  return [
    'Você analisa as mensagens que o WhatsApp da CBRio (Comunidade Batista do Rio de Janeiro) RECEBEU em um mês, para a equipe de comunicação.',
    'Objetivo: mostrar DO QUE as pessoas falam e o que o bot de IA da igreja NÃO saberia responder com o conhecimento atual de cada área.',
    '',
    '## Regras',
    `- Agrupe as mensagens em ATÉ ${TETO_TEMAS} temas, pelo ASSUNTO. Use português do Brasil.`,
    '- Coloque em `mensagens` TODOS os números [n] de cada tema, sem repetir um número em dois temas. A contagem do relatório sai daí.',
    '- Cumprimentos, "ok", agradecimentos e mensagens sem assunto vão num tema próprio "Cumprimentos e agradecimentos" (o_bot_saberia = true).',
    '- O nome do tema é GENÉRICO: nunca nome de pessoa, telefone, endereço ou qualquer dado que identifique alguém.',
    '- `area_sugerida` é o nome EXATO de uma das áreas abaixo, ou "Geral".',
    '- `o_bot_saberia` = true SOMENTE se o conhecimento escrito da área (abaixo) já responde o assunto. Na dúvida, false.',
    '- `lacuna`: o que faltaria escrever no conhecimento para o bot responder. Seja concreto.',
    '- `lacunas_gerais`: por área, o que a equipe deveria acrescentar ao conhecimento, com uma sugestão de texto quando possível.',
    '- NÃO invente mensagens nem números. Use só os números [n] que aparecem na lista.',
    '',
    '## Áreas e o que o bot sabe hoje',
    blocos.length ? blocos.join('\n\n') : '(nenhuma área configurada)',
  ].join('\n');
}

function montarUser({ amostra = null, periodo = '' } = {}) {
  const itens = Array.isArray(amostra) ? amostra : (amostra?.itens || []);
  const cabecalho = `Mensagens recebidas em ${rotuloPeriodo(periodo)} — ${itens.length} mensagem(ns) distinta(s):`;
  const linhas = itens.map(i => `[${i.idx}] (conversa da área: ${i.area || 'sem área'}) ${i.texto}`);
  return [cabecalho, '', ...linhas, '', 'Agrupe com a ferramenta `agrupar_temas`.'].join('\n');
}

function limparTexto(v, max) {
  if (typeof v !== 'string') return '';
  return mascararPII(v.replace(/\s+/g, ' ').trim()).slice(0, max).trim();
}

function indiceValido(raw, porIdx) {
  let n;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) n = Number(raw.trim());
  else return null;
  return Number.isInteger(n) && porIdx.has(n) ? n : null;
}











function normalizarSaidaModelo(input, { amostra = null, areasValidas = [] } = {}) {
  const vazio = { temas: [], lacunas: [] };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return vazio;
  const itens = Array.isArray(amostra) ? amostra : (amostra?.itens || []);
  const porIdx = new Map(itens.filter(i => Number.isInteger(i?.idx)).map(i => [i.idx, i]));
  const validas = (Array.isArray(areasValidas) ? areasValidas : []).map(a => String(a || '').trim()).filter(Boolean);
  const areaOk = (nome) => {
    const n = normalizar(nome).trim();
    return validas.find(a => normalizar(a).trim() === n) || 'Geral';
  };

  const usados = new Set();
  const temas = [];
  for (const t of Array.isArray(input.temas) ? input.temas : []) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) continue;
    const nome = limparTexto(t.tema, 60);
    if (!nome) continue;
    const idxs = [];
    const candidatos = [
      ...(Array.isArray(t.mensagens) ? t.mensagens : []),
      ...(Array.isArray(t.exemplos) ? t.exemplos : []),
    ];
    for (const raw of candidatos) {
      const n = indiceValido(raw, porIdx);
      if (n === null || usados.has(n)) continue;
      usados.add(n);
      idxs.push(n);
    }
    if (!idxs.length) continue;
    const preferidos = (Array.isArray(t.exemplos) ? t.exemplos : [])
      .map(raw => indiceValido(raw, porIdx)).filter(n => n !== null && idxs.includes(n));
    const exemplos = [...new Set([...preferidos, ...idxs])].slice(0, TETO_EXEMPLOS);
    const saberia = t.o_bot_saberia === true;
    temas.push({
      tema: nome,
      contagem: idxs.length,
      area_sugerida: areaOk(t.area_sugerida),
      o_bot_saberia: saberia,
      lacuna: saberia ? null : (limparTexto(t.lacuna, 300) || null),
      exemplo_ids: exemplos.map(n => porIdx.get(n)?.id).filter(Boolean),
    });
  }
  temas.sort((a, b) => b.contagem - a.contagem);

  const lacunas = [];
  for (const l of Array.isArray(input.lacunas_gerais) ? input.lacunas_gerais : []) {
    if (!l || typeof l !== 'object' || Array.isArray(l)) continue;
    const lacuna = limparTexto(l.lacuna, 300);
    if (!lacuna) continue;
    lacunas.push({
      area: areaOk(l.area),
      lacuna,
      sugestao_conhecimento: limparTexto(l.sugestao_conhecimento, 600) || null,
    });
    if (lacunas.length >= TETO_LACUNAS) break;
  }
  return { temas: temas.slice(0, TETO_TEMAS), lacunas };
}



function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function num(v) { return Number.isFinite(Number(v)) ? Number(v).toLocaleString('pt-BR') : '—'; }







function montarEmail({ periodo = '', totais = {}, temas = [], lacunas = [], urlErp = '' } = {}) {
  const rotulo = rotuloPeriodo(periodo);
  const link = `${String(urlErp || '').replace(/\/+$/, '')}/comunicacao?tab=bot`;
  const listaTemas = (Array.isArray(temas) ? temas : []).map(t => ({
    tema: String(t?.tema || ''), contagem: Number(t?.contagem) || 0,
    area: String(t?.area_sugerida || 'Geral'), saberia: t?.o_bot_saberia === true,
    lacuna: t?.lacuna ? String(t.lacuna) : '',
  }));
  const listaLacunas = (Array.isArray(lacunas) ? lacunas : []).map(l => ({
    area: String(l?.area || 'Geral'), lacuna: String(l?.lacuna || ''),
    sugestao: l?.sugestao_conhecimento ? String(l.sugestao_conhecimento) : '',
  }));
  const naoSaberia = listaTemas.filter(t => !t.saberia).length;
  const subject = `Varredura do WhatsApp · ${rotulo} · ${listaTemas.length} tema(s), ${naoSaberia} sem resposta do bot`;

  const linhasTotais = [
    ['Mensagens recebidas no mês', num(totais.total_mensagens)],
    ['Conversas', num(totais.total_conversas)],
    ['Tiradas por serem pastorais', num(totais.excluidas_pastoral)],
    ['Tiradas por serem conversas de Cuidados', num(totais.excluidas_conversas_cuidados)],
    ['Mensagens distintas analisadas', num(totais.analisadas)],
  ];

  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;max-width:720px">',
    `<h2 style="margin:0 0 4px">Varredura do WhatsApp · ${esc(rotulo)}</h2>`,
    '<p style="margin:0 0 16px;color:#6b7280">Do que as pessoas falaram com o WhatsApp da CBRio no mês, e o que o bot de IA ainda não saberia responder.</p>',
    '<table style="border-collapse:collapse;margin-bottom:16px">',
    ...linhasTotais.map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#6b7280">${esc(k)}</td><td style="padding:2px 0;font-weight:bold">${esc(v)}</td></tr>`),
    '</table>',
    totais.truncado ? '<p style="color:#b45309">⚠️ O mês teve mais mensagens distintas do que a amostra analisada — as contagens são sobre a amostra.</p>' : '',
    '<h3 style="margin:16px 0 8px">Temas</h3>',
    listaTemas.length
      ? ['<table style="border-collapse:collapse;width:100%">',
        '<tr style="background:#f3f4f6"><th style="text-align:left;padding:6px">Tema</th><th style="padding:6px">Msgs</th><th style="text-align:left;padding:6px">Área</th><th style="padding:6px">Bot saberia?</th><th style="text-align:left;padding:6px">O que falta</th></tr>',
        ...listaTemas.map(t => `<tr style="border-top:1px solid #e5e7eb"><td style="padding:6px">${esc(t.tema)}</td><td style="padding:6px;text-align:center">${esc(num(t.contagem))}</td><td style="padding:6px">${esc(t.area)}</td><td style="padding:6px;text-align:center">${t.saberia ? 'Sim' : '<b style="color:#b91c1c">Não</b>'}</td><td style="padding:6px">${esc(t.lacuna || '—')}</td></tr>`),
        '</table>'].join('')
      : '<p>Nenhum tema.</p>',
    '<h3 style="margin:16px 0 8px">O que escrever no conhecimento do bot</h3>',
    listaLacunas.length
      ? `<ul>${listaLacunas.map(l => `<li><b>${esc(l.area)}</b> — ${esc(l.lacuna)}${l.sugestao ? `<br><span style="color:#6b7280">Sugestão: ${esc(l.sugestao)}</span>` : ''}</li>`).join('')}</ul>`
      : '<p>Nenhuma lacuna apontada.</p>',
    `<p style="margin-top:20px"><a href="${esc(link)}">Abrir no sistema (Comunicação → Bot → IA por área)</a></p>`,
    '<p style="color:#6b7280;font-size:12px">Este e-mail não traz texto de nenhuma mensagem: os exemplos ficam só no sistema, sob permissão. Conversas de Cuidados e mensagens pastorais não entram na análise.</p>',
    '</div>',
  ].join('\n');

  const text = [
    `Varredura do WhatsApp · ${rotulo}`,
    '',
    ...linhasTotais.map(([k, v]) => `${k}: ${v}`),
    totais.truncado ? '(as contagens são sobre a amostra analisada)' : '',
    '',
    'TEMAS',
    ...(listaTemas.length
      ? listaTemas.map(t => `- ${t.tema} · ${t.contagem} msg · ${t.area} · bot saberia: ${t.saberia ? 'sim' : 'não'}${t.lacuna ? ` · falta: ${t.lacuna}` : ''}`)
      : ['- nenhum']),
    '',
    'O QUE ESCREVER NO CONHECIMENTO DO BOT',
    ...(listaLacunas.length
      ? listaLacunas.map(l => `- ${l.area}: ${l.lacuna}${l.sugestao ? ` (sugestão: ${l.sugestao})` : ''}`)
      : ['- nada apontado']),
    '',
    `Abrir no sistema: ${link}`,
    'Este e-mail não traz texto de nenhuma mensagem: os exemplos ficam só no sistema, sob permissão.',
  ].join('\n');

  return { subject, html, text };
}



const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;







function sanitizarErro(mensagem) {
  const s = String(mensagem ?? '');
  if (/credit balance|purchase credits|saldo de cr[eé]dito/i.test(s)) return 'anthropic_sem_credito';
  if (/ANTHROPIC_API_KEY/i.test(s) && /(n[aã]o configurad|missing|not set|ausente)/i.test(s)) return 'anthropic_nao_configurada';
  if (/authentication_error|invalid x-api-key|api key is invalid/i.test(s)) return 'anthropic_chave_invalida';
  let t = s
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, '[segredo]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [segredo]')
    .replace(/[A-Za-z0-9_-]{32,}/g, (m) => (RE_UUID.test(m) ? m : '[segredo]'));
  t = mascararPII(t).replace(/\s+/g, ' ').trim().slice(0, 300);
  return t || 'erro_desconhecido';
}

module.exports = {
  TZ, HORA_INICIO_BRT, TETO_TEMAS, TETO_EXEMPLOS, TETO_AMOSTRA_PADRAO, MAX_CHARS_PADRAO,
  PALAVRAS_PASTORAIS, TOOL_AGRUPAR,
  partesBrt, periodoAnterior, periodoValido, limitesUtcDoPeriodo, rotuloPeriodo, deveRodarAgora,
  ehPastoral, mascararPII, prepararAmostra,
  montarSystemPrompt, montarUser, normalizarSaidaModelo,
  montarEmail, sanitizarErro,
};

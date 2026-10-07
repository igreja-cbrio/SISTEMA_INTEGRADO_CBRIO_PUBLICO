




















const crypto = require('crypto');
const { ehPastoral, mascararPII } = require('./botIaVarredura');

const VERSAO_TEMAS = 1;

const TEMAS = Object.freeze([
  ['solicitacoes', 'Solicitações'],
  ['tarefas', 'Minhas Tarefas'],
  ['avaliacoes', 'Avaliações'],
  ['rh', 'Recursos Humanos'],
  ['financeiro', 'Financeiro'],
  ['campanhas', 'Campanhas'],
  ['logistica', 'Logística'],
  ['patrimonio', 'Patrimônio'],
  ['permissoes_acesso', 'Permissões e acesso'],
  ['painel_indicadores', 'Painel e indicadores'],
  ['dashboard_semanal', 'Dashboard Semanal'],
  ['ata_semanal', 'ATA Semanal'],
  ['nps', 'NPS'],
  ['censo', 'Censo'],
  ['links_qr', 'Links e QR'],
  ['eventos', 'Eventos'],
  ['inscricoes', 'Inscrições'],
  ['projetos', 'Projetos'],
  ['planejamento', 'Planejamento'],
  ['governanca', 'Governança'],
  ['integracao', 'Integração'],
  ['membresia', 'Membresia'],
  ['cuidados', 'Cuidados'],
  ['comunicacao', 'Comunicação'],
  ['grupos', 'Grupos'],
  ['voluntariado', 'Voluntariado'],
  ['entradas', 'Entradas'],
  ['kids', 'Kids'],
  ['cultos', 'Cultos e áreas (Online, AMI, Bridge)'],
  ['marketing', 'Marketing'],
  ['producao', 'Produção de Culto'],
  ['login_perfil', 'Login e perfil'],
  ['navegacao_geral', 'Navegação geral'],
  ['fora_do_escopo', 'Fora do escopo'],
  ['outro', 'Outro'],
]);
const SLUGS_TEMAS = TEMAS.map(([slug]) => slug);
const ROTULO_TEMA = Object.freeze(Object.fromEntries(TEMAS));

const TIPOS = Object.freeze(['como_fazer', 'onde_fica', 'erro_sistema', 'permissao', 'sugestao', 'fora_do_escopo', 'outro']);
const RESOLVIDO = Object.freeze(['sim', 'parcial', 'nao', 'indefinido']);

const TAM_MAX_FALA = 2000;
const TAM_MAX_TRANSCRICAO = 12000;
const TAM_MAX_RESUMO = 140;
const MAX_TURNOS = 400;

function hashConversa(id) {
  return crypto.createHash('sha256').update(String(id || '')).digest('hex');
}

function diaBrt(data = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(data);
}



function normalizarTurnos(turnos) {
  if (!Array.isArray(turnos)) return [];
  const saida = [];
  for (const t of turnos.slice(-MAX_TURNOS)) {
    const role = t && (t.role === 'user' || t.role === 'assistant') ? t.role : null;
    const texto = t && typeof t.texto === 'string' ? t.texto.replace(/\s+/g, ' ').trim().slice(0, TAM_MAX_FALA) : '';
    if (role && texto) saida.push({ role, texto });
  }

  let total = 0;
  const cortado = [];
  for (let i = saida.length - 1; i >= 0; i -= 1) {
    total += saida[i].texto.length;
    if (total > TAM_MAX_TRANSCRICAO) break;
    cortado.unshift(saida[i]);
  }
  return cortado;
}

function temFalaDaPessoa(turnos) {
  return turnos.some((t) => t.role === 'user');
}


function conversaSensivel(turnos) {
  return turnos.some((t) => ehPastoral(t.texto));
}

function semAcento(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}


function tokensDoNome(nome) {
  return [...new Set(String(nome || '').split(/[^\p{L}]+/u).filter((p) => p.length >= 3).map(semAcento))];
}

function mascararNome(texto, tokens) {
  if (!tokens.length) return texto;
  return String(texto).replace(/[\p{L}]+/gu, (palavra) => (tokens.includes(semAcento(palavra)) ? '[pessoa]' : palavra));
}

function transcricaoParaModelo(turnos, { nomePessoa = null } = {}) {
  const tokens = tokensDoNome(nomePessoa);
  return turnos
    .map((t) => `${t.role === 'user' ? 'Pessoa' : 'Assistente'}: ${mascararNome(mascararPII(t.texto), tokens)}`)
    .join('\n');
}



const PERMITIDAS_MAIUSCULA = new Set([
  ...TEMAS.flatMap(([, rotulo]) => rotulo.split(/[^\p{L}]+/u)),
  'Pedrinho', 'CBRio', 'Tavus', 'Claude', 'Next', 'Kids', 'Online', 'Planning', 'Center', 'Mercado', 'Livre',
  'WhatsApp', 'Staff', 'Menu', 'Painel', 'Sistema', 'Integrado', 'Ministerial', 'Administração', 'Inteligência',
  'Cultos', 'Criativo', 'Totem', 'Reportar', 'Perfil', 'Notificações', 'Voluntários', 'Batismo', 'Jornada',
  'Igreja', 'Excel', 'Google', 'Microsoft', 'Pix', 'Dashboard', 'Semanal', 'Início', 'Página', 'Inicial',
].filter(Boolean).map(semAcento));

function temCaraDeNome(texto) {
  const palavras = String(texto).split(/\s+/);
  for (let i = 1; i < palavras.length; i += 1) {
    if (/[.!?:]$/.test(palavras[i - 1])) continue;
    const p = palavras[i].replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    if (!p || !/^\p{Lu}/u.test(p)) continue;
    if (p.length <= 5 && p === p.toUpperCase()) continue;
    if (!PERMITIDAS_MAIUSCULA.has(semAcento(p))) return true;
  }
  return false;
}

function resumoSeguro(texto, { nomePessoa = null } = {}) {
  const limpo = String(texto || '').replace(/\s+/g, ' ').trim().slice(0, TAM_MAX_RESUMO);
  if (!limpo) return null;
  const mascarado = mascararPII(limpo);
  if (mascarado !== limpo) return null;
  if (/\d{4,}/.test(limpo) || limpo.includes('@') || limpo.includes('[')) return null;
  const tokens = tokensDoNome(nomePessoa);
  if (tokens.length && mascararNome(limpo, tokens) !== limpo) return null;
  if (temCaraDeNome(limpo)) return null;
  return limpo;
}

function normalizarClassificacao(bruto, { nomePessoa = null } = {}) {
  const b = bruto && typeof bruto === 'object' ? bruto : {};
  return {
    tema: SLUGS_TEMAS.includes(b.tema) ? b.tema : 'outro',
    tipo: TIPOS.includes(b.tipo) ? b.tipo : 'outro',
    resolvido: RESOLVIDO.includes(b.resolvido) ? b.resolvido : 'indefinido',
    resumo: resumoSeguro(b.resumo, { nomePessoa }),
  };
}

const TOOL_CLASSIFICAR = Object.freeze({
  name: 'registrar_tema',
  description: 'Registra o assunto da dúvida de uma conversa com o assistente de uso do sistema.',
  input_schema: {
    type: 'object',
    properties: {
      tema: { type: 'string', enum: SLUGS_TEMAS, description: 'Área do sistema da dúvida principal.' },
      tipo: { type: 'string', enum: [...TIPOS], description: 'Tipo da dúvida.' },
      resolvido: { type: 'string', enum: [...RESOLVIDO], description: 'Se o assistente resolveu a dúvida.' },
      resumo: { type: 'string', description: 'A dúvida em até 140 caracteres, genérica, SEM nomes de pessoas, números ou dados pessoais. Ex.: "como aprovar uma solicitação de compra".' },
    },
    required: ['tema', 'tipo', 'resolvido', 'resumo'],
  },
});

function montarSystemPrompt() {
  const lista = TEMAS.map(([slug, rotulo]) => `- ${slug}: ${rotulo}`).join('\n');
  return [
    'Você classifica conversas entre funcionários de uma igreja e o assistente de IA que ensina a usar o sistema interno.',
    'Responda SOMENTE chamando a ferramenta registrar_tema.',
    'O resumo descreve a dúvida de forma genérica, sem nomes de pessoas, números, datas ou qualquer dado pessoal.',
    'Nomes de pessoas na conversa aparecem como [pessoa] ou por extenso: nunca os repita no resumo.',
    'Temas possíveis:',
    lista,
  ].join('\n');
}



function agregarTemas(linhas) {
  const classificadas = linhas.filter((l) => l.status === 'classificado');
  const porTema = new Map();
  const porTela = new Map();
  const porTipo = new Map();
  for (const l of classificadas) {
    const t = porTema.get(l.tema) || { tema: l.tema, rotulo: ROTULO_TEMA[l.tema] || l.tema, total: 0, nao_resolvidas: 0 };
    t.total += 1;
    if (l.resolvido === 'nao' || l.resolvido === 'parcial') t.nao_resolvidas += 1;
    porTema.set(l.tema, t);
    const tela = l.tela_rotulo || 'Tela não identificada';
    porTela.set(tela, (porTela.get(tela) || 0) + 1);
    porTipo.set(l.tipo, (porTipo.get(l.tipo) || 0) + 1);
  }
  const ordenar = (m) => [...m.entries()].map(([chave, total]) => ({ chave, total })).sort((a, b) => b.total - a.total);
  return {
    totais: {
      conversas: linhas.length,
      classificadas: classificadas.length,
      descartadas_sensiveis: linhas.filter((l) => l.status === 'descartado').length,
      com_erro: linhas.filter((l) => l.status === 'erro').length,
      nao_resolvidas: classificadas.filter((l) => l.resolvido === 'nao' || l.resolvido === 'parcial').length,
    },
    por_tema: [...porTema.values()].sort((a, b) => b.total - a.total),
    por_tela: ordenar(porTela),
    por_tipo: ordenar(porTipo),
    lacunas: classificadas
      .filter((l) => (l.resolvido === 'nao' || l.resolvido === 'parcial') && l.resumo)
      .slice(0, 50)
      .map((l) => ({ dia: l.dia, tema: ROTULO_TEMA[l.tema] || l.tema, resumo: l.resumo, resolvido: l.resolvido })),
  };
}

module.exports = {
  VERSAO_TEMAS, TEMAS, SLUGS_TEMAS, ROTULO_TEMA, TIPOS, RESOLVIDO, TOOL_CLASSIFICAR,
  hashConversa, diaBrt, normalizarTurnos, temFalaDaPessoa, conversaSensivel, tokensDoNome, mascararNome,
  temCaraDeNome, transcricaoParaModelo, resumoSeguro, normalizarClassificacao, montarSystemPrompt, agregarTemas,
};

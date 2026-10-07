



















export const TAVUS_DEPLOYMENT_ID = '13f2330a-6504-4a5b-8b96-21a1b98cdd58';







export const TAVUS_WIDGET_VERSAO = '0.18.0';
export const TAVUS_WIDGET_SRC = `/vendor/tavus-widget-${TAVUS_WIDGET_VERSAO}.iife.js`;
export const TAVUS_WIDGET_SRI = 'sha384-wffnI1tIci7bPo1NFluSsimUgEV56e4c0gHsQzxRi2/4iz2iTtHA2n/5hZrP7bPu';




export const CONSENTIMENTO_VERSAO = 2;

export function chaveConsentimento(profileId: string): string {
  return `cbrio_tavus_consentimento_v${CONSENTIMENTO_VERSAO}_${profileId}`;
}




export function chaveMemoria(profileId: string): string {
  return `cbrio_tavus_memoria_${profileId}`;
}

export function memoryStoreDe(idAleatorio: string): string {
  const limpo = String(idAleatorio || '').replace(/[^a-zA-Z0-9-]/g, '');
  return limpo ? `${TAVUS_DEPLOYMENT_ID}-${limpo}` : '';
}

const TAM_MAX_NOME = 30;
const TAM_MAX_ROTULO = 60;

export function primeiroNome(nome: string | null | undefined): string {
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || '';
  return primeiro.replace(/[^\p{L}'-]/gu, '').slice(0, TAM_MAX_NOME);
}

export type ItemDeMenu = { label: string; path?: string };


const ROTULOS_FORA_DO_MENU: ItemDeMenu[] = [
  { label: 'Página inicial', path: '/dashboard' },
  { label: 'Meu Perfil', path: '/perfil' },
  { label: 'Notificações', path: '/notificacoes' },
];

function semConsultaNemAncora(pathname: string): string {
  return String(pathname || '').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
}



export function rotuloDaRota(pathname: string, itens: ItemDeMenu[]): string | null {
  const caminho = semConsultaNemAncora(pathname);
  let melhor: ItemDeMenu | null = null;
  for (const item of [...itens, ...ROTULOS_FORA_DO_MENU]) {
    const base = item.path ? semConsultaNemAncora(item.path) : '';
    if (!base || base === '/') continue;
    const casa = caminho === base || caminho.startsWith(`${base}/`);
    if (casa && (!melhor || base.length > semConsultaNemAncora(melhor.path || '').length)) melhor = item;
  }
  return melhor ? limparRotulo(melhor.label) : null;
}

function limparRotulo(rotulo: string): string {
  return String(rotulo || '').replace(/["“”\n\r]/g, '').trim().slice(0, TAM_MAX_ROTULO);
}

export function montarContexto({ nome, rotuloTela }: { nome?: string | null; rotuloTela?: string | null }): string {
  const quem = primeiroNome(nome);
  const tela = rotuloTela ? `na tela "${limparRotulo(rotuloTela)}"` : 'em uma tela do sistema';
  const partes = [
    'Você está dentro do Sistema Integrado CBRio, o sistema interno da igreja, falando com alguém da equipe.',
    quem ? `A pessoa se chama ${quem} e está agora ${tela}.` : `A pessoa está agora ${tela}.`,
    'Ajude só com o uso do sistema e não peça dados de membros, de crianças ou pedidos de oração.',
  ];
  return partes.join(' ');
}





export const TAVUS_INIT_URL = `https://tavusapi.com/v2/deployments/${TAVUS_DEPLOYMENT_ID}/init`;

export function mensagemIndisponivel(motivo: string | null | undefined): string {
  switch (motivo) {
    case 'daily_limit':
      return 'As conversas por vídeo de hoje já foram usadas. Tente de novo amanhã ou use o Pedrinho por texto.';
    case 'total_limit':
      return 'O limite de conversas por vídeo da conta foi atingido. Use o Pedrinho por texto enquanto isso.';
    case 'busy':
      return 'Outra pessoa está conversando com o assistente agora. Tente de novo em alguns minutos ou use o Pedrinho por texto.';
    default:
      return 'Não foi possível abrir o assistente em vídeo agora. Tente de novo mais tarde ou use o Pedrinho por texto.';
  }
}

export function contextoDeNavegacao(rotuloTela: string | null): string {
  return rotuloTela
    ? `A pessoa acabou de abrir a tela "${limparRotulo(rotuloTela)}" do sistema.`
    : 'A pessoa acabou de abrir outra tela do sistema.';
}







export type Turno = { role: 'user' | 'assistant'; texto: string };

const TAM_MAX_FALA = 2000;

export function turnoDeEvento(detalhe: unknown): Turno | null {
  const d = detalhe as { kind?: unknown; event_type?: unknown; properties?: Record<string, unknown> } | null;
  if (!d || d.kind !== 'utterance' || !d.properties) return null;
  const p = d.properties;
  if (typeof p.final === 'boolean') return null;
  const texto = typeof p.speech === 'string' ? p.speech.trim() : '';
  if (!texto) return null;
  const role = p.role === 'user' ? 'user' : (p.role === 'replica' || p.role === 'assistant' || p.role === 'pal') ? 'assistant' : null;
  if (!role) return null;
  return { role, texto: texto.slice(0, TAM_MAX_FALA) };
}




export const TAM_MAX_ENVIO = 40_000;

export function falasParaEnvio(turnos: Turno[]): Turno[] {
  const saida: Turno[] = [];
  let total = 0;
  for (let i = turnos.length - 1; i >= 0; i -= 1) {
    const t = turnos[i];
    total += t.texto.length + 20;
    if (total > TAM_MAX_ENVIO) break;
    saida.unshift(t);
  }
  return saida;
}


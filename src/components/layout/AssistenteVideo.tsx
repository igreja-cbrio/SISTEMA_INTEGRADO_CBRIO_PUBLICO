



















import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { VideoOff } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { assistenteConversas } from '../../api';
import { FERRAMENTA_FORMULARIO, FERRAMENTA_TELA, idDaChamada, type ChamadaFerramenta, type ResultadoAcao } from '../../lib/acoesAssistente';
import { registrarEncerramento } from '../../lib/saidaAssistenteVideo';
import {
  TAVUS_DEPLOYMENT_ID,
  TAVUS_INIT_URL,
  TAVUS_WIDGET_SRC,
  TAVUS_WIDGET_SRI,
  chaveConsentimento,
  chaveMemoria,
  contextoDeNavegacao,
  falasParaEnvio,
  memoryStoreDe,
  mensagemIndisponivel,
  montarContexto,
  turnoDeEvento,
  type Turno,
} from '../../lib/assistenteVideo';

type ElementoTavus = HTMLElement & {
  open?: () => void;
  destroy?: () => void;
  sendMessage?: (interacao: unknown) => void;
};

type Props = {
  pedidoAbrir: number;
  onAtivoChange: (ativo: boolean) => void;
  nome?: string | null;
  profileId?: string | null;
  rotuloTela: string | null;
  onFerramenta?: (chamada: ChamadaFerramenta) => ResultadoAcao | null;
};

const TEMPO_MAX_CONSULTA_MS = 8000;
const TEMPO_MAX_PRONTO_MS = 15000;
const INTERVALO_MIN_ACOES_MS = 2000;
const MAX_FALAS = 400;

let promessaScript: Promise<void> | null = null;
let scriptAtual: HTMLScriptElement | null = null;

function carregarScript(): Promise<void> {
  if (window.customElements.get('tavus-widget')) return Promise.resolve();
  if (promessaScript && scriptAtual?.isConnected) return promessaScript;
  promessaScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    scriptAtual = script;
    script.src = TAVUS_WIDGET_SRC;
    script.integrity = TAVUS_WIDGET_SRI;
    script.crossOrigin = 'anonymous';
    script.async = true;
    script.onload = () => { window.customElements.whenDefined('tavus-widget').then(() => resolve()); };
    script.onerror = () => {
      promessaScript = null;
      script.remove();
      reject(new Error('Falha ao carregar o widget da Tavus'));
    };
    document.head.appendChild(script);
  });
  return promessaScript;
}

type Disponibilidade = { ok: boolean; motivo?: string | null };

async function consultarDisponibilidade(): Promise<Disponibilidade> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TEMPO_MAX_CONSULTA_MS);
  try {
    const res = await fetch(TAVUS_INIT_URL, { signal: controle.signal });
    if (!res.ok) return { ok: false, motivo: null };
    const config = await res.json();
    if (config?.is_available === false) return { ok: false, motivo: config.unavailable_reason ?? null };
    return { ok: true };
  } catch {
    return { ok: false, motivo: null };
  } finally {
    clearTimeout(timer);
  }
}

function lerLocal(chave: string): string | null {
  try { return window.localStorage.getItem(chave); } catch { return null; }
}

function gravarLocal(chave: string, valor: string): void {
  try { window.localStorage.setItem(chave, valor); } catch {                                                           }
}

function idDeMemoria(profileId: string): string {
  const chave = chaveMemoria(profileId);
  const salvo = lerLocal(chave);
  if (salvo) return salvo;
  const novo = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : '';
  if (novo) gravarLocal(chave, novo);
  return novo;
}

function removerElemento(el: ElementoTavus | null): void {
  if (!el) return;
  try { el.destroy?.(); } catch {                                                  }
  if (el.isConnected) el.remove();
}

export default function AssistenteVideo({ pedidoAbrir, onAtivoChange, nome, profileId, rotuloTela, onFerramenta }: Props) {
  const [avisoAberto, setAvisoAberto] = useState(false);
  const [naTela, setNaTela] = useState(false);
  const elementoRef = useRef<ElementoTavus | null>(null);
  const carregandoRef = useRef(false);
  const emChamadaRef = useRef(false);
  const rotuloNaCriacaoRef = useRef<string | null>(null);
  const timerProntoRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  const geracaoRef = useRef(0);
  const atualRef = useRef({ nome, rotuloTela, onAtivoChange, onFerramenta });
  atualRef.current = { nome, rotuloTela, onAtivoChange, onFerramenta };

  const conversaIdRef = useRef<string | null>(null);
  const turnosRef = useRef<Turno[]>([]);
  const enviadoRef = useRef(false);
  const inicioRef = useRef<number | null>(null);

  const chamadasVistasRef = useRef(new Set<string>());
  const ultimaAcaoRef = useRef(0);

  const limparTimerPronto = () => {
    if (timerProntoRef.current) clearTimeout(timerProntoRef.current);
    timerProntoRef.current = null;
  };




  const enviarConversa = useCallback((): Promise<void> => {
    const id = conversaIdRef.current;
    if (!id || enviadoRef.current) return Promise.resolve();
    const falas = falasParaEnvio(turnosRef.current);
    if (!falas.some((t) => t.role === 'user')) return Promise.resolve();
    enviadoRef.current = true;
    const duracao = inicioRef.current ? Math.round((Date.now() - inicioRef.current) / 1000) : null;
    return assistenteConversas
      .registrarVideo({ conversa_id: id, tela_rotulo: rotuloNaCriacaoRef.current, duracao_s: duracao, turnos: falas }, { keepalive: true })
      .then(() => undefined)
      .catch(() => {                                                                     });
  }, []);

  const encerrar = useCallback(() => {
    enviarConversa();
    geracaoRef.current += 1;
    limparTimerPronto();
    const el = elementoRef.current;
    elementoRef.current = null;
    emChamadaRef.current = false;
    removerElemento(el);
    setNaTela(false);
    atualRef.current.onAtivoChange(false);
  }, [enviarConversa]);

  const iniciar = useCallback(async () => {
    if (!profileId) return;
    if (elementoRef.current) { elementoRef.current.open?.(); return; }
    if (carregandoRef.current) return;
    carregandoRef.current = true;
    const geracao = geracaoRef.current;
    try {
      const disponivel = await consultarDisponibilidade();
      if (geracao !== geracaoRef.current) return;
      if (!disponivel.ok) { toast.error(mensagemIndisponivel(disponivel.motivo)); return; }
      await carregarScript();
      if (geracao !== geracaoRef.current) return;

      const el = document.createElement('tavus-widget') as ElementoTavus;
      el.setAttribute('deployment-id', TAVUS_DEPLOYMENT_ID);
      el.setAttribute('camera-on-start', 'off');
      el.setAttribute('override-config', JSON.stringify({ customization: { widget: { expandable: 'start-expanded' } } }));
      el.setAttribute('conversational-context', montarContexto(atualRef.current));
      const memoria = memoryStoreDe(idDeMemoria(profileId));
      if (memoria) el.setAttribute('memory-stores', memoria);

      el.addEventListener('tavus:ready', () => { limparTimerPronto(); el.open?.(); });




      const idDoEvento = (e: Event) => {
        const id = (e as CustomEvent<{ conversationId?: unknown }>).detail?.conversationId;
        return typeof id === 'string' && id ? id : null;
      };
      el.addEventListener('tavus:conversation-started', (e) => { conversaIdRef.current = idDoEvento(e) || conversaIdRef.current; });
      el.addEventListener('tavus:conversation-created', (e) => { conversaIdRef.current = conversaIdRef.current || idDoEvento(e); });
      el.addEventListener('tavus:protocol-message', (e) => {
        const turno = turnoDeEvento((e as CustomEvent).detail);
        if (!turno) return;

        if (turnosRef.current.length >= MAX_FALAS) turnosRef.current.shift();
        turnosRef.current.push(turno);
      });
      el.addEventListener('tavus:tool-call', (e) => {
        const chamada = (e as CustomEvent<ChamadaFerramenta>).detail;
        const tratar = atualRef.current.onFerramenta;
        if (!tratar || !chamada) return;
        if (chamada.name !== FERRAMENTA_TELA && chamada.name !== FERRAMENTA_FORMULARIO) return;
        const id = idDaChamada(chamada);
        if (id && chamadasVistasRef.current.has(id)) return;
        if (id) chamadasVistasRef.current.add(id);
        const agora = Date.now();
        let resultado: ResultadoAcao | null;
        if (agora - ultimaAcaoRef.current < INTERVALO_MIN_ACOES_MS) {
          resultado = { status: 'error', output: 'Uma ação de cada vez: espere a tela anterior abrir e peça de novo.' };
        } else {
          ultimaAcaoRef.current = agora;
          resultado = tratar(chamada);
        }
        if (!resultado || !id) return;
        try {
          el.sendMessage?.({ event_type: 'conversation.tool_result', properties: { tool_call_id: id, output: resultado.output, status: resultado.status } });
        } catch {                                                                              }
      });
      el.addEventListener('tavus:state-change', (e) => {
        const estado = (e as CustomEvent<{ state?: string }>).detail?.state;
        if (estado === 'connecting') {

          enviarConversa();
          conversaIdRef.current = null;
          turnosRef.current = [];
          enviadoRef.current = false;
          inicioRef.current = null;
          rotuloNaCriacaoRef.current = atualRef.current.rotuloTela;
        }
        const conectou = estado === 'connected';
        if (conectou && !inicioRef.current) inicioRef.current = Date.now();
        if (conectou && !emChamadaRef.current && atualRef.current.rotuloTela !== rotuloNaCriacaoRef.current) {

          el.sendMessage?.({ event_type: 'conversation.append_llm_context', properties: { context: contextoDeNavegacao(atualRef.current.rotuloTela) } });
        }
        emChamadaRef.current = conectou;
      });
      el.addEventListener('tavus:conversation-ended', (e) => {
        emChamadaRef.current = false;
        conversaIdRef.current = conversaIdRef.current || idDoEvento(e);
        enviarConversa();
      });
      el.addEventListener('tavus:error', (e) => {
        console.warn('[assistente-video] erro do widget:', (e as CustomEvent<{ code?: string }>).detail?.code);
      });

      document.body.appendChild(el);
      elementoRef.current = el;
      setNaTela(true);
      atualRef.current.onAtivoChange(true);
      timerProntoRef.current = setTimeout(() => {
        toast.error(mensagemIndisponivel(null));
        encerrar();
      }, TEMPO_MAX_PRONTO_MS);
    } catch {
      toast.error(mensagemIndisponivel(null));
    } finally {
      carregandoRef.current = false;
    }
  }, [profileId, encerrar, enviarConversa]);

  useEffect(() => {
    if (!pedidoAbrir || !profileId) return;
    if (lerLocal(chaveConsentimento(profileId))) iniciar();
    else setAvisoAberto(true);
  }, [pedidoAbrir, profileId, iniciar]);


  useEffect(() => registrarEncerramento(async () => {
    const envio = enviarConversa();
    if (elementoRef.current) encerrar();
    await envio;
  }), [enviarConversa, encerrar]);


  useEffect(() => {
    window.addEventListener('pagehide', enviarConversa);
    return () => window.removeEventListener('pagehide', enviarConversa);
  }, [enviarConversa]);


  useEffect(() => () => {
    enviarConversa();
    geracaoRef.current += 1;
    limparTimerPronto();
    removerElemento(elementoRef.current);
    elementoRef.current = null;
  }, [enviarConversa]);



  useEffect(() => {
    const el = elementoRef.current;
    if (!el) return;
    el.setAttribute('conversational-context', montarContexto({ nome, rotuloTela }));
    if (emChamadaRef.current) {
      el.sendMessage?.({ event_type: 'conversation.append_llm_context', properties: { context: contextoDeNavegacao(rotuloTela) } });
    }
  }, [rotuloTela, nome]);

  function aceitar() {
    if (profileId) gravarLocal(chaveConsentimento(profileId), new Date().toISOString());
    setAvisoAberto(false);
    iniciar();
  }

  return (
    <>
      {naTela && (


        <button
          type="button"
          onClick={encerrar}
          className="fixed z-[55] flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold text-white shadow-lg transition-colors
                     bottom-4 right-[23.75rem]
                     max-[700px]:bottom-auto max-[700px]:right-auto max-[700px]:left-3 max-[700px]:top-3"
          style={{ background: '#1f2937' }}
        >
          <VideoOff className="h-4 w-4" /> Encerrar vídeo
        </button>
      )}
      <Dialog open={avisoAberto} onOpenChange={setAvisoAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assistente em vídeo (beta)</DialogTitle>
            <DialogDescription>Antes de começar, leia com atenção.</DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-2 pl-5 text-sm" style={{ color: 'var(--cbrio-text2)' }}>
            <li>Você vai conversar com uma <strong>inteligência artificial</strong> em vídeo, não com uma pessoa.</li>
            <li>O serviço é da <strong>Tavus</strong>, empresa dos Estados Unidos. Sua voz, e sua imagem se você ligar a câmera, são processadas por ela. A câmera começa desligada.</li>
            <li>A Tavus guarda a transcrição da conversa e uma memória, para o assistente lembrar de você nas próximas conversas.</li>
            <li>No fim da conversa, o texto (sem CPF, telefone, e-mail e links) é enviado à <strong>Anthropic</strong>, empresa dos Estados Unidos dona do Claude, só para identificar o assunto. O sistema guarda só o <strong>assunto</strong> da sua dúvida, sem o seu nome, por até 12 meses, para melhorar o manual. Ninguém é avaliado por isso.</li>
            <li>Use só para dúvidas sobre o uso do sistema. <strong>Não fale</strong> dados de membros, de crianças, pedidos de oração nem senhas. Quando o assistente abrir um formulário, <strong>digite</strong> os dados.</li>
            <li>A IA pode errar: confirme orientações importantes com a equipe responsável.</li>
          </ul>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAvisoAberto(false)}>Agora não</Button>
            <Button onClick={aceitar}>Entendi, continuar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

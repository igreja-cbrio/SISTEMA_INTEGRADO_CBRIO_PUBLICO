import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';

const { toastErro, registrarVideo } = vi.hoisted(() => ({ toastErro: vi.fn(), registrarVideo: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: toastErro, success: vi.fn() } }));
vi.mock('../api', () => ({
  agents: { sessions: vi.fn().mockResolvedValue([]), ask: vi.fn(), sessionMessages: vi.fn(), deleteSession: vi.fn() },
  assistenteConversas: { registrarVideo, temas: vi.fn() },
}));
vi.mock('../lib/pedrinhoVoz', () => ({ pedrinhoFalar: vi.fn(), pedrinhoParar: vi.fn() }));
vi.mock('../components/ui/siri-wave', () => ({ SiriWave: () => null }));

import ChatIAFloating from '../components/layout/ChatIAFloating';
import AssistenteVideo from '../components/layout/AssistenteVideo';
import { TAVUS_INIT_URL, TAVUS_WIDGET_SRI, chaveConsentimento, mensagemIndisponivel } from '../lib/assistenteVideo';



function armazenamentoDeTeste() {
  const dados = new Map<string, string>();
  return {
    getItem: (k: string) => (dados.has(k) ? dados.get(k)! : null),
    setItem: (k: string, v: string) => { dados.set(k, String(v)); },
    removeItem: (k: string) => { dados.delete(k); },
    clear: () => dados.clear(),
    key: (i: number) => [...dados.keys()][i] ?? null,
    get length() { return dados.size; },
  };
}

function initResponde(corpo: unknown, ok = true) {
  const f = vi.fn().mockResolvedValue({ ok, json: async () => corpo });
  vi.stubGlobal('fetch', f);
  return f;
}

const scriptDoWidget = () => document.head.querySelector<HTMLScriptElement>('script[src*="tavus-widget"]');
const widgetNaPagina = () => document.querySelector('tavus-widget');

const esperar = () => act(async () => { for (let i = 0; i < 20; i += 1) await Promise.resolve(); });

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: armazenamentoDeTeste(), configurable: true });

  Element.prototype.scrollIntoView = vi.fn();
  scriptDoWidget()?.remove();
  widgetNaPagina()?.remove();
  toastErro.mockClear();
  registrarVideo.mockReset();
  registrarVideo.mockResolvedValue({ ok: true });
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Pedrinho · entrada do assistente em vídeo', () => {
  it('sem a prop de vídeo, o Pedrinho não tem botão de vídeo', () => {
    render(<ChatIAFloating />);
    fireEvent.click(screen.getByLabelText('Abrir o Pedrinho'));
    expect(screen.queryByTitle('Falar por vídeo (beta)')).toBeNull();
  });

  it('"Falar por vídeo" pede o vídeo e fecha o painel do Pedrinho', () => {
    const abrir = vi.fn();
    render(<ChatIAFloating video={{ ativo: false, abrir }} />);
    fireEvent.click(screen.getByLabelText('Abrir o Pedrinho'));
    fireEvent.click(screen.getByTitle('Falar por vídeo (beta)'));
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Pedrinho, assistente IA' })).toBeNull();
  });

  it('com o vídeo ativo, o Pedrinho sai de cena (o widget cobre o canto dele)', () => {
    render(<ChatIAFloating video={{ ativo: true, abrir: vi.fn() }} />);
    expect(screen.queryByLabelText('Abrir o Pedrinho')).toBeNull();
  });
});

describe('AppShell · o vídeo é só de super-admin', () => {
  const shell = semComentariosJs(readFileSync(join(__dirname, '..', 'components', 'layout', 'AppShell.jsx'), 'utf8'));

  it('o Pedrinho só recebe a prop de vídeo para super-admin', () => {
    expect(shell).toMatch(/const videoDoPedrinho = isSuperAdmin\s*\?/);
  });

  it('o AssistenteVideo só é montado para super-admin', () => {
    expect(shell).toMatch(/\{isSuperAdmin && \(\s*<AssistenteVideo/);
  });

  it('o Reportar só sai de cena com o vídeo de fato na tela', () => {
    expect(shell).toMatch(/const videoNaTela = !!isSuperAdmin && videoAtivo/);
    expect(shell).toMatch(/\{!videoNaTela && <FeedbackButton \/>\}/);
  });
});

describe('Assistente em vídeo · consentimento e disponibilidade antes de carregar', () => {
  const props = { onAtivoChange: vi.fn(), nome: 'Ana Paula', profileId: 'perfil-1', rotuloTela: 'Solicitações' };

  function pedir(extra: Partial<typeof props> = {}) {
    const r = render(<AssistenteVideo {...props} {...extra} pedidoAbrir={0} />);
    r.rerender(<AssistenteVideo {...props} {...extra} pedidoAbrir={1} />);
    return r;
  }

  it('nada sai para a Tavus antes do aviso; "Agora não" mantém tudo fora', () => {
    const fetchMock = initResponde({ is_available: true });
    pedir();
    expect(screen.getByText('Assistente em vídeo (beta)')).toBeTruthy();
    fireEvent.click(screen.getByText('Agora não'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(scriptDoWidget()).toBeNull();
    expect(window.localStorage.getItem(chaveConsentimento('perfil-1'))).toBeNull();
  });

  it('aceitar grava o consentimento, consulta o /init e carrega o script travado com SRI', async () => {
    const fetchMock = initResponde({ is_available: true });
    pedir();
    await act(async () => { fireEvent.click(screen.getByText('Entendi, continuar')); });
    await esperar();
    expect(window.localStorage.getItem(chaveConsentimento('perfil-1'))).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(TAVUS_INIT_URL, expect.anything());
    expect(scriptDoWidget()?.getAttribute('src')).toBe('/vendor/tavus-widget-0.18.0.iife.js');
    expect(scriptDoWidget()?.integrity).toBe(TAVUS_WIDGET_SRI);
  });

  it('quem já aceitou não vê o aviso de novo', async () => {
    window.localStorage.setItem(chaveConsentimento('perfil-1'), '2026-10-05T00:00:00.000Z');
    initResponde({ is_available: true });
    pedir();
    await esperar();
    expect(screen.queryByText('Assistente em vídeo (beta)')).toBeNull();
    expect(scriptDoWidget()).not.toBeNull();
  });

  it('o aceite é por pessoa: outro perfil no mesmo navegador vê o aviso', () => {
    window.localStorage.setItem(chaveConsentimento('perfil-1'), '2026-10-05T00:00:00.000Z');
    initResponde({ is_available: true });
    pedir({ profileId: 'perfil-2' });
    expect(screen.getByText('Assistente em vídeo (beta)')).toBeTruthy();
  });

  it('⚠️ deployment indisponível: avisa em português e não monta widget vazio', async () => {
    window.localStorage.setItem(chaveConsentimento('perfil-1'), 'x');
    initResponde({ is_available: false, unavailable_reason: 'total_limit' });
    pedir();
    await esperar();
    expect(toastErro).toHaveBeenCalledWith(mensagemIndisponivel('total_limit'));
    expect(scriptDoWidget()).toBeNull();
    expect(props.onAtivoChange).not.toHaveBeenCalledWith(true);
  });

  it('⚠️ /init recusado (origem, Tavus fora do ar): avisa e não monta nada', async () => {
    window.localStorage.setItem(chaveConsentimento('perfil-1'), 'x');
    initResponde({ error: 'Origin not allowed' }, false);
    pedir();
    await esperar();
    expect(toastErro).toHaveBeenCalledWith(mensagemIndisponivel(null));
    expect(scriptDoWidget()).toBeNull();
  });

  it('⚠️ rede barrando a Tavus: avisa e não monta nada', async () => {
    window.localStorage.setItem(chaveConsentimento('perfil-1'), 'x');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    pedir();
    await esperar();
    expect(toastErro).toHaveBeenCalledWith(mensagemIndisponivel(null));
    expect(scriptDoWidget()).toBeNull();
  });
});


describe('Assistente em vídeo · widget montado', () => {
  beforeAll(() => {
    class WidgetFalso extends HTMLElement {
      open = vi.fn();
      sendMessage = vi.fn();
      destroy() { this.remove(); }
    }
    window.customElements.define('tavus-widget', WidgetFalso);
  });

  async function montar(onAtivoChange = vi.fn(), onFerramenta?: (c: unknown) => unknown) {
    window.localStorage.setItem(chaveConsentimento('perfil-1'), 'x');
    initResponde({ is_available: true });
    const props = { onAtivoChange, onFerramenta: onFerramenta as never, nome: 'Ana Paula Souza', profileId: 'perfil-1', rotuloTela: 'Solicitações' };
    const r = render(<AssistenteVideo {...props} pedidoAbrir={0} />);
    r.rerender(<AssistenteVideo {...props} pedidoAbrir={1} />);
    await esperar();
    return { ...r, onAtivoChange };
  }

  type WidgetTeste = HTMLElement & { sendMessage: ReturnType<typeof vi.fn> };
  const disparar = (el: HTMLElement, nome: string, detail: unknown) =>
    act(async () => { el.dispatchEvent(new CustomEvent(nome, { detail })); });
  const pedido = (name: string, args: Record<string, unknown>, id?: string) =>
    ({ name, arguments: JSON.stringify(args), ...(id ? { tool_call_id: id } : {}) });

  it('monta com câmera desligada e contexto só com primeiro nome e rótulo', async () => {
    await montar();
    const el = widgetNaPagina()!;
    expect(el).not.toBeNull();
    expect(el.getAttribute('camera-on-start')).toBe('off');
    const contexto = el.getAttribute('conversational-context') || '';
    expect(contexto).toContain('Ana');
    expect(contexto).not.toContain('Souza');
    expect(contexto).toContain('"Solicitações"');
    expect(el.getAttribute('memory-stores')).toMatch(/^13f2330a-6504-4a5b-8b96-21a1b98cdd58-/);
  });

  it('"Encerrar vídeo" fica por cima do widget e tira tudo da página', async () => {
    const { onAtivoChange } = await montar();
    expect(onAtivoChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByText('Encerrar vídeo'));
    expect(widgetNaPagina()).toBeNull();
    expect(onAtivoChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByText('Encerrar vídeo')).toBeNull();
  });

  it('⚠️ widget que nunca fica pronto sai da página com aviso, em vez de ficar invisível', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { onAtivoChange } = await montar();
    expect(widgetNaPagina()).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(15000); });
    expect(toastErro).toHaveBeenCalledWith(mensagemIndisponivel(null));
    expect(widgetNaPagina()).toBeNull();
    expect(onAtivoChange).toHaveBeenLastCalledWith(false);
  });

  it('tavus:ready cancela o tempo limite e abre o widget', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await montar();
    const el = widgetNaPagina() as HTMLElement & { open: ReturnType<typeof vi.fn> };
    await act(async () => { el.dispatchEvent(new CustomEvent('tavus:ready', { detail: {} })); });
    await act(async () => { vi.advanceTimersByTime(15000); });
    expect(el.open).toHaveBeenCalled();
    expect(widgetNaPagina()).not.toBeNull();
    expect(toastErro).not.toHaveBeenCalled();
  });

  it('trocar de tela durante a chamada avisa o assistente; fora dela, só atualiza a próxima', async () => {
    const r = await montar();
    const el = widgetNaPagina() as HTMLElement & { sendMessage: ReturnType<typeof vi.fn> };
    r.rerender(<AssistenteVideo onAtivoChange={r.onAtivoChange} nome="Ana Paula Souza" profileId="perfil-1" rotuloTela="Integração" pedidoAbrir={1} />);
    expect(el.sendMessage).not.toHaveBeenCalled();
    expect(el.getAttribute('conversational-context')).toContain('"Integração"');
    await act(async () => { el.dispatchEvent(new CustomEvent('tavus:state-change', { detail: { state: 'connected' } })); });
    r.rerender(<AssistenteVideo onAtivoChange={r.onAtivoChange} nome="Ana Paula Souza" profileId="perfil-1" rotuloTela="Membresia" pedidoAbrir={1} />);
    expect(el.sendMessage).toHaveBeenLastCalledWith({
      event_type: 'conversation.append_llm_context',
      properties: { context: 'A pessoa acabou de abrir a tela "Membresia" do sistema.' },
    });
    expect(el.getAttribute('conversational-context')).toContain('"Membresia"');
  });

  it('trocou de tela enquanto a sala era criada: ao conectar, o assistente recebe a tela atual', async () => {
    const r = await montar();
    const el = widgetNaPagina() as HTMLElement & { sendMessage: ReturnType<typeof vi.fn> };
    await act(async () => { el.dispatchEvent(new CustomEvent('tavus:state-change', { detail: { state: 'connecting' } })); });
    r.rerender(<AssistenteVideo onAtivoChange={r.onAtivoChange} nome="Ana Paula Souza" profileId="perfil-1" rotuloTela="Kids" pedidoAbrir={1} />);
    expect(el.sendMessage).not.toHaveBeenCalled();
    await act(async () => { el.dispatchEvent(new CustomEvent('tavus:state-change', { detail: { state: 'connected' } })); });
    expect(el.sendMessage).toHaveBeenCalledWith({
      event_type: 'conversation.append_llm_context',
      properties: { context: 'A pessoa acabou de abrir a tela "Kids" do sistema.' },
    });
  });

  it('pedido de ação: executa pelo AppShell e devolve o resultado com o mesmo tool_call_id', async () => {
    const onFerramenta = vi.fn().mockReturnValue({ status: 'success', output: 'A tela Grupos foi aberta para a pessoa.' });
    await montar(vi.fn(), onFerramenta);
    const el = widgetNaPagina() as WidgetTeste;
    await disparar(el, 'tavus:tool-call', pedido('ir_para_tela', { tela: 'grupos' }, 't1'));
    expect(onFerramenta).toHaveBeenCalledTimes(1);
    expect(el.sendMessage).toHaveBeenCalledWith({
      event_type: 'conversation.tool_result',
      properties: { tool_call_id: 't1', output: 'A tela Grupos foi aberta para a pessoa.', status: 'success' },
    });
  });

  it('⚠️ ferramenta que não é nossa nem chega ao AppShell', async () => {
    const onFerramenta = vi.fn();
    await montar(vi.fn(), onFerramenta);
    const el = widgetNaPagina() as WidgetTeste;
    await disparar(el, 'tavus:tool-call', pedido('magic_canvas_card', {}, 't1'));
    expect(onFerramenta).not.toHaveBeenCalled();
    expect(el.sendMessage).not.toHaveBeenCalled();
  });

  it('⚠️ o mesmo pedido repetido é executado uma vez só', async () => {
    const onFerramenta = vi.fn().mockReturnValue({ status: 'success', output: 'ok' });
    await montar(vi.fn(), onFerramenta);
    const el = widgetNaPagina() as WidgetTeste;
    await disparar(el, 'tavus:tool-call', pedido('ir_para_tela', { tela: 'grupos' }, 't1'));
    await disparar(el, 'tavus:tool-call', pedido('ir_para_tela', { tela: 'grupos' }, 't1'));
    expect(onFerramenta).toHaveBeenCalledTimes(1);


    expect(el.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('⚠️ dois pedidos em menos de 2 s: o segundo é recusado sem executar', async () => {
    const onFerramenta = vi.fn().mockReturnValue({ status: 'success', output: 'ok' });
    await montar(vi.fn(), onFerramenta);
    const el = widgetNaPagina() as WidgetTeste;
    await disparar(el, 'tavus:tool-call', pedido('ir_para_tela', { tela: 'grupos' }, 't1'));
    await disparar(el, 'tavus:tool-call', pedido('ir_para_tela', { tela: 'eventos' }, 't2'));
    expect(onFerramenta).toHaveBeenCalledTimes(1);
    expect(el.sendMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      properties: expect.objectContaining({ tool_call_id: 't2', status: 'error' }),
    }));
  });

  it('pedido sem tool_call_id é executado mas não tem resposta (a Tavus não teria como casar)', async () => {
    const onFerramenta = vi.fn().mockReturnValue({ status: 'success', output: 'ok' });
    await montar(vi.fn(), onFerramenta);
    const el = widgetNaPagina() as WidgetTeste;
    await disparar(el, 'tavus:tool-call', pedido('ir_para_tela', { tela: 'grupos' }));
    expect(onFerramenta).toHaveBeenCalledTimes(1);
    expect(el.sendMessage).not.toHaveBeenCalled();
  });

  it('as falas vão ao backend UMA vez no fim da conversa, sem os pedaços ao vivo', async () => {
    await montar();
    const el = widgetNaPagina() as WidgetTeste;
    await disparar(el, 'tavus:state-change', { state: 'connecting' });
    await disparar(el, 'tavus:conversation-started', { conversationId: 'c1' });
    await disparar(el, 'tavus:protocol-message', { kind: 'utterance', properties: { role: 'user', speech: 'Como apr', final: false } });
    await disparar(el, 'tavus:protocol-message', { kind: 'utterance', properties: { role: 'user', speech: 'Como aprovo uma compra?' } });
    await disparar(el, 'tavus:protocol-message', { kind: 'utterance', properties: { role: 'replica', speech: 'Vá em Solicitações.' } });
    await disparar(el, 'tavus:conversation-ended', { conversationId: 'c1' });
    await disparar(el, 'tavus:conversation-ended', { conversationId: 'c1' });
    fireEvent.click(screen.getByText('Encerrar vídeo'));
    expect(registrarVideo).toHaveBeenCalledTimes(1);
    const [corpo, opcoes] = registrarVideo.mock.calls[0];
    expect(corpo).toMatchObject({
      conversa_id: 'c1',
      tela_rotulo: 'Solicitações',
      turnos: [{ role: 'user', texto: 'Como aprovo uma compra?' }, { role: 'assistant', texto: 'Vá em Solicitações.' }],
    });
    expect(opcoes).toEqual({ keepalive: true });
  });

  it('conversa sem fala da pessoa não é enviada', async () => {
    await montar();
    const el = widgetNaPagina() as WidgetTeste;
    await disparar(el, 'tavus:state-change', { state: 'connecting' });
    await disparar(el, 'tavus:conversation-started', { conversationId: 'c2' });
    await disparar(el, 'tavus:protocol-message', { kind: 'utterance', properties: { role: 'replica', speech: 'Oi! Eu sou o Pedrinho.' } });
    await disparar(el, 'tavus:conversation-ended', { conversationId: 'c2' });
    expect(registrarVideo).not.toHaveBeenCalled();
  });

  it('"Encerrar vídeo" no meio da conversa também envia as falas', async () => {
    await montar();
    const el = widgetNaPagina() as WidgetTeste;
    await disparar(el, 'tavus:state-change', { state: 'connecting' });
    await disparar(el, 'tavus:conversation-started', { conversationId: 'c3' });
    await disparar(el, 'tavus:protocol-message', { kind: 'utterance', properties: { role: 'user', speech: 'Onde fica a escala?' } });
    fireEvent.click(screen.getByText('Encerrar vídeo'));
    expect(registrarVideo).toHaveBeenCalledTimes(1);
    expect(registrarVideo.mock.calls[0][0]).toMatchObject({ conversa_id: 'c3' });
  });

  it('⚠️ o id da conversa vem do evento que o widget emite de verdade (conversation-started)', async () => {
    await montar();
    const el = widgetNaPagina() as WidgetTeste;
    await disparar(el, 'tavus:state-change', { state: 'connecting' });
    await disparar(el, 'tavus:conversation-started', { conversationId: 'real-1' });
    await disparar(el, 'tavus:protocol-message', { kind: 'utterance', properties: { role: 'user', speech: 'Onde fica o Censo?' } });
    await disparar(el, 'tavus:conversation-ended', {});
    expect(registrarVideo).toHaveBeenCalledTimes(1);
    expect(registrarVideo.mock.calls[0][0]).toMatchObject({ conversa_id: 'real-1', tela_rotulo: 'Solicitações' });
  });

  it('se só o fim trouxer o id, ainda assim a conversa é enviada', async () => {
    await montar();
    const el = widgetNaPagina() as WidgetTeste;
    await disparar(el, 'tavus:state-change', { state: 'connecting' });
    await disparar(el, 'tavus:protocol-message', { kind: 'utterance', properties: { role: 'user', speech: 'Como lanço um culto?' } });
    await disparar(el, 'tavus:conversation-ended', { conversationId: 'so-no-fim' });
    expect(registrarVideo.mock.calls[0][0]).toMatchObject({ conversa_id: 'so-no-fim' });
  });

  it('conversa nova (connecting de novo) começa do zero, e a anterior já saiu', async () => {
    await montar();
    const el = widgetNaPagina() as WidgetTeste;
    await disparar(el, 'tavus:state-change', { state: 'connecting' });
    await disparar(el, 'tavus:conversation-started', { conversationId: 'a' });
    await disparar(el, 'tavus:protocol-message', { kind: 'utterance', properties: { role: 'user', speech: 'Primeira dúvida' } });
    await disparar(el, 'tavus:state-change', { state: 'connecting' });
    await disparar(el, 'tavus:conversation-started', { conversationId: 'b' });
    await disparar(el, 'tavus:protocol-message', { kind: 'utterance', properties: { role: 'user', speech: 'Segunda dúvida' } });
    await disparar(el, 'tavus:conversation-ended', { conversationId: 'b' });
    expect(registrarVideo).toHaveBeenCalledTimes(2);
    expect(registrarVideo.mock.calls[0][0]).toMatchObject({ conversa_id: 'a', turnos: [{ role: 'user', texto: 'Primeira dúvida' }] });
    expect(registrarVideo.mock.calls[1][0]).toMatchObject({ conversa_id: 'b', turnos: [{ role: 'user', texto: 'Segunda dúvida' }] });
  });

  it('⚠️ logout: antesDeSair manda a conversa e encerra o vídeo enquanto o token vale', async () => {
    const { antesDeSair } = await import('../lib/saidaAssistenteVideo');
    await montar();
    const el = widgetNaPagina() as WidgetTeste;
    await disparar(el, 'tavus:state-change', { state: 'connecting' });
    await disparar(el, 'tavus:conversation-started', { conversationId: 'saindo' });
    await disparar(el, 'tavus:protocol-message', { kind: 'utterance', properties: { role: 'user', speech: 'Onde fica o Financeiro?' } });
    await act(async () => { await antesDeSair(); });
    expect(registrarVideo).toHaveBeenCalledTimes(1);
    expect(widgetNaPagina()).toBeNull();
  });
});


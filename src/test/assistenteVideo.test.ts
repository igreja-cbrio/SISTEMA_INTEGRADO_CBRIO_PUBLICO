import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TAVUS_DEPLOYMENT_ID,
  TAVUS_INIT_URL,
  TAVUS_WIDGET_SRC,
  TAVUS_WIDGET_SRI,
  TAVUS_WIDGET_VERSAO,
  CONSENTIMENTO_VERSAO,
  TAM_MAX_ENVIO,
  chaveConsentimento,
  chaveMemoria,
  falasParaEnvio,
  turnoDeEvento,
  contextoDeNavegacao,
  memoryStoreDe,
  mensagemIndisponivel,
  montarContexto,
  primeiroNome,
  rotuloDaRota,
} from '@/lib/assistenteVideo';

const MENU = [
  { label: 'Membresia', path: '/ministerial/membresia' },
  { label: 'Solicitações', path: '/solicitacoes' },
  { label: 'Integração', path: '/integracao' },
  { label: 'Ministerial', path: '/ministerial' },
  { label: 'Sem caminho' },
];

const UUID = '3f2b7c1e-9a4d-4e1b-8c2a-5d6e7f8a9b0c';

describe('assistente em vídeo · contexto enviado à Tavus', () => {
  it('usa só o primeiro nome, sem sobrenome nem símbolos', () => {
    expect(primeiroNome('  Maria José da Silva ')).toBe('Maria');
    expect(primeiroNome('João')).toBe('João');
    expect(primeiroNome('<script>alert(1)</script>')).toBe('scriptalertscript');
    expect(primeiroNome(null)).toBe('');
    expect(primeiroNome('a'.repeat(80))).toHaveLength(30);
  });

  it('acha o rótulo pelo prefixo mais longo do menu', () => {
    expect(rotuloDaRota('/ministerial/membresia', MENU)).toBe('Membresia');
    expect(rotuloDaRota('/ministerial/outra', MENU)).toBe('Ministerial');
    expect(rotuloDaRota('/solicitacoes/', MENU)).toBe('Solicitações');
  });

  it('nunca devolve o caminho cru: UUID, query string e âncora ficam de fora', () => {
    const rotulo = rotuloDaRota(`/ministerial/membresia/${UUID}?cpf=12345678900#ficha`, MENU);
    expect(rotulo).toBe('Membresia');
    const contexto = montarContexto({ nome: 'Ana Paula', rotuloTela: rotulo });
    expect(contexto).not.toContain(UUID);
    expect(contexto).not.toContain('cpf');
    expect(contexto).not.toContain('/');
  });

  it('não confunde prefixo parcial com tela', () => {
    expect(rotuloDaRota('/integracaox', MENU)).toBeNull();
  });

  it('tela fora do menu vira "uma tela do sistema"', () => {
    expect(rotuloDaRota('/rota-que-nao-existe', MENU)).toBeNull();
    expect(montarContexto({ nome: 'Ana', rotuloTela: null })).toContain('em uma tela do sistema');
  });

  it('conhece as telas comuns fora do menu', () => {
    expect(rotuloDaRota('/dashboard', MENU)).toBe('Página inicial');
    expect(rotuloDaRota('/perfil', MENU)).toBe('Meu Perfil');
  });

  it('o contexto leva nome e tela e a regra de não pedir dado de pessoa', () => {
    const contexto = montarContexto({ nome: 'Caetano Emerson', rotuloTela: 'Solicitações' });
    expect(contexto).toContain('A pessoa se chama Caetano');
    expect(contexto).not.toContain('Emerson');
    expect(contexto).toContain('na tela "Solicitações"');
    expect(contexto).toMatch(/não peça dados de membros/);
  });

  it('sem nome, o contexto não inventa um', () => {
    expect(montarContexto({ nome: '', rotuloTela: 'Integração' })).toContain('A pessoa está agora na tela "Integração".');
  });

  it('aspas e quebras de linha do rótulo não quebram o contexto', () => {
    expect(contextoDeNavegacao('Tela "esquisita"\nnova')).toBe('A pessoa acabou de abrir a tela "Tela esquisitanova" do sistema.');
    expect(contextoDeNavegacao(null)).toBe('A pessoa acabou de abrir outra tela do sistema.');
  });
});

describe('assistente em vídeo · chaves locais e memória', () => {
  it('consentimento e memória são por perfil', () => {
    expect(chaveConsentimento('abc')).not.toBe(chaveConsentimento('def'));
    expect(chaveMemoria('abc')).not.toBe(chaveMemoria('def'));
  });

  it('a memória usa o id aleatório, nunca o id do perfil', () => {
    expect(memoryStoreDe(UUID)).toBe(`${TAVUS_DEPLOYMENT_ID}-${UUID}`);
    expect(memoryStoreDe('a,b')).toBe(`${TAVUS_DEPLOYMENT_ID}-ab`);
    expect(memoryStoreDe('')).toBe('');
  });

  it('o script do widget é servido pelo nosso domínio, na versão travada', () => {
    expect(TAVUS_WIDGET_SRC.startsWith('/vendor/')).toBe(true);
    expect(TAVUS_WIDGET_SRC).toContain(TAVUS_WIDGET_VERSAO);
    expect(TAVUS_WIDGET_SRC).not.toMatch(/latest|unpkg|jsdelivr/);
  });

  it('a consulta de disponibilidade usa o /init público do mesmo deployment', () => {
    expect(TAVUS_INIT_URL).toBe(`https://tavusapi.com/v2/deployments/${TAVUS_DEPLOYMENT_ID}/init`);
  });

  it('cada motivo de indisponível tem mensagem própria em português', () => {
    expect(mensagemIndisponivel('daily_limit')).toMatch(/de hoje/);
    expect(mensagemIndisponivel('total_limit')).toMatch(/limite/);
    expect(mensagemIndisponivel('busy')).toMatch(/Outra pessoa/);
    expect(mensagemIndisponivel(null)).toMatch(/Não foi possível/);
    expect(mensagemIndisponivel('motivo_desconhecido')).toBe(mensagemIndisponivel(null));
  });



  it('o SRI declarado bate com o arquivo em public/vendor', () => {
    const arquivo = readFileSync(join(__dirname, '..', '..', 'public', TAVUS_WIDGET_SRC));
    const sri = `sha384-${createHash('sha384').update(arquivo).digest('base64')}`;
    expect(sri).toBe(TAVUS_WIDGET_SRI);
  });
});

describe('assistente em vídeo · captura das falas', () => {
  const fala = (role: string, speech: string, extra: Record<string, unknown> = {}) =>
    ({ kind: 'utterance', event_type: 'conversation.utterance', properties: { role, speech, ...extra } });

  it('fala da pessoa e do avatar ("replica" é o nome antigo) viram turnos', () => {
    expect(turnoDeEvento(fala('user', ' Como aprovo uma compra? '))).toEqual({ role: 'user', texto: 'Como aprovo uma compra?' });
    expect(turnoDeEvento(fala('replica', 'Vá em Solicitações.'))).toEqual({ role: 'assistant', texto: 'Vá em Solicitações.' });
  });

  it('⚠️ pedaço da transcrição ao vivo (final booleano) é descartado, senão a frase entra várias vezes', () => {
    expect(turnoDeEvento(fala('user', 'Como apro', { final: false }))).toBeNull();
    expect(turnoDeEvento(fala('user', 'Como aprovo', { final: true }))).toBeNull();
  });

  it('outros eventos do protocolo, papéis desconhecidos e fala vazia ficam de fora', () => {
    expect(turnoDeEvento({ kind: 'tool_call', properties: { role: 'user', speech: 'x' } })).toBeNull();
    expect(turnoDeEvento(fala('system', 'prompt'))).toBeNull();
    expect(turnoDeEvento(fala('user', '   '))).toBeNull();
    expect(turnoDeEvento(null)).toBeNull();
  });

  it('o envio cabe no keepalive e corta pelas falas mais antigas', () => {
    const turnos = Array.from({ length: 60 }, (_, i) => ({ role: 'user' as const, texto: `${i}`.padEnd(1500, '.') }));
    const enviadas = falasParaEnvio(turnos);
    expect(JSON.stringify(enviadas).length).toBeLessThan(TAM_MAX_ENVIO + 5000);
    expect(enviadas[enviadas.length - 1].texto.startsWith('59')).toBe(true);
    expect(enviadas.length).toBeLessThan(60);
  });

  it('o aviso subiu para a versão 2 (agora diz o que fica guardado): todo mundo aceita de novo', () => {
    expect(CONSENTIMENTO_VERSAO).toBe(2);
    expect(chaveConsentimento('p')).toContain('_v2_');
  });
});


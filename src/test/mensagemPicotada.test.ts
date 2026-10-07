









import { describe, it, expect } from 'vitest';
import {
  JANELA_DEBOUNCE_MS_PADRAO,
  JANELA_AGRUPAR_MS_PADRAO,
  janelaValida,
  foiSuperada,
  agruparMensagensDaRajada,
  decidirDebounce,
} from '../../backend/utils/mensagemPicotada.js';



const RAJADA = [
  { id: 'a', criado_em: '2026-09-26T02:00:00.000Z', texto: 'boa tarde' },
  { id: 'b', criado_em: '2026-09-26T02:00:02.000Z', texto: 'você atende?' },
  { id: 'c', criado_em: '2026-09-26T02:00:04.000Z', texto: 'qual o valor' },
];

describe('sou eu quem está processando a última?', () => {
  it('mensagem MAIS ANTIGA aborta (outra chegou depois)', () => {
    expect(foiSuperada({
      minhaId: 'a',
      minhaCriadoEm: RAJADA[0].criado_em,
      todasInbound: RAJADA,
    })).toBe(true);
  });

  it('mensagem MAIS RECENTE prossegue', () => {
    expect(foiSuperada({
      minhaId: 'c',
      minhaCriadoEm: RAJADA[2].criado_em,
      todasInbound: RAJADA,
    })).toBe(false);
  });





  it('empate exato no timestamp NÃO conta como superada', () => {
    const empate = [
      { id: 'a', criado_em: '2026-09-26T02:00:00.000Z', texto: 'oi' },
      { id: 'b', criado_em: '2026-09-26T02:00:00.000Z', texto: 'oi' },
    ];
    expect(foiSuperada({ minhaId: 'a', minhaCriadoEm: empate[0].criado_em, todasInbound: empate })).toBe(false);
    expect(foiSuperada({ minhaId: 'b', minhaCriadoEm: empate[1].criado_em, todasInbound: empate })).toBe(false);
  });



  it('a própria linha reentregue não conta como outra', () => {
    expect(foiSuperada({
      minhaId: 'c',
      minhaCriadoEm: RAJADA[2].criado_em,
      todasInbound: [RAJADA[2]],
    })).toBe(false);
  });







  it('mesma mensagem com timestamp do banco ligeiramente posterior NÃO se supera', () => {
    const noBanco = { whatsapp_message_id: 'wamid.SOLO', criado_em: '2026-09-26T02:00:00.040Z', texto: 'oi' };
    expect(foiSuperada({
      minhaWamid: 'wamid.SOLO',
      minhaCriadoEm: '2026-09-26T02:00:00.000Z',
      todasInbound: [noBanco],
    })).toBe(false);
  });

  it('identifica também por wamid quando o id do banco ainda não existe', () => {
    const comWamid = [
      { whatsapp_message_id: 'wamid.X', criado_em: '2026-09-26T02:00:00.000Z', texto: 'a' },
      { whatsapp_message_id: 'wamid.Y', criado_em: '2026-09-26T02:00:03.000Z', texto: 'b' },
    ];
    expect(foiSuperada({
      minhaWamid: 'wamid.X',
      minhaCriadoEm: '2026-09-26T02:00:00.000Z',
      todasInbound: comWamid,
    })).toBe(true);
    expect(foiSuperada({
      minhaWamid: 'wamid.Y',
      minhaCriadoEm: '2026-09-26T02:00:03.000Z',
      todasInbound: comWamid,
    })).toBe(false);
  });



  it('timestamp ilegível não faz eu abortar', () => {
    expect(foiSuperada({
      minhaId: 'a',
      minhaCriadoEm: 'texto qualquer',
      todasInbound: [{ id: 'b', criado_em: '2026-09-26T02:00:03.000Z', texto: 'x' }],
    })).toBe(false);
    expect(foiSuperada({
      minhaId: 'a',
      minhaCriadoEm: RAJADA[0].criado_em,
      todasInbound: [{ id: 'b', criado_em: 'qualquer', texto: 'x' }],
    })).toBe(false);
  });

  it('lista vazia ou nula NUNCA aborta', () => {
    expect(foiSuperada({ minhaId: 'a', minhaCriadoEm: RAJADA[0].criado_em, todasInbound: [] })).toBe(false);
    expect(foiSuperada({ minhaId: 'a', minhaCriadoEm: RAJADA[0].criado_em, todasInbound: null as never })).toBe(false);
  });
});

describe('agrupar o texto das mensagens da rajada', () => {
  const AGORA = Date.parse('2026-09-26T02:00:05.000Z');

  it('junta na ORDEM CRONOLÓGICA (mais antiga primeiro)', () => {
    const g = agruparMensagensDaRajada({
      textoAtual: 'qual o valor',
      todasInbound: RAJADA,
      agoraMs: AGORA,
      janelaMs: JANELA_AGRUPAR_MS_PADRAO,
    });
    expect(g.contagem).toBe(3);
    expect(g.texto).toBe('boa tarde\nvocê atende?\nqual o valor');
  });


  it('lista fora de ordem é reordenada antes de juntar', () => {
    const foraOrdem = [RAJADA[2], RAJADA[0], RAJADA[1]];
    const g = agruparMensagensDaRajada({
      textoAtual: 'qual o valor',
      todasInbound: foraOrdem,
      agoraMs: AGORA,
      janelaMs: JANELA_AGRUPAR_MS_PADRAO,
    });
    expect(g.texto).toBe('boa tarde\nvocê atende?\nqual o valor');
  });

  it('mensagem fora da janela NÃO entra no bloco', () => {
    const bem_antes = { id: 'x', criado_em: '2026-09-26T01:30:00.000Z', texto: 'mensagem de 30 min atrás' };
    const g = agruparMensagensDaRajada({
      textoAtual: 'qual o valor',
      todasInbound: [bem_antes, ...RAJADA],
      agoraMs: AGORA,
      janelaMs: JANELA_AGRUPAR_MS_PADRAO,
    });
    expect(g.contagem).toBe(3);
    expect(g.texto).not.toContain('30 min atrás');
  });


  it('linhas vazias são descartadas', () => {
    const comVazio = [
      { id: 'a', criado_em: '2026-09-26T02:00:00.000Z', texto: 'oi' },
      { id: 'b', criado_em: '2026-09-26T02:00:01.000Z', texto: '' },
      { id: 'c', criado_em: '2026-09-26T02:00:02.000Z', texto: null },
      { id: 'd', criado_em: '2026-09-26T02:00:03.000Z', texto: 'tudo bem?' },
    ];
    const g = agruparMensagensDaRajada({
      textoAtual: 'tudo bem?',
      todasInbound: comVazio,
      agoraMs: AGORA,
      janelaMs: JANELA_AGRUPAR_MS_PADRAO,
    });
    expect(g.contagem).toBe(2);
    expect(g.texto).toBe('oi\ntudo bem?');
  });



  it('sem histórico devolve o texto atual', () => {
    const g = agruparMensagensDaRajada({
      textoAtual: 'oi',
      todasInbound: [],
      agoraMs: AGORA,
      janelaMs: JANELA_AGRUPAR_MS_PADRAO,
    });
    expect(g.contagem).toBe(1);
    expect(g.texto).toBe('oi');
  });

  it('futuro é ignorado (mensagem com criado_em > agora)', () => {
    const futuro = { id: 'z', criado_em: '2026-09-26T02:00:30.000Z', texto: 'do futuro' };
    const g = agruparMensagensDaRajada({
      textoAtual: 'oi',
      todasInbound: [...RAJADA, futuro],
      agoraMs: AGORA,
      janelaMs: JANELA_AGRUPAR_MS_PADRAO,
    });
    expect(g.texto).not.toContain('do futuro');
  });
});

describe('janela válida (env + defaults)', () => {
  it('número positivo passa', () => {
    expect(janelaValida(8000, 5000)).toBe(8000);
  });
  it('zero DESLIGA o debounce (o caller vira coalescing bypass)', () => {

    expect(janelaValida(0, 5000)).toBe(0);
  });
  it('valor tosto cai no padrão', () => {
    expect(janelaValida('oito', 5000)).toBe(5000);
    expect(janelaValida(NaN, 5000)).toBe(5000);
    expect(janelaValida(-100, 5000)).toBe(5000);
    expect(janelaValida(undefined, 5000)).toBe(5000);
  });
});

describe('decisão completa (o que o serviço vai usar)', () => {
  const AGORA = '2026-09-26T02:00:05.000Z';

  it('sou o último → responder com texto agrupado', () => {
    const d = decidirDebounce({
      minhaId: 'c',
      minhaCriadoEm: RAJADA[2].criado_em,
      textoAtual: 'qual o valor',
      todasInbound: RAJADA,
      agora: AGORA,
    });
    expect(d.acao).toBe('responder');
    expect(d.contagem).toBe(3);
    expect(d.texto).toBe('boa tarde\nvocê atende?\nqual o valor');
  });

  it('não sou o último → coalesced (aborta em silêncio)', () => {
    const d = decidirDebounce({
      minhaId: 'a',
      minhaCriadoEm: RAJADA[0].criado_em,
      textoAtual: 'boa tarde',
      todasInbound: RAJADA,
      agora: AGORA,
    });
    expect(d.acao).toBe('coalesced');
    expect(d.motivo).toBe('nao_sou_o_ultimo');
  });





  it('mensagem única (sem rajada) responde só ela', () => {
    const so_ela = { id: 'x', criado_em: RAJADA[0].criado_em, texto: 'oi' };
    const d = decidirDebounce({
      minhaId: 'x',
      minhaCriadoEm: so_ela.criado_em,
      textoAtual: 'oi',
      todasInbound: [so_ela],
      agora: AGORA,
    });
    expect(d.acao).toBe('responder');
    expect(d.contagem).toBe(1);
    expect(d.texto).toBe('oi');
  });
});

describe('constantes públicas', () => {
  it('padrão de janela de debounce = 5s (vídeo do Salu Barbato)', () => {
    expect(JANELA_DEBOUNCE_MS_PADRAO).toBe(5000);
  });
  it('padrão de janela de AGRUPAR > janela de DEBOUNCE', () => {


    expect(JANELA_AGRUPAR_MS_PADRAO).toBeGreaterThan(JANELA_DEBOUNCE_MS_PADRAO);
  });
});

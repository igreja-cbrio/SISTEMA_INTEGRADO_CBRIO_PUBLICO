








import { describe, it, expect } from 'vitest';
import {
  interpretarRespostaEscala, textoDaResposta, wamidRespondido,
} from '../../backend/utils/respostaEscala.js';

describe('⚠️ negação vence a afirmação embutida', () => {
  it('"Não vou poder" é RECUSA (contém "vou")', () => {
    expect(interpretarRespostaEscala('Não vou poder')).toBe('declined');
    expect(interpretarRespostaEscala('nao vou poder')).toBe('declined');
    expect(interpretarRespostaEscala('n vou conseguir')).toBe('declined');
  });

  it('outras formas de recusar', () => {
    for (const t of [
      'Não',
      'não posso',
      'infelizmente não vou conseguir',
      'nao consigo dessa vez',
      'Não vou',
      'preciso cancelar',
    ]) {
      expect(interpretarRespostaEscala(t), t).toBe('declined');
    }
  });
});

describe('confirmação', () => {
  it('formas de confirmar', () => {
    for (const t of [
      'Vou sim',
      'confirmo',
      'Confirmar presença',
      'sim',
      'ok',
      'beleza',
      'estarei lá',
      'pode contar comigo',
      'to dentro',
    ]) {
      expect(interpretarRespostaEscala(t), t).toBe('confirmed');
    }
  });

  it('acento e caixa não importam', () => {
    expect(interpretarRespostaEscala('ESTAREI LÁ')).toBe('confirmed');
    expect(interpretarRespostaEscala('Não Vou Poder')).toBe('declined');
  });
});

describe('⚠️ o que NÃO dá pra entender fica null', () => {
  it('não chuta', () => {


    for (const t of ['', '   ', 'oi', 'bom dia', '👍', 'quem é?', 'talvez']) {
      expect(interpretarRespostaEscala(t), JSON.stringify(t)).toBeNull();
    }
  });

  it('tolera nulo', () => {
    expect(interpretarRespostaEscala(null as any)).toBeNull();
    expect(interpretarRespostaEscala(undefined as any)).toBeNull();
  });
});

describe('textoDaResposta · os três formatos que a Meta manda', () => {
  it('quick-reply de TEMPLATE vem em button.text', () => {
    expect(textoDaResposta({ type: 'button', button: { text: 'Não vou poder', payload: 'nao' } } as any))
      .toBe('Não vou poder');
  });

  it('botão interativo de sessão vem em interactive.button_reply', () => {
    expect(textoDaResposta({ type: 'interactive', interactive: { button_reply: { id: 'x', title: 'Vou sim' } } } as any))
      .toBe('Vou sim');
  });

  it('texto digitado vem em text.body', () => {
    expect(textoDaResposta({ type: 'text', text: { body: 'não vou poder' } } as any)).toBe('não vou poder');
  });

  it('formato desconhecido devolve vazio, não quebra', () => {
    expect(textoDaResposta({ type: 'sticker' } as any)).toBe('');
    expect(textoDaResposta(null as any)).toBe('');
  });
});

describe('⚠️ wamidRespondido · é o que amarra a resposta à escala certa', () => {
  it('lê o context.id', () => {
    expect(wamidRespondido({ context: { id: 'wamid.ABC' } } as any)).toBe('wamid.ABC');
  });

  it('sem context não há a que responder', () => {


    expect(wamidRespondido({} as any)).toBeNull();
    expect(wamidRespondido(null as any)).toBeNull();
  });
});

describe('⚠️ modelo OPT-OUT · um botão só, ou um número (14/08)', () => {
  it('"2" é a recusa e "1" a confirmação', () => {


    expect(interpretarRespostaEscala('2')).toBe('declined');
    expect(interpretarRespostaEscala('2.')).toBe('declined');
    expect(interpretarRespostaEscala(' 2 ')).toBe('declined');
    expect(interpretarRespostaEscala('1')).toBe('confirmed');
  });

  it('⚠️ dígito no MEIO de uma frase não é resposta', () => {


    expect(interpretarRespostaEscala('chego 2 minutos antes')).toBeNull();
    expect(interpretarRespostaEscala('somos 2')).toBeNull();
  });

  it('outros números não significam nada', () => {
    for (const t of ['3', '0', '22', '10']) {
      expect(interpretarRespostaEscala(t), t).toBeNull();
    }
  });

  it('o texto do botão único continua sendo entendido', () => {
    expect(interpretarRespostaEscala('Não vou poder')).toBe('declined');
    expect(interpretarRespostaEscala('Não vou conseguir')).toBe('declined');
  });
});










describe('respostas reais ao disparo de escala', () => {
  it('⚠️⚠️ correção de horário NUNCA é recusa — é a invariante', () => {
    for (const t of [
      'Não sirvo as 8.30',
      'Meu horário é às 10',
      'No services estou 10h',
      'Desculpa esqueci de me colocar\nAmanhã as 10h',
      'nao sirvo nesse horario',
      'nao é esse culto, sirvo no de 19h',
    ]) {
      expect(interpretarRespostaEscala(t), t).toBeNull();
    }
  });

  it('a recusa de verdade continua sendo entendida', () => {
    for (const t of [
      'não', 'nao', 'NÃO', 'n',
      'Não vou poder',
      'nao vou poder',
      'Não vou conseguir ir',
      'Infelizmente não posso',
      'nao vou poder ir domingo',
      'não consigo dessa vez',
      '2',
    ]) {
      expect(interpretarRespostaEscala(t), t).toBe('declined');
    }
  });

  it('confirmação segue frouxa DE PROPÓSITO — os dois erros não custam igual', () => {


    for (const t of ['Ok', 'Eu vou', 'Bom dia!! estarei lá sim 🙏', 'confirmo', '1', 'blz']) {
      expect(interpretarRespostaEscala(t), t).toBe('confirmed');
    }
  });

  it('saudação solta continua sem interpretação — vai pra gente', () => {
    for (const t of ['Oiii, bom diaa', 'oi', 'boa noite']) {
      expect(interpretarRespostaEscala(t), t).toBeNull();
    }
  });

  it('⚠️ "chego 2 minutos antes" não é recusa (o dígito casa a mensagem inteira)', () => {
    expect(interpretarRespostaEscala('chego 2 minutos antes')).toBeNull();
  });
});

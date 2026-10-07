import { describe, it, expect } from 'vitest';
// @ts-ignore — serviço do backend em CommonJS, sem tipos.
import contato from '../../backend/services/contatoPessoa.js';

const { telefoneAlcancavel, classificarContato, contatoParaLider, MOTIVOS } = contato;

describe('telefoneAlcancavel · espelha o envio e fecha o buraco do DDD', () => {
  it('aceita celular e fixo brasileiros', () => {
    expect(telefoneAlcancavel('21900000013')).toBe(true);
    expect(telefoneAlcancavel('2133334444')).toBe(true);
    expect(telefoneAlcancavel('(21) 90000-0013')).toBe(true);
    expect(telefoneAlcancavel('5521900000013')).toBe(true);
  });

  it('⚠️ DDD 55 (Santa Maria/RS) é legítimo — não confundir com código do país', () => {
    expect(telefoneAlcancavel('55999887766')).toBe(true);
  });


  it('recusa o que o lançamento deixou passar', () => {
    expect(telefoneAlcancavel('0700000017')).toBe(false);
    expect(telefoneAlcancavel('41000000018')).toBe(false);
    expect(telefoneAlcancavel('900000015')).toBe(false);
    expect(telefoneAlcancavel('55219000000')).toBe(false);
  });

  it('recusa vazio e lixo', () => {
    expect(telefoneAlcancavel('')).toBe(false);
    expect(telefoneAlcancavel(null)).toBe(false);
    expect(telefoneAlcancavel('abc')).toBe(false);
    expect(telefoneAlcancavel('11')).toBe(false);
  });
});

describe('classificarContato', () => {
  it('telefone bom e sem falha = ok, sem selo', () => {
    const c = classificarContato({ telefone: '21900000013', email: 'a@b.com' });
    expect(c.ok).toBe(true);
    expect(c.motivo).toBeNull();
    expect(c.rotulo).toBeNull();
    expect(c.usarEmail).toBe(false);
  });

  it('número que o envio não alcança → "Número errado — impossível contato"', () => {
    const c = classificarContato({ telefone: '0700000017', email: 'p@k.ch' });
    expect(c.ok).toBe(false);
    expect(c.motivo).toBe(MOTIVOS.NUMERO_ERRADO);
    expect(c.rotulo).toBe('Número errado — impossível contato');
    expect(c.usarEmail).toBe(true);
  });


  it('brasileiro válido que a Meta disse "undeliverable" tem o MESMO rótulo', () => {
    const est = classificarContato({ telefone: '0700000017', email: 'x@y.com' });
    const br = classificarContato({ telefone: '21900000014', email: 'x@y.com', entregaFalhou: true });
    expect(br.ok).toBe(false);
    expect(br.motivo).toBe(MOTIVOS.SEM_WHATSAPP);
    expect(br.rotulo).toBe(est.rotulo);
  });

  it('falha de entrega em número já inválido não muda o rótulo (não duplica selo)', () => {
    const c = classificarContato({ telefone: '0700000017', entregaFalhou: true });
    expect(c.motivo).toBe(MOTIVOS.NUMERO_ERRADO);
  });

  it('sem telefone é caso PRÓPRIO (não é "número errado")', () => {
    const c = classificarContato({ telefone: '', email: 'a@b.com' });
    expect(c.motivo).toBe(MOTIVOS.SEM_TELEFONE);
    expect(c.rotulo).toBe('Sem telefone');
  });

  it('não sugere e-mail quando não há e-mail (orientação vazia)', () => {
    const c = classificarContato({ telefone: '0700000017', email: null });
    expect(c.ok).toBe(false);
    expect(c.usarEmail).toBe(false);
  });
});

describe('contatoParaLider · o que o líder lê no WhatsApp', () => {
  it('contato normal: telefone e e-mail, como antes', () => {
    expect(contatoParaLider({ telefone: '21900000013', email: 'a@b.com', telefoneExibicao: '(21) 90000-0013' }))
      .toBe('(21) 90000-0013 · a@b.com');
  });

  it('telefone ruim + e-mail: manda pelo e-mail e DIZ por quê', () => {
    const t = contatoParaLider({ telefone: '0700000017', email: 'p@k.ch' });
    expect(t).toContain('p@k.ch');
    expect(t).toContain('não recebe WhatsApp');

    expect(t).not.toContain('0700000017');
  });

  it('telefone ruim e SEM e-mail: avisa pra confirmar, não finge que dá pra falar', () => {
    const t = contatoParaLider({ telefone: '0700000017', email: null });
    expect(t).toContain('não recebe WhatsApp');
    expect(t).toContain('confirmar');
  });

  it('sem contato nenhum', () => {
    expect(contatoParaLider({ telefone: '', email: '' })).toBe('sem contato');
  });
});

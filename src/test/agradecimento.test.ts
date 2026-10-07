import { describe, it, expect } from 'vitest';
import { ehSoAgradecimento } from '../../backend/utils/agradecimento.js';








describe('só agradecimento · o bot cala', () => {
  const casos = [
    'obrigada', 'obrigado', 'Obrigado',
    'obrigada 🙏', 'olá,.. obrigada ☺️',
    'boa noite obrigada',
    'boa tarde!\nok.\nagradeço',
    'Muito obrigado pela atenção',
    'ok', 'ok!', 'blz', 'tmj', 'entendi',
    'Amém', 'Deus abençoe', 'Gratidão',
  ];
  for (const t of casos) {
    it(`cala em ${JSON.stringify(t)}`, () => expect(ehSoAgradecimento(t)).toBe(true));
  }

  it('emoji sozinho de gratidão conta (🙏 foi a resposta mais comum: 7 vezes)', () => {
    expect(ehSoAgradecimento('🙏🏻')).toBe(true);
    expect(ehSoAgradecimento('🙏🏼')).toBe(true);
    expect(ehSoAgradecimento('🥰🙏🏻')).toBe(true);
    expect(ehSoAgradecimento('❤️')).toBe(true);
  });
});

describe('⚠️ o menu CONTINUA abrindo', () => {
  const casos = [


    'oi', 'olá', 'Oi', 'bom dia', 'boa tarde', 'boa noite',

    'quando começa?', 'vcs mandam link?', 'obrigado, quando começa?',

    'enviei errado', 'não anda!', 'quero falar sobre o batismo', 'leonardo',

    '2', '5', '2 grupos',


    'olá!\nficamos no aguardo.\nmuito obrigada!',
  ];
  for (const t of casos) {
    it(`abre em ${JSON.stringify(t)}`, () => expect(ehSoAgradecimento(t)).toBe(false));
  }

  it('emoji que não é de gratidão não cala o bot', () => {
    expect(ehSoAgradecimento('😡')).toBe(false);
    expect(ehSoAgradecimento('❓')).toBe(false);
  });

  it('vazio não cala nada', () => {
    expect(ehSoAgradecimento('')).toBe(false);
    expect(ehSoAgradecimento('   ')).toBe(false);
    expect(ehSoAgradecimento(null as unknown as string)).toBe(false);
  });

  it('⚠️ saudação SOZINHA não é agradecimento — é o gatilho do menu', () => {


    expect(ehSoAgradecimento('bom dia')).toBe(false);
    expect(ehSoAgradecimento('boa noite')).toBe(false);

    expect(ehSoAgradecimento('bom dia, obrigado')).toBe(true);
  });

  it('texto longo tem conteúdo mesmo começando por obrigada', () => {
    expect(ehSoAgradecimento(
      'obrigada! aproveitando, vocês têm grupo na zona sul aos sábados?',
    )).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { normalizarBusca, contemNormalizado, algumContemNormalizado } from '@/lib/busca';



describe('normalizarBusca', () => {
  it('tira acento, caixa e espaço extra', () => {
    expect(normalizarBusca('  André   MARINO  Pereiral ')).toBe('andre marino pereiral');
    expect(normalizarBusca('ANDRE')).toBe('andre');
  });

  it('cobre cedilha, til, circunflexo, agudo e crase', () => {
    expect(normalizarBusca('AÇÃO')).toBe('acao');
    expect(normalizarBusca('José André à Vovó')).toBe('jose andre a vovo');
  });

  it('trata nulo/indefinido/número sem estourar', () => {
    expect(normalizarBusca(null)).toBe('');
    expect(normalizarBusca(undefined)).toBe('');
    expect(normalizarBusca(0 as unknown as string)).toBe('0');
  });

  it('normaliza NFD igual a NFC (o mesmo nome digitado de 2 jeitos)', () => {


    const nfd = 'Anto' + String.fromCharCode(0x302) + 'nio';
    const nfc = 'Ant' + String.fromCharCode(0xf4) + 'nio';
    expect(nfd).not.toBe(nfc);
    expect(normalizarBusca(nfd)).toBe('antonio');
    expect(normalizarBusca(nfd)).toBe(normalizarBusca(nfc));
  });
});

describe('contemNormalizado · acento nos DOIS sentidos', () => {


  it('termo sem acento acha alvo sem acento', () => {
    expect(contemNormalizado('ANDRE MARINO PEREIRAL', 'andre')).toBe(true);
  });
  it('termo COM acento acha alvo SEM acento', () => {
    expect(contemNormalizado('ANDRE MARINO PEREIRAL', 'André')).toBe(true);
  });
  it('termo SEM acento acha alvo COM acento', () => {
    expect(contemNormalizado('André Marino Pereiral', 'andre')).toBe(true);
    expect(contemNormalizado('José da Silva', 'jose')).toBe(true);
  });
  it('cedilha nos dois sentidos', () => {
    expect(contemNormalizado('acao social', 'AÇÃO')).toBe(true);
    expect(contemNormalizado('Ação Social', 'acao')).toBe(true);
  });
  it('ignora caixa e espaço extra do termo', () => {
    expect(contemNormalizado('Grupo Vida Centro', '  vida    CENTRO ')).toBe(true);
  });
  it('não casa quem não tem o termo', () => {
    expect(contemNormalizado('ANDRE MARINO PEREIRAL', 'joao')).toBe(false);
    expect(contemNormalizado(null, 'joao')).toBe(false);
  });
  it('termo vazio/espaços não filtra', () => {
    expect(contemNormalizado('qualquer coisa', '')).toBe(true);
    expect(contemNormalizado('qualquer coisa', '   ')).toBe(true);
  });
});

describe('algumContemNormalizado · nomes + apelidos do líder', () => {
  const alvos = ['ANDRE MARINO PEREIRAL', 'Tuninho'];

  it('acha pelo apelido, com e sem acento', () => {
    expect(algumContemNormalizado(alvos, 'tuninho')).toBe(true);
    expect(algumContemNormalizado(alvos, 'Tunínho')).toBe(true);
  });
  it('acha pelo nome real', () => {
    expect(algumContemNormalizado(alvos, 'André')).toBe(true);
    expect(algumContemNormalizado(alvos, 'pereiral')).toBe(true);
  });
  it('não casa termo estranho e tolera lista vazia/nula', () => {
    expect(algumContemNormalizado(alvos, 'zezinho')).toBe(false);
    expect(algumContemNormalizado([], 'andre')).toBe(false);
    expect(algumContemNormalizado(null as unknown as string[], 'andre')).toBe(false);
  });
});

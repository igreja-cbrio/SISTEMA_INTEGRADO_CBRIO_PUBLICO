








import { describe, it, expect } from 'vitest';
// @ts-ignore — util CommonJS do backend
import {
  CONTATO_FEITO, INALCANCAVEL, ENCERRADO,
  contatoFoiFeito, ehInalcancavel, precisaDeContato,
  totalAlcancavel, pctAlcancavel,
} from '../../backend/utils/primeiroContatoRegua';

describe('as duas perguntas', () => {
  const numeroErrado = { primeiro_contato_status: 'numero_errado' };
  const impossivel = { primeiro_contato_status: 'contato_impossivel' };


  it('número errado: a mensagem NÃO chegou, e NÃO adianta insistir', () => {
    expect(contatoFoiFeito(numeroErrado)).toBe(false);
    expect(precisaDeContato(numeroErrado)).toBe(false);
  });

  it('contato impossível: idem — é a mesma família', () => {
    expect(contatoFoiFeito(impossivel)).toBe(false);
    expect(precisaDeContato(impossivel)).toBe(false);
  });

  it('quem nunca foi marcado ainda precisa de contato', () => {
    expect(precisaDeContato({ primeiro_contato_status: null })).toBe(true);
    expect(contatoFoiFeito({ primeiro_contato_status: null })).toBe(false);
  });

  it('mensagem enviada: chegou, e não volta pra fila', () => {
    for (const v of ['contactada', 'nao_respondeu', 'nao_atendido', 'atendido_respondido']) {
      expect(contatoFoiFeito({ primeiro_contato_status: v }), v).toBe(true);
      expect(precisaDeContato({ primeiro_contato_status: v }), v).toBe(false);
    }
  });


  it('a data de contato vale mesmo sem status', () => {
    expect(contatoFoiFeito({ primeiro_contato_em: '2026-09-01T10:00:00Z' })).toBe(true);
    expect(precisaDeContato({ primeiro_contato_em: '2026-09-01T10:00:00Z' })).toBe(false);
  });
});

describe('os conjuntos', () => {


  it('inalcançável nunca é contato feito', () => {
    for (const v of INALCANCAVEL) expect(CONTATO_FEITO.has(v), v).toBe(false);
  });
  it('encerrado é a união dos dois', () => {
    expect([...ENCERRADO].sort()).toEqual([...new Set([...CONTATO_FEITO, ...INALCANCAVEL])].sort());
  });
  it('inalcançável é número errado + contato impossível', () => {
    expect([...INALCANCAVEL].sort()).toEqual(['contato_impossivel', 'numero_errado']);
  });
});

describe('o denominador', () => {
  const l = (s: string | null) => ({ primeiro_contato_status: s });

  it('tira os inalcançáveis do total', () => {
    expect(totalAlcancavel([l('contactada'), l('numero_errado'), l('contato_impossivel'), l(null)])).toBe(2);
  });

  it('lista inteira inalcançável dá 0, nunca negativo', () => {
    expect(totalAlcancavel([l('numero_errado'), l('contato_impossivel')])).toBe(0);
    expect(totalAlcancavel([])).toBe(0);
    expect(totalAlcancavel(null as any)).toBe(0);
  });



  it('sem o que medir devolve null, nunca divisão por zero', () => {
    expect(pctAlcancavel(0, 3, 3)).toBe(null);
    expect(pctAlcancavel(5, 0, 0)).toBe(null);
  });

  it('o percentual sai sobre o total alcançável', () => {
    expect(pctAlcancavel(453, 461, 7)).toBe(100);
    expect(pctAlcancavel(9, 12, 2)).toBe(90);
    expect(pctAlcancavel(0, 10, 0)).toBe(0);
  });

  it('nunca passa de 100%', () => {

    expect(pctAlcancavel(10, 12, 2)).toBe(100);
  });
});

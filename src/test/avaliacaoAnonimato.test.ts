









import { describe, it, expect } from 'vitest';
import {
  PISO_PADRAO, PISO_MINIMO_ABSOLUTO,
  normalizarPiso, podeColetarPapel, podeRevelar, planoDeColeta,
} from '../../backend/utils/avaliacaoAnonimato';

describe('piso', () => {
  it('o padrão é 3', () => {
    expect(PISO_PADRAO).toBe(3);
    expect(PISO_MINIMO_ABSOLUTO).toBe(3);
  });

  it('⚠️ NUNCA desce abaixo do mínimo, venha de onde vier', () => {


    expect(normalizarPiso(1)).toBe(3);
    expect(normalizarPiso(0)).toBe(3);
    expect(normalizarPiso(-5)).toBe(3);
  });

  it('aceita endurecer — a igreja pode querer 5', () => {
    expect(normalizarPiso(5)).toBe(5);
    expect(normalizarPiso(10)).toBe(10);
  });

  it('valor não-inteiro cai no padrão, nunca em zero', () => {
    expect(normalizarPiso(undefined)).toBe(3);
    expect(normalizarPiso(null)).toBe(3);
    expect(normalizarPiso('abc' as any)).toBe(3);
    expect(normalizarPiso(2.7)).toBe(3);
  });
});

describe('antes de convidar · podeColetarPapel', () => {
  it('⚠️⚠️ o gestor de UM liderado NÃO recebe feedback ascendente', () => {

    const d = podeColetarPapel({ papel: 'liderado', elegiveis: 1 });
    expect(d.coletar).toBe(false);
    expect(d.motivo).toBe('abaixo_do_piso');
  });

  it('⚠️ com 2 liderados também não — cada um sabe que metade é sua', () => {
    expect(podeColetarPapel({ papel: 'liderado', elegiveis: 2 }).coletar).toBe(false);
  });

  it('a partir do piso, coleta', () => {
    expect(podeColetarPapel({ papel: 'liderado', elegiveis: 3 }).coletar).toBe(true);
    expect(podeColetarPapel({ papel: 'liderado', elegiveis: 9 }).coletar).toBe(true);
  });

  it('⚠️ o Financeiro tem 2 pessoas — "par" ali é uma pessoa falando de outra', () => {

    expect(podeColetarPapel({ papel: 'par', elegiveis: 1 }).coletar).toBe(false);
  });

  it('nas áreas grandes, par coleta normalmente', () => {

    expect(podeColetarPapel({ papel: 'par', elegiveis: 18 }).coletar).toBe(true);
  });

  it('⚠️ auto e gestor NÃO passam pelo piso — são identificados por natureza', () => {



    expect(podeColetarPapel({ papel: 'auto', elegiveis: 1 }).coletar).toBe(true);
    expect(podeColetarPapel({ papel: 'gestor', elegiveis: 1 }).coletar).toBe(true);
  });

  it('⚠️ sem elegível nenhum não coleta — e o motivo é próprio', () => {

    const d = podeColetarPapel({ papel: 'par', elegiveis: 0 });
    expect(d.coletar).toBe(false);
    expect(d.motivo).toBe('sem_elegiveis');
  });

  it('⚠️ FAIL-CLOSED: não saber quantos são não é "pode"', () => {
    for (const v of [undefined, null, 'tres', -1, 2.5]) {
      const d = podeColetarPapel({ papel: 'par', elegiveis: v as any });
      expect(d.coletar).toBe(false);
    }
    expect(podeColetarPapel({ papel: 'par', elegiveis: undefined }).motivo)
      .toBe('elegiveis_desconhecido');
  });

  it('papel desconhecido nunca coleta', () => {
    expect(podeColetarPapel({ papel: 'cliente_interno' as any, elegiveis: 99 }).coletar).toBe(false);
    expect(podeColetarPapel({ papel: undefined as any, elegiveis: 99 }).coletar).toBe(false);
  });

  it('respeita piso endurecido do ciclo', () => {
    expect(podeColetarPapel({ papel: 'liderado', elegiveis: 4, piso: 5 }).coletar).toBe(false);
    expect(podeColetarPapel({ papel: 'liderado', elegiveis: 5, piso: 5 }).coletar).toBe(true);
  });
});

describe('depois de coletar · podeRevelar', () => {
  it('⚠️ é SEGUNDA camada: elegível na abertura, mas pouca gente respondeu', () => {

    const d = podeRevelar({ papel: 'liderado', respostas: 2 });
    expect(d.revelar).toBe(false);
    expect(d.motivo).toBe('abaixo_do_piso');
  });

  it('com o piso atingido, revela', () => {
    expect(podeRevelar({ papel: 'liderado', respostas: 3 }).revelar).toBe(true);
    expect(podeRevelar({ papel: 'par', respostas: 7 }).revelar).toBe(true);
  });

  it('auto e gestor revelam com 1 resposta', () => {
    expect(podeRevelar({ papel: 'auto', respostas: 1 }).revelar).toBe(true);
    expect(podeRevelar({ papel: 'gestor', respostas: 1 }).revelar).toBe(true);
  });

  it('⚠️ zero resposta tem motivo PRÓPRIO, não "abaixo do piso"', () => {


    const d = podeRevelar({ papel: 'par', respostas: 0 });
    expect(d.revelar).toBe(false);
    expect(d.motivo).toBe('sem_respostas');
  });

  it('⚠️ FAIL-CLOSED em contagem ilegível', () => {
    expect(podeRevelar({ papel: 'par', respostas: undefined as any }).revelar).toBe(false);
    expect(podeRevelar({ papel: 'par', respostas: null as any }).revelar).toBe(false);
    expect(podeRevelar({ papel: 'par', respostas: -3 }).revelar).toBe(false);
  });

  it('papel desconhecido nunca revela', () => {
    expect(podeRevelar({ papel: 'externo' as any, respostas: 50 }).revelar).toBe(false);
  });
});

describe('planoDeColeta · o retrato de um avaliado', () => {
  it('⚠️ o caso sintético de um dos 3 gestores com 1 liderado', () => {

    const p = planoDeColeta({ elegiveisPorPapel: { auto: 1, gestor: 1, par: 9, liderado: 1 } });
    expect(p.coletar).toEqual(['auto', 'gestor', 'par']);
    expect(p.suprimidos).toEqual([{ papel: 'liderado', motivo: 'abaixo_do_piso' }]);
  });

  it('⚠️ o caso do Financeiro: 2 pessoas na área, sem liderado', () => {
    const p = planoDeColeta({ elegiveisPorPapel: { auto: 1, gestor: 1, par: 1, liderado: 0 } });
    expect(p.coletar).toEqual(['auto', 'gestor']);
    expect(p.suprimidos).toEqual([
      { papel: 'par', motivo: 'abaixo_do_piso' },
      { papel: 'liderado', motivo: 'sem_elegiveis' },
    ]);
  });

  it('o gestor de 9 liderados coleta tudo', () => {
    const p = planoDeColeta({ elegiveisPorPapel: { auto: 1, gestor: 1, par: 18, liderado: 9 } });
    expect(p.coletar).toEqual(['auto', 'gestor', 'par', 'liderado']);
    expect(p.suprimidos).toEqual([]);
  });

  it('⚠️ o que ficou de fora é SEMPRE declarado, com motivo', () => {


    const p = planoDeColeta({ elegiveisPorPapel: { auto: 1, gestor: 1, par: 1, liderado: 0 } });
    expect(p.suprimidos.map((s: any) => s.papel)).toEqual(['par', 'liderado']);
    for (const s of p.suprimidos) expect(s.motivo).toBeTruthy();
  });

  it('⚠️⚠️ FAIL-CLOSED no plano: objeto vazio NÃO coleta nem auto', () => {




    const p = planoDeColeta({ elegiveisPorPapel: {} });
    expect(p.coletar).toEqual([]);
    expect(p.suprimidos).toHaveLength(4);
    for (const s of p.suprimidos) expect(s.motivo).toBe('elegiveis_desconhecido');
  });

  it('entrada inválida não vira plano vazio silencioso', () => {
    const p = planoDeColeta({ elegiveisPorPapel: null as any });
    expect(p.suprimidos.length).toBeGreaterThan(0);
    expect(p.piso).toBe(3);
  });

  it('o piso do ciclo aparece na saída — a tela precisa dizer qual é', () => {
    expect(planoDeColeta({ elegiveisPorPapel: {}, piso: 5 }).piso).toBe(5);
    expect(planoDeColeta({ elegiveisPorPapel: {}, piso: 1 }).piso).toBe(3);
  });
});

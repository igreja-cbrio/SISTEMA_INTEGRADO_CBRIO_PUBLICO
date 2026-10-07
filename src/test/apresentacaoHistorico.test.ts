




import { describe, it, expect } from 'vitest';
import { hojeBRT, separar, juntar, ORIGENS } from '../../backend/utils/apresentacaoHistorico.js';


const NOITE_BRT = Date.UTC(2026, 7, 21, 2, 30);

describe('hojeBRT · o dia é o da igreja', () => {



  it('à noite no Rio ainda é o mesmo dia', () => {
    expect(hojeBRT(NOITE_BRT)).toBe('2026-08-20');
    expect(new Date(NOITE_BRT).toISOString().slice(0, 10)).toBe('2026-08-21');
  });

  it('de manhã bate com o dia civil', () => {
    expect(hojeBRT(Date.UTC(2026, 7, 20, 13, 0))).toBe('2026-08-20');
  });
});

describe('separar próximas de histórico', () => {
  const linhas = [
    { id: 'set', data_apresentacao: '2026-09-13' },
    { id: 'jul', data_apresentacao: '2026-07-12' },
    { id: 'ago', data_apresentacao: '2026-08-09' },
    { id: 'hoje', data_apresentacao: '2026-08-20' },
  ];

  it('HOJE conta como próxima, não como histórico', () => {


    const r = separar(linhas, '2026-08-20');
    expect(r.proximas.map((l: any) => l.id)).toContain('hoje');
    expect(r.historico.map((l: any) => l.id)).not.toContain('hoje');
  });

  it('próximas em ordem crescente; histórico em decrescente', () => {
    const r = separar(linhas, '2026-08-20');
    expect(r.proximas.map((l: any) => l.id)).toEqual(['hoje', 'set']);
    expect(r.historico.map((l: any) => l.id)).toEqual(['ago', 'jul']);
  });



  it('sem data vai pro fim de próximas, nunca é descartada', () => {
    const r = separar([...linhas, { id: 'nd', data_apresentacao: null }], '2026-08-20');
    expect(r.proximas.map((l: any) => l.id)).toEqual(['hoje', 'set', 'nd']);
    expect(r.historico.map((l: any) => l.id)).not.toContain('nd');
  });

  it('lista vazia ou nula não quebra', () => {
    expect(separar([], '2026-08-20')).toEqual({ proximas: [], historico: [] });
    expect(separar(null as any, '2026-08-20')).toEqual({ proximas: [], historico: [] });
  });
});

describe('juntar os caminhos de resolução', () => {
  it('não repete a mesma apresentação', () => {
    const r = juntar({ vinculo: [{ id: 'x' }], ficha_kids: [{ id: 'x' }], cpf: [{ id: 'x' }] });
    expect(r).toHaveLength(1);
  });



  it('vínculo direto vence CPF, que vence a ficha do Kids', () => {
    expect(juntar({ ficha_kids: [{ id: 'x' }], cpf: [{ id: 'x' }], vinculo: [{ id: 'x' }] })[0].via).toBe('vinculo');
    expect(juntar({ ficha_kids: [{ id: 'y' }], cpf: [{ id: 'y' }] })[0].via).toBe('cpf');
    expect(juntar({ ficha_kids: [{ id: 'z' }] })[0].via).toBe('ficha_kids');
  });

  it('junta linhas diferentes de caminhos diferentes', () => {
    const r = juntar({ vinculo: [{ id: 'a' }], ficha_kids: [{ id: 'b' }] });
    expect(r.map((l: any) => l.id).sort()).toEqual(['a', 'b']);
  });

  it('linha sem id é ignorada em vez de virar item fantasma', () => {
    expect(juntar({ vinculo: [{ id: null }, {}] })).toHaveLength(0);
  });

  it('caminho ausente não quebra', () => {
    expect(juntar({})).toEqual([]);
    expect(juntar(null as any)).toEqual([]);
  });

  it('as origens declaradas são as 3 da cadeia, nessa ordem', () => {
    expect(ORIGENS).toEqual(['vinculo', 'cpf', 'ficha_kids']);
  });
});

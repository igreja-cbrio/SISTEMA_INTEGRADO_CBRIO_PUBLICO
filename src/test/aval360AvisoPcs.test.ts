

import { describe, it, expect } from 'vitest';
import { avisoPcs, textoAviso } from '../../backend/utils/aval360AvisoPcs.js';

const crit = (id: string, final: number | null, nome = id) => ({ competencia_id: id, nome, final });

describe('avisoPcs', () => {
  it('nota alta em escala 5: 4,5 é o limite (90%)', () => {
    const r = avisoPcs({ criterios: [crit('a', 4.5), crit('b', 4.5)] }, { escalaMax: 5 });
    expect(r.aviso).toBe('alta');
    expect(textoAviso(r)).toBe('Nota alta · verificar enquadramento no PCS');
  });

  it('nota baixa em escala 5: 2 é o limite (40%)', () => {
    const r = avisoPcs({ criterios: [crit('a', 2), crit('b', 2)] }, { escalaMax: 5 });
    expect(r.aviso).toBe('baixa');
    expect(textoAviso(r)).toBe('Nota baixa · verificar enquadramento no PCS');
  });

  it('o limite acompanha a escala do ciclo (escala 6: alto = 5,4)', () => {
    expect(avisoPcs({ criterios: [crit('a', 5.3)] }, { escalaMax: 6 }).aviso).toBeNull();
    expect(avisoPcs({ criterios: [crit('a', 5.4)] }, { escalaMax: 6 }).aviso).toBe('alta');
  });

  it('peso no PCS: entrega pesando 2 puxa a nota para o lado dela', () => {
    const pessoa = { criterios: [crit('entrega', 5), crit('postura', 3.5)] };

    expect(avisoPcs(pessoa, { escalaMax: 5 }).aviso).toBeNull();

    expect(avisoPcs(pessoa, { escalaMax: 5, pesos: { entrega: 3 } }).aviso).toBe('alta');
  });

  it('peso 0 tira o critério do aviso (inclusive dos critérios fora da curva)', () => {
    const r = avisoPcs({ criterios: [crit('entrega', 4), crit('postura', 1)] }, { escalaMax: 5, pesos: { postura: 0 } });
    expect(r.nota_pcs).toBe(4);
    expect(r.criterios_baixa).toEqual([]);
  });

  it('critério sem nota não conta; ninguém com nota → sem aviso', () => {
    expect(avisoPcs({ criterios: [crit('a', null)] }, { escalaMax: 5 })).toMatchObject({ nota_pcs: null, aviso: null });
  });

  it('aponta os critérios fora da curva mesmo com a média no meio', () => {
    const r = avisoPcs({ criterios: [crit('a', 5, 'Entrega'), crit('b', 1.5, 'Pontualidade')] }, { escalaMax: 5 });
    expect(r.aviso).toBeNull();
    expect(r.criterios_alta.map((c) => c.nome)).toEqual(['Entrega']);
    expect(r.criterios_baixa.map((c) => c.nome)).toEqual(['Pontualidade']);
    expect(textoAviso(r)).toBe('Critério fora da curva · verificar');
  });

  it('gestor bem, equipe mal (≥ 25% da escala de distância) vira aviso', () => {
    const r = avisoPcs({ gestor: 5, outros: 3.5, criterios: [crit('a', 4.4)] }, { escalaMax: 6 });
    expect(r.divergencia).toEqual({ gestor: 5, outros: 3.5, maior: 'gestor' });
    expect(textoAviso(r)).toBe('Gestor e equipe veem diferente · verificar');
  });

  it('sem a visão "outros" (abaixo do piso) não existe divergência', () => {
    expect(avisoPcs({ gestor: 6, outros: null, criterios: [crit('a', 4)] }, { escalaMax: 6 }).divergencia).toBeNull();
  });

  it('escala inválida não inventa aviso', () => {
    expect(avisoPcs({ criterios: [crit('a', 5)] }, { escalaMax: 0 }).aviso).toBeNull();
  });
});

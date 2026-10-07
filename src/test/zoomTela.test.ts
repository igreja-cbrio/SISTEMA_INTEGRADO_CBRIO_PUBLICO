









import { describe, it, expect } from 'vitest';
import {
  NIVEIS_ZOOM, ZOOM_PADRAO, CHAVE_ZOOM,
  normalizarZoom, lerZoomSalvo, salvarZoom, rotuloZoom,
} from '@/lib/zoomTela';

const store = (valor?: string | null) => ({
  getItem: () => (valor === undefined ? null : valor),
  setItem: () => {},
});

describe('normalizarZoom · só os níveis conhecidos passam', () => {
  it('aceita os níveis oferecidos', () => {
    for (const n of NIVEIS_ZOOM) expect(normalizarZoom(n)).toBe(n);
    expect(normalizarZoom('1.25')).toBe(1.25);
  });

  it('⚠️⚠️ valor fora da lista cai no padrão — nunca escala arbitrária', () => {
    for (const v of [4, 0.1, 2, 1.2, -1, 0]) expect(normalizarZoom(v)).toBe(ZOOM_PADRAO);
  });

  it('lixo, nulo e não-número caem no padrão', () => {
    for (const v of [null, undefined, '', 'grande', {}, [], NaN, Infinity]) {
      expect(normalizarZoom(v)).toBe(ZOOM_PADRAO);
    }
  });
});

describe('⚠️ o storage nunca derruba a tela', () => {
  it('lê o valor salvo', () => {
    expect(lerZoomSalvo(store('1.5'))).toBe(1.5);
  });

  it('chave vazia devolve o padrão', () => {
    expect(lerZoomSalvo(store(null))).toBe(ZOOM_PADRAO);
  });

  it('⚠️⚠️ getItem que LANÇA (Safari privado) não propaga', () => {
    const hostil = { getItem: () => { throw new Error('SecurityError'); } };
    expect(() => lerZoomSalvo(hostil)).not.toThrow();
    expect(lerZoomSalvo(hostil)).toBe(ZOOM_PADRAO);
  });

  it('⚠️⚠️ setItem que LANÇA (quota/privado) não propaga', () => {
    const hostil = { setItem: () => { throw new Error('QuotaExceeded'); } };
    expect(() => salvarZoom(1.25, hostil)).not.toThrow();
  });

  it('só grava nível válido — lixo vira padrão antes de persistir', () => {
    let gravado: string | null = null;
    const espiao = { setItem: (_k: string, v: string) => { gravado = v; } };
    // @ts-expect-error entrada hostil de propósito
    salvarZoom(9, espiao);
    expect(gravado).toBe(String(ZOOM_PADRAO));
  });
});

describe('⚠️ o teto não sobe sem alguém decidir', () => {
  it('nenhum nível passa de 1.5', () => {


    expect(Math.max(...NIVEIS_ZOOM)).toBeLessThanOrEqual(1.5);
  });

  it('⚠️ 100% é sempre o PRIMEIRO — é o caminho de volta', () => {
    expect(NIVEIS_ZOOM[0]).toBe(1);
    expect(ZOOM_PADRAO).toBe(1);
  });

  it('a chave é versionada (dá pra invalidar sem quebrar)', () => {
    expect(CHAVE_ZOOM).toMatch(/_v\d+$/);
  });
});

describe('rótulo', () => {
  it('mostra a porcentagem', () => {
    expect(rotuloZoom(1)).toBe('100%');
    expect(rotuloZoom(1.15)).toBe('115%');
    expect(rotuloZoom(1.5)).toBe('150%');
  });
});

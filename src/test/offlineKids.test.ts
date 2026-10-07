



import { describe, it, expect, beforeEach } from 'vitest';
import * as off from '../pages/ministerial/totemKids/lib/offlineKids';



if (typeof globalThis.localStorage === 'undefined') {
  const m = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  };
}

beforeEach(() => localStorage.clear());

describe('⚠️⚠️ o cliente NUNCA gera código — ele SACA do bloco', () => {
  it('sem bloco, não há check-in offline (e isso é um NÃO honesto)', () => {


    expect(off.sacarCodigo()).toBe(null);
    expect(off.codigosDisponiveis()).toEqual([]);
  });

  it('saca na ordem e NUNCA repete', () => {
    off.guardarCodigos(['AAAA', 'BBBB', 'CCCC']);
    const sacados = [off.sacarCodigo(), off.sacarCodigo(), off.sacarCodigo()];
    expect(sacados).toEqual(['AAAA', 'BBBB', 'CCCC']);
    expect(off.sacarCodigo()).toBe(null);
    expect(new Set(sacados).size).toBe(3);
  });

  it('⚠️⚠️ remove ANTES de devolver — recarregar a página não repete código', () => {


    off.guardarCodigos(['ZZZZ', 'YYYY']);
    const c = off.sacarCodigo();
    expect(off.codigosDisponiveis()).not.toContain(c);
    expect(off.codigosDisponiveis()).toEqual(['YYYY']);
  });

  it('recarregar o bloco SUBSTITUI, não acumula', () => {


    off.guardarCodigos(['AAAA', 'BBBB']);
    off.guardarCodigos(['AAAA', 'BBBB', 'CCCC']);
    expect(off.codigosDisponiveis()).toEqual(['AAAA', 'BBBB', 'CCCC']);
  });
});

describe('⚠️⚠️ pager de inclusão · fail-safe AO CONTRÁRIO', () => {
  it('desconhecido → DÁ PAGER', () => {


    expect(off.exigePagerOffline({ exige_pager: null })).toBe(true);
    expect(off.exigePagerOffline(undefined)).toBe(true);
    expect(off.exigePagerOffline(null)).toBe(true);
  });
  it('só um FALSE explícito dispensa', () => {
    expect(off.exigePagerOffline({ exige_pager: false })).toBe(false);
    expect(off.exigePagerOffline({ exige_pager: true })).toBe(true);
  });
});

describe('busca offline', () => {
  beforeEach(() => {
    off.guardarCriancas([
      { id: '1', nome: 'Mônica Duarte', nome_norm: 'monica duarte', sala_id: 's1', exige_pager: false },
      { id: '2', nome: 'João Pablo', nome_norm: 'joao pedro', sala_id: 's1', exige_pager: null },
    ]);
  });
  it('⚠️ acento normalizado dos DOIS lados (o bug do seletor, 25/08)', () => {
    expect(off.buscarOffline('monica').map((c) => c.id)).toEqual(['1']);
    expect(off.buscarOffline('mônica').map((c) => c.id)).toEqual(['1']);
    expect(off.buscarOffline('JOAO').map((c) => c.id)).toEqual(['2']);
  });
  it('termo curto não devolve a base inteira', () => {
    expect(off.buscarOffline('m')).toEqual([]);
  });
});

describe('fila e sincronização', () => {
  const item = {
    codigo: 'AB12', crianca_id: 'c1', crianca_nome: 'Ana', sala_id: 's1',
    sessao_id: 'x', responsavel_nome: 'Mãe', checkin_at: '2026-09-02T13:00:00Z',
  };

  it('enfileira e conta', () => {
    off.enfileirar(item);
    expect(off.filaCount()).toBe(1);
    expect(off.fila()[0].codigo).toBe('AB12');
  });

  it('⚠️⚠️ o código SACADO vai no payload — o servidor não pode trocá-lo', () => {


    off.enfileirar(item);
    const enviados: any[] = [];
    return off.sincronizar(async (p) => { enviados.push(p); }).then((r) => {
      expect(enviados[0].codigo_reservado).toBe('AB12');
      expect(enviados[0].origem).toBe('offline');
      expect(enviados[0].checkin_at).toBe('2026-09-02T13:00:00Z');
      expect(r.enviados).toBe(1);
      expect(off.filaCount()).toBe(0);
    });
  });

  it('⚠️ duplicado é SUCESSO — sai da fila', async () => {
    off.enfileirar(item);
    const r = await off.sincronizar(async () => { throw Object.assign(new Error('dup'), { status: 409 }); });
    expect(r.duplicados).toBe(1);
    expect(off.filaCount()).toBe(0);
  });

  it('⚠️⚠️ banco fora mantém na fila, sem contar como falha', async () => {
    off.enfileirar(item);
    const r = await off.sincronizar(async () => { throw Object.assign(new Error('down'), { status: 503 }); });
    expect(r.falharam).toBe(0);
    expect(r.pendentes).toBe(1);
    expect(off.filaCount()).toBe(1);
  });

  it('⚠️⚠️ conflito de CÓDIGO vira fila de exceção, não retry nem silêncio', async () => {


    off.enfileirar(item);
    const r = await off.sincronizar(async () => {
      throw Object.assign(new Error('conflito'), { status: 409, corpo: { codigo_conflito: true } });
    });
    expect(r.conflitoDeCodigo).toHaveLength(1);
    expect(r.conflitoDeCodigo[0].codigo).toBe('AB12');
    expect(r.duplicados).toBe(0);
    expect(off.filaCount()).toBe(0);
  });

  it('marca a etiqueta como impressa (o papel existe no mundo)', () => {
    const i = off.enfileirar(item);
    off.marcarImpresso(i.local_id);
    expect(off.fila()[0].impresso).toBe(true);
  });
});

describe('estação', () => {
  it('⚠️ o ref é ESTÁVEL — é o dono do bloco', () => {


    const a = off.estacaoRef();
    expect(off.estacaoRef()).toBe(a);
    expect(a).toMatch(/^totem-/);
  });
});

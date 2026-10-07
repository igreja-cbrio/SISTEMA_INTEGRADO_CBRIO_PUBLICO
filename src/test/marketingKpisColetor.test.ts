import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';





const require = createRequire(import.meta.url);
const K = require('../../backend/utils/marketingKpis.js');
const raiz = join(__dirname, '..', '..');
const ler = (p: string) => semComentariosJs(readFileSync(join(raiz, p), 'utf8'));

describe('MKT-PRAZO · entregues no prazo', () => {
  it('card sem prazo fica FORA do denominador e é declarado', () => {
    const r = K.prazoNoAlvo([
      { entregue_em: '2026-09-29T15:00:00Z', data_fim: '2026-09-30' },
      { entregue_em: '2026-09-29T15:00:00Z' },
    ]);
    expect(r.valor).toBe(100);
    expect(r.observacao).toContain('1 de 1');
    expect(r.observacao).toContain('1 sem prazo');
  });

  it('nenhum card com prazo é "sem medição", nunca 100%', () => {
    expect(K.prazoNoAlvo([{ entregue_em: '2026-09-29T15:00:00Z' }]).valor).toBeNull();
    expect(K.prazoNoAlvo([]).valor).toBeNull();
  });

  it('o prazo é o das Demandas: data_fim vence o prazo de produção', () => {
    const r = K.prazoNoAlvo([{ entregue_em: '2026-09-25T15:00:00Z', data_fim: '2026-09-20', prazo_producao: '2026-09-30' }]);
    expect(r.valor).toBe(0);
  });

  it('entregar no próprio dia do prazo, à noite no Rio, é no prazo', () => {

    expect(K.prazoNoAlvo([{ entregue_em: '2026-10-01T01:30:00Z', data_fim: '2026-09-30' }]).valor).toBe(100);
    expect(K.prazoNoAlvo([{ entregue_em: '2026-10-01T15:00:00Z', data_fim: '2026-09-30' }]).valor).toBe(0);
  });
});

describe('MKT-LEAD · do pedido à entrega', () => {
  const inicio = (c: any) => c.pedido_em;

  it('só pedido (frente Sistema) entra; ciclo criativo fica fora', () => {
    const r = K.leadDosPedidos([
      { campanha_id: 'c1', entregue_em: '2026-09-30T15:00:00Z', pedido_em: '2026-09-20T15:00:00Z' },
      { event_id: 'e1', entregue_em: '2026-09-30T15:00:00Z', pedido_em: '2026-01-01T15:00:00Z' },
    ], inicio);
    expect(r.valor).toBe(10);
  });

  it('média com uma casa; pedido sem data sai da média e é declarado', () => {
    const r = K.leadDosPedidos([
      { solicitacao_id: 's1', entregue_em: '2026-09-30T15:00:00Z', pedido_em: '2026-09-20T15:00:00Z' },
      { solicitacao_id: 's2', entregue_em: '2026-09-30T15:00:00Z', pedido_em: '2026-09-27T15:00:00Z' },
      { solicitacao_id: 's3', entregue_em: '2026-09-30T15:00:00Z', pedido_em: null },
    ], inicio);
    expect(r.valor).toBe(6.5);
    expect(r.observacao).toContain('1 sem a data do pedido');
  });

  it('sem pedido entregue é "sem medição", nunca zero', () => {
    expect(K.leadDosPedidos([], inicio).valor).toBeNull();
    expect(K.leadDosPedidos([{ event_id: 'e1', entregue_em: '2026-09-30T15:00:00Z' }], inicio).valor).toBeNull();
  });
});

describe('o coletor usa a régua pura, e o analytics lê a tabela certa', () => {
  const coletor = ler('backend/services/kpiAutoCollector.js');
  const marketing = ler('backend/routes/marketing.js');

  it('prazo e lead delegam para utils/marketingKpis', () => {
    expect(coletor).toContain("require('../utils/marketingKpis')");
    expect(coletor).toMatch(/MKT_KPIS\.prazoNoAlvo\(/);
    expect(coletor).toMatch(/MKT_KPIS\.leadDosPedidos\(/);
  });

  it('/analytics/kpis lê kpi_registros (onde o coletor grava), nunca kpi_valores_calculados', () => {
    const i = marketing.indexOf("'/analytics/kpis'");
    const trecho = marketing.slice(i, marketing.indexOf("'/analytics/aprovacoes-origem'"));
    expect(trecho).toContain("from('kpi_registros')");
    expect(trecho).not.toContain('kpi_valores_calculados');
  });
});

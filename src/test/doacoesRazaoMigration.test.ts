


import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const doacoes = require('../../backend/utils/doacoesDoador.js');

const raiz = resolve(__dirname, '../..');
const bruto = readFileSync(resolve(raiz, 'supabase/migrations/20261002200000_doacoes_razao_fonte_unica.sql'), 'utf8');
const sql = bruto.split('\n').map((l) => l.replace(/--[^\n]*/, '')).join('\n');
const coletor = readFileSync(resolve(raiz, 'backend/services/kpiAutoCollector.js'), 'utf8');

function bloco(inicio: string, fim: string) {
  const i = sql.indexOf(inicio);
  const j = sql.indexOf(fim, i + inicio.length);
  if (i < 0 || j < 0) throw new Error(`bloco não achado: ${inicio}`);
  return sql.slice(i, j);
}

describe('fn_doacao_tipo × PLANOS_DOACAO', () => {
  const corpo = bloco('CREATE OR REPLACE FUNCTION public.fn_doacao_tipo', 'COMMENT ON FUNCTION public.fn_doacao_tipo');
  const pares = [...corpo.matchAll(/WHEN p_codigo = '([\d.]+)'\s+OR p_codigo LIKE '([\d.]+)\.%'\s+THEN '(\w+)'/g)]
    .map((m) => ({ prefixo: m[1], like: m[2], tipo: m[3] }));

  it('mesmos planos e mesmos tipos, na mesma ordem', () => {
    expect(pares.map(({ prefixo, tipo }) => ({ prefixo, tipo })))
      .toEqual(doacoes.PLANOS_DOACAO.map(({ prefixo, tipo }: { prefixo: string; tipo: string }) => ({ prefixo, tipo })));
  });
  it('fronteira de prefixo: o LIKE é sempre "<prefixo>.%" (nunca "3.02.03.050")', () => {
    for (const p of pares) expect(p.like).toBe(p.prefixo);
  });
  it('empréstimo, inscrição e venda não estão na lista', () => {
    const prefixos = pares.map((p) => p.prefixo);
    for (const fora of ['3.02.06', '3.02.06.02', '3.02.02', '3.02.03.02', '3.02.04']) expect(prefixos).not.toContain(fora);
  });
});

describe('a view nova', () => {
  const view = bloco('CREATE OR REPLACE VIEW public.vw_doacoes_unificada AS', 'COMMENT ON VIEW public.vw_doacoes_unificada');

  it('não lê mais mem_contribuicoes nem fin_pix_detalhe (eram a dupla contagem)', () => {
    expect(view).not.toMatch(/mem_contribuicoes/);
    expect(view).not.toMatch(/fin_pix_detalhe/);
  });
  it('filtra a classe com a MESMA lista da régua JS', () => {
    const m = /ft\.classe_movimento IN \(([^)]*)\)/.exec(view);
    expect([...(m?.[1] || '').matchAll(/'([^']+)'/g)].map((x) => x[1])).toEqual(doacoes.CLASSES_DOACAO);
    expect(view).toMatch(/ft\.status <> 'cancelado'/);
  });
  it('as 11 colunas de antes na mesma ordem, e as novas só no fim', () => {
    const select = view.slice(view.lastIndexOf('SELECT ft.id'));
    const ordem = ['ft.id', 'AS data', 'ft.valor', 'AS tipo', 'ft.forma_pagamento', 'AS membro_id',
      'AS pagador_nome', 'AS pagador_documento', 'AS campanha', 'AS origem', 'AS fonte',
      'AS plano_codigo', 'AS classe', 'AS doador_chave', 'AS atribuicao_origem'];
    const pos = ordem.map((t) => select.indexOf(t));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });
  it('o CPF vence o nome, e o nome só vale com UM cadastro vivo', () => {
    expect(view).toMatch(/COALESCE\(ft\.membro_id, mu\.membro_id\)/);
    expect(view).toMatch(/HAVING count\(\*\) = 1/);
    expect(view).toMatch(/m\.deleted_at IS NULL/);
    expect(view).toMatch(/ON ft\.membro_id IS NULL\s+AND public\.fn_doador_chave\(ft\.referencia\) = mu\.chave/);
  });
  it('valor sai como numeric SEM precisão (a coluna viva não aceita numeric(15,2))', () => {
    expect(view).toMatch(/ft\.valor::numeric AS valor/);
  });
  it('só plano de doação entra (o filtro de tipo está no WHERE)', () => {
    expect(view).toMatch(/WHERE ft\.tipo = 'receita'[\s\S]*AND public\.fn_doacao_tipo\(pc\.codigo\) IS NOT NULL;/);
  });
  it('documento do pagador não sai (nada de CPF na view)', () => {
    expect(view).toMatch(/NULL::text AS pagador_documento/);
  });
});

describe('vw_doacoes_mensal', () => {
  const mensal = bloco('CREATE OR REPLACE VIEW public.vw_doacoes_mensal AS', 'ORDER BY m.mes;');
  it('as 8 colunas de antes na mesma ordem, as novas no fim', () => {
    const select = mensal.slice(mensal.lastIndexOf('SELECT m.mes'));
    const ordem = ['AS mes_label', 'AS total', 'AS dizimo', 'AS oferta', 'AS outras', 'AS qtd_doacoes',
      'AS qtd_doadores_unicos', 'AS extraordinaria', 'AS qtd_membros_doadores', 'AS total_atribuido',
      'AS qtd_membros_ativos_doadores', 'AS qtd_dizimistas'];
    const pos = ordem.map((t) => select.indexOf(t));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });
  it('mês corrente em BRT', () => {
    expect(mensal).toMatch(/now\(\) AT TIME ZONE 'America\/Sao_Paulo'/);
  });
  it('a janela de 12 meses filtra ANTES do join (senão calcula o histórico inteiro)', () => {
    expect(mensal).toMatch(/FROM public\.vw_doacoes_unificada u\s+WHERE u\.data >= \(date_trunc\('month', \(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::date\) - interval '11 months'\)::date/);
  });
  it('contagens com DISTINCT e % de membros no mesmo grupo do denominador', () => {
    expect(mensal).toMatch(/count\(DISTINCT d\.membro_id\) AS qtd_membros_doadores/);
    expect(mensal).toMatch(/count\(DISTINCT d\.membro_id\) FILTER \(WHERE mm\.status = 'membro_ativo'\) AS qtd_membros_ativos_doadores/);
    expect(mensal).toMatch(/FILTER \(WHERE d\.tipo = 'dizimo'\) AS qtd_dizimistas/);
  });
});

describe('contrato dos KPIs (o número não pode mudar)', () => {
  it('_kpi_agregar_dado: patch dinâmico com 2 âncoras e o filtro dízimo+oferta', () => {
    const patch = bloco("v_def  text := pg_get_functiondef('public._kpi_agregar_dado", 'END $$;');
    expect(patch).toMatch(/v_ancora text := 'fonte = ''fin_transacoes''';/);
    expect(patch).toMatch(/AND tipo IN \(''dizimo'', ''oferta''\)/);
    expect(patch).toMatch(/IF n <> 2 THEN/);
  });
  it('coletor GEN-05 filtra dízimo+oferta', () => {
    const gen05 = coletor.slice(coletor.indexOf("'generosidade.valor_total'"), coletor.indexOf("'generosidade.next_doadores'"));
    expect(gen05).toMatch(/\.eq\('fonte', 'fin_transacoes'\)\.in\('tipo', \['dizimo', 'oferta'\]\)/);
  });
  it('as travas da migration existem (abortam tudo se o número divergir)', () => {
    expect(sql).toMatch(/trava 7\.1/);
    expect(sql).toMatch(/trava 7\.2/);
    expect(sql).toMatch(/trava 7\.3/);
    expect(sql).toMatch(/definição viva de vw_doacoes_unificada não é a esperada/);
  });
});

describe('pararam e alertas', () => {
  const pararam = bloco('CREATE OR REPLACE FUNCTION public.fn_generosidade_pararam', 'END $$;');
  it('dias contados em BRT, regular = 3+ doações, cadastro apagado fora', () => {
    expect(pararam).toMatch(/v_hoje date := \(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::date/);
    expect(pararam).not.toMatch(/CURRENT_DATE/);
    expect(pararam).toMatch(/HAVING count\(\*\) >= 3/);
    expect(pararam).toMatch(/m\.deleted_at IS NULL/);
  });
  it('alerta só fecha com doação nos últimos 60 dias (quem parou de novo continua aberto)', () => {
    const alertas = sql.slice(sql.indexOf("UPDATE public.fin_alertas a"));
    expect(alertas).toMatch(/d\.data > \(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::date - 60/);
    expect(alertas).toMatch(/a\.tipo = 'doador_parou'/);
    expect(alertas).toMatch(/a\.atendido_em IS NULL/);
  });
});

describe('permissões', () => {
  it('as funções novas só para service_role', () => {
    expect(sql).not.toMatch(/GRANT[^;]*TO\s+(anon|authenticated)/i);
    for (const f of ['fn_generosidade_top(date, date, int, text)', 'fn_generosidade_pararam(int, int)', 'fn_generosidade_historico_membro(uuid, date, date)']) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${f} TO service_role;`);
    }
  });
});

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { htmlRelatorioDoacoes, dataBr as dataBrTela } from '@/lib/imprimirRelatorioDoacoes';

const require = createRequire(import.meta.url);
const d = require('../../backend/utils/doacoesDoador.js');

const linha = (over: Record<string, unknown> = {}) => ({
  id: String(Math.random()), data: '2026-03-01', valor: 100, plano_codigo: '3.01.01.04',
  plano_nome: 'Dizimos em Geral', classe: 'ordinaria', forma_pagamento: 'Pix',
  nome: 'Maria Silva', chave: 'maria silva', ...over,
});

describe('o que conta como doação', () => {
  it('dízimo, oferta, campanha, extraordinária, missões, ação social e outras contribuições entram', () => {
    for (const codigo of ['3.01.01.04', '3.01.02.08', '3.02.01.07', '3.02.03.03', '3.02.03.05', '3.02.03.01', '3.02.05.05']) {
      expect(d.ehLinhaDeDoacao({ plano_codigo: codigo, classe: 'ordinaria' })).toBe(true);
    }
  });
  it('EMPRÉSTIMO nunca é doação (lei do projeto) · nem pelo plano nem pela classe', () => {
    expect(d.ehLinhaDeDoacao({ plano_codigo: '3.02.06.02', classe: 'ordinaria' })).toBe(false);
    expect(d.ehLinhaDeDoacao({ plano_codigo: '3.01.01.04', classe: 'emprestimo' })).toBe(false);
  });
  it('inscrição (Kids, Jovens, Retiro), venda, rendimento, estorno e transferência ficam fora', () => {
    for (const codigo of ['3.02.02.01', '3.02.02.02', '3.02.02.03.01', '3.02.03.02', '3.02.03.06', '3.02.04.03', '3.02.05.01', '3.02.05.03', '3.02.05.04', '3.02.06.01', '3.02.06.03', '1.01.01.02']) {
      expect(d.ehLinhaDeDoacao({ plano_codigo: codigo, classe: 'ordinaria' })).toBe(false);
    }
    expect(d.ehLinhaDeDoacao({ plano_codigo: '3.01.02.04', classe: 'transferencia' })).toBe(false);
    expect(d.ehLinhaDeDoacao({ plano_codigo: '3.01.02.04', classe: 'estorno' })).toBe(false);
  });
  it('conta nova no plano fica fora até alguém decidir', () => {
    expect(d.ehLinhaDeDoacao({ plano_codigo: '3.02.07.01', classe: 'ordinaria' })).toBe(false);
    expect(d.tipoDoPlano('3.02.03')).toBeNull();
    expect(d.tipoDoPlano('3.02.010')).toBeNull();
  });
  it('a lista que vai para o SQL é a mesma da régua', () => {
    expect(d.PREFIXOS_DOACAO).toEqual(d.PLANOS_DOACAO.map((p: { prefixo: string }) => p.prefixo));
    expect(d.PREFIXOS_DOACAO).not.toContain('3.02.06.02');
    expect(d.CLASSES_DOACAO).toEqual(['ordinaria', 'extraordinaria']);
  });
});

describe('validações de entrada', () => {
  it('busca exige 3 letras depois de normalizar', () => {
    expect(d.validarBusca('ab').ok).toBe(false);
    expect(d.validarBusca('  á  b ').ok).toBe(false);
    expect(d.validarBusca('Mar').ok).toBe(true);
  });
  it('chave do doador: sem acento, minúscula, espaços colapsados', () => {
    expect(d.chaveDoador('  JOSÉ   da  Silva ')).toBe('jose da silva');
    expect(d.chaveDoador('')).toBeNull();
  });
  it('NBSP e tab na ponta não deixam espaço na borda da chave', () => {
    expect(d.chaveDoador('\u00a0Maria  Silva\t')).toBe('maria silva');
    expect(d.chaveDoador('Maria\u00a0Silva')).toBe('maria silva');
  });
  it('chaves: 1 a 20, sem repetidas', () => {
    expect(d.validarChaves(undefined).ok).toBe(false);
    expect(d.validarChaves('maria').chaves).toEqual(['maria']);
    expect(d.validarChaves(['a', 'a', ' b ']).chaves).toEqual(['a', 'b']);
    expect(d.validarChaves(Array.from({ length: 21 }, (_, i) => `n${i}`)).ok).toBe(false);
  });
  it('período: datas válidas e em ordem; vazio = tudo', () => {
    expect(d.validarPeriodo({})).toEqual({ ok: true, inicio: null, fim: null });
    expect(d.validarPeriodo({ inicio: '2026-02-30' }).ok).toBe(false);
    expect(d.validarPeriodo({ inicio: '2024-02-29' }).ok).toBe(true);
    expect(d.validarPeriodo({ inicio: '2026-13-01' }).ok).toBe(false);
    expect(d.validarPeriodo({ inicio: '2026-05-01', fim: '2026-04-01' }).ok).toBe(false);
  });
});

describe('resumirHistorico', () => {
  it('soma em centavos, por ano e por tipo, na ordem dos tipos', () => {
    const r = d.resumirHistorico([
      linha({ valor: 0.1, data: '2025-12-31' }),
      linha({ valor: 0.2, data: '2026-01-01' }),
      linha({ valor: 50, plano_codigo: '3.01.02.04', data: '2026-02-01' }),
      linha({ valor: 30000, plano_codigo: '3.02.03.03', classe: 'extraordinaria', data: '2026-06-10' }),
    ]);
    expect(r.total).toBe(30050.3);
    expect(r.qtd).toBe(4);
    expect(r.primeira).toBe('2025-12-31');
    expect(r.ultima).toBe('2026-06-10');
    expect(r.por_ano.map((a: { ano: string }) => a.ano)).toEqual(['2026', '2025']);
    expect(r.por_ano[0].por_tipo).toEqual({ dizimo: 0.2, oferta: 50, extraordinaria: 30000 });
    expect(r.por_tipo.map((t: { tipo: string }) => t.tipo)).toEqual(['dizimo', 'oferta', 'extraordinaria']);
  });
  it('linha que não é doação é descartada e CONTADA, nunca some calada', () => {
    const r = d.resumirHistorico([linha(), linha({ plano_codigo: '3.02.06.02', classe: 'emprestimo', valor: 999999 })]);
    expect(r.total).toBe(100);
    expect(r.descartadas).toBe(1);
  });
  it('agrupa os nomes incluídos', () => {
    const r = d.resumirHistorico([linha(), linha({ nome: 'Maria S Silva', chave: 'maria s silva', valor: 10 })]);
    expect(r.nomes.map((n: { nome: string }) => n.nome)).toEqual(['Maria Silva', 'Maria S Silva']);
  });
  it('vazio é zero com base declarada', () => {
    expect(d.resumirHistorico([])).toMatchObject({ total: 0, qtd: 0, primeira: null, ultima: null, descartadas: 0 });
  });
});

describe('planilha e registro de acesso', () => {
  it('célula que começa com = + - @ não vira fórmula', () => {
    expect(d.celulaSegura('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(d.celulaSegura('@SOMA')).toBe(`'@SOMA`);
    expect(d.celulaSegura('+5521')).toBe(`'+5521`);
    expect(d.celulaSegura('-1')).toBe(`'-1`);
    expect(d.celulaSegura('Maria')).toBe('Maria');
  });
  it('a planilha leva só doação, valor como número e o nome do extrato protegido', () => {
    const linhas = [linha({ nome: '=1+1' }), linha({ plano_codigo: '3.02.06.02', classe: 'emprestimo' })];
    const resumo = d.resumirHistorico(linhas);
    const { doacoes, porAno } = d.montarPlanilha({ linhas, resumo, inicio: null, fim: null, geradoEm: 'agora', geradoPor: 'Fulano' });
    const cab = doacoes.findIndex((r: unknown[]) => r[0] === 'Data');
    const corpo = doacoes.slice(cab + 1);
    expect(corpo).toHaveLength(1);
    expect(typeof corpo[0][1]).toBe('number');
    expect(corpo[0][5]).toBe(`'=1+1`);
    expect(porAno.at(-1)[0]).toBe('Total');
  });
  it('planilha declara o corte e o que a régua descartou', () => {
    const linhas = [linha(), linha({ plano_codigo: '3.02.06.02', classe: 'emprestimo' })];
    const resumo = d.resumirHistorico(linhas);
    const { doacoes } = d.montarPlanilha({ linhas, resumo, base: { qtd_total: 6000, truncado: true, limite: 5000 }, inicio: null, fim: null });
    const txt = JSON.stringify(doacoes);
    expect(txt).toMatch(/6000 lançamentos/);
    expect(txt).toMatch(/1 lançamento\(s\) fora da régua/);
  });
  it('nome de arquivo sem acento nem espaço', () => {
    expect(d.nomeArquivo({ nome: 'José da Silva', inicio: null, fim: null, ext: 'xlsx' })).toBe('doacoes_jose-da-silva_tudo.xlsx');
    expect(d.nomeArquivo({ nome: 'Ana', inicio: '2026-01-01', fim: '2026-12-31', ext: 'xlsx' })).toBe('doacoes_ana_2026-01-01_a_2026-12-31.xlsx');
  });
  it('registro de acesso grava o autor (req.user.userId) e não leva valores', () => {
    const reg = d.registroDeAcesso({
      acao: 'download', chaves: ['maria silva'], membros: [{ id: 'm1', nome: 'Maria' }], inicio: null, fim: null,
      formato: 'xlsx', qtd: 3, user: { userId: 'u1', email: 'a@b.c', name: 'Fulano', id: 'NAO-USAR' },
    });
    expect(reg).toMatchObject({ table_name: 'fin_doador_relatorio', row_id: 'm1', action: 'INSERT', user_id: 'u1', user_email: 'a@b.c' });
    expect(JSON.stringify(reg)).not.toMatch(/valor|total/);
    const semMembro = d.registroDeAcesso({ acao: 'historico', chaves: ['joao'], membros: [], user: { userId: 'u1' } });
    expect(semMembro.table_name).toBe('fin_doador_historico');
    expect(semMembro.row_id).toBe('nome:joao');
  });
  it('rótulo do período', () => {
    expect(d.rotuloPeriodo(null, null)).toBe('Todo o histórico');
    expect(d.rotuloPeriodo('2026-01-01', '2026-12-31')).toBe('01/01/2026 a 31/12/2026');
  });
});

describe('folha de impressão', () => {
  it('escapa o nome que vem do extrato', () => {
    const linhas = [linha({ nome: '<img src=x onerror=alert(1)>', tipo_rotulo: 'Dízimo' })];
    const resumo = d.resumirHistorico(linhas);
    const html = htmlRelatorioDoacoes({ linhas, resumo, periodo_rotulo: 'Todo o histórico', gerado_em: 'agora', gerado_por: '<b>x</b>' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toMatch(/não é comprovante fiscal/);
  });
  it('declara quando o relatório cortou lançamentos', () => {
    const resumo = d.resumirHistorico([linha()]);
    const html = htmlRelatorioDoacoes({ linhas: [linha()], resumo, base: { qtd_total: 6000, truncado: true, limite: 5000 } });
    expect(html).toMatch(/6000 lançamentos/);
  });
  it('data sem fuso (fatiando a string)', () => {
    expect(dataBrTela('2026-01-01')).toBe('01/01/2026');
    expect(d.dataBr('2026-01-01')).toBe('01/01/2026');
  });
});

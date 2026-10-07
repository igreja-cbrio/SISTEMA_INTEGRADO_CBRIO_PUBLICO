import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';







const require = createRequire(import.meta.url);
const P = require('../../backend/utils/marketingPropagacao.js');
const { exigirLiderNaEscritaCom } = require('../../backend/services/marketingContexto.js');

const antigo = { nome_fase: 'Finalizações', texto: 'Arte do telão', culto: null, category_id: null, esforco_valor: 0, esforco_unidade: 'horas' };
const novo = { ...antigo, esforco_valor: 4, esforco_unidade: 'horas' };
const cards = [
  { id: 'c-ami', culto: 'ami', estado: 'producao', category_id: 'cat-serie' },
  { id: 'c-kids', culto: 'kids', estado: 'backlog', category_id: 'cat-serie' },
  { id: 'c-feito', culto: 'ami', estado: 'concluido', category_id: 'cat-serie' },
  { id: 'c-propria', culto: 'cbrio', estado: 'backlog', category_id: 'cat-com-lista' },
];
const item = (id, card_id, extra = {}) => ({ id, card_id, grupo: 'Finalizações', texto: 'Arte do telão', feito: false, esforco_valor: 0, esforco_unidade: 'horas', ...extra });

describe('propagação do esforço da matriz', () => {
  it('leva o esforço às subtarefas abertas, em tarefas abertas, que seguem o padrão', () => {
    const ids = P.alvosDaPropagacao({
      antigo, novo, cards,
      itens: [item('i1', 'c-ami'), item('i2', 'c-kids'), item('i3', 'c-feito'), item('i4', 'c-ami', { feito: true })],
    });
    expect(ids.sort()).toEqual(['i1', 'i2']);
  });

  it('NUNCA sobrescreve o que a equipe ajustou à mão', () => {
    const ids = P.alvosDaPropagacao({ antigo, novo, cards, itens: [item('i1', 'c-ami', { esforco_valor: 6 })] });
    expect(ids).toEqual([]);
  });

  it('a subtarefa que estava com o esforço ANTIGO do padrão acompanha a mudança', () => {
    const de4 = { ...antigo, esforco_valor: 4 };
    const para1dia = { ...antigo, esforco_valor: 1, esforco_unidade: 'dias' };
    const ids = P.alvosDaPropagacao({ antigo: de4, novo: para1dia, cards, itens: [item('i1', 'c-ami', { esforco_valor: 4 })] });
    expect(ids).toEqual(['i1']);
  });

  it('zerar o padrão não zera o que a equipe tem', () => {
    const de4 = { ...antigo, esforco_valor: 4 };
    expect(P.alvosDaPropagacao({ antigo: de4, novo: { ...antigo, esforco_valor: 0 }, cards, itens: [item('i1', 'c-ami', { esforco_valor: 4 })] })).toEqual([]);
  });

  it('sem mudança de esforço, nada muda', () => {
    expect(P.esforcoMudou(antigo, { ...antigo })).toBe(false);
    expect(P.alvosDaPropagacao({ antigo, novo: { ...antigo }, cards, itens: [item('i1', 'c-ami')] })).toEqual([]);
  });

  it('padrão de um culto só alcança as tarefas daquele culto', () => {
    const doAmi = { ...antigo, culto: 'ami' };
    const ids = P.alvosDaPropagacao({ antigo: doAmi, novo: { ...doAmi, esforco_valor: 2 }, cards, itens: [item('i1', 'c-ami'), item('i2', 'c-kids')] });
    expect(ids).toEqual(['i1']);
  });

  it('padrão global não alcança categoria que tem lista própria na fase', () => {
    const ids = P.alvosDaPropagacao({
      antigo, novo, cards, categoriasComListaPropria: new Set(['cat-com-lista']),
      itens: [item('i1', 'c-ami'), item('i2', 'c-propria')],
    });
    expect(ids).toEqual(['i1']);
  });

  it('casa por fase E texto (a subtarefa não guarda o id do padrão)', () => {
    const ids = P.alvosDaPropagacao({ antigo, novo, cards, itens: [item('i1', 'c-ami', { texto: 'Outra coisa' }), item('i2', 'c-ami', { grupo: 'Execução' })] });
    expect(ids).toEqual([]);
  });
});

function resFalso() {
  const r: { statusCode?: number; body?: unknown; status: (n: number) => typeof r; json: (b: unknown) => typeof r } = {
    status(n) { r.statusCode = n; return r; },
    json(b) { r.body = b; return r; },
  };
  return r;
}

describe('exigirLiderNaEscrita · só o líder escreve configuração', () => {
  it('leitura passa sem nem consultar quem é o líder', async () => {
    const obter = vi.fn();
    const next = vi.fn();
    await exigirLiderNaEscritaCom(obter)({ method: 'GET' }, resFalso(), next);
    expect(next).toHaveBeenCalled();
    expect(obter).not.toHaveBeenCalled();
  });

  it('escrita de quem não é líder → 403 (o nível 5 do boost não basta)', async () => {
    const res = resFalso();
    const next = vi.fn();
    await exigirLiderNaEscritaCom(async () => ({ lider: false, nivel: 5 }))({ method: 'PATCH' }, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('escrita do líder passa', async () => {
    const next = vi.fn();
    await exigirLiderNaEscritaCom(async () => ({ lider: true }))({ method: 'POST' }, resFalso(), next);
    expect(next).toHaveBeenCalled();
  });

  it('sem conseguir conferir, NÃO libera (503)', async () => {
    const res = resFalso();
    const next = vi.fn();
    await exigirLiderNaEscritaCom(async () => { throw new Error('banco fora'); })({ method: 'DELETE' }, res, next);
    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('guardas estáticas · rotas, menu e tela', () => {
  const raiz = join(__dirname, '..', '..');
  const ler = (rel: string) => semComentariosJs(readFileSync(join(raiz, rel), 'utf8'));
  const rotas = ler('backend/routes/marketing.js');
  const app = ler('src/App.tsx');
  const nav = ler('src/pages/marketing/MarketingNav.jsx');
  const tela = ler('src/pages/marketing/MarketingLinhaDoTempo.jsx');
  const abas = ler('src/pages/marketing/MarketingAdmin.jsx');

  it('a trava de /admin é montada ANTES da primeira rota de /admin', () => {
    const trava = rotas.indexOf("router.use('/admin', exigirLiderNaEscrita)");
    const primeira = rotas.search(/router\.(get|post|patch|put|delete)\('\/admin/);
    expect(trava).toBeGreaterThan(-1);
    expect(trava).toBeLessThan(primeira);
  });

  it('mudar o esforço de uma subtarefa padrão propaga para as abertas', () => {
    expect(rotas).toMatch(/propagarEsforcoDoPadrao\(antigo, data\)/);
  });

  it('a aba Admin saiu do menu, e o endereço antigo abre a engrenagem', () => {
    expect(nav).not.toContain("'/marketing/admin'");
    expect(app).toMatch(/path="\/marketing\/admin" element=\{<Navigate to="\/marketing\/demandas\?configurar=equipe" replace \/>\}/);
    expect(app).not.toContain('MarketingAdmin');
  });

  it('a engrenagem só aparece para o líder fora da "Visão"', () => {
    expect(tela).toMatch(/\{lider && !vendoComo && \(\s*<Button[^>]*onClick=\{\(\) => setConfigurar\('equipe'\)\}/);
    expect(tela).toMatch(/\{configurar && lider && !vendoComo && \(/);
  });

  it('as abas de configuração são peças (a página default não existe mais)', () => {
    expect(abas).not.toMatch(/export default/);
    for (const aba of ['AbaMembros', 'AbaRecorrentes', 'AbaOverrides', 'AbaPadroes', 'AbaEtiquetas']) {
      expect(abas).toContain(`export function ${aba}(`);
    }
    expect(existsSync(join(raiz, 'src/pages/marketing/ConfigurarMarketing.jsx'))).toBe(true);
  });
});

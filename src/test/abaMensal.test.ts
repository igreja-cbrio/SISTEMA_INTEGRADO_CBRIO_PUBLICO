











import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..', '..');
const TELA = join(RAIZ, 'src/pages/admin/financeiro/DashboardFinanceiroSemanal.jsx');
const semComentarios = (src: string) => src
  .split('\n')
  .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');

const tela = () => semComentarios(readFileSync(TELA, 'utf8'));
const backend = () => semComentarios(readFileSync(join(RAIZ, 'backend/routes/financeiroV2.js'), 'utf8'));

describe('⚠️⚠️ a aba mudou de NOME, não de chave', () => {
  it('o rótulo é "Mensal"', () => {
    expect(tela()).toMatch(/\{ key: 'tendencias',\s*label: 'Mensal',/);
  });

  it('⚠️⚠️ a chave `tendencias` sobrevive nos 3 pontos do front', () => {
    const s = tela();
    expect(s).toMatch(/key: 'tendencias'/);
    expect(s, 'o render do slide perdeu a chave').toMatch(/slides\[slide\]\.key === 'tendencias'/);
    expect(s).toMatch(/tendencias: \{ id: 2,/);
  });

  it('⚠️⚠️ o assistente de IA continua conhecendo a chave', () => {
    const s = backend();
    expect(s, 'ASSISTENTE_ABAS perdeu a aba').toMatch(/^\s*tendencias:\s*\{ label:/m);

    expect(s.match(/case 'tendencias':/g)?.length).toBe(2);
  });

  it('o rótulo do assistente acompanha o nome novo', () => {
    expect(backend()).toMatch(/tendencias:\s*\{ label: 'Mensal',/);
  });
});

describe('⚠️ o card da média mora junto do gráfico (herda o filtro global)', () => {
  it('MediaMensalCards é renderizado dentro do ArrecadacaoAnualChart', () => {
    const s = tela();
    const i = s.indexOf('function ArrecadacaoAnualChart');
    expect(i).toBeGreaterThan(-1);
    expect(s.slice(i)).toContain('<MediaMensalCards');
  });

  it('⚠️⚠️ o card NÃO faz busca própria — usa o `dadosPorAno` do gráfico', () => {
    const s = tela();
    const i = s.indexOf('function MediaMensalCards');
    const fim = s.indexOf('function ArrecadacaoAnualChart');
    expect(i).toBeGreaterThan(-1);
    const corpo = s.slice(i, fim);
    expect(corpo, 'o card passou a buscar sozinho e perde o filtro global')
      .not.toMatch(/financeiroV2\.|useEffect|fetch\(/);
    expect(corpo).toContain('dadosPorAno[a]?.meses');
  });

  it('⚠️ a média nunca aparece sem a base', () => {
    const s = tela();
    const i = s.indexOf('function MediaMensalCards');
    const corpo = s.slice(i, s.indexOf('function ArrecadacaoAnualChart'));
    expect(corpo).toContain('textoBase(r)');
    expect(corpo).toContain('mediaPuxadaPorUmMes(r)');
  });

  it('usa a régua pura, não uma conta solta na tela', () => {
    const s = tela();
    expect(s).toMatch(/from '@\/lib\/mediaMensal'/);
    const i = s.indexOf('function MediaMensalCards');
    const corpo = s.slice(i, s.indexOf('function ArrecadacaoAnualChart'));

    expect(corpo).not.toMatch(/\/\s*12\b/);
    expect(corpo).toContain('calcularMediaMensal(');
  });
});

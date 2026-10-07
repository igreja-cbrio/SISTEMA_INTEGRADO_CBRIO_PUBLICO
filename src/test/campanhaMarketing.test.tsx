import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CartaoCampanha } from '../pages/marketing/MarketingCampanhas';
import { semComentariosJs } from './_semComentarios';





const require = createRequire(import.meta.url);
const CM = require('../../backend/utils/campanhaMarketing.js');



const linha = (extra = {}) => ({
  campanha_id: 'c-kids', nome: 'Reforma do Espaço Kids', slug: 'reforma-kids', digito: '12',
  status: 'ativa', publica: true, data_inicio: '2026-09-01', data_lancamento: '2026-09-06', data_fim: '2026-10-31',
  meta_centavos: 50000000, total_centavos: 17012768, falta_centavos: 32987232,
  pct: 34.03, pct_barra: 34.03, pct_conciliando: 0, bateu_meta: false, no_ar: true,
  por_domingo_centavos: 6597446, domingos_restantes: 5,
  total_lancamentos: 639, doadores_aprox: 0,
  ...extra,
});



const linhaVoluntariado = (extra = {}) => linha({
  campanha_id: 'c-vol', nome: 'Servir 2027', slug: 'servir-2027', digito: null,
  meta_centavos: 0, total_centavos: 0, falta_centavos: 0, pct: 0, pct_barra: 0,
  por_domingo_centavos: null, domingos_restantes: null, total_lancamentos: 0,
  ...extra,
});
const extraVoluntariado = { template: 'voluntariado', meta_pessoas: 200 };

describe('campanhaMarketing · a lente do Marketing', () => {
  it('encerrada entra (é o resultado final); cancelada sai', () => {
    const r = CM.listaDaAba([linha(), linha({ campanha_id: 'c2', status: 'encerrada' }), linha({ campanha_id: 'c3', status: 'cancelada' })]);
    expect(r.map((c: { id: string }) => c.id)).toEqual(['c-kids', 'c2']);
    expect(r[0].em_curso).toBe(true);
    expect(r[1].em_curso).toBe(false);
  });

  it('o id vem de campanha_id (é assim que a view o chama)', () => {
    expect(CM.resumoCampanhaMarketing(linha()).id).toBe('c-kids');
  });

  it('engajamento = contribuições registradas, NUNCA doadores_aprox', () => {
    const r = CM.resumoCampanhaMarketing(linha());
    expect(r.engajamento).toEqual({ status: 'em_definicao', contribuicoes: 639 });
    expect(r).not.toHaveProperty('doadores_aprox');
  });

  it('custo fica em definição (não há fonte)', () => {
    expect(CM.resumoCampanhaMarketing(linha()).custo).toEqual({ status: 'em_definicao' });
  });

  it('sem contribuições medidas, o engajamento é nulo — não zero', () => {
    expect(CM.resumoCampanhaMarketing(linha({ total_lancamentos: null })).engajamento.contribuicoes).toBeNull();
  });

  it('rascunho e pausada contam como em curso', () => {
    expect(CM.resumoCampanhaMarketing(linha({ status: 'rascunho' })).em_curso).toBe(true);
    expect(CM.resumoCampanhaMarketing(linha({ status: 'pausada' })).em_curso).toBe(true);
  });
});

describe('campanhaMarketing · o TIPO da campanha (templates · 28/09)', () => {
  it('sem template lido, a campanha é do modelo anterior: arrecadação', () => {
    const r = CM.resumoCampanhaMarketing(linha());
    expect(r.tipo).toEqual({ id: 'legado', nome: 'Arrecadação', unidade: 'centavos', dinheiro: true });
    expect(r.em_dinheiro).toBe(true);
    expect(r.tem_meta_em_reais).toBe(true);
  });

  it('campanha de voluntariado NÃO é dinheiro, e o alvo vem em pessoas', () => {
    const r = CM.resumoCampanhaMarketing(linhaVoluntariado(), extraVoluntariado);
    expect(r.tipo.nome).toBe('Voluntariado');
    expect(r.em_dinheiro).toBe(false);
    expect(r.tem_meta_em_reais).toBe(false);
    expect(r.meta_pessoas).toBe(200);
  });

  it('numa campanha de pessoas não existe "0 contribuições" (seria lido como fracasso)', () => {
    expect(CM.resumoCampanhaMarketing(linhaVoluntariado(), extraVoluntariado).engajamento.contribuicoes).toBeNull();
  });

  it('meta 0 não é meta em reais (é a meta NULA que calcularProgresso zerou)', () => {
    expect(CM.resumoCampanhaMarketing(linha({ meta_centavos: 0 })).tem_meta_em_reais).toBe(false);
    expect(CM.resumoCampanhaMarketing(linha({ meta_centavos: null })).tem_meta_em_reais).toBe(false);
  });

  it('tipo desconhecido (leitura falhou) sem meta em reais NÃO vira dinheiro', () => {
    const r = CM.resumoCampanhaMarketing(linhaVoluntariado(), null);
    expect(r.tipo).toBeNull();
    expect(r.em_dinheiro).toBe(false);
  });

  it('tipo desconhecido com meta em reais segue sendo dinheiro (o dado diz)', () => {
    const r = CM.resumoCampanhaMarketing(linha(), null);
    expect(r.tipo).toBeNull();
    expect(r.em_dinheiro).toBe(true);
  });

  it('listaDaAba aplica o template de cada campanha pelo id', () => {
    const extras = new Map([['c-vol', extraVoluntariado]]);
    const r = CM.listaDaAba([linha(), linhaVoluntariado()], extras);
    expect(r.map((c: { em_dinheiro: boolean }) => c.em_dinheiro)).toEqual([true, false]);
  });

  it('listaDaAba com leitura falhada (null) deixa todo tipo desconhecido', () => {
    const r = CM.listaDaAba([linha(), linhaVoluntariado()], null);
    expect(r.map((c: { tipo: unknown }) => c.tipo)).toEqual([null, null]);
  });
});

function renderResumo(resumo: Record<string, unknown>, hoje = '2026-09-28', podeAbrirModulo = false) {
  return render(
    <MemoryRouter>
      <CartaoCampanha campanha={resumo} hoje={hoje} podeAbrirModulo={podeAbrirModulo} />
    </MemoryRouter>,
  );
}

function renderCartao(campanha: Record<string, unknown>, hoje = '2026-09-28', podeAbrirModulo = false) {
  return renderResumo(CM.resumoCampanhaMarketing(campanha), hoje, podeAbrirModulo);
}

describe('CartaoCampanha · a tela', () => {
  it('mostra as três métricas, com custo e engajamento declarados em definição', () => {
    renderCartao(linha());
    expect(screen.getByText('Custo')).toBeTruthy();
    expect(screen.getByText('Engajamento')).toBeTruthy();
    expect(screen.getByText('Resultado')).toBeTruthy();
    expect(screen.getAllByText('em definição')).toHaveLength(2);
    expect(screen.getByText('Ainda não medido.')).toBeTruthy();
  });

  it('o engajamento diz que são contribuições, não pessoas', () => {
    renderCartao(linha());
    expect(screen.getByText('639')).toBeTruthy();
    expect(screen.getByText(/não é o número de pessoas/)).toBeTruthy();
  });

  it('o resultado vem pronto do servidor e diz o que falta por domingo', () => {
    renderCartao(linha());
    expect(screen.getByText('34,03%')).toBeTruthy();
    expect(screen.getByText(/por domingo/)).toBeTruthy();
    expect(screen.getByText('Arrecadando')).toBeTruthy();
    expect(screen.getByText('Arrecadação')).toBeTruthy();
  });

  it('encerrada: selo Encerrada, resultado final e sem cobrar o que falta', () => {
    renderCartao(linha({ status: 'encerrada' }), '2026-11-20');
    expect(screen.getByText('Encerrada')).toBeTruthy();
    expect(screen.getByText('Campanha encerrada — este é o resultado final.')).toBeTruthy();
    expect(screen.queryByText(/Faltam/)).toBeNull();
  });

  it('o atalho para o módulo Campanhas só aparece para quem o alcança', () => {
    renderCartao(linha(), '2026-09-28', false);
    expect(screen.queryByText('Abrir no módulo Campanhas')).toBeNull();
    renderCartao(linha(), '2026-09-28', true);
    expect(screen.getByText('Abrir no módulo Campanhas')).toBeTruthy();
  });

  it('arrecadação sem meta em reais não escreve "de R$ 0,00" nem desenha barra', () => {
    renderCartao(linha({ meta_centavos: 0 }));
    expect(screen.getByText('sem meta em reais definida')).toBeTruthy();
    expect(screen.queryByText(/de R\$\s?0,00/)).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});

describe('CartaoCampanha · campanha de PESSOAS', () => {
  const resumoVol = () => CM.resumoCampanhaMarketing(linhaVoluntariado(), extraVoluntariado);

  it('mostra o alvo em pessoas, e nunca "R$ 0,00 de R$ 0,00"', () => {
    renderResumo(resumoVol());
    expect(screen.getByText('200 pessoas')).toBeTruthy();
    expect(screen.queryByText(/R\$/)).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('o selo e o tipo falam de pessoas, não de arrecadação nem de dígito', () => {
    renderResumo(resumoVol());
    expect(screen.getByText('Voluntariado')).toBeTruthy();
    expect(screen.getByText('Em andamento')).toBeTruthy();
    expect(screen.queryByText('Arrecadando')).toBeNull();
    expect(screen.queryByText(/Dígito|dígito/)).toBeNull();

    expect(screen.queryByText(/doaç/i)).toBeNull();
  });

  it('não mostra "0 contribuições" no engajamento', () => {
    renderResumo(resumoVol());
    expect(screen.queryByText(/contribuiç/)).toBeNull();
    expect(screen.getAllByText('Ainda não medido.')).toHaveLength(2);
  });

  it('com o tipo desconhecido, diz que não deu para conferir', () => {
    renderResumo(CM.resumoCampanhaMarketing(linhaVoluntariado(), null));
    expect(screen.getByText(/Não deu para conferir o tipo desta campanha agora/)).toBeTruthy();
    expect(screen.getByText('Campanha')).toBeTruthy();
  });
});

describe('a aba Generosidade virou Campanhas · guardas', () => {
  const raiz = join(__dirname, '..', '..');
  const ler = (rel: string) => semComentariosJs(readFileSync(join(raiz, rel), 'utf8'));

  it('/marketing/generosidade redireciona para a sub-aba dentro de Campanhas', () => {
    const app = ler('src/App.tsx');
    expect(app).toMatch(/path="\/marketing\/generosidade" element=\{<Navigate to="\/marketing\/campanhas\?t=generosidade" replace \/>\}/);
    expect(app).toMatch(/path="\/marketing\/campanhas" element=\{<ModuleGuard moduleSlug="marketing" nivelMinimo=\{1\}>/);
  });

  it('o menu do Marketing tem Campanhas e não tem mais Generosidade', () => {
    const nav = ler('src/pages/marketing/MarketingNav.jsx');
    expect(nav).toContain("path: '/marketing/campanhas'");
    expect(nav).not.toContain('/marketing/generosidade');
  });

  it('a lista vem do servidor do Marketing, com as encerradas, e não pelo módulo Campanhas', () => {
    const rota = ler('backend/routes/marketing.js');
    expect(rota).toContain("router.get('/resultado-campanhas', authorizeModule('marketing', 1),");
    expect(rota).toContain('arrecadacaoCampanhas.listar({ incluirEncerradas: true })');
    expect(rota).not.toContain('carregarCampanhasDaGenerosidade');
    expect(ler('src/pages/marketing/MarketingCampanhas.jsx')).not.toContain('campanhas.list(');
  });




  it('a rota da aba não disputa o caminho do CRUD de pedidos', () => {
    const rota = ler('backend/routes/marketing.js');
    expect(rota.split("router.get('/campanhas',").length - 1).toBe(1);
  });




  it('o cliente do Marketing tem UMA chave campanhas e a aba usa a própria', () => {
    const api = ler('src/api.js');
    const ini = api.indexOf('export const marketing = {');
    const fim = api.indexOf('\nexport const ', ini + 1);
    const objeto = api.slice(ini, fim);
    expect(objeto.match(/^\s+campanhas\s*:/gm)).toHaveLength(1);
    expect(objeto).toContain("resultadoCampanhas: () => get('/marketing/resultado-campanhas')");
    expect(ler('src/pages/marketing/MarketingCampanhas.jsx')).toContain('api.resultadoCampanhas()');
  });

  it('o tipo da campanha sai da régua do módulo, nunca de cópia local', () => {
    const util = ler('backend/utils/campanhaMarketing.js');
    expect(util).toContain("require('./campanhaTemplates')");
    expect(util).toContain('T.templateDe(');
    const rota = ler('backend/routes/marketing.js');
    expect(rota).toContain('await templatesDasCampanhas(ids)');
    expect(rota).toContain('campanhaMarketing.listaDaAba(lista, extras)');
  });

  it('a generosidade do culto é conteúdo da aba (sem cabeçalho próprio)', () => {
    const gen = ler('src/pages/marketing/MarketingGenerosidade.jsx');
    expect(gen).not.toContain('MarketingPagina');
    expect(gen).not.toContain('BarraCampanha');
    expect(existsSync(join(raiz, 'src/pages/marketing/formatos.js'))).toBe(true);
  });
});

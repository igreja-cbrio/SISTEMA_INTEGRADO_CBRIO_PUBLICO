import { describe, it, expect } from 'vitest';
import {
  filtrarPessoas, alternarFiltro, temFiltro, recontarGrafico, recontarDemografia,
  recontarMapa, resumirValores, decodificarCruzamento, modoDoQuadro, campoPergunta,
  LARGURA_PAGINA_CENSO, LARGURA_PAGINA_COM_QUADRO, LARGURA_COLUNA_PERGUNTAS, LARGURA_QUADRO, VAO_QUADRO, campoDemografia, CAMPO_MAPA,
  type PessoaCruzamento, type GraficoPerfil,
} from '../lib/censoCruzamento';

import { baseSemNeutras, ordenarPorOpcoes, ehNeutra } from '../../backend/utils/censoPerguntas.js';

const demo = (o: Partial<PessoaCruzamento['d']> = {}): PessoaCruzamento['d'] => ({
  faixa_etaria: '25-34', genero: 'feminino', estado_civil: 'casado', bairro: 'Recreio', status_membro: 'membro_ativo', ...o,
});
const pessoa = (id: string, a: Record<string, string[]>, extra: Partial<PessoaCruzamento> = {}): PessoaCruzamento => ({
  id, nome: `Pessoa ${id}`, membro: true, d: demo(), bn: 'recreio', a,
  v: { seguir: true, conectar: false, investir: false, servir: false, generosidade: false }, ...extra,
});

const pessoas: PessoaCruzamento[] = [
  pessoa('1', { filhos: ['1'], vinculo: ['Me considero visitante'], nps: ['10'] }, { v: { seguir: true, conectar: true, investir: false, servir: true } }),
  pessoa('2', { filhos: ['1'], vinculo: ['Sou membro'], nps: ['8'] }),
  pessoa('3', { filhos: ['2'], vinculo: ['Me considero visitante'], nps: ['7'] }, { d: demo({ bairro: 'Barra' }), bn: 'barra' }),
  pessoa('4', { filhos: ['1'], vinculo: ['Me considero visitante'], nps: ['10'] }),
  pessoa('5', { vinculo: ['Prefiro não dizer'], nps: ['10'] }, { v: null, membro: false }),
];

describe('filtrarPessoas · E entre perguntas, OU dentro da pergunta', () => {
  it('sem filtro devolve todo mundo', () => {
    expect(filtrarPessoas(pessoas, {})).toHaveLength(5);
  });
  it('1 filho E se considera visitante (exemplo do Mauricio)', () => {
    const f = { [campoPergunta('filhos')]: ['1'], [campoPergunta('vinculo')]: ['Me considero visitante'] };
    expect(filtrarPessoas(pessoas, f).map((p) => p.id)).toEqual(['1', '4']);
  });
  it('NPS 7 OU 8 (exemplo do Juca)', () => {
    expect(filtrarPessoas(pessoas, { [campoPergunta('nps')]: ['7', '8'] }).map((p) => p.id)).toEqual(['2', '3']);
  });
  it('demografia e mapa filtram também (quem mora no Recreio)', () => {
    expect(filtrarPessoas(pessoas, { [campoDemografia('bairro')]: ['Recreio'] })).toHaveLength(4);
    expect(filtrarPessoas(pessoas, { [CAMPO_MAPA]: ['barra'] }).map((p) => p.id)).toEqual(['3']);
  });
  it('múltipla escolha: marcar UMA das opções da pessoa já a traz', () => {
    const multi = [pessoa('m', { areas: ['Kids', 'Produção'] }), pessoa('n', { areas: ['Louvor'] })];
    expect(filtrarPessoas(multi, { 'p:areas': ['Kids'] }).map((p) => p.id)).toEqual(['m']);
  });
  it('quem não respondeu a pergunta não passa no filtro dela', () => {
    expect(filtrarPessoas(pessoas, { [campoPergunta('filhos')]: ['1', '2'] }).map((p) => p.id)).not.toContain('5');
  });
});

describe('alternarFiltro', () => {
  it('liga, soma e desliga; campo vazio sai do objeto', () => {
    let f = alternarFiltro({}, 'p:nps', '7');
    f = alternarFiltro(f, 'p:nps', '8');
    expect(f).toEqual({ 'p:nps': ['7', '8'] });
    f = alternarFiltro(alternarFiltro(f, 'p:nps', '7'), 'p:nps', '8');
    expect(f).toEqual({});
    expect(temFiltro(f)).toBe(false);
  });
});

describe('recontarGrafico', () => {
  const vinculo: GraficoPerfil = {
    tipo: 'opcao_unica', id: 'vinculo', texto: 'Vínculo',
    valores: [
      { valor: 'Sou membro', total: 0, pct: 0, neutra: false },
      { valor: 'Me considero visitante', total: 0, pct: 0, neutra: false },
      { valor: 'Prefiro não dizer', total: 0, pct: 0, neutra: true },
    ],
  };

  it('neutra fica fora da base e é % do total; opção sem ninguém aparece com zero', () => {
    const r = recontarGrafico(vinculo, pessoas);
    expect(r.base).toBe(4);
    expect(r.neutras).toBe(1);
    expect(r.valores?.map((v) => [v.valor, v.total, v.pct])).toEqual([
      ['Sou membro', 1, 25], ['Me considero visitante', 3, 75], ['Prefiro não dizer', 1, 20],
    ]);
    const so3 = recontarGrafico(vinculo, filtrarPessoas(pessoas, { 'p:nps': ['7'] }));
    expect(so3.valores?.find((v) => v.valor === 'Sou membro')?.total).toBe(0);
  });

  it('a mesma resposta repetida na pessoa conta UMA vez (múltipla gravada em dobro)', () => {
    const repetida = [pessoa('x', { vinculo: ['Sou membro', 'Sou membro', 'Sou membro'] })];
    const r = recontarGrafico(vinculo, repetida);
    expect(r.valores?.find((v) => v.valor === 'Sou membro')?.total).toBe(1);
    expect(r.base).toBe(1);
  });

  it('média refeita só com as pessoas do filtro', () => {
    const nps: GraficoPerfil = {
      tipo: 'nps', id: 'nps', texto: 'NPS', media: 9,
      valores: ['7', '8', '10'].map((valor) => ({ valor, total: 0, pct: 0, neutra: false })),
    };
    expect(recontarGrafico(nps, filtrarPessoas(pessoas, { 'p:nps': ['7', '8'] })).media).toBe(7.5);
  });

  it('valor que o teto do servidor escondeu continua fora, recontado', () => {
    const curto: GraficoPerfil = { ...vinculo, valores: vinculo.valores!.slice(0, 1).concat(vinculo.valores![2]) };
    const r = recontarGrafico(curto, pessoas);
    expect(r.valores_ocultos).toBe(1);
    expect(r.valores_ocultos_pessoas).toBe(3);
  });

  it('PARIDADE: sem filtro, bate com a conta do /perfil (régua do servidor)', () => {
    const pergunta = { id: 'vinculo', tipo: 'opcao_unica', opcoes: ['Sou membro', 'Me considero visitante', 'Prefiro não dizer'], opcoes_neutras: ['Prefiro não dizer'] };

    const linhas = [
      { valor: 'Me considero visitante', total: 3 }, { valor: 'Prefiro não dizer', total: 1 }, { valor: 'Sou membro', total: 1 },
    ];
    const { base, neutras, total } = baseSemNeutras(pergunta, linhas);
    const servidor = ordenarPorOpcoes(pergunta, linhas).map((l: { valor: string; total: number }) => {
      const neutra = ehNeutra(pergunta, l.valor);
      return { valor: l.valor, total: l.total, neutra,
        pct: neutra ? Math.round((l.total / total) * 1000) / 10 : Math.round((l.total / base) * 1000) / 10 };
    });
    const g: GraficoPerfil = { tipo: 'opcao_unica', id: 'vinculo', texto: 'Vínculo', base, neutras, total, valores: servidor };
    const r = recontarGrafico(g, pessoas);
    expect(r.valores).toEqual(servidor);
    expect([r.base, r.neutras, r.total]).toEqual([base, neutras, total]);
  });
});

describe('recontarDemografia e recontarMapa', () => {
  it('conta só quem está no filtro', () => {
    const { demografia } = recontarDemografia(filtrarPessoas(pessoas, { 'p:nps': ['7'] }));
    expect(demografia.bairro).toEqual([{ valor: 'Barra', total: 1 }]);
  });
  it('bairro com teto de 12 e "(não informado)" sempre visível', () => {
    const muitos = Array.from({ length: 15 }, (_, i) => pessoa(`b${i}`, {}, { d: demo({ bairro: `B${i}` }) }))
      .concat(pessoa('x', {}, { d: demo({ bairro: '(não informado)' }) }));
    const { demografia, ocultos } = recontarDemografia(muitos);
    expect(demografia.bairro).toHaveLength(13);
    expect(demografia.bairro.at(-1)?.valor).toBe('(não informado)');
    expect(ocultos.bairro).toEqual({ valores: 3, pessoas: 3 });
  });
  it('mapa: bairro sem ninguém do filtro sai', () => {
    const bairros = [
      { bairro: 'Recreio', norm: 'recreio', total: 4, lat: 0, lng: 0 },
      { bairro: 'Barra', norm: 'barra', total: 1, lat: 0, lng: 0 },
    ];
    const r = recontarMapa(bairros, filtrarPessoas(pessoas, { 'p:nps': ['7'] }));
    expect(r.bairros.map((b) => [b.norm, b.total])).toEqual([['barra', 1]]);
    expect(r.pessoas_no_mapa).toBe(1);
  });
});

describe('resumirValores', () => {
  it('quem respondeu sem cadastro sai da base (não vira "não serve")', () => {
    const r = resumirValores(filtrarPessoas(pessoas, { 'p:nps': ['10'] }), false);
    expect(r.base).toBe(2);
    expect(r.sem_cadastro).toBe(1);
    expect(r.valores.find((v) => v.chave === 'servir')).toEqual({ chave: 'servir', total: 1, pct: 50 });
    expect(r.valores.map((v) => v.chave)).not.toContain('generosidade');
  });
  it('generosidade só aparece com permissão', () => {
    expect(resumirValores(pessoas, true).valores.map((v) => v.chave)).toContain('generosidade');
  });
});

describe('decodificarCruzamento', () => {
  it('troca o índice pelo texto da opção, pergunta a pergunta', () => {
    const r = decodificarCruzamento({
      dicionario: { vinculo: ['Sou membro', 'Me considero visitante'], cores: ['azul', 'verde'] },
      pessoas: [{ ...pessoa('1', {}), a: { vinculo: [1], cores: [0, 1] } }],
    });
    expect(r[0].a).toEqual({ vinculo: ['Me considero visitante'], cores: ['azul', 'verde'] });
  });
});

describe('modoDoQuadro · a coluna das perguntas mantém a largura de antes', () => {
  it('ao lado a partir de 1410px (a página cresce para 1496px)', () => {
    expect(modoDoQuadro(1920)).toBe('lateral');
    expect(modoDoQuadro(1497)).toBe('lateral');
    expect(modoDoQuadro(1410)).toBe('lateral');
    expect(modoDoQuadro(1409)).toBe('flutuante');
    expect(modoDoQuadro(1280)).toBe('flutuante');
    expect(modoDoQuadro(390)).toBe('flutuante');
  });
  it('largura ilegível cai no flutuante', () => {
    expect(modoDoQuadro(Number.NaN)).toBe('flutuante');
    expect(modoDoQuadro(0)).toBe('flutuante');
  });
  it('a página com o quadro = página de antes + vão + quadro', () => {
    expect(LARGURA_PAGINA_COM_QUADRO).toBe(LARGURA_PAGINA_CENSO + VAO_QUADRO + LARGURA_QUADRO);
    expect(LARGURA_COLUNA_PERGUNTAS).toBe(LARGURA_PAGINA_CENSO - 48);
  });
});

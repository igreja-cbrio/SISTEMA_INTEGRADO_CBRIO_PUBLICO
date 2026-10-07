














import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const {
  normalizarSexo,
  consolidarDeclaracoes,
  primeiroNomeParaPalpite,
  palpitesUsaveis,
  casarPalpites,
} = require_('../../backend/utils/sexoDeclarado.js');

describe('normalizarSexo · as tabelas não falam a mesma língua', () => {
  it('canônico passa', () => {
    expect(normalizarSexo('masculino')).toBe('masculino');
    expect(normalizarSexo('feminino')).toBe('feminino');
  });



  it('vocabulário curto M/F traduz', () => {
    expect(normalizarSexo('M')).toBe('masculino');
    expect(normalizarSexo('f')).toBe('feminino');
  });

  it('caixa e espaço não atrapalham', () => {
    expect(normalizarSexo('  Feminino ')).toBe('feminino');
    expect(normalizarSexo('MASCULINO')).toBe('masculino');
  });

  it('não inventa: vazio, lixo e "outro" viram null', () => {
    for (const v of ['', '   ', null, undefined, 'outro', 'x', 'nao informado', 0]) {
      expect(normalizarSexo(v as never)).toBeNull();
    }
  });
});

describe('consolidarDeclaracoes · divergência é CONFLITO, não desempate', () => {
  it('uma fonte só', () => {
    const r = consolidarDeclaracoes([{ fonte: 'next', sexo: 'feminino' }]);
    expect(r).toMatchObject({ sexo: 'feminino', conflito: false });
    expect(r.fontes).toEqual(['next']);
  });

  it('fontes concordando (mesmo em vocabulários diferentes) somam', () => {
    const r = consolidarDeclaracoes([
      { fonte: 'voluntariado', sexo: 'masculino' },
      { fonte: 'batismo', sexo: 'M' },
    ]);
    expect(r.sexo).toBe('masculino');
    expect(r.conflito).toBe(false);
    expect(r.fontes).toEqual(['voluntariado', 'batismo']);
  });




  it('fontes divergindo NÃO gravam nada', () => {
    const r = consolidarDeclaracoes([
      { fonte: 'voluntariado', sexo: 'masculino' },
      { fonte: 'batismo', sexo: 'F' },
    ]);
    expect(r.sexo).toBeNull();
    expect(r.conflito).toBe(true);
    expect(r.fontes.join(' ')).toContain('voluntariado');
    expect(r.fontes.join(' ')).toContain('batismo');
  });

  it('sem declaração nenhuma', () => {
    expect(consolidarDeclaracoes([])).toMatchObject({ sexo: null, conflito: false });
    expect(consolidarDeclaracoes([{ fonte: 'next', sexo: 'outro' }])).toMatchObject({ sexo: null, conflito: false });
    expect(consolidarDeclaracoes(null as never)).toMatchObject({ sexo: null, conflito: false });
  });
});

describe('primeiroNomeParaPalpite · só o primeiro nome vai pro modelo (LGPD)', () => {
  it('devolve o primeiro token', () => {
    expect(primeiroNomeParaPalpite('Maria Souza Lima')).toBe('Maria');
    expect(primeiroNomeParaPalpite('  João   Pablo  ')).toBe('João');
  });

  it('inicial não é nome — não dá pra palpitar', () => {
    expect(primeiroNomeParaPalpite('R. Silva')).toBeNull();
    expect(primeiroNomeParaPalpite('J Souza')).toBeNull();
  });

  it('vazio/nulo não estoura', () => {
    expect(primeiroNomeParaPalpite('')).toBeNull();
    expect(primeiroNomeParaPalpite(null as never)).toBeNull();
  });
});

describe('palpitesUsaveis · ambíguo NÃO vira sugestão', () => {
  it('só confiança alta sobrevive', () => {
    const r = palpitesUsaveis([
      { nome: 'Maria', sexo: 'feminino', confianca: 'alta' },
      { nome: 'Alex', sexo: 'masculino', confianca: 'ambiguo' },
      { nome: 'Ari', sexo: 'feminino', confianca: 'media' },
    ]);
    expect(r).toEqual([{ nome: 'Maria', sexo: 'feminino' }]);
  });



  it('nome unissex marcado ambíguo some da lista', () => {
    const unissex = ['Alex', 'Ari', 'Darci', 'Jean', 'Yuri', 'Nicola', 'Lindomar'];
    const r = palpitesUsaveis(unissex.map(nome => ({ nome, sexo: 'masculino', confianca: 'ambiguo' })));
    expect(r).toEqual([]);
  });

  it('sexo inválido não passa nem com confiança alta', () => {
    expect(palpitesUsaveis([{ nome: 'Chris', sexo: 'outro', confianca: 'alta' }])).toEqual([]);
    expect(palpitesUsaveis([{ nome: '', sexo: 'feminino', confianca: 'alta' }])).toEqual([]);
  });

  it('resposta que não é lista não estoura', () => {
    expect(palpitesUsaveis(null as never)).toEqual([]);
    expect(palpitesUsaveis({ erro: 'x' } as never)).toEqual([]);
  });
});




describe('palpitesUsaveis · formato COMPACTO {masculino:[], feminino:[]}', () => {
  it('lê as duas listas', () => {
    const r = palpitesUsaveis({ masculino: ['João', 'Pablo'], feminino: ['Maria'] });
    expect(r).toEqual([
      { nome: 'João', sexo: 'masculino' },
      { nome: 'Pablo', sexo: 'masculino' },
      { nome: 'Maria', sexo: 'feminino' },
    ]);
  });

  it('chave desconhecida (ex.: "ambiguo") é ignorada', () => {
    const r = palpitesUsaveis({ masculino: ['João'], ambiguo: ['Alex', 'Ari'], outro: ['X'] });
    expect(r).toEqual([{ nome: 'João', sexo: 'masculino' }]);
  });

  it('lista vazia, valor não-array e nome vazio não estouram', () => {
    expect(palpitesUsaveis({ masculino: [], feminino: [] })).toEqual([]);
    expect(palpitesUsaveis({ masculino: 'João' } as never)).toEqual([]);
    expect(palpitesUsaveis({ feminino: ['', '  '] })).toEqual([]);
  });

  it('aceita M/F como chave (o modelo às vezes abrevia)', () => {
    expect(palpitesUsaveis({ m: ['Pablo'], f: ['Ana'] })).toEqual([
      { nome: 'Pablo', sexo: 'masculino' },
      { nome: 'Ana', sexo: 'feminino' },
    ]);
  });
});

describe('casarPalpites · o modelo responde com acento, a base nem sempre tem', () => {
  it('casa ignorando acento e caixa', () => {
    const r = casarPalpites(
      [{ membro_id: 'a', nome: 'JOSE DA SILVA' }, { membro_id: 'b', nome: 'joão pedro' }],
      [{ nome: 'José', sexo: 'masculino' }, { nome: 'Joao', sexo: 'masculino' }],
    );
    expect(r.map(x => x.membro_id).sort()).toEqual(['a', 'b']);
  });

  it('pessoa sem palpite não entra na lista', () => {
    const r = casarPalpites(
      [{ membro_id: 'a', nome: 'Alex Souza' }],
      [{ nome: 'Maria', sexo: 'feminino' }],
    );
    expect(r).toEqual([]);
  });

  it('a mesma sugestão vale pra todo mundo que tem aquele nome', () => {
    const r = casarPalpites(
      [{ membro_id: '1', nome: 'Maria A' }, { membro_id: '2', nome: 'Maria B' }],
      [{ nome: 'Maria', sexo: 'feminino' }],
    );
    expect(r).toHaveLength(2);
    expect(r.every(x => x.sexo === 'feminino')).toBe(true);
  });

  it('aceita id em `id` ou `membro_id`, e ignora quem não tem nome utilizável', () => {
    const r = casarPalpites(
      [{ id: 'z', nome: 'Ana Paula' }, { membro_id: 'w', nome: 'A. Silva' }],
      [{ nome: 'Ana', sexo: 'feminino' }],
    );
    expect(r).toEqual([{ membro_id: 'z', nome: 'Ana Paula', primeiro_nome: 'Ana', sexo: 'feminino' }]);
  });
});

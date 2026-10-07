import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
















const req = createRequire(import.meta.url);

type Linha = Record<string, unknown>;
let cadastro: Linha;
let patchesAplicados: Linha[] = [];

req('../../backend/utils/supabase.js').supabase = {
  from(tabela: string) {
    const q: Record<string, unknown> = {};
    let patch: Linha | null = null;
    for (const m of ['select', 'eq', 'is', 'order', 'limit']) q[m] = () => q;
    q.update = (p: Linha) => { patch = p; return q; };
    q.maybeSingle = () => Promise.resolve({ data: cadastro, error: null });

    q.then = (ok: (r: unknown) => unknown) => {
      if (patch && tabela === 'mem_membros') {
        patchesAplicados.push(patch);
        Object.assign(cadastro, patch);
      }
      return Promise.resolve(ok({ data: null, error: null }));
    };
    return q;
  },
};

const { preencherOQuePortaoExige } = req('../../backend/services/appIdentidade.js');


const COBRADOS = ['telefone', 'data_nascimento', 'genero'] as const;

const digitado = {
  nomeCompleto: 'Milton Teorico',
  telefone: '21900007988',
  dataNascimento: '1958-03-14',
  sexo: 'masculino',
  cpf: '11144477735',
};

describe('preencher o que o portão exige', () => {
  beforeEach(() => { patchesAplicados = []; });



  for (const campo of COBRADOS) {
    it(`grava ${campo} quando está vazio — senão o portão rebate para sempre`, async () => {
      cadastro = {
        nome: 'Milton Teorico', telefone: '21900007988',
        cpf: '11144477735', data_nascimento: '1958-03-14', genero: 'masculino',
      };
      cadastro[campo] = null;

      await preencherOQuePortaoExige('m1', digitado, 'milton@exemplo.com');

      expect(cadastro[campo], `${campo} continuou vazio`).toBeTruthy();
    });
  }

  it('⚠️ o caso sintético medido: só o nascimento faltando', async () => {
    cadastro = {
      nome: 'Milton Teorico', telefone: '21900007988',
      cpf: '11144477735', data_nascimento: null, genero: 'masculino',
    };
    await preencherOQuePortaoExige('m1', digitado, 'milton@exemplo.com');
    expect(cadastro.data_nascimento).toBe('1958-03-14');

    expect(patchesAplicados).toEqual([{ data_nascimento: '1958-03-14' }]);
  });

  it('NÃO sobrescreve o que a equipe já corrigiu à mão', async () => {
    cadastro = {
      nome: 'Milton Teorico Filho', telefone: '2199999999',
      cpf: '11144477735', data_nascimento: '1958-03-14', genero: 'feminino',
    };
    await preencherOQuePortaoExige('m1', digitado, 'milton@exemplo.com');
    expect(patchesAplicados).toEqual([]);
    expect(cadastro.genero).toBe('feminino');
    expect(cadastro.telefone).toBe('2199999999');
  });

  it('troca nome derivado de e-mail por nome de gente', async () => {


    cadastro = {
      nome: 'milton.teorico', telefone: '21900007988',
      cpf: '11144477735', data_nascimento: '1958-03-14', genero: 'masculino',
    };
    await preencherOQuePortaoExige('m1', digitado, 'milton.teorico@exemplo.com');
    expect(cadastro.nome).toBe('Milton Teorico');
  });

  it('⚠️ NUNCA grava CPF — é a chave forte e tem serviço próprio', async () => {


    cadastro = {
      nome: 'Milton Teorico', telefone: '21900007988',
      cpf: null, data_nascimento: '1958-03-14', genero: 'masculino',
    };
    await preencherOQuePortaoExige('m1', digitado, 'milton@exemplo.com');
    expect(cadastro.cpf).toBeNull();
    expect(patchesAplicados).toEqual([]);
  });

  it('cadastro ilegível não derruba o fluxo', async () => {
    cadastro = null as unknown as Linha;
    await expect(preencherOQuePortaoExige('m1', digitado, 'x@y.com')).resolves.toBeUndefined();
  });
});

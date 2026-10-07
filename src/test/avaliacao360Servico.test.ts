import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const requireLocal = createRequire(import.meta.url);
const anonimato = requireLocal('../../backend/utils/avaliacaoAnonimato.js');
const fonte = readFileSync(resolve(__dirname, '../../backend/services/avaliacao360.js'), 'utf8');

type Resultado = { data?: unknown; error?: { message: string; code?: string } | null };
function carregar(resultados: Resultado[] = [], retornoRpc: Resultado = { data: { gravados: 0, existentes: 0 } }) {
  const consultas: { tabela: string; filtros: unknown[][] }[] = [];
  const supabase = {
    from: vi.fn((tabela: string) => {
      const consulta = { tabela, filtros: [] as unknown[][] };
      consultas.push(consulta);
      const builder: any = {};
      for (const metodo of ['select', 'eq', 'is', 'ilike', 'order', 'range', 'maybeSingle']) {
        builder[metodo] = (...args: unknown[]) => { consulta.filtros.push([metodo, ...args]); return builder; };
      }
      builder.then = (resolve: (resultado: Resultado) => unknown) => {
        if (!resultados.length) throw new Error('Consulta inesperada');
        return Promise.resolve(resultados.shift()).then(resolve);
      };
      return builder;
    }),
    rpc: vi.fn().mockResolvedValue(retornoRpc),
  };
  const modulo = { exports: {} as any };
  runInNewContext(fonte, {
    module: modulo,
    require: (id: string) => {
      if (id === '../utils/supabase') return { supabase };
      if (id === '../utils/avaliacaoAnonimato') return anonimato;
      throw new Error(`Import inesperado: ${id}`);
    },
  });
  return { servico: modulo.exports, supabase, consultas };
}

const funcionario = (id: string, gestor_id: string | null = null) => ({ id, gestor_id, nome: id, area: 'Equipe', email: `${id}@example.org` });
const ciclo = { id: 'ciclo', status: 'rascunho', piso_respondentes: 3, max_pares: 3 };

describe('360: identidade literal do login', () => {
  it('normaliza caixa e espaços e escapa curingas antes da consulta', async () => {
    const pessoa = { ...funcionario('a'), email: 'A_B%\\X@example.org' };
    const { servico, consultas } = carregar([{ data: [pessoa] }]);
    const resultado = await servico.funcionarioDoLogin({ user: { email: ' A_B%\\X@example.org ' } });
    expect(resultado).toEqual({ funcionario: pessoa, erro: null });
    expect(consultas[0].filtros).toContainEqual(['ilike', 'email', 'a\\_b\\%\\\\x@example.org']);
    expect(consultas[0].filtros).toContainEqual(['eq', 'status', 'ativo']);
    expect(consultas[0].filtros).toContainEqual(['is', 'deleted_at', null]);
  });

  it('não vincula funcionário retornado apenas por expansão de curinga', async () => {
    const { servico } = carregar([{ data: [{ ...funcionario('a'), email: 'anaXsilva@example.org' }] }]);
    expect(await servico.funcionarioDoLogin({ user: { email: 'ana_silva@example.org' } })).toEqual({ funcionario: null, erro: 'nao_e_funcionario' });
  });

  it('e-mail com asterisco só resolve o candidato literalmente igual', async () => {
    const literal = { ...funcionario('a'), email: 'ana*silva@example.org' };
    const outro = { ...funcionario('b'), email: 'anaXsilva@example.org' };
    const { servico, consultas } = carregar([{ data: [literal, outro] }]);
    expect((await servico.funcionarioDoLogin({ user: { email: literal.email } })).funcionario).toEqual(literal);
    expect(consultas[0].filtros).toContainEqual(['ilike', 'email', 'ana_silva@example.org']);
  });

  it('recusa duas identidades literais e não trata erro de banco como cadastro ausente', async () => {
    const pessoa = funcionario('a');
    const { servico } = carregar([{ data: [pessoa, { ...pessoa, id: 'b' }] }, { error: { message: 'offline' } }]);
    expect((await servico.funcionarioDoLogin({ user: { email: pessoa.email } })).erro).toBe('email_ambiguo');
    expect((await servico.funcionarioDoLogin({ user: { email: pessoa.email } })).erro).toBe('consulta_falhou');
  });

  it('não consulta o banco para login sem e-mail', async () => {
    const { servico, supabase } = carregar();
    expect((await servico.funcionarioDoLogin({ user: {} })).erro).toBe('sem_email');
    expect(supabase.from).not.toHaveBeenCalled();
  });
});





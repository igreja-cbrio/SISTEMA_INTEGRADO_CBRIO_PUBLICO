import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';





const consultas: { tabela: string; filtros: Record<string, unknown> }[] = [];
let respostaPorMembro: unknown = null;
let respostaPorCpf: unknown = null;






const req = createRequire(import.meta.url);
req('../../backend/utils/supabase.js').supabase = {
    from(tabela: string) {
      const filtros: Record<string, unknown> = {};
      consultas.push({ tabela, filtros });
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'not', 'is', 'order', 'limit']) {
        q[m] = (a: unknown, b: unknown) => { if (a) filtros[String(a)] = b ?? true; return q; };
      }
      q.maybeSingle = () => Promise.resolve({
        data: tabela === 'cen_resposta' ? respostaPorMembro : respostaPorCpf, error: null,
      });
      return q;
    },
};

const { acharRespostaDaPessoa } = req('../../backend/services/censoJaRespondeu.js');

describe('já respondeu o censo?', () => {
  beforeEach(() => { consultas.length = 0; respostaPorMembro = null; respostaPorCpf = null; });

  it('acha pelo vínculo quando o pós-processamento já rodou', async () => {
    respostaPorMembro = { id: 'r1', concluida_em: '2026-08-09T12:00:00Z' };
    const r = await acharRespostaDaPessoa({ pesquisaId: 'p1', membroId: 'm1', cpf: '12345678909' });
    expect(r?.por).toBe('membro');

    expect(consultas.map((c) => c.tabela)).toEqual(['cen_resposta']);
  });

  it('⚠️ acha pelo CPF quando o vínculo AINDA não foi feito', async () => {





    respostaPorMembro = null;
    respostaPorCpf = { cen_resposta: { id: 'r2', concluida_em: '2026-08-09T13:00:00Z' } };
    const r = await acharRespostaDaPessoa({ pesquisaId: 'p1', membroId: 'm1', cpf: '123.456.789-09' });
    expect(r?.por).toBe('cpf');
    expect(r?.id).toBe('r2');

    expect(consultas[1].filtros.valor_texto).toBe('12345678909');
  });

  it('devolve null quando ninguém respondeu — é o que libera o censo no app', async () => {
    expect(await acharRespostaDaPessoa({ pesquisaId: 'p1', membroId: 'm1', cpf: '12345678909' }))
      .toBeNull();
  });

  it('membro sem CPF não vira erro', async () => {
    const r = await acharRespostaDaPessoa({ pesquisaId: 'p1', membroId: 'm1', cpf: null });
    expect(r).toBeNull();

    expect(consultas.map((c) => c.tabela)).toEqual(['cen_resposta']);
  });

  it('CPF malformado não vira consulta', async () => {
    await acharRespostaDaPessoa({ pesquisaId: 'p1', membroId: null, cpf: '123' });
    expect(consultas).toEqual([]);
  });

  it('sem pesquisa não consulta nada', async () => {
    expect(await acharRespostaDaPessoa({ pesquisaId: null, membroId: 'm1', cpf: '12345678909' }))
      .toBeNull();
    expect(consultas).toEqual([]);
  });

  it('a busca por CPF filtra pela pesquisa e só pega resposta CONCLUÍDA', async () => {
    respostaPorCpf = { cen_resposta: { id: 'r3', concluida_em: '2026-08-09T13:00:00Z' } };
    await acharRespostaDaPessoa({ pesquisaId: 'p9', membroId: null, cpf: '12345678909' });
    const f = consultas[0].filtros;

    expect(f['cen_resposta.pesquisa_id']).toBe('p9');

    expect(f['cen_resposta.concluida_em']).toBeDefined();
  });
});

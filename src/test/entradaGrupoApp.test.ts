import { describe, it, expect } from 'vitest';
import { avaliarEntradaNoGrupo, sexoNormalizado } from '../../backend/utils/entradaGrupoApp.js';












const ABERTO = {
  id: 'g1', categoria: 'Adultos', ativo: true,
  aceitando_inscricoes: true, modo_inscricao: 'temporada',
  temporada: null, deleted_at: null,
};

describe('avaliarEntradaNoGrupo · o caminho feliz', () => {
  it('deixa entrar em grupo aberto e sem restrição de sexo', () => {
    expect(avaliarEntradaNoGrupo({ grupo: ABERTO, genero: null })).toEqual({ ok: true });
    expect(avaliarEntradaNoGrupo({ grupo: ABERTO, genero: 'masculino' })).toEqual({ ok: true });
  });

  it('⚠️ MUTATION GUARD · `sempre_aberto` entra MESMO com a temporada fechada', () => {


    const g = { ...ABERTO, modo_inscricao: 'sempre_aberto', temporada: 't1' };
    expect(avaliarEntradaNoGrupo({ grupo: g, temporadaAberta: false })).toEqual({ ok: true });
  });

  it('grupo sem temporada não depende de temporada nenhuma', () => {
    expect(avaliarEntradaNoGrupo({ grupo: ABERTO, temporadaAberta: null })).toEqual({ ok: true });
  });
});

describe('avaliarEntradaNoGrupo · os 5 buracos que estavam abertos', () => {
  it('[1] grupo inexistente ou apagado → 404', () => {
    expect(avaliarEntradaNoGrupo({ grupo: null }).status).toBe(404);
    expect(avaliarEntradaNoGrupo({ grupo: undefined }).status).toBe(404);
    expect(avaliarEntradaNoGrupo({ grupo: { ...ABERTO, deleted_at: '2026-01-01' } }).status).toBe(404);
  });

  it('[2] grupo pausado (`ativo=false`) → 403', () => {
    const r = avaliarEntradaNoGrupo({ grupo: { ...ABERTO, ativo: false } });
    expect(r.status).toBe(403);
    expect(r.codigo).toBe('inscricoes_fechadas');
  });

  it('⚠️ [3] `fechado` NÃO barra mais — é o convite do líder (Mauricio · 11/08)', () => {











    expect(avaliarEntradaNoGrupo({ grupo: { ...ABERTO, modo_inscricao: 'fechado' } }))
      .toEqual({ ok: true });
  });

  it('⚠️ mas `fechado` continua obedecendo as OUTRAS travas', () => {


    const fechado = { ...ABERTO, modo_inscricao: 'fechado' };
    expect(avaliarEntradaNoGrupo({ grupo: { ...fechado, ativo: false } }).status).toBe(403);
    expect(avaliarEntradaNoGrupo({ grupo: { ...fechado, aceitando_inscricoes: false } }).status).toBe(403);
    expect(avaliarEntradaNoGrupo({ grupo: { ...fechado, temporada: 't1' }, temporadaAberta: false }).status).toBe(403);
    expect(avaliarEntradaNoGrupo({ grupo: { ...fechado, categoria: 'Mulheres' }, genero: 'masculino' }).status).toBe(422);
  });

  it('[4] `aceitando_inscricoes=false` → 403', () => {
    expect(avaliarEntradaNoGrupo({ grupo: { ...ABERTO, aceitando_inscricoes: false } }).status).toBe(403);
  });

  it('[5] temporada fechada → 403', () => {
    const g = { ...ABERTO, temporada: 't1' };
    expect(avaliarEntradaNoGrupo({ grupo: g, temporadaAberta: false }).status).toBe(403);


    expect(avaliarEntradaNoGrupo({ grupo: g, temporadaAberta: null }).status).toBe(403);
  });
});

describe('avaliarEntradaNoGrupo · a trava de sexo (a queixa do Mauricio)', () => {
  const SO_MULHERES = { ...ABERTO, categoria: 'Mulheres' };
  const SO_HOMENS = { ...ABERTO, categoria: 'Homens' };

  it('⚠️ MUTATION GUARD · homem NÃO entra em grupo de mulheres', () => {
    const r = avaliarEntradaNoGrupo({ grupo: SO_MULHERES, genero: 'masculino' });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(422);
    expect(r.codigo).toBe('grupo_incompativel');
  });

  it('⚠️ MUTATION GUARD · mulher NÃO entra em grupo de homens', () => {
    const r = avaliarEntradaNoGrupo({ grupo: SO_HOMENS, genero: 'feminino' });
    expect(r.status).toBe(422);
    expect(r.codigo).toBe('grupo_incompativel');
  });

  it('deixa entrar quem é do público do grupo', () => {
    expect(avaliarEntradaNoGrupo({ grupo: SO_MULHERES, genero: 'feminino' })).toEqual({ ok: true });
    expect(avaliarEntradaNoGrupo({ grupo: SO_HOMENS, genero: 'masculino' })).toEqual({ ok: true });
  });

  it('⚠️⚠️ MUTATION GUARD · sexo DESCONHECIDO não passa — uma regra só', () => {






    for (const v of [null, undefined, '', '   ', 'outro', 'nao_informado']) {
      const r = avaliarEntradaNoGrupo({ grupo: SO_MULHERES, genero: v });
      expect(r.ok).toBe(false);
      expect(r.status).toBe(422);
      expect(r.codigo).toBe('grupo_incompativel');


      expect(r.erro).toContain('Complete seu cadastro');
    }
  });

  it('quem tem o sexo e não bate recebe a mensagem do PÚBLICO, não a de cadastro', () => {
    expect(avaliarEntradaNoGrupo({ grupo: SO_MULHERES, genero: 'masculino' }).erro)
      .toContain('só de mulheres');
    expect(avaliarEntradaNoGrupo({ grupo: SO_HOMENS, genero: 'feminino' }).erro)
      .toContain('só de homens');
  });

  it('⚠️ MUTATION GUARD · categoria NÃO restritiva nunca pergunta o sexo', () => {


    for (const cat of ['Adultos', 'Jovens', 'Casais', 'Conexao', 'Jornada 180', '', null]) {
      expect(avaliarEntradaNoGrupo({ grupo: { ...ABERTO, categoria: cat }, genero: null })).toEqual({ ok: true });
    }
  });

  it('a categoria bate sem depender de caixa ou espaço', () => {
    expect(avaliarEntradaNoGrupo({ grupo: { ...ABERTO, categoria: '  MULHERES ' }, genero: 'masculino' }).codigo)
      .toBe('grupo_incompativel');
  });

  it('⚠️ a ORDEM importa: grupo fechado responde "fechado", não "sexo"', () => {


    const g = { ...SO_MULHERES, aceitando_inscricoes: false };
    expect(avaliarEntradaNoGrupo({ grupo: g, genero: 'masculino' }).codigo).toBe('inscricoes_fechadas');
  });
});

describe('sexoNormalizado', () => {
  it('aceita as formas que chegam do banco e do formulário', () => {
    expect(sexoNormalizado('Masculino')).toBe('masculino');
    expect(sexoNormalizado(' FEMININO ')).toBe('feminino');
    expect(sexoNormalizado('M')).toBe('masculino');
    expect(sexoNormalizado('f')).toBe('feminino');
  });

  it('devolve null pro que não dá pra saber', () => {
    for (const v of [null, undefined, '', 'x', 'outro', 42, {}]) {
      expect(sexoNormalizado(v as never)).toBeNull();
    }
  });
});










import { describe, it, expect } from 'vitest';
import {
  diaBRT, avaliarIndisponibilidade, textoIndisponibilidade,
  indexarPorPessoa, ehPessoaEscalavel,
} from '../../backend/utils/volDisponibilidade.js';

const CULTO = 'svc-1';
const DIA = '2026-08-16';

describe('diaBRT · o dia é o da igreja, não o do UTC', () => {
  it('culto de domingo 19h NÃO vira segunda', () => {


    expect(diaBRT('2026-08-16T19:00:00-03:00')).toBe('2026-08-16');
    expect(diaBRT('2026-08-16T22:30:00-03:00')).toBe('2026-08-16');
  });

  it('aceita Date e ISO com Z', () => {
    expect(diaBRT(new Date('2026-08-16T12:00:00-03:00'))).toBe('2026-08-16');
    expect(diaBRT('2026-08-17T01:00:00Z')).toBe('2026-08-16');
  });

  it('entrada inválida vira null, não uma data errada', () => {
    expect(diaBRT(null)).toBeNull();
    expect(diaBRT('nao-e-data')).toBeNull();
  });
});

describe('avaliarIndisponibilidade · os DOIS modelos', () => {
  it('bloqueio POR CULTO (service_id) pega', () => {
    const r = avaliarIndisponibilidade({ serviceId: CULTO, dia: DIA }, [
      { service_id: CULTO, reason: 'viagem' },
    ]);
    expect(r.indisponivel).toBe(true);
    expect(r.origem).toBe('culto');
    expect(r.motivo).toBe('viagem');
  });

  it('bloqueio POR PERÍODO (faixa de datas) pega', () => {


    const r = avaliarIndisponibilidade({ serviceId: CULTO, dia: DIA }, [
      { service_id: null, unavailable_from: '2026-08-10', unavailable_to: '2026-08-20', reason: 'férias' },
    ]);
    expect(r.indisponivel).toBe(true);
    expect(r.origem).toBe('periodo');
  });

  it('bordas do período são INCLUSIVAS', () => {
    const faixa = [{ service_id: null, unavailable_from: DIA, unavailable_to: DIA }];
    expect(avaliarIndisponibilidade({ serviceId: CULTO, dia: DIA }, faixa).indisponivel).toBe(true);
  });

  it('período que NÃO cobre o dia não bloqueia', () => {
    const r = avaliarIndisponibilidade({ serviceId: CULTO, dia: DIA }, [
      { service_id: null, unavailable_from: '2026-08-01', unavailable_to: '2026-08-15' },
    ]);
    expect(r.indisponivel).toBe(false);
  });

  it('bloqueio de OUTRO culto não vale para este', () => {
    const r = avaliarIndisponibilidade({ serviceId: CULTO, dia: DIA }, [{ service_id: 'svc-999' }]);
    expect(r.indisponivel).toBe(false);
  });

  it('sem registro nenhum = DISPONÍVEL (o modelo é negativo)', () => {


    expect(avaliarIndisponibilidade({ serviceId: CULTO, dia: DIA }, []).indisponivel).toBe(false);
    expect(avaliarIndisponibilidade({ serviceId: CULTO, dia: DIA }).indisponivel).toBe(false);
  });

  it('sem dia do culto, a faixa não é aplicada (não afirma sem base)', () => {
    const r = avaliarIndisponibilidade({ serviceId: CULTO, dia: null }, [
      { service_id: null, unavailable_from: '2026-01-01', unavailable_to: '2030-01-01' },
    ]);
    expect(r.indisponivel).toBe(false);
  });

  it('faixa incompleta é ignorada em vez de bloquear todo mundo', () => {
    const r = avaliarIndisponibilidade({ serviceId: CULTO, dia: DIA }, [
      { service_id: null, unavailable_from: '2026-08-10', unavailable_to: null },
    ]);
    expect(r.indisponivel).toBe(false);
  });
});

describe('indexarPorPessoa · a chave errada perdia metade dos casos', () => {



  const linhas = [
    { volunteer_profile_id: 'p1', planning_center_person_id: null, service_id: CULTO },
    { volunteer_profile_id: null, planning_center_person_id: 'pc9', service_id: CULTO },
  ];

  it('acha por profile_id', () => {
    expect(indexarPorPessoa(linhas).get('p1')).toHaveLength(1);
  });

  it('acha por planning_center_person_id', () => {
    expect(indexarPorPessoa(linhas).get('pc9')).toHaveLength(1);
  });

  it('linha com os DOIS lados é achável pelos dois', () => {
    const idx = indexarPorPessoa([{ volunteer_profile_id: 'p2', planning_center_person_id: 'pc2' }]);
    expect(idx.get('p2')).toHaveLength(1);
    expect(idx.get('pc2')).toHaveLength(1);
  });

  it('não cria entrada para chave vazia', () => {
    expect(indexarPorPessoa([{ volunteer_profile_id: null, planning_center_person_id: null }]).size).toBe(0);
  });
});

describe('ehPessoaEscalavel · conta de sistema fora da lista de escalar', () => {


  it.each(['. f', '.', 'ADM CBRio', 'admin', 'Totem 1', 'Sistema', 'teste', 'Contribuinte 059412', '', 'a'])(
    'recusa %s', (n) => { expect(ehPessoaEscalavel(n)).toBe(false); },
  );




  it.each(['Adriana Rouxinol', 'Ana', 'Jô', 'Alan Figueira', 'Élen Violeta', "D'Ávila Souza"])(
    'aceita %s', (n) => { expect(ehPessoaEscalavel(n)).toBe(true); },
  );
});

describe('textoIndisponibilidade · frase pra tela', () => {
  it('distingue as duas origens', () => {
    expect(textoIndisponibilidade({ origem: 'culto' })).toContain('neste culto');
    expect(textoIndisponibilidade({ origem: 'periodo' })).toContain('nesta data');
  });
  it('inclui o motivo quando existe', () => {
    expect(textoIndisponibilidade({ origem: 'culto', motivo: 'viagem' })).toContain('viagem');
  });
  it('sem origem não inventa frase', () => {
    expect(textoIndisponibilidade({})).toBeNull();
  });
});

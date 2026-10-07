import { describe, it, expect } from 'vitest';

import {
  ENTIDADES_PERMITIDAS_NO_VAULT,
  podeIrProVault,
  decidirRetrySync,
  getSupportedEntityTypes,
  AREA_VAULT_BY_ENTITY,
  MAX_TENTATIVAS_SYNC,
} from '../../backend/services/cerebroSync.js';












describe('vault · allowlist de entidades', () => {
  it('⚠️ acompanhamento (fila pastoral) NUNCA pode ir pro vault', () => {




    expect(podeIrProVault('acompanhamento')).toBe(false);
    expect(ENTIDADES_PERMITIDAS_NO_VAULT.has('acompanhamento')).toBe(false);
  });

  it('o backfill não OFERECE tipo bloqueado', () => {


    expect(getSupportedEntityTypes()).not.toContain('acompanhamento');
  });

  it('libera exatamente o que foi decidido — nem mais, nem menos', () => {


    expect([...ENTIDADES_PERMITIDAS_NO_VAULT].sort()).toEqual([
      'contribuicao-mes', 'evento', 'funcionario', 'membro', 'projeto', 'voluntario',
    ]);
  });

  it('toda entidade permitida tem pasta no vault mapeada', () => {


    for (const tipo of ENTIDADES_PERMITIDAS_NO_VAULT) {
      expect(AREA_VAULT_BY_ENTITY[tipo], `${tipo} sem area_vault`).toBeTruthy();
    }
  });

  it('tipo desconhecido/vazio é barrado (fail-closed)', () => {
    expect(podeIrProVault('tipo_que_nao_existe')).toBe(false);
    expect(podeIrProVault('')).toBe(false);
    expect(podeIrProVault(null)).toBe(false);
    expect(podeIrProVault(undefined)).toBe(false);
  });
});

describe('vault · retry da fila de sync', () => {
  it('falha de CONSULTA volta pra fila em vez de virar erro terminal', () => {


    expect(decidirRetrySync({ tentativas: 1, retentavel: true }))
      .toEqual({ status: 'pendente', motivo: 'retentavel' });
  });

  it('entidade REALMENTE ausente é terminal na hora', () => {

    expect(decidirRetrySync({ tentativas: 1, retentavel: false }))
      .toEqual({ status: 'erro', motivo: 'permanente' });
  });

  it('retentável tem teto — não tenta pra sempre', () => {
    expect(decidirRetrySync({ tentativas: MAX_TENTATIVAS_SYNC, retentavel: true }))
      .toEqual({ status: 'erro', motivo: 'tentativas_esgotadas' });
    expect(decidirRetrySync({ tentativas: MAX_TENTATIVAS_SYNC - 1, retentavel: true }).status)
      .toBe('pendente');
  });

  it('sem argumento nenhum, desiste (não trava a fila num item sem contexto)', () => {
    expect(decidirRetrySync().status).toBe('erro');
    expect(decidirRetrySync({}).status).toBe('erro');
  });
});

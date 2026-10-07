import { describe, it, expect } from 'vitest';
import { decidirReconciliacao } from '../../backend/utils/volSyncIntegrity';







describe('a rodada de sync tem que se declarar', () => {

  const statusDaRodada = (r: any) => {
    const falhas = Number(r?.tiposComFalha || 0);
    const total = Number(r?.tiposTotal || 0);
    const cultos = Number(r?.services || 0);
    if (falhas > 0 && cultos > 0) return 'partial';
    if (falhas > 0 && total > 0 && falhas >= total) return 'error';
    if (falhas > 0) return 'partial';
    if (!cultos) return 'partial';
    return 'success';
  };

  it('⚠️ o caso que passou três dias escondido: tudo falhou e o log dizia sucesso', () => {
    expect(statusDaRodada({ services: 0, schedules: 0, tiposComFalha: 7, tiposTotal: 7 })).toBe('error');
  });

  it('⚠️ falha de ROSTER com culto entrando é parcial, nunca erro', () => {




    expect(statusDaRodada({ services: 21, schedules: 796, tiposComFalha: 17, tiposTotal: 17 })).toBe('partial');
  });

  it('⚠️ zero culto SEM falha declarada também não é sucesso', () => {


    expect(statusDaRodada({ services: 0, tiposComFalha: 0, tiposTotal: 7 })).toBe('partial');
  });

  it('falha parcial é parcial, não sucesso nem erro', () => {
    expect(statusDaRodada({ services: 18, tiposComFalha: 2, tiposTotal: 7 })).toBe('partial');
  });

  it('rodada boa continua sucesso', () => {
    expect(statusDaRodada({ services: 22, schedules: 460, tiposComFalha: 0, tiposTotal: 7 })).toBe('success');
  });

  it('o histórico não tem contador de tipos e ainda assim se declara', () => {
    expect(statusDaRodada({ services: 30 })).toBe('success');
    expect(statusDaRodada({ services: 0 })).toBe('partial');
  });
});

describe('roster incompleto trava o arquivamento, não a entrada', () => {
  it('⚠️ com tipo falhando, a reconciliação NÃO roda', () => {


    const d = decidirReconciliacao({ tiposComFalha: 1, pessoasCompletas: true });
    expect(d.podeReconciliar).toBe(false);
    expect(d.motivo).toBe('tipos_de_servico_com_falha');
  });

  it('com tudo íntegro, a reconciliação roda', () => {
    expect(decidirReconciliacao({ tiposComFalha: 0, pessoasCompletas: true }).podeReconciliar).toBe(true);
  });
});

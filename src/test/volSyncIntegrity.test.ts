import { describe, it, expect } from 'vitest';
import { decidirReconciliacao, podeGerarCulto } from '../../backend/utils/volSyncIntegrity';





describe('decidirReconciliacao', () => {
  const ok = { tiposComFalha: 0, pessoasCompletas: true };

  it('reconcilia quando o pull foi completo e o PCO ainda é a fonte', () => {
    expect(decidirReconciliacao({ ...ok, pcoAtivo: true })).toEqual({ podeReconciliar: true, motivo: null });
  });

  it('⚠️ NÃO reconcilia com o PCO desligado — sair do Services não é todo mundo sair do voluntariado', () => {
    expect(decidirReconciliacao({ ...ok, pcoAtivo: false }))
      .toEqual({ podeReconciliar: false, motivo: 'pco_desativado' });
  });

  it('⚠️ o PCO desligado é avaliado ANTES das guardas de pull parcial', () => {




    expect(decidirReconciliacao({ tiposComFalha: 3, pessoasCompletas: false, pcoAtivo: false }))
      .toEqual({ podeReconciliar: false, motivo: 'pco_desativado' });
  });

  it('mantém as guardas de pull parcial', () => {
    expect(decidirReconciliacao({ tiposComFalha: 1, pessoasCompletas: true }).podeReconciliar).toBe(false);
    expect(decidirReconciliacao({ tiposComFalha: 0, pessoasCompletas: false }).podeReconciliar).toBe(false);
  });

  it('sem o parâmetro, o comportamento é o de hoje (PCO ativo)', () => {


    expect(decidirReconciliacao(ok).podeReconciliar).toBe(true);
  });
});

describe('podeGerarCulto', () => {
  const TIPO = 'tipo-domingo-noite';
  const OUTRO = 'tipo-domingo-manha';

  it('não duplica o MESMO tipo no mesmo dia, com ou sem PCO', () => {
    const dia = [{ service_type_id: TIPO, planning_center_id: null }];
    expect(podeGerarCulto({ servicosDoDia: dia, serviceTypeId: TIPO, pcoAtivo: true }).pode).toBe(false);
    expect(podeGerarCulto({ servicosDoDia: dia, serviceTypeId: TIPO, pcoAtivo: false }).pode).toBe(false);
  });

  it('⚠️ com o PCO ativo, qualquer culto dele no dia bloqueia (incidente 05/07)', () => {
    const dia = [{ service_type_id: null, planning_center_id: 'pc-123' }];
    const r = podeGerarCulto({ servicosDoDia: dia, serviceTypeId: TIPO, pcoAtivo: true });
    expect(r.pode).toBe(false);
    expect(r.motivo).toBe('dia_tem_culto_do_planning_center');
  });

  it('⚠️ com o PCO desligado, o culto da manhã não bloqueia o da noite', () => {


    const dia = [{ service_type_id: null, planning_center_id: 'pc-manha' }];
    expect(podeGerarCulto({ servicosDoDia: dia, serviceTypeId: TIPO, pcoAtivo: false }).pode).toBe(true);
  });

  it('outro tipo NOSSO no mesmo dia nunca bloqueia', () => {
    const dia = [{ service_type_id: OUTRO, planning_center_id: null }];
    expect(podeGerarCulto({ servicosDoDia: dia, serviceTypeId: TIPO, pcoAtivo: true }).pode).toBe(true);
  });

  it('dia vazio gera', () => {
    expect(podeGerarCulto({ servicosDoDia: [], serviceTypeId: TIPO }).pode).toBe(true);
    expect(podeGerarCulto({ serviceTypeId: TIPO }).pode).toBe(true);
  });
});

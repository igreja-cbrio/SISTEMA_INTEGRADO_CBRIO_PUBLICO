









import { describe, it, expect } from 'vitest';
import { rosterAtivoDoPco, podeDesarquivar } from '../../backend/services/planningCenter.js';

const p = (id: string, extra = {}) => [id, { planning_center_person_id: id, ...extra }] as const;

describe('rosterAtivoDoPco', () => {
  it('pessoa normal do PCO entra como ativa', () => {
    const r = rosterAtivoDoPco(new Map([p('1'), p('2')]));
    expect([...r.pcIds].sort()).toEqual(['1', '2']);
    expect(r.rosterBruto).toBe(2);
  });

  it('⚠️ quem o PCO marcou como inativo NÃO entra em pcIds', () => {
    const r = rosterAtivoDoPco(new Map([p('1'), p('2', { pco_inativo: true })]));
    expect([...r.pcIds]).toEqual(['1']);
  });

  it('⚠️⚠️ o roster BRUTO conta o inativo — é ele que guarda o pull parcial', () => {


    const r = rosterAtivoDoPco(new Map([p('1'), p('2', { pco_inativo: true }), p('3', { pco_inativo: true })]));
    expect(r.rosterBruto).toBe(3);
    expect(r.pcIds.size).toBe(1);
  });

  it('⚠️ ids viram STRING — o PCO devolve número e o banco guarda texto', () => {
    const r = rosterAtivoDoPco(new Map([[123 as unknown as string, { planning_center_person_id: 123 }]]));
    expect([...r.pcIds]).toEqual(['123']);
  });

  it('⚠️ `pco_inativo` ausente ou false conta como ATIVO — na dúvida ninguém é desativado', () => {
    const r = rosterAtivoDoPco(new Map([p('1'), p('2', { pco_inativo: false }), p('3', { pco_inativo: undefined })]));
    expect(r.pcIds.size).toBe(3);
  });

  it('id vazio é descartado dos dois lados', () => {
    const r = rosterAtivoDoPco(new Map([p('1'), ['', { planning_center_person_id: '' }] as const]));
    expect(r.rosterBruto).toBe(1);
    expect(r.pcIds.size).toBe(1);
  });

  it('aceita objeto simples e entrada vazia sem quebrar', () => {
    expect(rosterAtivoDoPco({ a: { pco_inativo: false } }).pcIds.size).toBe(1);
    expect(rosterAtivoDoPco(new Map()).rosterBruto).toBe(0);
    expect(rosterAtivoDoPco(null as never).rosterBruto).toBe(0);
  });
});




describe('podeDesarquivar', () => {
  const roster = new Set(['1', '2']);

  it('quem voltou pro roster do PCO é desarquivado', () => {
    expect(podeDesarquivar({ planning_center_id: '1' }, roster)).toBe(true);
  });

  it('⚠️⚠️ quem foi arquivado À MÃO fica arquivado, mesmo estando no roster', () => {
    expect(podeDesarquivar({ planning_center_id: '1', arquivado_manual: true }, roster)).toBe(false);
  });

  it('quem não está no roster não volta', () => {
    expect(podeDesarquivar({ planning_center_id: '99' }, roster)).toBe(false);
  });

  it('⚠️ coluna AUSENTE (migration não aplicada) = comportamento antigo, o PCO manda', () => {
    expect(podeDesarquivar({ planning_center_id: '1' }, roster)).toBe(true);
    expect(podeDesarquivar({ planning_center_id: '1', arquivado_manual: undefined }, roster)).toBe(true);
    expect(podeDesarquivar({ planning_center_id: '1', arquivado_manual: false }, roster)).toBe(true);
  });

  it('⚠️ só o booleano TRUE trava — string "true" vinda de payload não conta', () => {
    expect(podeDesarquivar({ planning_center_id: '1', arquivado_manual: 'true' as never }, roster)).toBe(true);
  });

  it('id numérico casa com o roster em string', () => {
    expect(podeDesarquivar({ planning_center_id: 1 as never }, roster)).toBe(true);
  });

  it('perfil sem planning_center_id ou nulo não quebra', () => {
    expect(podeDesarquivar({ planning_center_id: null }, roster)).toBe(false);
    expect(podeDesarquivar(null as never, roster)).toBe(false);
  });
});












import { describe, it, expect } from 'vitest';
import { montarCobertura, contarStatus, cultoCompativel } from '../../backend/utils/volCobertura.js';

const item = (over: any = {}) => ({
  id: over.id || 'i1',
  team_id: over.team_id || 'banda',
  team: over.team || { name: 'Banda' },
  position_id: over.position_id === undefined ? 'vocal' : over.position_id,
  position: over.position === undefined ? { name: 'Vocal' } : over.position,
  quantidade: over.quantidade === undefined ? 2 : over.quantidade,
  fixo: !!over.fixo,
});

const esc = (over: any = {}) => ({
  id: over.id || 's1',
  volunteer_id: over.volunteer_id === undefined ? 'p1' : over.volunteer_id,
  volunteer_name: over.volunteer_name || 'Ana',
  team_id: over.team_id || 'banda',
  position_id: over.position_id === undefined ? 'vocal' : over.position_id,
  escala_culto_item_id: over.escala_culto_item_id || null,
  confirmation_status: over.confirmation_status || 'pending',
});

describe('montarCobertura · conta o que falta', () => {
  it('casa pelo vínculo explícito com a vaga', () => {
    const r = montarCobertura([item({ id: 'i1' })], [esc({ id: 's1', escala_culto_item_id: 'i1' })]);
    expect(r.itens[0].preenchidas).toBe(1);
    expect(r.itens[0].faltam).toBe(1);
    expect(r.sobrando).toHaveLength(0);
  });

  it('cai no par (equipe, função) para escala antiga, sem vínculo', () => {
    const r = montarCobertura([item({ id: 'i1' })], [esc({ id: 's1' })]);
    expect(r.itens[0].preenchidas).toBe(1);
  });

  it('⚠️ a MESMA pessoa não preenche duas linhas do mesmo par', () => {


    const r = montarCobertura(
      [item({ id: 'i1', quantidade: 1 }), item({ id: 'i2', quantidade: 1 })],
      [esc({ id: 's1' })],
    );
    const preenchidas = r.itens.map(i => i.preenchidas);
    expect(preenchidas.reduce((a, b) => a + b, 0)).toBe(1);
    expect(r.resumo.faltam).toBe(1);
  });

  it('o vínculo explícito ganha do fallback quando os dois disputam', () => {
    const r = montarCobertura(
      [item({ id: 'i1', quantidade: 1 }), item({ id: 'i2', quantidade: 1 })],
      [esc({ id: 's1', escala_culto_item_id: 'i2' })],
    );
    expect(r.itens.find(i => i.id === 'i2')!.preenchidas).toBe(1);
    expect(r.itens.find(i => i.id === 'i1')!.preenchidas).toBe(0);
  });

  it('⚠️ quem está fora de qualquer composição aparece em `sobrando`', () => {


    const r = montarCobertura([item({ id: 'i1' })], [esc({ id: 's9', team_id: 'cuidados', position_id: null })]);
    expect(r.sobrando).toHaveLength(1);
    expect(r.sobrando[0].id).toBe('s9');
  });

  it('excedente do mesmo par também sobra (não some)', () => {
    const r = montarCobertura(
      [item({ id: 'i1', quantidade: 1 })],
      [esc({ id: 's1' }), esc({ id: 's2', volunteer_id: 'p2' })],
    );
    expect(r.itens[0].preenchidas).toBe(1);
    expect(r.sobrando.map((s: any) => s.id)).toEqual(['s2']);
  });

  it('linha SEM voluntário não preenche vaga — é lugar reservado, não gente', () => {
    const r = montarCobertura([item({ id: 'i1' })], [esc({ id: 's1', volunteer_id: null })]);
    expect(r.itens[0].preenchidas).toBe(0);
    expect(r.itens[0].faltam).toBe(2);
    expect(r.sobrando).toHaveLength(0);
  });

  it('item de equipe toda (sem função) casa com escala sem função', () => {
    const r = montarCobertura(
      [item({ id: 'i1', position_id: null, position: null, quantidade: 1 })],
      [esc({ id: 's1', position_id: null })],
    );
    expect(r.itens[0].preenchidas).toBe(1);
  });

  it('resumo soma alvo, preenchidas e falta', () => {
    const r = montarCobertura(
      [item({ id: 'i1', quantidade: 2 }), item({ id: 'i2', position_id: 'bateria', position: { name: 'Bateria' }, quantidade: 1 })],
      [esc({ id: 's1' })],
    );
    expect(r.resumo).toMatchObject({ alvo: 3, preenchidas: 1, faltam: 2, cobertura_pct: 33 });
  });

  it('sem composição: tudo sobra e o resumo é neutro', () => {
    const r = montarCobertura([], [esc({ id: 's1' })]);
    expect(r.resumo).toMatchObject({ alvo: 0, preenchidas: 0, faltam: 0, cobertura_pct: null });
    expect(r.sobrando).toHaveLength(1);
  });

  it('tolera entradas nulas', () => {
    expect(montarCobertura(null as any, null as any).itens).toEqual([]);
    expect(montarCobertura([item()], [null as any]).itens[0].preenchidas).toBe(0);
  });
});

describe('contarStatus · escalado ≠ confirmou', () => {
  it('separa confirmado, recusado e pendente', () => {
    const r = contarStatus([
      esc({ confirmation_status: 'confirmed' }),
      esc({ confirmation_status: 'declined' }),
      esc({ confirmation_status: 'pending' }),
      esc({ confirmation_status: null }),
    ]);
    expect(r).toEqual({ total: 4, confirmados: 1, recusados: 1, pendentes: 2 });
  });

  it('status desconhecido conta como pendente, nunca some do total', () => {
    expect(contarStatus([esc({ confirmation_status: 'inventado' })]))
      .toEqual({ total: 1, confirmados: 0, recusados: 0, pendentes: 1 });
  });
});









describe('recusa reabre a vaga', () => {
  const item = (over: Record<string, unknown> = {}) => ({
    id: 'i1', team_id: 't1', position_id: 'p1', quantidade: 2, ...over,
  });
  const esc = (id: string, status: string | null, over: Record<string, unknown> = {}) => ({
    id, volunteer_id: `v_${id}`, team_id: 't1', position_id: 'p1',
    escala_culto_item_id: 'i1', confirmation_status: status, ...over,
  });

  it('⚠️ quem recusou NÃO preenche — é a invariante', () => {
    const r = montarCobertura([item()], [esc('a', 'confirmed'), esc('b', 'declined')]);
    expect(r.itens[0].preenchidas).toBe(1);
    expect(r.itens[0].faltam).toBe(1);
    expect(r.itens[0].recusadas).toBe(1);
    expect(r.resumo.preenchidas).toBe(1);
    expect(r.resumo.faltam).toBe(1);
  });

  it('⚠️ mas CONTINUA aparecendo na vaga — sumir tira do supervisor quem ele precisa repor', () => {
    const r = montarCobertura([item()], [esc('a', 'confirmed'), esc('b', 'declined')]);
    expect(r.itens[0].pessoas.map(p => p.id).sort()).toEqual(['a', 'b']);
    expect(r.sobrando).toHaveLength(0);
  });

  it('pendente e confirmado seguem preenchendo — só a recusa abre vaga', () => {
    const r = montarCobertura([item()], [esc('a', 'pending'), esc('b', 'confirmed')]);
    expect(r.itens[0].preenchidas).toBe(2);
    expect(r.itens[0].faltam).toBe(0);
    expect(r.itens[0].recusadas).toBe(0);
  });

  it('status nulo conta como preenchido (o default da base)', () => {
    const r = montarCobertura([item({ quantidade: 1 })], [esc('a', null)]);
    expect(r.itens[0].preenchidas).toBe(1);
  });

  it('⚠️ recusada no vínculo DIRETO não bloqueia o fallback de mostrar a vaga aberta', () => {

    const solta = { id: 'c', volunteer_id: 'v_c', team_id: 't1', position_id: 'p1', confirmation_status: 'confirmed' };
    const r = montarCobertura([item({ quantidade: 1 })], [esc('a', 'declined'), solta]);
    expect(r.itens[0].preenchidas).toBe(1);
    expect(r.itens[0].faltam).toBe(0);
    expect(r.sobrando).toHaveLength(0);
  });

  it('todos recusaram: a vaga fica INTEIRA em aberto', () => {
    const r = montarCobertura([item()], [esc('a', 'declined'), esc('b', 'declined')]);
    expect(r.itens[0].preenchidas).toBe(0);
    expect(r.itens[0].faltam).toBe(2);
    expect(r.resumo.cobertura_pct).toBe(0);
  });
});
















describe('cultoCompativel · régua do eixo de horário', () => {
  it('NULL de qualquer lado é curinga', () => {
    expect(cultoCompativel(null, 'c930')).toBe(true);
    expect(cultoCompativel('c930', null)).toBe(true);
    expect(cultoCompativel(null, null)).toBe(true);
  });

  it('mesmo culto casa; culto diferente NÃO casa', () => {
    expect(cultoCompativel('c930', 'c930')).toBe(true);
    expect(cultoCompativel('c930', 'c1130')).toBe(false);
  });
});

describe('montarCobertura · com split por horário', () => {
  const alvo930 = { ...item({ id: 'i930', quantidade: 1 }), culto_id: 'c930' };
  const alvo1130 = { ...item({ id: 'i1130', quantidade: 1 }), culto_id: 'c1130' };

  it('⚠️ a pessoa do 09:30 NÃO preenche a vaga do 11:30', () => {
    const escala = { ...esc({ id: 's930', volunteer_id: 'p1' }), culto_id: 'c930' };
    const r = montarCobertura([alvo930, alvo1130], [escala]);
    const i930 = r.itens.find((i: any) => i.id === 'i930');
    const i1130 = r.itens.find((i: any) => i.id === 'i1130');
    expect(i930.preenchidas).toBe(1);
    expect(i930.faltam).toBe(0);
    expect(i1130.preenchidas).toBe(0);
    expect(i1130.faltam).toBe(1);
  });

  it('quem serve os DOIS horários (culto_id NULL) preenche a vaga de qualquer um', () => {
    const ambos = { ...esc({ id: 'sAmbos', volunteer_id: 'p9' }), culto_id: null };
    const r = montarCobertura([alvo930], [ambos]);
    expect(r.itens[0].preenchidas).toBe(1);
    expect(r.itens[0].faltam).toBe(0);
  });

  it('vaga de BLOCO (culto_id NULL) é preenchida por quem serve só um horário', () => {
    const blocoAlvo = { ...item({ id: 'iBloco', quantidade: 2 }), culto_id: null };
    const so930 = { ...esc({ id: 's930', volunteer_id: 'p1' }), culto_id: 'c930' };
    const r = montarCobertura([blocoAlvo], [so930]);
    expect(r.itens[0].preenchidas).toBe(1);
    expect(r.itens[0].faltam).toBe(1);
  });

  it('⚠️ o vínculo EXPLÍCITO manda, mesmo com horário divergente', () => {


    const amarrada = { ...esc({ id: 'sX', volunteer_id: 'p7', escala_culto_item_id: 'i1130' }), culto_id: 'c930' };
    const r = montarCobertura([alvo1130], [amarrada]);
    expect(r.itens[0].preenchidas).toBe(1);
    expect(r.sobrando).toHaveLength(0);
  });

  it('o item devolve o culto_id, que é o que a tela usa pra agrupar', () => {
    const r = montarCobertura([alvo930, alvo1130], []);
    expect(r.itens.map((i: any) => i.culto_id)).toEqual(['c930', 'c1130']);
  });

  it('sem split, nada muda: culto_id vem null', () => {
    const r = montarCobertura([item({ id: 'i1' })], [esc({ id: 's1' })]);
    expect(r.itens[0].culto_id).toBeNull();
    expect(r.itens[0].preenchidas).toBe(1);
  });
});

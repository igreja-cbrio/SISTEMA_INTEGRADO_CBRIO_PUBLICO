









const VINC_INVERSO = {
  filho: 'pai_mae', pai_mae: 'filho', irmao: 'irmao', conjuge: 'conjuge',
  avo: 'neto', neto: 'avo', tio: 'sobrinho', sobrinho: 'tio', primo: 'primo',
  responsavel: 'dependente', dependente: 'responsavel', outro: 'outro',
};


const PARENTESCO_PROXIMO = new Set(['pai_mae', 'filho', 'conjuge', 'irmao']);

const ultimoSobrenome = (n) => {
  const t = String(n || '').trim().split(/\s+/).filter(Boolean);
  return t.length ? t[t.length - 1] : '';
};






async function vincularParentesco(supabase, { pessoaId, relacionadoId, tipo, userId = null }) {
  if (!pessoaId || !relacionadoId || pessoaId === relacionadoId) return { ok: false, motivo: 'ids_invalidos' };
  if (!VINC_INVERSO[tipo]) return { ok: false, motivo: 'tipo_invalido' };
  const { data: existe } = await supabase.from('mem_vinculos_familiares')
    .select('id').eq('pessoa_id', pessoaId).eq('relacionado_id', relacionadoId).is('deleted_at', null).maybeSingle();
  if (existe) return { ok: true, ja_existia: true, id: existe.id };
  const { data: a, error: ea } = await supabase.from('mem_vinculos_familiares')
    .insert({ pessoa_id: pessoaId, relacionado_id: relacionadoId, tipo, created_by: userId })
    .select('id').single();
  if (ea) return { ok: false, motivo: ea.message };
  const { data: b } = await supabase.from('mem_vinculos_familiares')
    .insert({ pessoa_id: relacionadoId, relacionado_id: pessoaId, tipo: VINC_INVERSO[tipo], par_id: a.id, created_by: userId })
    .select('id').single();
  if (b) await supabase.from('mem_vinculos_familiares').update({ par_id: b.id }).eq('id', a.id);
  return { ok: true, id: a.id };
}








async function entrarNaFamilia(supabase, { membroId, anfitriaoId, userId = null }) {
  const [{ data: mA }, { data: mB }] = await Promise.all([
    supabase.from('mem_membros').select('id, nome, familia_id').eq('id', membroId).maybeSingle(),
    supabase.from('mem_membros').select('id, nome, familia_id').eq('id', anfitriaoId).maybeSingle(),
  ]);
  if (!mA || !mB) return { ok: false, motivo: 'membro_inexistente' };

  let familiaId = mB.familia_id || null;
  let familiaNome = null;
  if (!familiaId) {
    const sob = ultimoSobrenome(mB.nome) || ultimoSobrenome(mA.nome) || 'sem sobrenome';
    familiaNome = `Família ${sob}`;
    const { data: fam, error: ef } = await supabase.from('mem_familias')
      .insert({ nome: familiaNome }).select('id, nome').single();
    if (ef || !fam) return { ok: false, motivo: ef?.message || 'falha_criar_familia' };
    familiaId = fam.id;

    await supabase.from('mem_membros').update({ familia_id: familiaId }).eq('id', anfitriaoId);
  } else {
    const { data: fam } = await supabase.from('mem_familias').select('nome').eq('id', familiaId).maybeSingle();
    familiaNome = fam?.nome || null;
  }

  if (mA.familia_id !== familiaId) {
    await supabase.from('mem_membros').update({ familia_id: familiaId }).eq('id', membroId);
  }

  const [x, y] = [membroId, anfitriaoId].sort();
  await supabase.from('mem_duplicados_ignorados').upsert(
    { membro_a_id: x, membro_b_id: y, ignorado_por: userId, motivo: 'Convite de familiar (mesma família)' },
    { onConflict: 'membro_a_id,membro_b_id' }).then(() => {}, () => {});

  return { ok: true, familia_id: familiaId, familia_nome: familiaNome };
}

module.exports = { VINC_INVERSO, PARENTESCO_PROXIMO, vincularParentesco, entrarNaFamilia };

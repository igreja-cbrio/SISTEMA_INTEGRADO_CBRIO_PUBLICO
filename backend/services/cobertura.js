











const { supabase } = require('../utils/supabase');
const { resolveEffectivePerms, getCargoMatrix, getModulos, bustPermissionCaches } = require('../middleware/auth');



const OPERACIONAIS = new Set([
  'integracao', 'cuidados', 'grupos', 'voluntariado', 'next', 'next-batismo',
  'membresia', 'kids', 'ami', 'bridge', 'online', 'marketing', 'producao',
]);

function normEmail(e) { return String(e || '').trim().toLowerCase(); }



async function resolverOperacionais(email) {
  const em = normEmail(email);
  if (!em) return { usuarioId: null, ops: {}, overrideMods: new Set() };

  const { data: usuario } = await supabase
    .from('usuarios').select('id, cargo_id').ilike('email', em).maybeSingle();
  if (!usuario) return { usuarioId: null, ops: {}, overrideMods: new Set() };

  const { data: overridesRaw } = await supabase
    .from('permissoes_modulo')
    .select('modulo_id, nivel_leitura, nivel_escrita, pode_exportar, pode_aprovar, escopo_proprio, expira_em')
    .eq('usuario_id', usuario.id);
  const now = Date.now();
  const overrides = (overridesRaw || []).filter(o => !o.expira_em || new Date(o.expira_em).getTime() > now);
  const overrideMods = new Set((overrides || []).map(o => o.modulo_id));

  const { data: userAreas } = await supabase
    .from('usuario_areas').select('areas(nome)').eq('usuario_id', usuario.id);
  const areas = (userAreas || []).map(ua => ua.areas?.nome).filter(Boolean);

  const modulos = await getModulos();
  const cargoMatrix = await getCargoMatrix(usuario.cargo_id);
  const perms = resolveEffectivePerms({ overrides, cargoMatrix, cargoId: usuario.cargo_id, modulos, areas });

  const bySlug = {};
  for (const m of modulos) if (m.slug) bySlug[m.slug] = m.id;

  const ops = {};
  for (const slug of OPERACIONAIS) {
    const p = perms[slug];
    if (p && p.leitura > 0 && bySlug[slug] != null) {
      ops[slug] = { leitura: p.leitura, escrita: p.escrita, modulo_id: bySlug[slug] };
    }
  }
  return { usuarioId: usuario.id, ops, overrideMods };
}


function expiraEmDe(dataFim) {
  const d = new Date(dataFim + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}



async function aplicarCobertura({
  feriasId, titular, substituto, dataInicio, dataFim, criadoPor, observacao,
}) {

  if (!substituto?.email) return { ok: false, motivo: 'substituto sem e-mail' };


  if (feriasId) {
    const { data: ja } = await supabase.from('rh_cobertura')
      .select('id').eq('ferias_id', feriasId).eq('status', 'ativa').limit(1).maybeSingle();
    if (ja) return { ok: true, jaExistia: true, cobertura_id: ja.id };
  }

  const tit = await resolverOperacionais(titular?.email);
  const sub = await resolverOperacionais(substituto.email);


  const { data: cob, error: eCob } = await supabase.from('rh_cobertura').insert({
    ferias_id: feriasId || null,
    titular_funcionario_id: titular?.funcionario_id || null,
    titular_email: normEmail(titular?.email) || null,
    titular_nome: titular?.nome || null,
    substituto_funcionario_id: substituto.funcionario_id || null,
    substituto_email: normEmail(substituto.email),
    substituto_nome: substituto.nome || null,
    data_inicio: dataInicio,
    data_fim: dataFim,
    status: 'ativa',
    criado_por: criadoPor || null,
    observacao: observacao || null,
  }).select('id').single();
  if (eCob) throw eCob;

  const concedidos = {};
  if (sub.usuarioId) {
    const expira = expiraEmDe(dataFim);
    for (const [slug, t] of Object.entries(tit.ops)) {
      const jaEfetivo = sub.ops[slug]?.leitura || 0;
      if (t.leitura <= jaEfetivo) continue;
      if (sub.overrideMods.has(t.modulo_id)) continue;
      const { error } = await supabase.from('permissoes_modulo').insert({
        usuario_id: sub.usuarioId,
        modulo_id: t.modulo_id,
        nivel_leitura: t.leitura,
        nivel_escrita: t.escrita,
        motivo: `cobertura:${cob.id}`,
        expira_em: expira,
        criado_por: criadoPor || null,
      });
      if (!error) concedidos[slug] = { l: t.leitura, e: t.escrita };
    }
  }

  await supabase.from('rh_cobertura')
    .update({ modulos_concedidos: concedidos, updated_at: new Date().toISOString() })
    .eq('id', cob.id);

  bustPermissionCaches();
  return { ok: true, cobertura_id: cob.id, concedidos, substituto_sem_login: !sub.usuarioId };
}


async function encerrarCobertura(coberturaId, novoStatus = 'cancelada') {
  const { data: cob } = await supabase.from('rh_cobertura')
    .select('id, substituto_email').eq('id', coberturaId).maybeSingle();
  if (!cob) return { ok: false };

  const { data: usuario } = await supabase
    .from('usuarios').select('id').ilike('email', normEmail(cob.substituto_email)).maybeSingle();
  if (usuario) {
    await supabase.from('permissoes_modulo')
      .delete().eq('usuario_id', usuario.id).eq('motivo', `cobertura:${coberturaId}`);
  }
  await supabase.from('rh_cobertura')
    .update({ status: novoStatus, updated_at: new Date().toISOString() }).eq('id', coberturaId);
  bustPermissionCaches();
  return { ok: true };
}

module.exports = { OPERACIONAIS, resolverOperacionais, aplicarCobertura, encerrarCobertura };

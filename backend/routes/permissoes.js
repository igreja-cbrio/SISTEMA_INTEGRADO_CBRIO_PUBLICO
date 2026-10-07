const router = require('express').Router();
const {


  authenticate, authorizeModule, bustPermissionCaches,
  resolveEffectivePerms, getCargoMatrix, getModulos,
  AREA_MODULO_BOOST, _normalizarArea,
} = require('../middleware/auth');
const { supabase } = require('../utils/supabase');














router.use(authenticate, authorizeModule('permissoes', 4));






const DEV_EMAILS = (process.env.DEV_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);


async function ehDev(req) {
  const email = (req.user?.email || '').toLowerCase();
  if (!email) return false;
  if (DEV_EMAILS.includes(email)) return true;
  try {
    const { data } = await supabase.from('app_super_admins')
      .select('email').ilike('email', email).eq('ativo', true).maybeSingle();
    return !!data;
  } catch { return false; }
}





function bloqueiaAutoEdicao(req, resolved) {
  const sameProfile = req.params.id && String(req.params.id) === String(req.user.userId);
  const sameUsuario = resolved?.id != null
    && req.user.granular?.usuarioId != null
    && String(resolved.id) === String(req.user.granular.usuarioId);
  return sameProfile || sameUsuario;
}





const NIVEL_TOTAL_PERMISSOES = 5;
async function podeMexerNoControleDeAcesso(req) {


  const perm = req.user?.granular?.modulePerms?.['permissoes-admin'];
  if (perm && (perm.escrita ?? 0) >= NIVEL_TOTAL_PERMISSOES) return true;
  return ehDev(req);
}






async function auditarAcesso(req, { rowId, action = 'UPDATE', changes }) {
  try {
    await supabase.from('app_audit_log').insert({
      table_name: 'permissoes_admin',
      row_id: String(rowId ?? '-'),
      action,
      user_id: req.user?.id || null,
      user_email: req.user?.email || null,
      changes: {
        rota: `${req.method} ${req.originalUrl}`,
        ator_nome: req.user?.name || null,
        ...changes,
      },
    });
  } catch (e) {
    console.error('[permissoes] auditoria falhou:', e.message);
  }
}














async function resolverUsuarioId(idParam) {
  if (idParam == null) return null;


  if (/^\d+$/.test(String(idParam))) {
    return { id: Number(idParam), criado: false };
  }


  let { data: profile } = await supabase.from('profiles')
    .select('id, email, name').eq('id', idParam).maybeSingle();



  if (!profile?.email) {
    const { data: func } = await supabase.from('rh_funcionarios')
      .select('id, email, nome').eq('id', idParam).maybeSingle();
    if (func?.email) {
      profile = { id: func.id, email: func.email, name: func.nome };
    }
  }

  if (!profile?.email) return null;

  const email = profile.email.toLowerCase().trim();


  const { data: existing } = await supabase.from('usuarios')
    .select('id').eq('email', email).maybeSingle();
  if (existing?.id != null) {
    return { id: existing.id, criado: false };
  }


  const { data: novo, error } = await supabase.from('usuarios')
    .insert({
      nome: (profile.name && profile.name.trim()) || email.split('@')[0],
      email,
    }).select('id').single();
  if (error || !novo) return null;
  return { id: novo.id, criado: true };
}









router.get('/colaboradores', async (_req, res) => {
  try {

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, avatar_url')
      .eq('active', true)
      .order('name');
    if (error) throw error;


    const { data: volIds } = await supabase
      .from('vol_profiles')
      .select('auth_user_id')
      .not('auth_user_id', 'is', null);
    const volSet = new Set((volIds || []).map(v => v.auth_user_id));


    const { data: cadEmails } = await supabase
      .from('mem_cadastros_pendentes')
      .select('email')
      .not('email', 'is', null);
    const cadSet = new Set((cadEmails || [])
      .map(c => (c.email || '').toLowerCase().trim())
      .filter(Boolean));



    const { data: usuariosRows } = await supabase
      .from('usuarios')
      .select('email, cargo_id, cargos(id, slug, nome, nome_completo)')
      .eq('ativo', true);
    const cargoByEmail = new Map();
    for (const u of usuariosRows || []) {
      if (!u.email) continue;
      cargoByEmail.set(u.email.toLowerCase().trim(), {
        cargo_id: u.cargo_id,
        cargo_slug: u.cargos?.slug || null,
        cargo_nome: u.cargos?.nome_completo || u.cargos?.nome || null,
      });
    }


    const colaboradores = (profiles || [])
      .filter(p => {
        if (volSet.has(p.id)) return false;
        if (p.email && cadSet.has(p.email.toLowerCase().trim())) return false;
        return true;
      })
      .map(p => {
        const cargoInfo = cargoByEmail.get((p.email || '').toLowerCase().trim()) || {
          cargo_id: null, cargo_slug: null, cargo_nome: null,
        };
        return { ...p, ...cargoInfo, origem: 'profile' };
      });




    const profileEmails = new Set(
      (profiles || [])
        .map(p => (p.email || '').toLowerCase().trim())
        .filter(Boolean)
    );
    const { data: funcionariosRows } = await supabase
      .from('rh_funcionarios')
      .select('id, nome, email, cargo, area')
      .eq('status', 'ativo')
      .not('email', 'is', null);

    for (const f of funcionariosRows || []) {
      const emailKey = (f.email || '').toLowerCase().trim();
      if (!emailKey) continue;
      if (profileEmails.has(emailKey)) continue;
      const cargoInfo = cargoByEmail.get(emailKey) || {
        cargo_id: null, cargo_slug: null, cargo_nome: null,
      };
      colaboradores.push({
        id: f.id,
        name: f.nome,
        email: f.email,
        role: 'funcionario',
        avatar_url: null,
        ...cargoInfo,
        origem: 'funcionario',
      });
    }


    colaboradores.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    res.json(colaboradores);
  } catch (e) {
    console.error('[permissoes/colaboradores]', e.message);
    res.status(500).json({ error: e.message });
  }
});




router.post('/cache/bust', async (_req, res) => {
  try {
    bustPermissionCaches();
    res.json({ success: true, bustedAt: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});





router.get('/diagnostico/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase().trim();

    const { data: profile } = await supabase.from('profiles')
      .select('id, name, email, role, active, area, kpi_areas')
      .ilike('email', email)
      .maybeSingle();

    const { data: funcionario } = await supabase.from('rh_funcionarios')
      .select('id, nome, email, cargo, area, status')
      .ilike('email', email)
      .maybeSingle();

    const { data: usuario } = await supabase.from('usuarios')
      .select('id, email, nome, ativo, cargo_id, cargos(id, slug, nome, nome_completo, nivel_padrao_leitura, nivel_padrao_escrita)')
      .ilike('email', email)
      .maybeSingle();

    const { data: areas } = usuario?.id ? await supabase.from('usuario_areas')
      .select('areas(nome, setor_id, setores(nome))')
      .eq('usuario_id', usuario.id) : { data: [] };

    const { data: overrides } = usuario?.id ? await supabase.from('permissoes_modulo')
      .select('modulo_id, nivel_leitura, nivel_escrita, escopo_proprio, motivo, expira_em, modulos(slug, nome)')
      .eq('usuario_id', usuario.id) : { data: [] };


    const { data: modulosRaw } = await supabase
      .from('modulos')
      .select('id, nome, slug, categoria, rota, ordem')
      .eq('ativo', true);

    let cargoMatrixRaw = [];
    {
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data: page } = await supabase
          .from('cargo_modulo_permissao')
          .select('cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio')
          .range(offset, offset + pageSize - 1);
        if (!page || page.length === 0) break;
        cargoMatrixRaw = cargoMatrixRaw.concat(page);
        if (page.length < pageSize) break;
        offset += pageSize;
      }
    }

    const cargoId = usuario?.cargo_id;
    const cargoIdType = typeof cargoId;


    const matrixRowsForUser = (cargoMatrixRaw || []).filter(r => r.cargo_id === cargoId);
    const matrixRowsForUserLoose = (cargoMatrixRaw || []).filter(r => Number(r.cargo_id) === Number(cargoId));

    const sampleMatrixRow = (cargoMatrixRaw || [])[0] || null;
    const sampleModulo = (modulosRaw || [])[0] || null;

    const defaultsByMod = new Map();
    for (const r of matrixRowsForUser) {
      defaultsByMod.set(r.modulo_id, r);
    }

    const modulosLookup = (modulosRaw || []).map(m => ({
      slug: m.slug,
      nome: m.nome,
      id: m.id,
      id_type: typeof m.id,
      tem_matriz: defaultsByMod.has(m.id),
      nivel_matriz: defaultsByMod.get(m.id)?.nivel ?? null,
    }));


    const tipoModulosId = sampleModulo ? typeof sampleModulo.id : null;
    const tipoCmpModuloId = sampleMatrixRow ? typeof sampleMatrixRow.modulo_id : null;
    const tipoCmpCargoId = sampleMatrixRow ? typeof sampleMatrixRow.cargo_id : null;

    res.json({
      email_query: email,
      profile,
      funcionario,
      usuario: usuario ? {
        ...usuario,
        cargo_id_type: typeof usuario.cargo_id,
      } : null,
      areas_list: (areas || []).map(a => a.areas?.nome).filter(Boolean),
      overrides: overrides || [],
      cargo_id: cargoId,
      cargo_id_type: cargoIdType,
      matrix_stats: {
        cargoMatrix_total_rows: (cargoMatrixRaw || []).length,
        rows_for_user_strict: matrixRowsForUser.length,
        rows_for_user_loose: matrixRowsForUserLoose.length,
        defaultsByMod_size: defaultsByMod.size,
      },
      type_check: {
        modulos_id: tipoModulosId,
        cmp_modulo_id: tipoCmpModuloId,
        cmp_cargo_id: tipoCmpCargoId,
        sample_modulo_id_value: sampleModulo?.id,
        sample_cmp_modulo_id_value: sampleMatrixRow?.modulo_id,
        sample_cmp_cargo_id_value: sampleMatrixRow?.cargo_id,
      },
      modulos_resolvidos: modulosLookup.sort((a, b) => (a.slug || '').localeCompare(b.slug || '')),
    });
  } catch (e) { console.error('[PERMISSOES] diagnostico:', e.stack || e.message); res.status(500).json({ error: e.message }); }
});


router.get('/estrutura', async (req, res) => {
  try {
    const [setores, areas, modulos, cargos] = await Promise.all([
      supabase.from('setores').select('*').eq('ativo', true).order('id'),
      supabase.from('areas').select('*, setores(nome)').eq('ativo', true).order('nome'),
      supabase.from('modulos').select('*').eq('ativo', true).order('ordem'),
      supabase.from('cargos').select('*').eq('ativo', true).order('ordem'),
    ]);
    res.json({
      setores: setores.data || [],
      areas: areas.data || [],
      modulos: modulos.data || [],
      cargos: cargos.data || [],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});






router.get('/matriz', async (_req, res) => {
  try {
    const [cargos, modulos] = await Promise.all([
      supabase.from('cargos').select('*').eq('ativo', true).order('ordem'),
      supabase.from('modulos').select('*').eq('ativo', true).order('ordem'),
    ]);



    let celulas = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('cargo_modulo_permissao')
        .select('*')
        .range(offset, offset + pageSize - 1);
      if (error) return res.status(400).json({ error: error.message });
      if (!data || data.length === 0) break;
      celulas = celulas.concat(data);
      if (data.length < pageSize) break;
      offset += pageSize;
    }
    res.json({
      cargos: cargos.data || [],
      modulos: modulos.data || [],
      celulas,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});






router.put('/matriz/celula', async (req, res) => {
  try {
    const { cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio } = req.body;
    if (!cargo_id || !modulo_id) return res.status(400).json({ error: 'cargo_id e modulo_id são obrigatórios' });
    if (typeof nivel !== 'number' || nivel < 0 || nivel > 5) return res.status(400).json({ error: 'nível deve estar entre 0 e 5' });



    if (!(await podeMexerNoControleDeAcesso(req))) {
      return res.status(403).json({ error: 'Só quem tem nível 5 em Permissões (ou o time de sistemas) pode alterar a matriz dos cargos.' });
    }







    if (req.user?.granular?.cargoId != null
        && String(cargo_id) === String(req.user.granular.cargoId)
        && !(await ehDev(req))) {
      return res.status(403).json({ error: 'Você não pode alterar a régua do seu próprio cargo. Peça a outro administrador.' });
    }

    const { error } = await supabase.from('cargo_modulo_permissao').upsert({
      cargo_id, modulo_id, nivel,
      pode_exportar: !!pode_exportar,
      pode_aprovar: !!pode_aprovar,
      escopo_proprio: !!escopo_proprio,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'cargo_id,modulo_id' });
    if (error) return res.status(400).json({ error: error.message });


    await auditarAcesso(req, {
      rowId: `${cargo_id}:${modulo_id}`,
      changes: { tipo: 'matriz_celula', cargo_id, modulo_id, nivel, pode_exportar: !!pode_exportar, pode_aprovar: !!pode_aprovar, escopo_proprio: !!escopo_proprio },
    });
    bustPermissionCaches();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.get('/cargo/:id', async (req, res) => {
  try {
    const [cargo, celulas] = await Promise.all([
      supabase.from('cargos').select('*').eq('id', req.params.id).single(),
      supabase.from('cargo_modulo_permissao').select('*, modulos(slug, nome, categoria, ordem)').eq('cargo_id', req.params.id),
    ]);
    if (cargo.error) return res.status(404).json({ error: 'Cargo não encontrado' });
    res.json({ cargo: cargo.data, celulas: celulas.data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.get('/usuario/:id', async (req, res) => {
  try {
    const resolved = await resolverUsuarioId(req.params.id);
    if (!resolved) {

      return res.json({ usuario: null, areas: [], overrides: [], extraScopes: [] });
    }
    const userId = resolved.id;


    const { data: usuario } = await supabase.from('usuarios')
      .select('*, cargos(*)').eq('id', userId).maybeSingle();


    const { data: userAreas } = await supabase.from('usuario_areas')
      .select('*, areas(nome, setor_id, setores(nome))').eq('usuario_id', userId);


    const { data: overrides } = await supabase.from('permissoes_modulo')
      .select('*, modulos(nome)').eq('usuario_id', userId);


    const { data: extraScopes } = await supabase.from('permissoes_escopo_extra')
      .select('*, modulos(nome), areas(nome), setores(nome)').eq('usuario_id', userId);





    let grade = [];
    try {
      const cargoId = usuario?.cargo_id ?? null;
      const modulos = await getModulos();
      const cargoMatrix = cargoId != null ? await getCargoMatrix(cargoId) : [];
      const areaNames = (userAreas || []).map(a => a.areas?.nome).filter(Boolean);


      const slugsComBoost = new Set();
      for (const a of areaNames) {
        const slug = AREA_MODULO_BOOST[_normalizarArea(a)];
        if (slug) slugsComBoost.add(slug);
      }

      const efetivas = resolveEffectivePerms({
        overrides: overrides || [],
        cargoMatrix,
        cargoId,
        modulos,
        areas: areaNames,
      });
      const overrideByMod = new Map((overrides || []).map(o => [o.modulo_id, o]));
      const cargoByMod = new Map();
      for (const r of cargoMatrix || []) {
        if (r.cargo_id === cargoId) cargoByMod.set(r.modulo_id, r);
      }

      grade = (modulos || []).map(m => {
        const ov = overrideByMod.get(m.id) || null;
        const cargoCell = cargoByMod.get(m.id) || null;
        const boost = !!(m.slug && slugsComBoost.has(m.slug));


        const blocked = !!ov && (ov.nivel_leitura ?? 1) === 0;
        const eff = (m.slug && efetivas[m.slug]) || (m.nome && efetivas[m.nome]) || { leitura: 0, escrita: 0 };

        let origem;
        if (ov) origem = blocked ? 'bloqueio' : 'override';
        else if (boost) origem = 'area';
        else if (cargoCell && (cargoCell.nivel ?? 0) > 0) origem = 'cargo';
        else origem = 'nenhum';
        return {
          modulo_id: m.id,
          slug: m.slug,
          nome: m.nome,
          categoria: m.categoria || 'outros',
          ordem: m.ordem ?? 0,
          rota: m.rota || null,
          leitura: blocked ? 0 : (eff.leitura ?? 0),
          escrita: blocked ? 0 : (eff.escrita ?? 0),
          origem,
          area_boost: boost,
          blocked,
          cargo_nivel: cargoCell?.nivel ?? 0,

          pode_exportar: ov?.pode_exportar ?? cargoCell?.pode_exportar ?? false,
          pode_aprovar: ov?.pode_aprovar ?? cargoCell?.pode_aprovar ?? false,
          escopo_proprio: ov?.escopo_proprio ?? cargoCell?.escopo_proprio ?? false,
          override: ov ? {
            nivel_leitura: ov.nivel_leitura,
            nivel_escrita: ov.nivel_escrita,
            motivo: ov.motivo || null,
            expira_em: ov.expira_em || null,
          } : null,
        };
      }).sort((a, b) => (a.ordem - b.ordem) || (a.nome || '').localeCompare(b.nome || ''));
    } catch (gradeErr) {
      console.error('[permissoes/usuario grade]', gradeErr.message);
      grade = [];
    }

    res.json({
      usuario: usuario || null,
      areas: userAreas || [],
      overrides: overrides || [],
      extraScopes: extraScopes || [],
      grade,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.get('/usuario-por-email/:email', async (req, res) => {
  try {
    const { data } = await supabase.from('usuarios')
      .select('*, cargos(*)').eq('email', req.params.email).single();
    res.json(data || null);
  } catch (e) { res.json(null); }
});


router.post('/usuario', async (req, res) => {
  try {
    const { nome, email, cargo_id } = req.body;
    if (!nome || !cargo_id) return res.status(400).json({ error: 'Nome e cargo são obrigatórios' });




    const emailNorm = String(email || '').trim().toLowerCase();
    if (!emailNorm || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailNorm)) {
      return res.status(400).json({ error: 'É preciso um e-mail válido para criar o acesso deste colaborador.' });
    }





    if (emailNorm === String(req.user?.email || '').trim().toLowerCase()) {
      return res.status(403).json({ error: 'Você não pode criar nem alterar o próprio cadastro de acesso. Peça a outro administrador.' });
    }


    const { data: existing } = await supabase.from('usuarios')
      .select('id').eq('email', emailNorm).limit(1);



    if (existing?.length && bloqueiaAutoEdicao(req, { id: existing[0].id })) {
      return res.status(403).json({ error: 'Você não pode alterar o próprio cadastro de acesso. Peça a outro administrador.' });
    }

    let userId;
    let acaoAudit = 'UPDATE';
    if (existing?.length) {
      await supabase.from('usuarios').update({ nome, cargo_id }).eq('id', existing[0].id);
      userId = existing[0].id;
    } else {
      const { data, error } = await supabase.from('usuarios')
        .insert({ nome, email: emailNorm, cargo_id }).select().single();
      if (error) return res.status(400).json({ error: error.message });
      userId = data.id;
      acaoAudit = 'INSERT';
    }


    await auditarAcesso(req, { rowId: userId, action: acaoAudit, changes: { tipo: 'usuario_cargo', email: emailNorm, cargo_id } });
    res.json({ id: userId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});





router.post('/criar-login', async (req, res) => {
  if (!(await ehDev(req))) return res.status(403).json({ error: 'Acesso restrito.' });
  try {
    const { email, nome, senha, cargo_id, role, areas } = req.body || {};
    const em = String(email || '').trim().toLowerCase();
    if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }
    if (!nome || String(nome).trim().length < 2) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }
    if (!senha || String(senha).length < 6) {
      return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres' });
    }
    const roleFinal = ['assistente', 'diretor', 'admin'].includes(role) ? role : 'assistente';


    const { data: created, error: authErr } = await supabase.auth.admin.createUser({
      email: em,
      password: String(senha),
      email_confirm: true,
      user_metadata: { nome: String(nome).trim(), origem: 'admin' },
    });
    if (authErr) {
      const dup = /already|exists|registered|duplicate/i.test(authErr.message || '');
      return res.status(400).json({ error: dup ? 'Já existe um usuário com esse e-mail.' : authErr.message });
    }
    const uid = created?.user?.id;
    if (!uid) return res.status(500).json({ error: 'Falha ao criar o usuário no Auth.' });



    await supabase.from('profiles')
      .update({ name: String(nome).trim(), role: roleFinal, is_membro_only: false })
      .eq('id', uid);




    try {
      const { data: prof } = await supabase.from('profiles').select('membro_id').eq('id', uid).maybeSingle();
      if (prof?.membro_id) {
        const { data: mem } = await supabase.from('mem_membros')
          .select('id, origem_cadastro, status').eq('id', prof.membro_id).maybeSingle();
        if (mem && mem.origem_cadastro === 'admin' && mem.status === 'visitante') {
          await supabase.rpc('app_soft_delete', { p_table_name: 'mem_membros', p_row_id: mem.id, p_deleted_by: req.user?.userId ?? null });
          await supabase.from('profiles').update({ membro_id: null }).eq('id', uid);
        }
      }
    } catch (limpErr) { console.warn('[permissoes] criar-login limpeza membro:', limpErr.message); }


    const resolved = await resolverUsuarioId(uid);
    if (resolved?.id != null) {
      const patch = { nome: String(nome).trim() };
      if (cargo_id) patch.cargo_id = cargo_id;
      await supabase.from('usuarios').update(patch).eq('id', resolved.id);

      if (Array.isArray(areas) && areas.length) {
        await supabase.from('usuario_areas').delete().eq('usuario_id', resolved.id);
        const rows = areas.map((aid, i) => ({ usuario_id: resolved.id, area_id: aid, is_principal: i === 0 }));
        const { error: aerr } = await supabase.from('usuario_areas').insert(rows);
        if (aerr) console.warn('[permissoes] criar-login áreas:', aerr.message);
      }
    }

    bustPermissionCaches();
    res.status(201).json({ id: uid, email: em });
  } catch (e) {
    console.error('[permissoes] criar-login:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao criar o usuário' });
  }
});




router.put('/usuario/:id/email', async (req, res) => {
  if (!(await ehDev(req))) return res.status(403).json({ error: 'Acesso restrito.' });
  try {
    const uid = req.params.id;
    const novo = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(novo)) return res.status(400).json({ error: 'E-mail inválido' });


    const { data: got, error: getErr } = await supabase.auth.admin.getUserById(uid);
    if (getErr || !got?.user) {
      return res.status(404).json({ error: 'Essa pessoa não tem login de sistema (só ficha) — não dá pra editar o e-mail.' });
    }
    const antigo = (got.user.email || '').toLowerCase();
    if (novo === antigo) return res.json({ success: true, email: novo });


    const { data: dupe } = await supabase.from('profiles').select('id').ilike('email', novo).neq('id', uid).maybeSingle();
    if (dupe) return res.status(400).json({ error: 'Já existe outra conta com esse e-mail.' });


    const { error: upErr } = await supabase.auth.admin.updateUserById(uid, { email: novo, email_confirm: true });
    if (upErr) {
      const dup = /already|exists|registered|duplicate/i.test(upErr.message || '');
      return res.status(400).json({ error: dup ? 'Já existe outra conta com esse e-mail.' : upErr.message });
    }

    await supabase.from('profiles').update({ email: novo }).eq('id', uid);
    if (antigo) await supabase.from('usuarios').update({ email: novo }).eq('email', antigo);

    bustPermissionCaches();
    res.json({ success: true, email: novo });
  } catch (e) {
    console.error('[permissoes] editar-email:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao editar o e-mail' });
  }
});


router.put('/usuario/:id/cargo', async (req, res) => {
  try {
    const { cargo_id } = req.body;
    const resolved = await resolverUsuarioId(req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Usuario nao encontrado' });
    if (bloqueiaAutoEdicao(req, resolved)) {
      return res.status(403).json({ error: 'Você não pode alterar o próprio cargo. Peça a outro administrador.' });
    }

    const updatePayload = { cargo_id };

    try {
      const { error } = await supabase.from('usuarios')
        .update({ ...updatePayload, updated_at: new Date().toISOString() }).eq('id', resolved.id);
      if (error) {

        const { error: err2 } = await supabase.from('usuarios')
          .update(updatePayload).eq('id', resolved.id);
        if (err2) return res.status(400).json({ error: err2.message });
      }
    } catch {
      const { error: err3 } = await supabase.from('usuarios')
        .update(updatePayload).eq('id', resolved.id);
      if (err3) return res.status(400).json({ error: err3.message });
    }



    await auditarAcesso(req, { rowId: resolved.id, changes: { tipo: 'usuario_cargo', cargo_id, alvo_param: req.params.id } });
    bustPermissionCaches();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});






const ROLES_VALIDOS = ['assistente', 'admin', 'diretor'];
router.put('/usuario/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!ROLES_VALIDOS.includes(role)) {
      return res.status(400).json({ error: `Acesso base inválido. Use: ${ROLES_VALIDOS.join(', ')}.` });
    }

    if (bloqueiaAutoEdicao(req, null)) {
      return res.status(403).json({ error: 'Você não pode alterar o próprio acesso base. Peça a outro administrador.' });
    }


    if (!(await podeMexerNoControleDeAcesso(req))) {
      return res.status(403).json({ error: 'Só quem tem nível 5 em Permissões (ou o time de sistemas) pode mudar o acesso base de alguém.' });
    }


    const { data: antes } = await supabase.from('profiles')
      .select('role').eq('id', req.params.id).maybeSingle();

    const { data, error } = await supabase.from('profiles')
      .update({ role }).eq('id', req.params.id).select('id').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Perfil não encontrado.' });

    await auditarAcesso(req, { rowId: req.params.id, changes: { tipo: 'profile_role', role: { old: antes?.role ?? null, new: role } } });
    bustPermissionCaches();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});













router.put('/usuario/:id/ativo', async (req, res) => {
  try {
    const uid = req.params.id;
    const ativo = req.body?.ativo;
    const motivo = String(req.body?.motivo || '').trim().slice(0, 500) || null;
    if (typeof ativo !== 'boolean') return res.status(400).json({ error: 'Informe `ativo` (true ou false).' });

    if (bloqueiaAutoEdicao(req, null)) {
      return res.status(403).json({ error: 'Você não pode ativar/desativar a própria conta. Peça a outro administrador.' });
    }
    if (!(await podeMexerNoControleDeAcesso(req))) {
      return res.status(403).json({ error: 'Só quem tem nível 5 em Permissões (ou o time de sistemas) pode ativar/desativar uma conta.' });
    }

    const { data: antes } = await supabase.from('profiles')
      .select('id, email, active').eq('id', uid).maybeSingle();
    if (!antes) return res.status(404).json({ error: 'Perfil não encontrado.' });


    const { error: upErr } = await supabase.from('profiles').update({ active: ativo }).eq('id', uid);
    if (upErr) return res.status(400).json({ error: upErr.message });



    let authSincronizado = true;
    let authDetalhe = null;
    const { error: banErr } = await supabase.auth.admin.updateUserById(uid, { ban_duration: ativo ? 'none' : '876000h' });
    if (banErr) {
      authSincronizado = false;
      authDetalhe = banErr.message;
      console.error('[permissoes] ban/desban no Auth falhou:', banErr.message);
    }

    await auditarAcesso(req, { rowId: uid, changes: { tipo: 'profile_ativo', email: antes.email || null, active: { old: antes.active ?? null, new: ativo }, ban_sincronizado: authSincronizado, motivo } });
    bustPermissionCaches();
    res.json({ success: true, ativo, auth_sincronizado: authSincronizado, detail: authDetalhe });
  } catch (e) {
    console.error('[permissoes] ativar/desativar:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao ativar/desativar a conta' });
  }
});


router.put('/usuario/:id/areas', async (req, res) => {
  try {
    const { area_ids } = req.body;
    const resolved = await resolverUsuarioId(req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Usuario nao encontrado' });
    if (bloqueiaAutoEdicao(req, resolved)) {
      return res.status(403).json({ error: 'Você não pode alterar as próprias áreas. Peça a outro administrador.' });
    }
    const userId = resolved.id;


    await supabase.from('usuario_areas').delete().eq('usuario_id', userId);


    if (area_ids?.length) {
      const rows = area_ids.map((aid, i) => ({ usuario_id: userId, area_id: aid, is_principal: i === 0 }));
      const { error } = await supabase.from('usuario_areas').insert(rows);
      if (error) return res.status(400).json({ error: error.message });
    }



    await auditarAcesso(req, { rowId: userId, changes: { tipo: 'usuario_areas', area_ids: area_ids || [], alvo_param: req.params.id } });
    bustPermissionCaches();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});





router.put('/usuario/:id/modulo', async (req, res) => {
  try {
    const {
      modulo_id, nivel_leitura, nivel_escrita,
      pode_exportar = false, pode_aprovar = false, escopo_proprio = false,
      motivo = null, expira_em = null,
    } = req.body;
    if (!req.params.id || !modulo_id) return res.status(400).json({ error: 'usuário e módulo são obrigatórios' });
    const resolved = await resolverUsuarioId(req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Usuario nao encontrado' });
    if (bloqueiaAutoEdicao(req, resolved)) {
      return res.status(403).json({ error: 'Você não pode alterar as próprias permissões. Peça a outro administrador.' });
    }



    try {
      const { data: mod } = await supabase.from('modulos').select('slug').eq('id', modulo_id).maybeSingle();
      if (mod?.slug === 'permissoes-admin' && !(await podeMexerNoControleDeAcesso(req))) {
        return res.status(403).json({ error: 'Conceder acesso ao módulo Permissões exige nível 5 (ou o time de sistemas).' });
      }
    } catch (e) { console.error('[permissoes] checagem de override em permissoes-admin falhou:', e.message); }
    const userId = resolved.id;


    const { data: user } = await supabase.from('usuarios')
      .select('cargo_id').eq('id', userId).maybeSingle();

    let cellDefault = null;
    if (user?.cargo_id) {
      const { data } = await supabase.from('cargo_modulo_permissao')
        .select('nivel, pode_exportar, pode_aprovar, escopo_proprio')
        .eq('cargo_id', user.cargo_id).eq('modulo_id', modulo_id).maybeSingle();
      cellDefault = data;
    }


    const equalsDefault = cellDefault
      && nivel_leitura === cellDefault.nivel
      && nivel_escrita === cellDefault.nivel
      && !!pode_exportar === !!cellDefault.pode_exportar
      && !!pode_aprovar === !!cellDefault.pode_aprovar
      && !!escopo_proprio === !!cellDefault.escopo_proprio
      && !expira_em;

    if (equalsDefault) {
      await supabase.from('permissoes_modulo')
        .delete().eq('usuario_id', userId).eq('modulo_id', modulo_id);
    } else {



      const criadoPor = /^\d+$/.test(String(req.user?.granular?.usuarioId ?? ''))
        ? Number(req.user.granular.usuarioId) : null;
      const { error } = await supabase.from('permissoes_modulo').upsert({
        usuario_id: userId,
        modulo_id,
        nivel_leitura,
        nivel_escrita,
        pode_exportar: !!pode_exportar,
        pode_aprovar: !!pode_aprovar,
        escopo_proprio: !!escopo_proprio,
        motivo,
        expira_em,
        criado_por: criadoPor,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'usuario_id,modulo_id' });
      if (error) return res.status(400).json({ error: error.message });
    }



    await auditarAcesso(req, {
      rowId: `${userId}:${modulo_id}`,
      changes: { tipo: equalsDefault ? 'override_removido_por_igualar_default' : 'override_definido', modulo_id, nivel_leitura, nivel_escrita, alvo_param: req.params.id },
    });
    bustPermissionCaches();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


router.delete('/usuario/:id/modulo/:moduloId', async (req, res) => {
  try {
    const resolved = await resolverUsuarioId(req.params.id);
    if (!resolved) return res.status(404).json({ error: 'Usuário não encontrado' });



    if (bloqueiaAutoEdicao(req, resolved)) {
      return res.status(403).json({ error: 'Você não pode alterar as próprias permissões. Peça a outro administrador.' });
    }


    const { data: antes } = await supabase.from('permissoes_modulo')
      .select('nivel_leitura, nivel_escrita, motivo')
      .eq('usuario_id', resolved.id).eq('modulo_id', req.params.moduloId).maybeSingle();
    const { error } = await supabase.from('permissoes_modulo')
      .delete()
      .eq('usuario_id', resolved.id)
      .eq('modulo_id', req.params.moduloId);
    if (error) return res.status(400).json({ error: error.message });
    await auditarAcesso(req, {
      rowId: `${resolved.id}:${req.params.moduloId}`,
      action: 'DELETE',
      changes: { tipo: 'override_removido', modulo_id: req.params.moduloId, removido: antes ?? null, alvo_param: req.params.id },
    });
    bustPermissionCaches();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

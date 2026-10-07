const { supabase } = require('../utils/supabase');
const { respostaDeFalhaAuth, ehFalhaDeInfra } = require('../utils/falhaInfra');





const ROLE_MAP = {
  'diretor': 'pmo', 'admin': 'lider_adm', 'assistente': 'membro_marketing',
  'pmo': 'pmo', 'lider_adm': 'lider_adm', 'lider_marketing': 'lider_marketing',
  'lider_area_adm': 'lider_area_adm', 'membro_marketing': 'membro_marketing',
};




const ROUTE_MODULE_MAP = {

  'rh':           ['rh'],
  'financeiro':   ['financeiro'],
  'santander':    ['financeiro'],
  'logistica':    ['logistica'],
  'patrimonio':   ['patrimonio'],
  'eventos':      ['eventos'],
  'events':       ['eventos'],
  'eventos-externos': ['eventos-externos'],
  'inscricoes':   ['inscricoes'],
  'projects':     ['projetos'],
  'expansion':    ['expansao'],
  'solicitacoes': ['solicitacoes'],









  'campanhas':    ['campanhas'],

  'integracao':   ['integracao'],
  'relatorios':   ['relatorios'],
  'cuidados':     ['cuidados'],
  'conversas':    ['conversas'],
  'comunicacao':  ['comunicacao'],
  'online':       ['online'],
  'wifi':         ['wifi'],
  'next':         ['next'],




  'next-gestao':  ['next', 'integracao'],
  'next-batismo': ['next-batismo'],








  'batismo-leitura': ['integracao', 'batismo'],
  'voluntariado': ['voluntariado'],










  'devocionais':  ['cuidados', 'membresia'],
  'membresia':    ['membresia'],



  'censo':        ['censo'],










  'links':        ['links'],


  'visitantes':   ['visitantes'],





  'membros':      ['membresia','grupos','cuidados','integracao','next','next-batismo','voluntariado','kids','ami','bridge','online','face'],








  'jornada-convertidos': ['cuidados','online','ami','bridge','kids'],

  'membros-financeiro': ['membresia','financeiro'],



  'membros-totem': ['membresia','grupos','cuidados','integracao','next','next-batismo','voluntariado','kids','ami','bridge','online','face','totem-membro'],
  'totem-membro': ['totem-membro'],






  'inscricoes-totem': ['inscricoes','totem-membro'],
  'face':         ['face'],
  'grupos':       ['grupos'],
  'kids':         ['kids'],
  'totem-kids':   ['kids'],
  'ami':          ['ami'],
  'bridge':       ['bridge'],
  'producao':     ['producao'],
  'marketing':    ['marketing'],
  'marketing-admin': ['marketing'],
  'painel-area':  ['kids', 'ami', 'bridge', 'online', 'producao'],
  'whatsapp-admin': ['integracao', 'grupos'],

  'gestao':       ['gestao'],
  'planejamento': ['planejamento'],
  'planejamento-anual': ['planejamento-anual'],




  'planejamento-execucao': ['planejamento-execucao'],
  'governanca':   ['governanca'],
  'painel':       ['painel-cbrio'],
  'revisoes':    ['revisao-estrategica'],

  'dados-brutos': ['dados-brutos'],
  'dadosBrutos':  ['dados-brutos'],
  'nps':          ['nps'],
  'agents':       ['assistente-ia'],
  'notificacoes': ['notificacoes-config'],
  'permissoes':   ['permissoes-admin'],
  'cerebro':      ['cerebro'],
  'apresentacoes': ['apresentacoes'],
};




const CACHE_TTL = 30 * 1000;

let modulosCache = null;
let modulosCacheTime = 0;






const AUTH_CACHE_TTL = 60 * 1000;
const authUserCache = new Map();

async function getModulos() {
  if (modulosCache && Date.now() - modulosCacheTime < CACHE_TTL) return modulosCache;
  const { data } = await supabase
    .from('modulos')
    .select('id, nome, slug, categoria, rota, ordem')
    .eq('ativo', true);
  modulosCache = data || [];
  modulosCacheTime = Date.now();
  return modulosCache;
}











async function getCargoMatrix(cargoId = null) {
  let query = supabase
    .from('cargo_modulo_permissao')
    .select('cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio');
  if (cargoId != null) query = query.eq('cargo_id', cargoId);
  const { data } = await query;
  return data || [];
}






const AREA_MODULO_BOOST = {
  'cuidados':     'cuidados',
  'grupos':       'grupos',
  'integracao':   'integracao',
  'voluntariado': 'voluntariado',
  'next':         'next',
  'online':       'online',

  'kids':         'kids',
  'ami':          'ami',
  'bridge':       'bridge',


  'marketing':    'marketing',


  'producao':     'producao',
};

function _normalizarArea(nome) {
  if (!nome) return '';
  return nome.toString().toLowerCase().trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}






function resolveEffectivePerms({ overrides, cargoMatrix, cargoId, modulos, areas = [] }) {
  const result = {};
  const overridesByMod = new Map();
  for (const o of overrides || []) overridesByMod.set(o.modulo_id, o);
  const defaultsByMod = new Map();
  for (const r of cargoMatrix || []) {
    if (r.cargo_id === cargoId) defaultsByMod.set(r.modulo_id, r);
  }


  const slugsComBoost = new Set();
  for (const a of areas || []) {
    const slug = AREA_MODULO_BOOST[_normalizarArea(a)];
    if (slug) slugsComBoost.add(slug);
  }

  for (const m of modulos) {
    const o = overridesByMod.get(m.id);
    const d = defaultsByMod.get(m.id);
    let nivelL, nivelE, exp, apr, esc;

    if (o) {

      nivelL = o.nivel_leitura ?? 0;
      nivelE = o.nivel_escrita ?? 0;
      exp = o.pode_exportar ?? false;
      apr = o.pode_aprovar ?? false;
      esc = o.escopo_proprio ?? false;
    } else {

      nivelL = d?.nivel ?? 0;
      nivelE = d?.nivel ?? 0;
      exp = d?.pode_exportar ?? false;
      apr = d?.pode_aprovar ?? false;
      esc = d?.escopo_proprio ?? false;
      if (m.slug && slugsComBoost.has(m.slug)) {
        nivelL = Math.max(nivelL, 5);
        nivelE = Math.max(nivelE, 5);
      }
    }


    const entry = {
      leitura: nivelL,
      escrita: nivelE,
      pode_exportar: exp,
      pode_aprovar: apr,
      escopo_proprio: esc,
    };
    if (m.nome) result[m.nome] = entry;
    if (m.slug) result[m.slug] = entry;
  }
  return result;
}


async function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token não fornecido', reason: 'no_token' });

  if (!supabase) {
    console.error('[AUTH] Supabase client não inicializado · verifique SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Vercel');
    return res.status(500).json({ error: 'Backend não configurado (Supabase env vars ausentes)', reason: 'no_supabase_client' });
  }


  const cachedAuth = authUserCache.get(token);
  if (cachedAuth && cachedAuth.exp > Date.now()) {
    req.user = cachedAuth.user;
    return next();
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {






    const { status, corpo } = respostaDeFalhaAuth(error);
    if (status === 503) {
      console.error('[AUTH] Auth indisponível (infra):', error?.message);
      res.set('Retry-After', '30');
    } else {
      console.warn('[AUTH] Token rejeitado pelo Supabase:', error?.message || 'usuario null');
    }
    return res.status(status).json({
      ...corpo,
      detail: error?.message || 'getUser retornou null · token pode ser de outro projeto Supabase',
    });
  }
























  let banidoAte = null;
  try {
    const { data: contaAuth, error: erroAdmin } = await supabase.auth.admin.getUserById(user.id);
    if (erroAdmin) throw erroAdmin;
    banidoAte = contaAuth?.user?.banned_until || null;
  } catch (e) {
    console.warn('[AUTH] ⚠️ Não deu pra conferir banimento no GoTrue (seguindo só com profiles.active):', e?.message || e);
  }
  const banidoAteMs = banidoAte ? Date.parse(banidoAte) : NaN;
  if (!Number.isNaN(banidoAteMs) && banidoAteMs > Date.now()) {
    console.warn('[AUTH] Conta banida no Auth tentou entrar:', user.email, '· banned_until =', banidoAte);
    return res.status(403).json({ error: 'Acesso suspenso', reason: 'banned_user', detail: `banned_until=${banidoAte}` });
  }


  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, email, role, area, kpi_areas, kpi_valores, ministerio_id, ministerio_papel, is_diretoria_geral, funcao_diretoria, active, membro_id, is_membro_only')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.error('[AUTH] Erro ao buscar profile:', profileError.message);


    if (ehFalhaDeInfra(profileError)) {
      res.set('Retry-After', '30');
      return res.status(503).json({
        error: 'O sistema está temporariamente indisponível. Aguarde um instante.',
        reason: 'banco_indisponivel', retry_apos_seg: 30, detail: profileError.message,
      });
    }
    return res.status(500).json({ error: 'Erro ao carregar perfil', reason: 'profile_query_error', detail: profileError.message });
  }

  if (!profile) {
    return res.status(403).json({ error: 'Perfil não encontrado pra este usuário', reason: 'no_profile', detail: `auth.uid=${user.id} email=${user.email}` });
  }

  if (!profile.active) {
    return res.status(403).json({ error: 'Usuario inativo', reason: 'inactive_profile' });
  }


  if (!profile.area && profile.email) {
    const { data: rh } = await supabase
      .from('rh_funcionarios')
      .select('area, cargo')
      .eq('email', profile.email)
      .eq('status', 'ativo')
      .limit(1)
      .maybeSingle();
    if (rh?.area) {
      await supabase.from('profiles').update({ area: rh.area }).eq('id', profile.id);
      profile.area = rh.area;
    }
  }


  let granular = null;
  if (profile.email) {
    let permUser = null;
    const { data: existing } = await supabase.from('usuarios')
      .select('id, cargo_id, cargos(slug, nome, nome_completo, nivel_padrao_leitura, nivel_padrao_escrita)')
      .eq('email', profile.email)
      .eq('ativo', true)
      .maybeSingle();

    permUser = existing;





    if (!permUser) {
      try {
        const roleSlugMap = {
          admin: 'diretor-administrativo',
          diretor: 'diretor-administrativo',
          assistente: 'membro',
          voluntario: 'voluntario',
          membro: 'membro',
        };
        const cargoSlug = roleSlugMap[profile.role] || 'membro';
        const { data: cargo } = await supabase.from('cargos')
          .select('id, nivel_padrao_leitura, nivel_padrao_escrita')
          .eq('slug', cargoSlug)
          .limit(1)
          .maybeSingle();

        const insertPayload = {
          email: profile.email,

          nome: (profile.name && profile.name.trim()) || profile.email.split('@')[0],
          cargo_id: cargo?.id || null,
          ativo: true,
        };

        const { data: created } = await supabase.from('usuarios')
          .insert(insertPayload)
          .select('id, cargo_id, cargos(slug, nome, nome_completo, nivel_padrao_leitura, nivel_padrao_escrita)')
          .single();

        if (created) {
          permUser = created;
          console.log(`[AUTH] Auto-provisionado usuario granular: ${profile.email} (cargo: ${cargoSlug})`);
        }
      } catch (autoErr) {
        console.error('[AUTH] Auto-provisionar usuario falhou:', autoErr.message);
      }
    }

    if (permUser) {

      const { data: overrides } = await supabase.from('permissoes_modulo')
        .select('modulo_id, nivel_leitura, nivel_escrita, pode_exportar, pode_aprovar, escopo_proprio, expira_em')
        .eq('usuario_id', permUser.id);


      const now = Date.now();
      const validOverrides = (overrides || []).filter(o => !o.expira_em || new Date(o.expira_em).getTime() > now);

      const modulos = await getModulos();

      const cargoMatrix = await getCargoMatrix(permUser.cargo_id);


      const { data: userAreas } = await supabase.from('usuario_areas')
        .select('area_id, is_principal, areas(nome, setor_id, setores(nome))')
        .eq('usuario_id', permUser.id);

      const areas = (userAreas || []).map(ua => ua.areas?.nome).filter(Boolean);
      const setores = [...new Set((userAreas || []).map(ua => ua.areas?.setores?.nome).filter(Boolean))];

      const modulePerms = resolveEffectivePerms({
        overrides: validOverrides,
        cargoMatrix,
        cargoId: permUser.cargo_id,
        modulos,
        areas,
      });




      const modulosById = new Map(modulos.map(m => [m.id, m]));
      const modulosBloqueados = validOverrides
        .filter(o => (o.nivel_leitura ?? 1) === 0)
        .map(o => modulosById.get(o.modulo_id)?.slug)
        .filter(Boolean);






      const slugsComAcesso = modulos
        .filter(m => m.slug && (modulePerms[m.slug]?.leitura || 0) >= 1)
        .map(m => m.slug);

      granular = {
        usuarioId: permUser.id,
        cargoId: permUser.cargo_id,
        cargoSlug: permUser.cargos?.slug ?? null,
        cargoNome: permUser.cargos?.nome_completo || permUser.cargos?.nome || null,
        cargoNivelLeitura: permUser.cargos?.nivel_padrao_leitura ?? 1,
        cargoNivelEscrita: permUser.cargos?.nivel_padrao_escrita ?? 1,
        modulePerms,
        modulosBloqueados,
        slugsComAcesso,
        areas,
        setores,
      };
    }
  }

  req.user = {
    userId: user.id,
    email: user.email,
    role: profile.role,
    name: profile.name,
    area: profile.area,
    kpi_areas: profile.kpi_areas || [],
    kpi_valores: profile.kpi_valores || [],
    ministerio_id: profile.ministerio_id || null,
    ministerio_papel: profile.ministerio_papel || null,
    is_diretoria_geral: !!profile.is_diretoria_geral,
    funcao_diretoria: profile.funcao_diretoria || null,
    membro_id: profile.membro_id || null,
    is_membro_only: !!profile.is_membro_only,
    id: user.id,
    granular,
  };


  if (authUserCache.size > 1000) authUserCache.clear();
  authUserCache.set(token, { user: req.user, exp: Date.now() + AUTH_CACHE_TTL });

  next();
}





const ROLE_NIVEL = { admin: 5, diretor: 4, assistente: 2 };
function authorize(...roles) {
  const nivelMinimo = Math.min(...roles.map(r => ROLE_NIVEL[r] || 4));
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });


    if (req.user.granular) {
      const nivel = Math.max(req.user.granular.cargoNivelLeitura || 1, req.user.granular.cargoNivelEscrita || 1);
      if (nivel >= nivelMinimo) return next();
    }


    if (roles.includes(req.user.role)) return next();

    return res.status(403).json({ error: 'Acesso negado para este perfil' });
  };
}











function authorizeKpiArea(areaExtractor, valoresExtractor = null) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if (['admin', 'diretor'].includes(req.user.role)) return next();
    try {
      const area = await areaExtractor(req);
      const myAreas = (req.user.kpi_areas || []).map(a => String(a).toLowerCase());
      if (area && myAreas.includes(String(area).toLowerCase())) return next();


      if (valoresExtractor) {
        const valores = (await valoresExtractor(req)) || [];
        const myValores = (req.user.kpi_valores || []).map(v => String(v).toLowerCase());
        if (valores.some(v => myValores.includes(String(v).toLowerCase()))) return next();
      }

      return res.status(403).json({ error: `Sem permissão para editar KPIs da área "${area || '?'}"` });
    } catch (e) {
      console.error('[authorizeKpiArea]', e.message);
      res.status(500).json({ error: 'Erro ao verificar permissão' });
    }
  };
}





function authorizeCycle(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    const mr = ROLE_MAP[req.user.role] || req.user.role;
    if (roles.length > 0 && !roles.includes(mr)) {
      return res.status(403).json({ error: 'Acesso negado para este perfil' });
    }
    next();
  };
}








const VOLUNTARIADO_SELF_SERVICE_PATTERNS = [
  { re: /^\/me(\/|$)/ },
  { re: /^\/my-/ },
  { re: /^\/self-checkin(\/|$)/ },
  { re: /^\/qr-lookup(\/|$)/ },
  { re: /^\/quero-servir(\/|$)/ },
  { re: /^\/check-ins$/, methods: ['POST'] },
  { re: /^\/face\/match$/, methods: ['POST'] },
  { re: /^\/services\/(upcoming|today)$/, methods: ['GET'] },
];

function isVoluntariadoSelfService(req, moduleNames) {
  if (!moduleNames.some((m) => m === 'Membresia')) return false;
  const p = req.path || '';
  const method = req.method;
  return VOLUNTARIADO_SELF_SERVICE_PATTERNS.some(({ re, methods }) => {
    if (!re.test(p)) return false;
    if (methods && !methods.includes(method)) return false;
    return true;
  });
}














function authorizeModule(routeKey, nivelMinimo = 2) {
  const moduleNames = ROUTE_MODULE_MAP[routeKey] || [];

  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if (req.user.is_super_admin === true) return next();


    const bloqueados = req.user.granular?.modulosBloqueados || [];
    if (moduleNames.length && moduleNames.some(m => bloqueados.includes(m))) {
      return res.status(403).json({ error: 'Acesso bloqueado para este módulo.', modulos: moduleNames });
    }


    if (['admin', 'diretor'].includes(req.user.role)) return next();


    if (req.user.role === 'voluntario'
        && moduleNames.some(m => m === 'voluntariado' || m === 'membresia' || m === 'Membresia')
        && nivelMinimo <= 1) {
      return next();
    }



    if (isVoluntariadoSelfService(req, moduleNames)) {
      return next();
    }


    if (!req.user.granular) {
      return res.status(403).json({ error: 'Acesso negado — permissões não configuradas' });
    }


    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const tipo = isWrite ? 'escrita' : 'leitura';


    let hasAccess = false;
    for (const modName of moduleNames) {
      const perm = req.user.granular.modulePerms[modName];
      if (perm && perm[tipo] >= nivelMinimo) {
        hasAccess = true;
        break;
      }
    }


    if (moduleNames.length === 0) {
      const nivel = isWrite ? req.user.granular.cargoNivelEscrita : req.user.granular.cargoNivelLeitura;
      hasAccess = nivel >= nivelMinimo;
    }

    if (!hasAccess) {
      return res.status(403).json({
        error: `Acesso negado ao módulo. Nível insuficiente para ${tipo}.`,
        modulos: moduleNames,
      });
    }

    next();
  };
}



const _superAdminCache = new Map();
async function isSuperAdminEmail(email) {
  if (!email) return false;
  const key = String(email).toLowerCase();
  const hit = _superAdminCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.val;
  let val = false;
  try {
    const { data } = await supabase.from('app_super_admins')
      .select('email').ilike('email', key).eq('ativo', true).maybeSingle();
    val = !!data;
  } catch {                   }
  _superAdminCache.set(key, { at: Date.now(), val });
  return val;
}


async function requireSuperAdmin(req, res, next) {
  if (await isSuperAdminEmail(req.user?.email)) {
    req.user.is_super_admin = true;
    return next();
  }
  return res.status(403).json({ error: 'Acesso restrito aos administradores gerais.' });
}


async function getMyPermissions(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });



  let modulosMeta = [];
  try {
    const modulos = await getModulos();
    modulosMeta = modulos.map(m => ({
      slug: m.slug, nome: m.nome, rota: m.rota, categoria: m.categoria, ordem: m.ordem,
    })).sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  } catch (e) {
    console.warn('[AUTH] falha ao carregar metadata de módulos:', e.message);
  }

  res.json({
    role: req.user.role,
    area: req.user.area,
    name: req.user.name,
    isSuperAdmin: await isSuperAdminEmail(req.user.email),
    privateUiAccess: require('../utils/privateUiAccess').privateUiAccess(req.user.email),
    modulos: modulosMeta,
    granular: req.user.granular ? {
      cargoId: req.user.granular.cargoId,
      cargoSlug: req.user.granular.cargoSlug || null,
      cargoNome: req.user.granular.cargoNome || null,
      cargoNivelLeitura: req.user.granular.cargoNivelLeitura,
      cargoNivelEscrita: req.user.granular.cargoNivelEscrita,
      modulePerms: req.user.granular.modulePerms,
      modulosBloqueados: req.user.granular.modulosBloqueados || [],
      slugsComAcesso: req.user.granular.slugsComAcesso || [],
      areas: req.user.granular.areas || [],
      setores: req.user.granular.setores || [],
    } : null,
  });
}



function bustPermissionCaches() {
  modulosCache = null;
  authUserCache.clear();
  modulosCacheTime = 0;
}





function getEffectiveLevel(req, routeKey) {
  if (!req.user) return 0;
  if (req.user.role === 'admin') return 5;
  if (req.user.role === 'diretor') return 4;
  if (!req.user.granular) return 1;

  const moduleNames = ROUTE_MODULE_MAP[routeKey] || [];
  let maxLevel = req.user.granular.cargoNivelLeitura || 1;
  for (const mod of moduleNames) {
    const perm = req.user.granular.modulePerms?.[mod];
    if (perm) maxLevel = Math.max(maxLevel, perm.leitura);
  }
  return maxLevel;
}





function getUserAreas(req) {
  const areas = [];
  if (req.user?.granular?.areas?.length) {
    areas.push(...req.user.granular.areas);
  }
  if (req.user?.area && !areas.includes(req.user.area)) {
    areas.push(req.user.area);
  }
  return areas;
}














function applyAccessFilter(query, req, routeKey, opts = {}) {
  const level = getEffectiveLevel(req, routeKey);
  const { areaColumn = 'area', ownerColumn = null, ownerEmail = false } = opts;

  if (level >= 4) return query;




  if (level === 3 && areaColumn) {
    const areas = getUserAreas(req);
    if (areas.length > 0) return query.in(areaColumn, areas);
  }

  if ((level === 2 || level === 3) && ownerColumn) {
    const val = ownerEmail ? req.user.email : req.user.userId;
    return query.eq(ownerColumn, val);
  }


  return query.eq('id', '00000000-0000-0000-0000-000000000000');
}











function apenasColaborador(req, res, next) {
  if (req.user?.is_membro_only) {
    return res.status(403).json({ error: 'Acesso restrito a colaboradores' });
  }
  next();
}

module.exports = { authenticate, authorize, authorizeCycle, authorizeModule, authorizeKpiArea, getMyPermissions, getEffectiveLevel, getUserAreas, applyAccessFilter, bustPermissionCaches, ROLE_MAP, ROUTE_MODULE_MAP, apenasColaborador,


  resolveEffectivePerms, getCargoMatrix, getModulos, AREA_MODULO_BOOST, _normalizarArea,
  isSuperAdminEmail, requireSuperAdmin };

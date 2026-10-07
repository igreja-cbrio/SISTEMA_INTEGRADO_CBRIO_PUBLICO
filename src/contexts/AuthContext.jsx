import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { resolveApiBaseUrl } from '../lib/api-base';

const API = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const AuthContext = createContext(null);



const MODULO_ROTA_TRAVA = {
  batismo: '/batismo',
  producao: '/producao',
  cuidados: '/ministerial/cuidados',
  grupos: '/grupos',
  kids: '/ministerial/kids',
  marketing: '/marketing',
  online: '/online',

  'totem-membro': '/totem',
};















const MODULO_TRAVA_PREFIXOS = {
  kids: ['/ministerial/kids', '/ministerial/totem-kids', '/kids'],
};


const DEV_BYPASS_AUTH = false;

const FAKE_USER = {
  id: 'dev-user-00000000',
  email: 'admin@cbrio.dev',
};

const FAKE_PROFILE = {
  id: 'dev-user-00000000',
  name: 'Admin Dev',
  email: 'admin@cbrio.dev',
  role: 'admin',
  area: 'Tecnologia',
  kpi_areas: [],
  avatar_url: null,
};






function comTimeout(promise, ms, label) {
  let t;
  const limite = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`timeout_${label}`)), ms); });
  return Promise.race([promise, limite]).finally(() => clearTimeout(t));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(DEV_BYPASS_AUTH ? FAKE_USER : null);
  const [profile, setProfile] = useState(DEV_BYPASS_AUTH ? FAKE_PROFILE : null);
  const [modulePerms, setModulePerms] = useState(null);
  const [permData, setPermData] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(DEV_BYPASS_AUTH ? false : true);


  const sessaoAtivaRef = useRef(false);






  async function fetchProfile(userId, tentativa = 1) {
    if (!supabase) return { ok: false, error: 'sem_supabase' };
    try {
      const { data, error } = await comTimeout(
        supabase
          .from('profiles')
          .select('id, name, email, role, area, kpi_areas, avatar_url, ministerio_id, ministerio_papel, is_diretoria_geral, funcao_diretoria, telefone, membro_id, is_membro_only, password_changed_at')
          .eq('id', userId)
          .single(),
        7000, 'profile');
      if (!error && data) { setProfile(data); return { ok: true, data }; }


      if (tentativa < 2) {
        await new Promise((r) => setTimeout(r, 1200));
        return fetchProfile(userId, tentativa + 1);
      }





      const viaBackend = await fetchProfileBackend();
      if (viaBackend.ok) return viaBackend;

      console.warn('[Auth] fetchProfile falhou · mantendo perfil atual:', error?.message);
      return { ok: false, error: error?.message || 'falha' };
    } catch (e) {
      if (tentativa < 2) {
        await new Promise((r) => setTimeout(r, 1200));
        return fetchProfile(userId, tentativa + 1);
      }
      const viaBackend = await fetchProfileBackend();
      if (viaBackend.ok) return viaBackend;
      console.warn('[Auth] fetchProfile erro · mantendo perfil atual:', e?.message);
      return { ok: false, error: e?.message || 'erro' };
    }
  }



  async function fetchProfileBackend() {
    try {
      if (!supabase) return { ok: false, error: 'sem_supabase' };
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return { ok: false, error: 'sem_token' };
      const res = await comTimeout(fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }), 7000, 'profile_backend');
      if (!res.ok) return { ok: false, error: `http_${res.status}` };
      const data = await res.json();
      if (data?.id) { setProfile(data); return { ok: true, data }; }
      return { ok: false, error: 'sem_dados' };
    } catch (e) {
      return { ok: false, error: e?.message || 'erro' };
    }
  }

  async function fetchPermissions(tentativa = 1) {
    try {
      if (!supabase) return { ok: false, error: 'sem_supabase' };
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return { ok: false, error: 'sem_token' };
      const res = await comTimeout(fetch(`${API}/auth/my-permissions`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }), 7000, 'perms');
      if (res.ok) {
        const data = await res.json();
        setModulePerms(data.granular?.modulePerms ?? null);
        setPermData({ ...(data.granular || {}), privateUiAccess: data.privateUiAccess || {} });
        setIsSuperAdmin(!!data.isSuperAdmin);
        return { ok: true };
      }


      if (tentativa < 2) {
        await new Promise((r) => setTimeout(r, 1200));
        return fetchPermissions(tentativa + 1);
      }
      return { ok: false, error: `http_${res.status}` };
    } catch (e) {
      if (tentativa < 2) {
        await new Promise((r) => setTimeout(r, 1200));
        return fetchPermissions(tentativa + 1);
      }
      console.warn('[Auth] Erro ao buscar permissões · mantendo as atuais:', e?.message);
      return { ok: false, error: e?.message || 'erro' };
    }
  }




  async function carregarDadosUsuario(userId) {
    const [pRes, permRes] = await Promise.all([fetchProfile(userId), fetchPermissions()]);
    if (!pRes?.ok || !permRes?.ok) {
      await new Promise((r) => setTimeout(r, 1500));
      await Promise.all([
        pRes?.ok ? Promise.resolve() : fetchProfile(userId),
        permRes?.ok ? Promise.resolve() : fetchPermissions(),
      ]);
    }
  }

  useEffect(() => {
    if (DEV_BYPASS_AUTH) return;
    if (!supabase) {
      setLoading(false);
      return;
    }








    let sessionResolvida = false;
    const safetyTimer = setTimeout(() => {
      if (!sessionResolvida) {
        console.warn('[Auth] getSession travou — liberando o carregamento (rede de segurança).');
        setLoading(false);
      }
    }, 8000);

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      sessionResolvida = true;
      clearTimeout(safetyTimer);
      sessaoAtivaRef.current = !!session?.user;
      setUser(session?.user ?? null);
      if (session?.user) {
        await carregarDadosUsuario(session.user.id);
      }
    }).catch((e) => {
      console.warn('[Auth] Erro ao obter sessão:', e?.message);
    }).finally(() => {
      clearTimeout(safetyTimer);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {









      const tinhaSessao = sessaoAtivaRef.current;
      sessaoAtivaRef.current = !!session?.user;
      setUser(session?.user ?? null);
      if (session?.user) {







        const loginReal = !tinhaSessao;
        if (loginReal) {
          setLoading(true);
          await carregarDadosUsuario(session.user.id);
          setLoading(false);
        }
      } else {
        setProfile(null);
        setModulePerms(null);
        setPermData(null);
        setIsSuperAdmin(false);
      }
    });

    return () => { clearTimeout(safetyTimer); subscription.unsubscribe(); };
  }, []);

  function supabaseErroMsg() {

    const url = !!import.meta.env.VITE_SUPABASE_URL;
    const key = !!(import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
    const viteKeys = Object.keys(import.meta.env || {}).filter(k => k.startsWith('VITE_'));
    const faltam = [];
    if (!url) faltam.push('VITE_SUPABASE_URL');
    if (!key) faltam.push('VITE_SUPABASE_ANON_KEY');
    return `Supabase não configurado · faltam: ${faltam.join(', ') || '(?)'}. `
      + `Vite ve essas envs: [${viteKeys.join(', ') || 'nenhuma'}]. `
      + 'Confira no Vercel se cada var tem prefixo VITE_, esta marcada para "Preview" e o deploy foi refeito.';
  }

  async function signInWithGoogle() {
    if (!supabase) return { error: { message: supabaseErroMsg() } };
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  }

  async function signInWithMicrosoft() {
    if (!supabase) return { error: { message: supabaseErroMsg() } };
    return supabase.auth.signInWithOAuth({
      provider: 'azure',


      options: { redirectTo: window.location.origin, scopes: 'email profile' },
    });
  }

  async function signInWithEmail(email, password) {
    if (!supabase) return { error: { message: supabaseErroMsg() } };
    return supabase.auth.signInWithPassword({ email, password });
  }

  async function sendPasswordReset(email) {
    if (!supabase) return { error: { message: supabaseErroMsg() } };
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
  }

  async function updatePasswordWithCurrent(currentPassword, newPassword) {
    if (!supabase) return { error: { message: supabaseErroMsg() } };
    const email = user?.email || profile?.email;
    if (!email) return { error: { message: 'Sessão sem email · refaca login.' } };

    const { error: reauthErr } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (reauthErr) return { error: { message: 'Senha atual incorreta.' } };
    const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
    if (updErr) return { error: updErr };
    try { await supabase.rpc('app_marcar_senha_trocada'); } catch {                      }
    await fetchProfile(user.id).catch(() => {});
    return { error: null };
  }

  async function updatePasswordOnly(newPassword) {
    if (!supabase) return { error: { message: supabaseErroMsg() } };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error };
    try { await supabase.rpc('app_marcar_senha_trocada'); } catch {                      }
    if (user?.id) await fetchProfile(user.id).catch(() => {});
    return { error: null };
  }

  async function signOut() {
    if (DEV_BYPASS_AUTH) return;
    if (supabase) await supabase.auth.signOut();
  }


  const modulosBloqueados = permData?.modulosBloqueados || [];

  function canAccessModule(moduleNames, tipo = 'leitura', nivelMinimo = 2) {
    if (moduleNames.some((n) => modulosBloqueados.includes(n))) return false;
    if (['admin', 'diretor'].includes(profile?.role)) return true;
    if (!modulePerms) return false;
    for (const name of moduleNames) {
      const perm = modulePerms[name];
      if (perm && perm[tipo] >= nivelMinimo) return true;
    }
    return false;
  }

  function getAccessLevel(moduleNames) {
    if (moduleNames.some((n) => modulosBloqueados.includes(n))) return 0;
    if (profile?.role === 'admin') return 5;
    if (profile?.role === 'diretor') return 4;
    if (!modulePerms) return 1;
    let max = 1;
    for (const name of moduleNames) {
      const perm = modulePerms[name];
      if (perm) max = Math.max(max, perm.leitura || 1);
    }
    return max;
  }

  const userAreas = permData?.areas || [profile?.area].filter(Boolean);
  const userSetores = permData?.setores || [];
  const cargoNome = permData?.cargoNome || null;
  const cargoSlug = permData?.cargoSlug || null;



  const isDev = !!permData?.privateUiAccess?.isDev;

  const isVoluntario = profile?.role === 'voluntario';
  const isAdmin = ['admin', 'diretor'].includes(profile?.role);



  const canRH = canAccessModule(['rh', 'RH', 'DP', 'Pessoas']);
  const canFinanceiro = canAccessModule(['financeiro', 'Financeiro']);
  const canLogistica = canAccessModule(['logistica', 'Logística']);
  const canPatrimonio = canAccessModule(['patrimonio', 'Patrimônio']);
  const canMembresia = canAccessModule(['membresia', 'Membresia']);
  const canProjetos = canAccessModule(['projetos', 'Projetos', 'Tarefas']);
  const canExpansao = canAccessModule(['expansao', 'Planejamento Estratégico', 'Expansão', 'Projetos']);
  const canAgenda = canAccessModule(['eventos', 'Eventos', 'Agenda']);
  const canIAModulo = canAccessModule(['assistente-ia', 'Assistente IA', 'IA / Agentes']);
  const canKPIs = isAdmin || canAccessModule(['minha-area', 'Minha Área', 'KPIs', 'Indicadores']);
  const canCuidados = isAdmin || canAccessModule(['cuidados', 'Cuidados']);

  const canProcessos = false;
  const canSolicitacoes = isAdmin || canAccessModule(['solicitacoes', 'Solicitações'], 'leitura', 1);
  const canNPS = isAdmin || canAccessModule(['nps', 'NPS']);
  const canDadosBrutos = isAdmin || canAccessModule(['dados-brutos', 'Dados Brutos']);
  const canPainel = isAdmin || canAccessModule(['painel-cbrio', 'Painel CBRio'], 'leitura', 1);


  const isColaborador = isAdmin || canRH || canFinanceiro || canLogistica || canPatrimonio || canMembresia || canProjetos || canExpansao || canAgenda || canIAModulo || canCuidados || canSolicitacoes || canDadosBrutos || canNPS;








  const temAcessoSistema = !!modulePerms
    && Object.values(modulePerms).some((p) => p && (p.leitura || 0) >= 1);




  const isMembroOnly = !!profile?.is_membro_only && !isColaborador && !temAcessoSistema;









  const slugsComAcesso = Array.isArray(permData?.slugsComAcesso) ? permData.slugsComAcesso : null;
  let slugTravavel = null;
  if (slugsComAcesso) {
    slugTravavel = (slugsComAcesso.length === 1 && MODULO_ROTA_TRAVA[slugsComAcesso[0]])
      ? slugsComAcesso[0]
      : null;
  } else if (modulePerms) {
    const entriesComAcesso = [...new Set(Object.values(modulePerms).filter((p) => p && (p.leitura || 0) >= 1))];
    slugTravavel = entriesComAcesso.length === 1
      ? (Object.keys(MODULO_ROTA_TRAVA).find((s) => modulePerms?.[s] === entriesComAcesso[0]) || null)
      : null;
  }

  const moduloUnico = slugsComAcesso && slugsComAcesso.length === 1 ? slugsComAcesso[0] : null;
  const moduloTravado = (
    !!profile?.is_membro_only && !isAdmin && profile?.role !== 'diretor' && !isVoluntario && slugTravavel
  ) ? slugTravavel : null;
  const rotaTravada = moduloTravado ? MODULO_ROTA_TRAVA[moduloTravado] : null;
  const travaPrefixos = moduloTravado
    ? (MODULO_TRAVA_PREFIXOS[moduloTravado] || [MODULO_ROTA_TRAVA[moduloTravado]])
    : null;


  const canIA = isColaborador;

  const value = {
    user,
    profile,
    loading,
    role: profile?.role ?? null,
    isAdmin,
    isDiretor: profile?.role === 'diretor',
    isVoluntario,
    isMembroOnly,
    moduloTravado,
    rotaTravada,
    travaPrefixos,
    moduloUnico,
    isColaborador,
    modulePerms,
    modulosBloqueados,
    canAccessModule,
    canRH, canFinanceiro, canLogistica, canPatrimonio, canMembresia, canProjetos, canExpansao, canAgenda, canIA, canKPIs, canCuidados, canProcessos, canSolicitacoes, canNPS, canDadosBrutos, canPainel,
    getAccessLevel,
    userAreas,
    userSetores,
    cargoNome,
    cargoSlug,
    isDev,
    podeVerSaidas: !!permData?.privateUiAccess?.financeiroSaidas,
    podeVerMonitor: !!permData?.privateUiAccess?.monitor,
    isSuperAdmin,
    signInWithMicrosoft,
    signInWithGoogle,
    signInWithEmail,
    sendPasswordReset,
    updatePasswordWithCurrent,
    updatePasswordOnly,
    signOut,
    refreshProfile: () => user?.id && fetchProfile(user.id),


    recarregarAuth: () => (user?.id ? carregarDadosUsuario(user.id) : Promise.resolve()),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {

    return {
      user: null, profile: null, loading: true, role: null,
      isAdmin: false, isDiretor: false, isVoluntario: false, isMembroOnly: false, moduloTravado: null, rotaTravada: null, travaPrefixos: null, moduloUnico: null, isColaborador: false, modulePerms: null,
      canAccessModule: () => false, getAccessLevel: () => 1,
      canRH: false, canFinanceiro: false, canLogistica: false,
      canPatrimonio: false, canMembresia: false, canProjetos: false,
      canExpansao: false, canAgenda: false, canIA: false, canCuidados: false,
      canProcessos: false, canSolicitacoes: false, canNPS: false,
      canDadosBrutos: false, canPainel: false, canKPIs: false,
      userAreas: [], userSetores: [],
      cargoNome: null, cargoSlug: null, isDev: false, podeVerSaidas: false, podeVerMonitor: false, isSuperAdmin: false,
      recarregarAuth: async () => {},
      refreshProfile: async () => {},
      signInWithMicrosoft: async () => ({}),
      signInWithGoogle: async () => ({}),
      signInWithEmail: async () => ({}),
      sendPasswordReset: async () => ({}),
      updatePasswordWithCurrent: async () => ({}),
      updatePasswordOnly: async () => ({}),
      signOut: async () => {},
    };
  }
  return ctx;
}

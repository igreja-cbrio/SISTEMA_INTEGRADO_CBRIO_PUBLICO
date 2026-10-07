






























export interface NavGate {
  perm?: string;
  module?: string;
  moduleMin?: number;
  path?: string;
  superAdminOnly?: boolean;
}

type AuthLike = Record<string, unknown>;





function normalizar(s: string): string {


  return (s || '')
    .normalize('NFD')
    .split('')
    .filter((c) => { const n = c.charCodeAt(0); return n < 0x0300 || n > 0x036f; })
    .join('')
    .toLowerCase()
    .trim();
}
const AREA_PARA_SLUG: Record<string, string> = {
  integracao: 'integracao', grupos: 'grupos', cuidados: 'cuidados',
  voluntariado: 'voluntariado', next: 'next', online: 'online',
  kids: 'kids', ami: 'ami', bridge: 'bridge',
  marketing: 'marketing', producao: 'producao',
};

const SLUGS_AREA_MINISTERIAL = new Set(['integracao', 'grupos', 'cuidados', 'voluntariado', 'next', 'online', 'kids', 'ami', 'bridge']);




type Dominio = 'planejamento' | 'estrategico' | 'criativo' | 'admin' | 'area' | 'membresia';
const DOMINIO_POR_PATH: Record<string, { dom: Dominio; slug?: string }> = {

  '/projetos': { dom: 'planejamento' },
  '/expansao': { dom: 'planejamento' },
  '/gestao': { dom: 'planejamento' },
  '/monitoramento-okr': { dom: 'estrategico' },
  '/jornada': { dom: 'estrategico' },

  '/marketing': { dom: 'criativo' },
  '/producao': { dom: 'criativo' },






  '/marketing/app': { dom: 'criativo' },
  '/marketing/demandas': { dom: 'criativo' },
  '/marketing/linha-do-tempo': { dom: 'criativo' },


  '/admin/destaques': { dom: 'criativo' },
  '/admin/fotos-batismo': { dom: 'criativo' },

  '/admin/rh': { dom: 'admin' },
  '/admin/financeiro': { dom: 'admin' },
  '/admin/logistica': { dom: 'admin' },
  '/admin/patrimonio': { dom: 'admin' },
  '/admin/permissoes': { dom: 'admin' },
  '/admin/feedback': { dom: 'admin' },
  '/admin/app-analytics': { dom: 'admin' },

  '/ministerial/integracao': { dom: 'area', slug: 'integracao' },
  '/grupos': { dom: 'area', slug: 'grupos' },
  '/ministerial/cuidados': { dom: 'area', slug: 'cuidados' },
  '/ministerial/voluntariado': { dom: 'area', slug: 'voluntariado' },
  '/ministerial/next': { dom: 'area', slug: 'next' },
  '/online': { dom: 'area', slug: 'online' },
  '/kids': { dom: 'area', slug: 'kids' },
  '/ami': { dom: 'area', slug: 'ami' },
  '/bridge': { dom: 'area', slug: 'bridge' },
  '/ministerial/totem-kids': { dom: 'area', slug: 'kids' },

  '/ministerial/membresia': { dom: 'membresia' },
};




const PUBLICO_TODOS = new Set(['/painel', '/dashboard-semanal']);

const CRIATIVO_CARGOS = new Set(['coordenador-marketing', 'assistente-marketing', 'lider-producao', 'assistente-producao', 'diretor-criativo']);
const MINISTERIAL_CARGOS = new Set(['lider-ministerial', 'assistente-ministerial', 'assistente-area', 'coordenador-voluntarios', 'supervisor-jornada', 'diretor-ministerial']);

interface Perfil {
  isTudo: boolean;
  isAdminRole: boolean;
  verPlanejamento: boolean;
  verEstrategico: boolean;
  verCriativo: boolean;
  verAdmin: boolean;
  scopeArea: boolean;
  areasSlugs: Set<string>;
}

function perfilMenu(auth: AuthLike): Perfil {
  const profile = (auth?.profile as Record<string, unknown>) || {};
  const role = (auth?.role as string) ?? (profile?.role as string) ?? null;
  const cargo = (auth?.cargoSlug as string) || null;
  const isAdminRole = auth?.isAdmin === true || role === 'admin' || role === 'diretor';
  const diretoriaGeral = profile?.is_diretoria_geral === true;


  const isTudo = role === 'admin' || cargo === 'dev' || cargo === 'coordenador-estrategia';

  const areas = (auth?.userAreas as string[]) || [];
  const setores = (auth?.userSetores as string[]) || [];
  const mods = (auth?.modulePerms as Record<string, { leitura?: number }>) || {};

  const areasSlugs = new Set(
    areas.map((a) => AREA_PARA_SLUG[normalizar(a)]).filter(Boolean) as string[],
  );
  const setorTem = (s: string) => setores.some((x) => normalizar(x).includes(s));
  const temAreaMinisterial = [...areasSlugs].some((s) => SLUGS_AREA_MINISTERIAL.has(s));

  const isCriativoCargo = (!!cargo && CRIATIVO_CARGOS.has(cargo)) || setorTem('criativo');
  const isMinisterialCargo = (!!cargo && MINISTERIAL_CARGOS.has(cargo)) || setorTem('ministerial');
  const isCriativo = isTudo || isCriativoCargo
    || areasSlugs.has('marketing') || areasSlugs.has('producao')
    || (mods['marketing']?.leitura ?? 0) > 0 || (mods['producao']?.leitura ?? 0) > 0;

  return {
    isTudo,
    isAdminRole,
    verPlanejamento: isAdminRole,
    verEstrategico: isAdminRole || diretoriaGeral,
    verCriativo: !!isCriativo,
    verAdmin: isTudo || (!isMinisterialCargo && !isCriativoCargo),


    scopeArea: !isAdminRole && !isTudo && cargo !== 'supervisor-jornada' && temAreaMinisterial,
    areasSlugs,
  };
}

export function navItemAllowed(item: NavGate, auth: AuthLike): boolean {


  if (item.superAdminOnly && auth?.isSuperAdmin !== true) return false;
  const isAdmin = auth?.isAdmin === true;
  const modulePerms = auth?.modulePerms as Record<string, { leitura?: number }> | null | undefined;
  const modulosBloqueados = (auth?.modulosBloqueados as string[] | undefined) || [];



  const permsLoaded = modulePerms != null || isAdmin;
  if (!permsLoaded) return true;


  if (item.perm && auth[item.perm] === false) return false;
  if (item.module && modulosBloqueados.includes(item.module)) return false;




  if (item.path && PUBLICO_TODOS.has(item.path)) return true;


  const d = item.path ? DOMINIO_POR_PATH[item.path] : undefined;
  if (d) {
    const p = perfilMenu(auth);
    if (!p.isTudo) {
      if (d.dom === 'planejamento' && !p.verPlanejamento) return false;
      if (d.dom === 'estrategico' && !p.verEstrategico) return false;
      if (d.dom === 'criativo' && !p.verCriativo) return false;
      if (d.dom === 'admin' && !p.verAdmin) return false;
      if (d.dom === 'membresia' && !p.isAdminRole && (auth?.cargoSlug as string) !== 'supervisor-jornada') return false;
      if (d.dom === 'area' && p.scopeArea && (!d.slug || !p.areasSlugs.has(d.slug))) return false;
    }
  }

  if (isAdmin) return true;

  if (item.module && modulePerms) {
    const leitura = modulePerms[item.module]?.leitura ?? 0;
    if (leitura < (item.moduleMin ?? 1)) return false;
  }
  return true;
}

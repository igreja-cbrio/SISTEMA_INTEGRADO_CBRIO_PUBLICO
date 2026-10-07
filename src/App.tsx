import { lerRetornoSelecao } from './lib/selecaoRetorno';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { TutorialProvider } from './contexts/TutorialContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, Component, useEffect, useRef, useState } from 'react';
import type { ReactNode, ComponentType, ErrorInfo } from 'react';
import { Toaster } from 'sonner';
import AppShell from './components/layout/AppShell';
import Login from './pages/Login';
import DemoAutoLogin from './pages/DemoAutoLogin';
import { DEMO_MODE } from './lib/demo';
import RedefinirSenha from './pages/RedefinirSenha';
import { CbrioLoader } from './components/ui/cbrio-loader';
import {
  APP_UPDATE_CACHE_BUSTER_PARAM,
  APP_UPDATE_RETRY_PARAM,
  APP_UPDATE_RETRY_STARTED_PARAM,
  APP_UPDATE_RETRY_WINDOW_MS,
  MAX_APP_UPDATE_RETRIES,
  getAppUpdateRetryCount,
  hasNewAppVersion,
  registrarAssetComFalha,
  registrarErroDeChunk,
  reloadForAppUpdate,
} from './lib/appUpdate';
import { CHUNK_ERROR_RE, classificarErroDeTela } from './lib/erroRecuperavel';
import type { MotivoRecuperacao } from './lib/erroRecuperavel';
import { captureAppException } from './lib/sentry';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,


      staleTime: 60_000,

      gcTime: 10 * 60_000,
    },
  },
});













function atalhoRecarregarForcado() {
  const mac = typeof navigator !== 'undefined'
    && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');
  return mac ? 'Cmd + Shift + R' : 'Ctrl + Shift + R';
}







async function hardReload() {
  await reloadForAppUpdate();
}







if (typeof window !== 'undefined') {



  const recuperarSeChunk = (msg: string) => {
    if (!CHUNK_ERROR_RE.test(msg || '')) return;
    registrarErroDeChunk(msg);
    if (getAppUpdateRetryCount() < MAX_APP_UPDATE_RETRIES) hardReload();
  };

  window.addEventListener('error', (e: ErrorEvent) => {
    const alvo = e.target as (HTMLScriptElement & HTMLLinkElement) | null;
    const src = alvo ? (alvo.src || alvo.href || '') : '';
    if (src && /\/assets\/.*\.(js|mjs|css)(\?|$)/.test(src)) {
      registrarAssetComFalha(src);
      if (getAppUpdateRetryCount() < MAX_APP_UPDATE_RETRIES) hardReload();
      return;
    }
    recuperarSeChunk(e.message || e.error?.message || '');
  }, true);
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const r: unknown = e.reason;
    recuperarSeChunk(typeof r === 'string' ? r : (r as Error)?.message || '');
  });
}

function lazyWithRetry<T extends ComponentType<Record<string, never>>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err || '');
      const isChunkError = CHUNK_ERROR_RE.test(message);
      if (isChunkError) registrarErroDeChunk(message);
      if (isChunkError && getAppUpdateRetryCount() < MAX_APP_UPDATE_RETRIES) {
        hardReload();
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null; updating: boolean; motivo: MotivoRecuperacao | null; segundos: number | null }
> {
  private timer: number | null = null;
  private timerSaudavel: number | null = null;

  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, updating: false, motivo: null, segundos: null };
  }







  componentDidMount() {
    this.timerSaudavel = window.setTimeout(() => {
      this.timerSaudavel = null;
      if (this.state.hasError) return;
      try { sessionStorage.removeItem(ErrorBoundary.CHAVE_ESPERAS); } catch {                    }
    }, APP_UPDATE_RETRY_WINDOW_MS);
  }

  componentWillUnmount() {
    if (this.timer !== null) window.clearInterval(this.timer);
    if (this.timerSaudavel !== null) window.clearTimeout(this.timerSaudavel);
  }












  private static readonly MAX_ESPERAS = 5;
  private static readonly ESPERA_S = 20;
  private static readonly CHAVE_ESPERAS = 'cbrio-esperas-atualizacao';

  private esperasFeitas(): number {
    try { return Number(sessionStorage.getItem(ErrorBoundary.CHAVE_ESPERAS) || '0') || 0; }
    catch { return 0; }
  }

  private iniciarEspera() {
    if (this.timer !== null) return;
    if (this.esperasFeitas() >= ErrorBoundary.MAX_ESPERAS) return;

    this.setState({ segundos: ErrorBoundary.ESPERA_S });
    this.timer = window.setInterval(() => {
      this.setState((s) => {
        const restante = (s.segundos ?? 0) - 1;
        if (restante > 0) return { ...s, segundos: restante };
        if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
        try { sessionStorage.setItem(ErrorBoundary.CHAVE_ESPERAS, String(this.esperasFeitas() + 1)); } catch {                    }
        void reloadForAppUpdate({ resetRetries: true });
        return { ...s, segundos: 0, updating: true };
      });
    }, 1000);
  }
  static getDerivedStateFromError(error: Error) {
    const { recuperavel, motivo } = classificarErroDeTela(
      error?.message,
      getAppUpdateRetryCount(),
      MAX_APP_UPDATE_RETRIES,
    );




    return { hasError: true, error, updating: recuperavel, motivo };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { recuperavel, motivo } = classificarErroDeTela(
      error?.message,
      getAppUpdateRetryCount(),
      MAX_APP_UPDATE_RETRIES,
    );
    if (motivo === 'chunk') registrarErroDeChunk(error?.message);

    captureAppException(error, {
      mechanism: 'react-error-boundary',
      tags: { surface: 'web', recuperavel: String(recuperavel), motivo: motivo || 'nenhum' },
      context: { componentStack: errorInfo.componentStack || null },
    });

    if (recuperavel) { hardReload(); return; }


    if (motivo === 'chunk') this.iniciarEspera();
  }
  render() {
    if (this.state.hasError) {
      const isChunkError = this.state.motivo !== null;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, padding: 32, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, fontWeight: 'bold' }}>Algo deu errado</h1>
          {isChunkError ? (
            <>
              <p style={{ color: '#888', maxWidth: 480 }}>
                {this.state.updating
                  ? 'Há uma nova versão do sistema. Estamos atualizando automaticamente; seu acesso e esta página serão mantidos.'
                  : this.state.segundos !== null
                    ? 'Uma atualização está sendo publicada agora. Recarregar neste instante cai no mesmo lugar, porque os arquivos ainda estão sendo trocados — vamos tentar de novo em instantes. Seu acesso e esta página serão mantidos.'
                    : 'Não foi possível concluir a atualização automática. Tente novamente; seu acesso e esta página serão mantidos.'}
              </p>

              {this.state.segundos !== null && this.state.segundos > 0 && (
                <p style={{ color: '#00B39D', fontSize: 15, fontWeight: 600 }}>
                  Nova tentativa em {this.state.segundos}s
                </p>
              )}
              <button
                disabled={this.state.updating}
                onClick={() => {
                  this.setState({ updating: true });
                  void reloadForAppUpdate({ resetRetries: true });
                }}
                style={{ padding: '10px 28px', borderRadius: 8, background: '#00B39D', color: '#fff', border: 'none', cursor: this.state.updating ? 'wait' : 'pointer', opacity: this.state.updating ? 0.75 : 1, fontSize: 14, fontWeight: 600 }}
              >
                {this.state.updating ? 'Atualizando…' : 'Tentar atualizar agora'}
              </button>
              {





                                                                  }
              {



                                                        }
              {!this.state.updating && this.state.segundos === null && (
                <p style={{ color: '#888', fontSize: 13, maxWidth: 480 }}>
                  Se voltar a falhar, force o recarregamento: <b>{atalhoRecarregarForcado()}</b>.
                </p>
              )}
              <p style={{ color: '#aaa', fontSize: 12, marginTop: 8 }}>
                Alterações ainda não salvas nesta página podem ser perdidas.
              </p>
            </>
          ) : (
            <>
              <p style={{ color: '#888' }}>{this.state.error?.message || 'Erro inesperado na aplicação.'}</p>
              <button
                disabled={this.state.updating}
                onClick={() => {
                  this.setState({ updating: true });
                  void reloadForAppUpdate({ resetRetries: true });
                }}
                style={{ padding: '8px 24px', borderRadius: 8, background: '#00B39D', color: '#fff', border: 'none', cursor: this.state.updating ? 'wait' : 'pointer', opacity: this.state.updating ? 0.75 : 1 }}
              >
                {this.state.updating ? 'Atualizando…' : 'Tentar novamente'}
              </button>
            </>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const DesignPreview = lazyWithRetry(() => import('./pages/DesignPreview'));
const Perfil = lazyWithRetry(() => import('./pages/Perfil'));
const MinhasTarefas = lazyWithRetry(() => import('./pages/MinhasTarefas'));
const AcompanhamentoRotinas = lazyWithRetry(() => import('./pages/rotinas/AcompanhamentoRotinas'));
const MinhasAvaliacoes = lazyWithRetry(() => import('./pages/MinhasAvaliacoes'));
const NotFound = lazyWithRetry(() => import('./pages/NotFound'));
const Solicitacoes = lazyWithRetry(() => import('./pages/Solicitacoes'));
const NotificacaoRegras = lazyWithRetry(() => import('./pages/admin/NotificacaoRegras'));
const CruzamentosPessoas = lazyWithRetry(() => import('./pages/admin/CruzamentosPessoas'));
const SolicitacoesResponsaveis = lazyWithRetry(() => import('./pages/admin/SolicitacoesResponsaveis'));
const SolicitacoesFluxo = lazyWithRetry(() => import('./pages/admin/SolicitacoesFluxo'));
const PermissoesAdmin = lazyWithRetry(() => import('./pages/admin/Permissoes'));
const FeedbackAdmin = lazyWithRetry(() => import('./pages/admin/Feedback'));
const AppAnalytics = lazyWithRetry(() => import('./pages/admin/AppAnalytics'));
const Sistema = lazyWithRetry(() => import('./pages/sistema/Sistema'));
const Painel = lazyWithRetry(() => import('./pages/Painel'));

const PainelNsmPessoas = lazyWithRetry(() => import('./pages/PainelNsmPessoas'));
const PainelJornada = lazyWithRetry(() => import('./pages/PainelJornada'));
const EstruturaOkr = lazyWithRetry(() => import('./pages/admin/EstruturaOkr'));
const Ritual = lazyWithRetry(() => import('./pages/Ritual'));
const Gestao = lazyWithRetry(() => import('./pages/Gestao'));
const DadosBrutos = lazyWithRetry(() => import('./pages/DadosBrutos'));
const DashboardSemanal = lazyWithRetry(() => import('./pages/DashboardSemanal'));
const MonitoramentoOkr = lazyWithRetry(() => import('./pages/MonitoramentoOkr'));
const AtaSemanal = lazyWithRetry(() => import('./pages/inteligencia/AtaSemanal'));
const Membresia = lazyWithRetry(() => import('./pages/ministerial/Membresia'));
const MemberScan = lazyWithRetry(() => import('./pages/ministerial/membresia/MemberScan'));
const ReconhecimentoFacial = lazyWithRetry(() => import('./pages/ministerial/reconhecimentoFacial/ReconhecimentoFacial'));
const Online = lazyWithRetry(() => import('./pages/ministerial/Online'));
const PainelKids = lazyWithRetry(() => import('./pages/ministerial/PainelKids'));
const PainelAmi = lazyWithRetry(() => import('./pages/ministerial/PainelAmi'));
const PainelBridge = lazyWithRetry(() => import('./pages/ministerial/PainelBridge'));
const TotemKidsCheckin = lazyWithRetry(() => import('./pages/ministerial/totemKids/TotemKidsCheckin'));
const GestaoCriancas = lazyWithRetry(() => import('./pages/ministerial/totemKids/GestaoCriancas'));
const KidsHub = lazyWithRetry(() => import('./pages/ministerial/totemKids/KidsHub'));
const KidsFrequencia = lazyWithRetry(() => import('./pages/ministerial/totemKids/KidsFrequencia'));
const VoluntariosKids = lazyWithRetry(() => import('./pages/ministerial/totemKids/VoluntariosKids'));
const VoluntariadoInscricoesKids = lazyWithRetry(() => import('./pages/ministerial/totemKids/VoluntariadoInscricoesKids'));
const EstoqueKids = lazyWithRetry(() => import('./pages/ministerial/totemKids/EstoqueKids'));
const BatismosKids = lazyWithRetry(() => import('./pages/ministerial/totemKids/BatismosKids'));
const ApresentacaoCriancasKids = lazyWithRetry(() => import('./pages/ministerial/totemKids/ApresentacaoCriancas'));
const TotemKidsCheckout = lazyWithRetry(() => import('./pages/ministerial/totemKids/TotemKidsCheckout'));
const TotemKidsPainel = lazyWithRetry(() => import('./pages/ministerial/totemKids/TotemKidsPainel'));
const TotemKidsTesteEtiqueta = lazyWithRetry(() => import('./pages/ministerial/totemKids/TotemKidsTesteEtiqueta'));
const TotemKidsDecisoes = lazyWithRetry(() => import('./pages/ministerial/totemKids/TotemKidsDecisoes'));
const KidsDecisoesRegistro = lazyWithRetry(() => import('./pages/ministerial/totemKids/KidsDecisoesRegistro'));
const TotemKidsVinculos = lazyWithRetry(() => import('./pages/ministerial/totemKids/TotemKidsVinculos'));
const TotemKidsPortao = lazyWithRetry(() => import('./pages/ministerial/totemKids/TotemKidsPortao'));
const MarketingInicio = lazyWithRetry(() => import('./pages/marketing/MarketingInicio'));
const MarketingCalendario = lazyWithRetry(() => import('./pages/marketing/MarketingCalendario'));
const MarketingLinhaDoTempo = lazyWithRetry(() => import('./pages/marketing/MarketingLinhaDoTempo'));
const MarketingAnalytics = lazyWithRetry(() => import('./pages/marketing/MarketingAnalytics'));
const MarketingApp = lazyWithRetry(() => import('./pages/marketing/MarketingApp'));
const MarketingCampanhas = lazyWithRetry(() => import('./pages/marketing/MarketingCampanhas'));
const MarketingArquivos = lazyWithRetry(() => import('./pages/marketing/MarketingArquivos'));
const TotemKidsAdmin = lazyWithRetry(() => import('./pages/admin/totemKids/TotemKidsAdmin'));
const AssistenteIA = lazyWithRetry(() => import('./pages/admin/AssistenteIA'));
const EventDetail = lazyWithRetry(() => import('./pages/eventos/EventDetail'));
const Financeiro = lazyWithRetry(() => import('./pages/admin/financeiro/Financeiro'));
const Patrimonio = lazyWithRetry(() => import('./pages/admin/patrimonio/Patrimonio'));
const Expansao = lazyWithRetry(() => import('./pages/Expansao'));
const RevisaoEstrategica = lazyWithRetry(() => import('./pages/RevisaoEstrategica'));
const RevisaoDetalhe = lazyWithRetry(() => import('./pages/RevisaoDetalhe'));
const RH = lazyWithRetry(() => import('./pages/admin/rh/RH'));
const Logistica = lazyWithRetry(() => import('./pages/admin/logistica/Logistica'));
const PlanejamentoAnual = lazyWithRetry(() => import('./pages/planejamentoAnual/PlanejamentoAnual'));
const ExecucaoPlanejamento = lazyWithRetry(() => import('./pages/execucaoPlanejamento/ExecucaoPlanejamento'));
const Eventos = lazyWithRetry(() => import('./pages/eventos/Eventos'));
const Projetos = lazyWithRetry(() => import('./pages/Projetos'));
const Processos = lazyWithRetry(() => import('./pages/Processos'));
const Nps = lazyWithRetry(() => import('./pages/Nps'));
const Censo = lazyWithRetry(() => import('./pages/censo/Censo'));
const Links = lazyWithRetry(() => import('./pages/links/Links'));
const CensoPublica = lazyWithRetry(() => import('./pages/public/CensoPublica'));
const NpsResponder = lazyWithRetry(() => import('./pages/nps/NpsResponder'));
const NpsPublica = lazyWithRetry(() => import('./pages/public/NpsPublica'));
const KidsRetirada = lazyWithRetry(() => import('./pages/public/KidsRetirada'));
const Grupos = lazyWithRetry(() => import('./pages/ministerial/Grupos'));
const GruposSupervisao = lazyWithRetry(() => import('./pages/ministerial/GruposSupervisao'));
const CadastroMembresia = lazyWithRetry(() => import('./pages/public/CadastroMembresia'));
const OnboardingColaborador = lazyWithRetry(() => import('./pages/public/OnboardingColaborador'));
const FichaContratada = lazyWithRetry(() => import('./pages/public/FichaContratada'));
const InscricaoBatismo = lazyWithRetry(() => import('./pages/public/InscricaoBatismo'));
const BatismoAcesso = lazyWithRetry(() => import('./pages/public/BatismoAcesso'));
const ApresentacaoCriancasPublica = lazyWithRetry(() => import('./pages/public/ApresentacaoCriancas'));
const InscricaoGrupos = lazyWithRetry(() => import('./pages/public/InscricaoGrupos'));
const InscricaoLideres = lazyWithRetry(() => import('./pages/public/InscricaoLideres'));
const GrupoAprovarPedido = lazyWithRetry(() => import('./pages/public/GrupoAprovarPedido'));
const GrupoSugestaoAceite = lazyWithRetry(() => import('./pages/public/GrupoSugestaoAceite'));
const GrupoFrequenciaMes = lazyWithRetry(() => import('./pages/public/GrupoFrequenciaMes'));
const GrupoRenovacao = lazyWithRetry(() => import('./pages/public/GrupoRenovacao'));
const GrupoConfiraLista = lazyWithRetry(() => import('./pages/public/GrupoConfiraLista'));

const EscalaResposta = lazyWithRetry(() => import('./pages/public/EscalaResposta'));
const FamiliaConvite = lazyWithRetry(() => import('./pages/public/FamiliaConvite'));
const InscricaoGruposQRCode = lazyWithRetry(() => import('./pages/admin/InscricaoGruposQRCode'));
const GruposGeocode = lazyWithRetry(() => import('./pages/admin/GruposGeocode'));
const TemporadasGrupos = lazyWithRetry(() => import('./pages/admin/TemporadasGrupos'));
const WalletPage = lazyWithRetry(() => import('./pages/public/WalletPage'));
const Motion = lazyWithRetry(() => import('./pages/public/Motion'));


const NovoSite = lazyWithRetry(() => import('./pages/public/NovoSite'));
const QuemSomos = lazyWithRetry(() => import('./pages/public/QuemSomos'));

const SeriesLista = lazyWithRetry(() => import('./pages/public/SeriesLista'));
const SerieDetalhe = lazyWithRetry(() => import('./pages/public/SerieDetalhe'));
const Suporte = lazyWithRetry(() => import('./pages/public/Suporte'));

const Atlas = lazyWithRetry(() => import('./pages/atlas/Atlas'));
const Voluntariado = lazyWithRetry(() => import('./pages/ministerial/voluntariado'));
const VolTotem = lazyWithRetry(() => import('./pages/ministerial/voluntariado/VolTotem'));
const TotemMembro = lazyWithRetry(() => import('./pages/TotemMembro'));
const VolSelfCheckin = lazyWithRetry(() => import('./pages/ministerial/voluntariado/VolSelfCheckin'));
const PcCallback = lazyWithRetry(() => import('./pages/auth/PcCallback'));
const Cuidados = lazyWithRetry(() => import('./pages/ministerial/Cuidados'));
const Comunicacao = lazyWithRetry(() => import('./pages/Comunicacao'));






function RedirectComunicacao({ tab }: { tab: string }) {
  const location = useLocation();
  const p = new URLSearchParams(location.search);
  p.set('tab', tab);
  return <Navigate to={`/comunicacao?${p.toString()}`} replace />;
}
const DevocionalMovido = lazyWithRetry(() => import('./pages/devocional/DevocionalMovido'));
const Integracao = lazyWithRetry(() => import('./pages/ministerial/Integracao'));
const Batismo = lazyWithRetry(() => import('./pages/ministerial/Batismos'));
const WifiModulo = lazyWithRetry(() => import('./pages/ministerial/Wifi'));
const Producao = lazyWithRetry(() => import('./pages/ministerial/Producao'));
const ColetaCulto = lazyWithRetry(() => import('./pages/ministerial/coleta/ColetaCulto'));
const NextBatismo = lazyWithRetry(() => import('./pages/ministerial/NextBatismo'));
const Governanca = lazyWithRetry(() => import('./pages/governanca/Governanca'));
const GovernancaRitual = lazyWithRetry(() => import('./pages/governanca/RitualPage'));


const InscricaoNext = lazyWithRetry(() => import('./pages/public/InscricaoNext'));
const EventoExterno = lazyWithRetry(() => import('./pages/public/EventoExterno'));
const GenesisPublico = lazyWithRetry(() => import('./pages/public/GenesisPublico'));
const PagamentoInscricao = lazyWithRetry(() => import('./pages/public/PagamentoInscricao'));




const Doar = lazyWithRetry(() => import('./pages/public/Doar'));
const InscricaoComprovante = lazyWithRetry(() => import('./pages/public/InscricaoComprovante'));
const PoliticaReembolso = lazyWithRetry(() => import('./pages/public/PoliticaReembolso'));
const InscricaoEventoCheckin = lazyWithRetry(() => import('./pages/InscricaoEventoCheckin'));
const EventoCheckin = lazyWithRetry(() => import('./pages/public/EventoCheckin'));



const Inscricoes = lazyWithRetry(() => import('./pages/Inscricoes'));
const Campanhas = lazyWithRetry(() => import('./pages/Campanhas'));
const CampanhaPublica = lazyWithRetry(() => import('./pages/public/CampanhaPublica'));
const InscricaoEventoDetalhe = lazyWithRetry(() => import('./pages/InscricaoEventoDetalhe'));
const InscricaoTotens = lazyWithRetry(() => import('./pages/InscricaoTotens'));






const NextDirecionar = lazyWithRetry(() => import('./pages/public/NextDirecionar'));
const DecisaoOnline = lazyWithRetry(() => import('./pages/public/DecisaoOnline'));

const VisitantePublico = lazyWithRetry(() => import('./pages/public/VisitantePublico'));
const VisitanteAvaliar = lazyWithRetry(() => import('./pages/public/VisitanteAvaliar'));
const Visitantes = lazyWithRetry(() => import('./pages/Visitantes'));
const DecisaoCulto = lazyWithRetry(() => import('./pages/public/DecisaoCulto'));
const InscricaoVoluntariado = lazyWithRetry(() => import('./pages/public/InscricaoVoluntariado'));




const PlaceholderPage = ({ title }) => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
    <h1 className="text-2xl font-bold text-foreground">{title}</h1>
    <p className="text-muted-foreground">Este módulo será carregado do backend.</p>
  </div>
);

const Loading = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <CbrioLoader />
  </div>
);

function loginRedirectTarget() {
  if (typeof window === 'undefined') return '/login';
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const hasAuthError = searchParams.has('error') || hashParams.has('error');
  return hasAuthError ? `/login${window.location.search}${window.location.hash}` : '/login';
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={loginRedirectTarget()} replace />;
  return children;
}



function MemberOnlyRedirect({ children }: { children: ReactNode }) {
  const { isMembroOnly, loading } = useAuth();
  if (loading) return <Loading />;
  if (isMembroOnly) return <Navigate to="/devocional" replace />;
  return <>{children}</>;
}












function SuperAdminGuard({ children }: { children: ReactNode }) {
  const auth = useAuth() as Record<string, unknown>;
  if (auth.loading) return <Loading />;
  if (!auth.isSuperAdmin) {
    const email = (auth.user as { email?: string } | null)?.email;
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-2xl border border-amber-300/50 bg-amber-50 p-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <h1 className="text-xl font-semibold">Acesso restrito ao Sistema</h1>
          <p className="mt-2 text-sm leading-6 opacity-80">Esta área exige cadastro ativo em app_super_admins. Ser admin ou diretor não libera o command center técnico.</p>
          {email && <p className="mt-3 rounded-lg border border-current/15 px-3 py-2 font-mono text-xs">Conta atual: {email}</p>}
          <a href="/dashboard" className="mt-5 inline-flex min-h-10 items-center rounded-md bg-amber-900 px-4 text-sm font-medium text-white dark:bg-amber-200 dark:text-amber-950">Voltar ao painel</a>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function ModuleGuard({ permKey, moduleSlug, anyOf, nivelMinimo = 1, children }: { permKey?: string; moduleSlug?: string; anyOf?: string[]; nivelMinimo?: number; children: ReactNode }) {
  const auth = useAuth();
  const a = auth as Record<string, unknown>;







  const naoHidratou = !auth.loading && !!a.user && (a.profile == null || a.modulePerms == null);
  useEffect(() => {
    if (naoHidratou && typeof a.recarregarAuth === 'function') (a.recarregarAuth as () => void)();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naoHidratou]);

  if (auth.loading) return <Loading />;
  if (naoHidratou) return <Loading />;


  const PERM_SLUG: Record<string, string> = {
    canRH: 'rh', canFinanceiro: 'financeiro', canLogistica: 'logistica',
    canPatrimonio: 'patrimonio', canMembresia: 'membresia', canProjetos: 'projetos',
    canExpansao: 'expansao', canAgenda: 'eventos', canIA: 'assistente-ia', canCuidados: 'cuidados',
  };
  const slugAlvo = moduleSlug || (permKey ? PERM_SLUG[permKey] : undefined);
  const bloqueados = ((auth as Record<string, unknown>).modulosBloqueados as string[] | undefined) || [];
  if (slugAlvo && bloqueados.includes(slugAlvo)) return <Navigate to="/dashboard" replace />;

  if (auth.isAdmin) return <>{children}</>;



  if (anyOf && anyOf.length) {
    const ok = anyOf.some(s => ((auth.modulePerms?.[s] as { leitura?: number } | undefined)?.leitura ?? 0) >= nivelMinimo);
    if (!ok) return <Navigate to="/dashboard" replace />;
    return <>{children}</>;
  }

  if (moduleSlug) {
    const perm = auth.modulePerms?.[moduleSlug];
    const leitura = perm?.leitura ?? 0;
    if (leitura < nivelMinimo) return <Navigate to="/dashboard" replace />;
    return <>{children}</>;
  }


  const hasAccess = permKey ? (auth as Record<string, unknown>)[permKey] : true;
  if (hasAccess === false) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}



function DevGuard({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  if (!(auth as Record<string, unknown>).isDev) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}




function VoluntariadoGuard({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.loading) return <Loading />;
  if (auth.isVoluntario) return <>{children}</>;










  if (auth.modulePerms && !auth.isAdmin
      && !auth.canAccessModule(['voluntariado', 'Voluntariado'], 'leitura', 1)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}


function VolunteerShell() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen" style={{ background: 'var(--cbrio-bg)' }}>
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="flex items-center justify-between h-14 px-4 md:px-6 max-w-[1800px] mx-auto">
          <div className="flex items-center gap-2">
            <img src="/logo-cbrio-text.png" alt="CBRio" className="h-7 object-contain" />
            <span className="text-sm font-medium text-muted-foreground">Voluntariado</span>
          </div>
          <div className="flex items-center gap-3">
            {profile?.name && <span className="text-sm text-foreground hidden sm:inline">{profile.name.split(' ')[0]}</span>}
            <button
              onClick={async () => { await signOut(); navigate('/login'); }}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-[1800px] mx-auto">
        <Outlet />
      </main>
    </div>
  );
}






const HOME_MODULO_UNICO: Record<string, string> = {
  producao: '/producao',
  batismo: '/batismo',
  kids: '/ministerial/kids',
  grupos: '/grupos',
};
function homeRoute(auth: Record<string, unknown>): string {
  if (auth.rotaTravada) return auth.rotaTravada as string;
  if (auth.isMembroOnly) return '/devocional';
  if (auth.isVoluntario) return '/voluntariado/checkin';
  const moduloUnico = auth.moduloUnico as string | null | undefined;
  if (!auth.isAdmin && moduloUnico && HOME_MODULO_UNICO[moduloUnico]) {
    return HOME_MODULO_UNICO[moduloUnico];
  }
  return '/dashboard';
}

const SelecaoInterna = lazyWithRetry(() => import('./pages/admin/rh/SelecaoInterna'));

function DefaultRedirect() {
  const auth = useAuth();
  const { user, loading } = auth;
  if (loading) return <Loading />;

  if (!user && DEMO_MODE) return <Navigate to="/demo" replace />;
  if (!user) return <Navigate to={loginRedirectTarget()} replace />;
  return <Navigate to={(!auth.isMembroOnly && !auth.rotaTravada && lerRetornoSelecao()) || homeRoute(auth as Record<string, unknown>)} replace />;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;

  return (
    <Routes>
      <Route path="/selecao-interna/:id" element={<Suspense fallback={<Loading />}><SelecaoInterna /></Suspense>} />
      <Route path="/login" element={user ? <DefaultRedirect /> : <Login />} />
      <Route path="/redefinir-senha" element={<RedefinirSenha />} />

      {                                                                              }
      <Route path="/demo" element={<DemoAutoLogin />} />

      {                    }
      <Route path="/cadastro-membresia" element={<Suspense fallback={<Loading />}><CadastroMembresia /></Suspense>} />
      <Route path="/onboarding/:token" element={<Suspense fallback={<Loading />}><OnboardingColaborador /></Suspense>} />
      {                                                                    }
      <Route path="/ficha-contratada/:token" element={<Suspense fallback={<Loading />}><FichaContratada /></Suspense>} />
      <Route path="/inscricao-batismo" element={<Suspense fallback={<Loading />}><InscricaoBatismo /></Suspense>} />
      {                                                                                                 }
      <Route path="/batismo/acesso" element={<Suspense fallback={<Loading />}><BatismoAcesso /></Suspense>} />
      <Route path="/apresentacao-criancas" element={<Suspense fallback={<Loading />}><ApresentacaoCriancasPublica /></Suspense>} />
      <Route path="/evento/:slug" element={<Suspense fallback={<Loading />}><EventoExterno /></Suspense>} />
      {

                                                                                }
      <Route path="/genesis" element={<Suspense fallback={<Loading />}><GenesisPublico /></Suspense>} />
      <Route path="/genesis/:slug" element={<Suspense fallback={<Loading />}><EventoExterno /></Suspense>} />
      {                                                                               }
      <Route path="/pagamento/:token" element={<Suspense fallback={<Loading />}><PagamentoInscricao /></Suspense>} />
      {
                                                             }
      <Route path="/doar" element={<Suspense fallback={<Loading />}><Doar /></Suspense>} />
      <Route path="/doar/:token" element={<Suspense fallback={<Loading />}><Doar /></Suspense>} />
      {                                                                                              }
      <Route path="/i/c/:token" element={<Suspense fallback={<Loading />}><InscricaoComprovante /></Suspense>} />
      {
                                                               }
      <Route path="/politica-reembolso" element={<Suspense fallback={<Loading />}><PoliticaReembolso /></Suspense>} />
      <Route path="/inscricao-grupos" element={<Suspense fallback={<Loading />}><InscricaoGrupos /></Suspense>} />
      <Route path="/inscricao-lideres" element={<Suspense fallback={<Loading />}><InscricaoLideres /></Suspense>} />
      {                                                                                         }
      <Route path="/g/a/:token" element={<Suspense fallback={<Loading />}><GrupoAprovarPedido /></Suspense>} />
      {                                                                               }
      <Route path="/g/s/:token" element={<Suspense fallback={<Loading />}><GrupoSugestaoAceite /></Suspense>} />
      {                                                                                   }
      <Route path="/g/f/:token" element={<Suspense fallback={<Loading />}><GrupoFrequenciaMes /></Suspense>} />
      <Route path="/g/r/:token" element={<Suspense fallback={<Loading />}><GrupoRenovacao /></Suspense>} />
      {                                                                                   }
      <Route path="/g/c/:token" element={<Suspense fallback={<Loading />}><GrupoConfiraLista /></Suspense>} />
      <Route path="/e/:token" element={<Suspense fallback={<Loading />}><EscalaResposta /></Suspense>} />
      {                                                                           }
      <Route path="/f/a/:codigo" element={<Suspense fallback={<Loading />}><FamiliaConvite /></Suspense>} />
      <Route path="/next" element={<Suspense fallback={<Loading />}><InscricaoNext /></Suspense>} />
      <Route path="/next/inscrever" element={<Suspense fallback={<Loading />}><InscricaoNext /></Suspense>} />
      <Route path="/next/direcionar/:token" element={<Suspense fallback={<Loading />}><NextDirecionar /></Suspense>} />
      <Route path="/inscricao-voluntariado" element={<Suspense fallback={<Loading />}><InscricaoVoluntariado /></Suspense>} />
      <Route path="/decisao" element={<Suspense fallback={<Loading />}><DecisaoOnline /></Suspense>} />
      {

                                                       }
      <Route path="/visitante" element={<Suspense fallback={<Loading />}><VisitantePublico /></Suspense>} />
      <Route path="/visitante/avaliar/:token" element={<Suspense fallback={<Loading />}><VisitanteAvaliar /></Suspense>} />
      {

                                      }
      <Route path="/decisao/:token" element={<Suspense fallback={<Loading />}><DecisaoOnline /></Suspense>} />
      {                                                                                }
      <Route path="/c/:token" element={<Suspense fallback={<Loading />}><DecisaoCulto /></Suspense>} />
      {                                                                      }
      <Route path="/ec/:token" element={<Suspense fallback={<Loading />}><EventoCheckin /></Suspense>} />
      <Route path="/wallet" element={<Suspense fallback={<Loading />}><WalletPage /></Suspense>} />
      <Route path="/motion" element={<Suspense fallback={<Loading />}><Motion /></Suspense>} />
      {                                                                       }
      <Route path="/novosite" element={<Suspense fallback={<Loading />}><NovoSite /></Suspense>} />
      <Route path="/novosite/quem-somos" element={<Suspense fallback={<Loading />}><QuemSomos /></Suspense>} />
      <Route path="/novosite/series" element={<Suspense fallback={<Loading />}><SeriesLista /></Suspense>} />
      <Route path="/novosite/series/:slug" element={<Suspense fallback={<Loading />}><SerieDetalhe /></Suspense>} />
      {                                                                            }
      <Route path="/suporte" element={<Suspense fallback={<Loading />}><Suporte /></Suspense>} />
      <Route path="/nps/publica/:token" element={<Suspense fallback={<Loading />}><NpsPublica /></Suspense>} />
      {                                                                   }
      <Route path="/censo/p/:slug" element={<Suspense fallback={<Loading />}><CensoPublica /></Suspense>} />
      {




                                                                                                                       }
      <Route path="/campanha/:slug" element={<Suspense fallback={<Loading />}><CampanhaPublica /></Suspense>} />
      {                                                                           }
      <Route path="/kids/retirada/:codigo" element={<Suspense fallback={<Loading />}><KidsRetirada /></Suspense>} />
      <Route path="/auth/pc-callback" element={<Suspense fallback={<Loading />}><PcCallback /></Suspense>} />

      {
                                                                                  }
      <Route path="/devocional" element={<Suspense fallback={<Loading />}><DevocionalMovido /></Suspense>} />
      <Route path="/devocional/hoje" element={<Navigate to="/devocional" replace />} />
      <Route path="/devocional/historico" element={<Navigate to="/devocional" replace />} />

      {                                                                                 }
      <Route path="/design-preview" element={<ProtectedRoute><Suspense fallback={<Loading />}><DesignPreview /></Suspense></ProtectedRoute>} />

      {                                                                                                                             }
      <Route path="/atlas" element={<ProtectedRoute><Suspense fallback={<Loading />}><Atlas /></Suspense></ProtectedRoute>} />
      {                                                                   }
      <Route path="/atlas/fluxograma" element={<ProtectedRoute><Suspense fallback={<Loading />}><Atlas initialHash="#fluxograma" /></Suspense></ProtectedRoute>} />

      {                                          }
      <Route path="/voluntariado/totem" element={<ProtectedRoute><Suspense fallback={<Loading />}><VolTotem /></Suspense></ProtectedRoute>} />
      <Route path="/totem" element={<ProtectedRoute><ModuleGuard moduleSlug="totem-membro"><Suspense fallback={<Loading />}><TotemMembro /></Suspense></ModuleGuard></ProtectedRoute>} />

      {

                                                                   }
      <Route path="/voluntariado/self-checkin" element={<Suspense fallback={<Loading />}><VolSelfCheckin /></Suspense>} />

      {                                                     }
      <Route element={<ProtectedRoute><VolunteerShell /></ProtectedRoute>}>
        <Route path="/voluntariado/checkin/*" element={<Suspense fallback={<Loading />}><Voluntariado /></Suspense>} />
        <Route path="/voluntariado/*" element={<Navigate to="/voluntariado/checkin" replace />} />
      </Route>

      {                                                }
      <Route
        element={
          <ProtectedRoute>
            <MemberOnlyRedirect>
              <AppShell />
            </MemberOnlyRedirect>
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Suspense fallback={<Loading />}><Dashboard /></Suspense>} />
        <Route path="/perfil" element={<Suspense fallback={<Loading />}><Perfil /></Suspense>} />
        {                                                                            }
        <Route path="/tarefas" element={<Suspense fallback={<Loading />}><MinhasTarefas /></Suspense>} />
        <Route path="/rotinas" element={<Suspense fallback={<Loading />}><AcompanhamentoRotinas /></Suspense>} />
        {                                                                                  }
        <Route path="/minhas-avaliacoes" element={<Suspense fallback={<Loading />}><MinhasAvaliacoes /></Suspense>} />
        <Route path="/planejamento-anual" element={<ModuleGuard moduleSlug="planejamento-anual"><Suspense fallback={<Loading />}><PlanejamentoAnual /></Suspense></ModuleGuard>} />
        <Route path="/planejamento-execucao" element={<ModuleGuard moduleSlug="planejamento-execucao"><Suspense fallback={<Loading />}><ExecucaoPlanejamento /></Suspense></ModuleGuard>} />
        <Route path="/eventos" element={<ModuleGuard permKey="canAgenda"><Suspense fallback={<Loading />}><Eventos /></Suspense></ModuleGuard>} />
        <Route path="/eventos/:id" element={<ModuleGuard permKey="canAgenda"><Suspense fallback={<Loading />}><EventDetail /></Suspense></ModuleGuard>} />
        <Route path="/projetos" element={<ModuleGuard permKey="canProjetos"><Suspense fallback={<Loading />}><Projetos /></Suspense></ModuleGuard>} />
        <Route path="/expansao" element={<ModuleGuard moduleSlug="expansao"><Suspense fallback={<Loading />}><Expansao /></Suspense></ModuleGuard>} />
        <Route path="/revisao" element={<Suspense fallback={<Loading />}><RevisaoEstrategica /></Suspense>} />
        <Route path="/revisao/:tipo/:id" element={<Suspense fallback={<Loading />}><RevisaoDetalhe /></Suspense>} />
        {                                                                                               }
        <Route path="/processos" element={<Navigate to="/eventos" replace />} />
        <Route path="/processos/*" element={<Navigate to="/eventos" replace />} />
        <Route path="/nps" element={<Suspense fallback={<Loading />}><Nps /></Suspense>} />
        <Route path="/censo" element={<ModuleGuard moduleSlug="censo" nivelMinimo={1}><Suspense fallback={<Loading />}><Censo /></Suspense></ModuleGuard>} />
        <Route path="/links" element={<ModuleGuard moduleSlug="links" nivelMinimo={1}><Suspense fallback={<Loading />}><Links /></Suspense></ModuleGuard>} />
        <Route path="/visitantes" element={<ModuleGuard moduleSlug="visitantes" nivelMinimo={1}><Suspense fallback={<Loading />}><Visitantes /></Suspense></ModuleGuard>} />
        <Route path="/nps/:id/responder" element={<Suspense fallback={<Loading />}><NpsResponder /></Suspense>} />
        <Route path="/admin/rh" element={<ModuleGuard permKey="canRH"><Suspense fallback={<Loading />}><RH /></Suspense></ModuleGuard>} />
        <Route path="/admin/financeiro" element={<ModuleGuard permKey="canFinanceiro"><Suspense fallback={<Loading />}><Financeiro /></Suspense></ModuleGuard>} />
        <Route path="/admin/logistica" element={<ModuleGuard permKey="canLogistica"><Suspense fallback={<Loading />}><Logistica /></Suspense></ModuleGuard>} />
        <Route path="/admin/patrimonio" element={<ModuleGuard permKey="canPatrimonio"><Suspense fallback={<Loading />}><Patrimonio /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/membresia" element={<ModuleGuard permKey="canMembresia"><Suspense fallback={<Loading />}><Membresia /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/membresia/scan" element={<ModuleGuard permKey="canMembresia"><Suspense fallback={<Loading />}><MemberScan /></Suspense></ModuleGuard>} />
        {                                                                                           }
        <Route path="/ministerial/reconhecimento-facial" element={<SuperAdminGuard><Suspense fallback={<Loading />}><ReconhecimentoFacial /></Suspense></SuperAdminGuard>} />
        <Route path="/ministerial/voluntariado/*" element={<VoluntariadoGuard><Suspense fallback={<Loading />}><Voluntariado /></Suspense></VoluntariadoGuard>} />
        {                                                        }
        <Route path="/ministerial/totem-kids" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><TotemKidsCheckin /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/kids" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><KidsHub /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/criancas" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><GestaoCriancas /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/frequencia" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><KidsFrequencia /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/voluntarios" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><VoluntariosKids /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/voluntariado-inscricoes" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><VoluntariadoInscricoesKids /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/estoque" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><EstoqueKids /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/batismos" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><BatismosKids /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/apresentacao" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><ApresentacaoCriancasKids /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/checkout" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><TotemKidsCheckout /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/portao" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><TotemKidsPortao /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/painel" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><TotemKidsPainel /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/teste-etiqueta" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><TotemKidsTesteEtiqueta /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/decisoes" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><TotemKidsDecisoes /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/decisoes-registro" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><KidsDecisoesRegistro /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/vinculos" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><TotemKidsVinculos /></Suspense></ModuleGuard>} />
        <Route path="/ministerial/totem-kids/configuracoes" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><TotemKidsAdmin /></Suspense></ModuleGuard>} />
        {                                                              }
        <Route path="/admin/totem-kids" element={<Navigate to="/ministerial/totem-kids/configuracoes" replace />} />
        <Route path="/admin/totem-kids/sessoes" element={<Navigate to="/ministerial/totem-kids/configuracoes?aba=sessoes" replace />} />
        <Route path="/grupos" element={<ModuleGuard moduleSlug="grupos"><Suspense fallback={<Loading />}><Grupos /></Suspense></ModuleGuard>} />
        <Route path="/grupos/supervisao" element={<ModuleGuard moduleSlug="grupos"><Suspense fallback={<Loading />}><GruposSupervisao /></Suspense></ModuleGuard>} />
        {
                                                                           }
        <Route path="/grupos/pedidos" element={<Navigate to="/grupos?tab=entrada" replace />} />
        <Route path="/ministerial/cuidados" element={<ModuleGuard moduleSlug="cuidados"><Suspense fallback={<Loading />}><Cuidados /></Suspense></ModuleGuard>} />
        {                                                                                                }
        <Route path="/comunicacao" element={<ModuleGuard moduleSlug="comunicacao"><Suspense fallback={<Loading />}><Comunicacao /></Suspense></ModuleGuard>} />
        {                                                               }
        {


                                                          }
        <Route path="/conversas" element={<RedirectComunicacao tab="conversas" />} />
        <Route path="/admin/conversas-setores" element={<RedirectComunicacao tab="bot" />} />
        {                                                                   }
        <Route path="/wifi" element={<SuperAdminGuard><Suspense fallback={<Loading />}><WifiModulo /></Suspense></SuperAdminGuard>} />
        <Route path="/ministerial/devocional" element={<Navigate to="/ministerial/cuidados?tab=devocional" replace />} />
        <Route path="/ministerial/jornada" element={<Navigate to="/ministerial/membresia" replace />} />
        {


                                                                             }
        <Route path="/ministerial/integracao" element={<ModuleGuard anyOf={['integracao', 'next', 'batismo']}><Suspense fallback={<Loading />}><Integracao /></Suspense></ModuleGuard>} />
        <Route path="/batismo" element={<ModuleGuard moduleSlug="batismo"><Suspense fallback={<Loading />}><Batismo /></Suspense></ModuleGuard>} />
        {                                                                           }
        <Route path="/ministerial/relatorios" element={<Navigate to="/dashboard-semanal" replace />} />
        <Route path="/integracao/coleta" element={<ModuleGuard moduleSlug="integracao" nivelMinimo={2}><Suspense fallback={<Loading />}><ColetaCulto /></Suspense></ModuleGuard>} />
        <Route path="/integracao" element={<Navigate to="/ministerial/integracao" replace />} />
        <Route path="/producao" element={<ModuleGuard moduleSlug="producao" nivelMinimo={1}><Suspense fallback={<Loading />}><Producao /></Suspense></ModuleGuard>} />
        <Route path="/entradas" element={<ModuleGuard moduleSlug="next-batismo" nivelMinimo={1}><Suspense fallback={<Loading />}><NextBatismo /></Suspense></ModuleGuard>} />
        {                                                                           }
        <Route path="/eventos-externos" element={<Navigate to="/inscricoes" replace />} />
        <Route path="/eventos-externos/:id" element={<Navigate to="/inscricoes" replace />} />
        <Route path="/inscricoes" element={<ModuleGuard moduleSlug="inscricoes" nivelMinimo={1}><Suspense fallback={<Loading />}><Inscricoes /></Suspense></ModuleGuard>} />
        <Route path="/campanhas" element={<ModuleGuard moduleSlug="campanhas" nivelMinimo={1}><Suspense fallback={<Loading />}><Campanhas /></Suspense></ModuleGuard>} />
        <Route path="/inscricoes/evento/:id" element={<ModuleGuard moduleSlug="inscricoes" nivelMinimo={1}><Suspense fallback={<Loading />}><InscricaoEventoDetalhe /></Suspense></ModuleGuard>} />
        {                                                                        }
        <Route path="/inscricoes/evento/:id/checkin" element={<ModuleGuard moduleSlug="inscricoes" nivelMinimo={2}><Suspense fallback={<Loading />}><InscricaoEventoCheckin /></Suspense></ModuleGuard>} />
        {                                                                   }
        <Route path="/inscricoes/totens" element={<ModuleGuard moduleSlug="inscricoes" nivelMinimo={1}><Suspense fallback={<Loading />}><InscricaoTotens /></Suspense></ModuleGuard>} />
        <Route path="/governanca" element={<ModuleGuard moduleSlug="governanca" nivelMinimo={1}><Suspense fallback={<Loading />}><Governanca /></Suspense></ModuleGuard>} />
        <Route path="/governanca/:sigla" element={<ModuleGuard moduleSlug="governanca" nivelMinimo={1}><Suspense fallback={<Loading />}><GovernancaRitual /></Suspense></ModuleGuard>} />
        <Route path="/next-batismo" element={<Navigate to="/entradas" replace />} />
        {                                                                    }
        <Route path="/online" element={<ModuleGuard moduleSlug="online"><Suspense fallback={<Loading />}><Online /></Suspense></ModuleGuard>} />
        <Route path="/kids" element={<ModuleGuard moduleSlug="kids"><Suspense fallback={<Loading />}><PainelKids /></Suspense></ModuleGuard>} />
        <Route path="/ami" element={<ModuleGuard moduleSlug="ami"><Suspense fallback={<Loading />}><PainelAmi /></Suspense></ModuleGuard>} />
        <Route path="/bridge" element={<ModuleGuard moduleSlug="bridge"><Suspense fallback={<Loading />}><PainelBridge /></Suspense></ModuleGuard>} />
        {






                                                    }
        <Route path="/marketing" element={<ModuleGuard moduleSlug="marketing" nivelMinimo={1}><Suspense fallback={<Loading />}><MarketingInicio /></Suspense></ModuleGuard>} />
        <Route path="/marketing/kanban" element={<Navigate to="/marketing/demandas" replace />} />
        <Route path="/marketing/demandas" element={<ModuleGuard moduleSlug="marketing" nivelMinimo={1}><Suspense fallback={<Loading />}><MarketingLinhaDoTempo /></Suspense></ModuleGuard>} />
        <Route path="/marketing/linha-do-tempo" element={<Navigate to="/marketing/demandas" replace />} />
        <Route path="/marketing/dashboard" element={<ModuleGuard moduleSlug="marketing" nivelMinimo={1}><Suspense fallback={<Loading />}><MarketingAnalytics /></Suspense></ModuleGuard>} />
        <Route path="/marketing/calendario" element={<ModuleGuard moduleSlug="marketing" nivelMinimo={1}><Suspense fallback={<Loading />}><MarketingCalendario /></Suspense></ModuleGuard>} />
        {                                                                                      }
        <Route path="/marketing/planner" element={<Navigate to="/marketing/demandas?modo=pessoa" replace />} />
        {                                                                                  }
        <Route path="/marketing/admin" element={<Navigate to="/marketing/demandas?configurar=equipe" replace />} />
        {                                                                      }
        <Route path="/marketing/analytics" element={<Navigate to="/marketing/dashboard" replace />} />
        {

                                                                            }
        <Route path="/marketing/app" element={<ModuleGuard moduleSlug="marketing" nivelMinimo={1}><Suspense fallback={<Loading />}><MarketingApp /></Suspense></ModuleGuard>} />
        <Route path="/marketing/comunicados" element={<Navigate to="/marketing/app" replace />} />
        <Route path="/marketing/campanhas" element={<ModuleGuard moduleSlug="marketing" nivelMinimo={1}><Suspense fallback={<Loading />}><MarketingCampanhas /></Suspense></ModuleGuard>} />
        {                                                                                              }
        <Route path="/marketing/arquivos" element={<ModuleGuard anyOf={['marketing', 'eventos']} nivelMinimo={1}><Suspense fallback={<Loading />}><MarketingArquivos /></Suspense></ModuleGuard>} />
        {                                                                                            }
        <Route path="/marketing/generosidade" element={<Navigate to="/marketing/campanhas?t=generosidade" replace />} />
        <Route path="/marketing/fila" element={<Navigate to="/marketing/demandas" replace />} />
        <Route path="/marketing/ciclo-criativo" element={<Navigate to="/marketing/demandas" replace />} />
        <Route path="/marketing/triagem" element={<Navigate to="/marketing/demandas" replace />} />
        {                                                           }
        <Route path="/ministerial/online" element={<Navigate to="/online" replace />} />
        <Route path="/ministerial/ami" element={<Navigate to="/ami" replace />} />
        <Route path="/ministerial/bridge" element={<Navigate to="/bridge" replace />} />
        <Route path="/ministerial/next" element={<Navigate to="/ministerial/integracao?tab=next" replace />} />
        <Route path="/ministerial/batismos" element={<Navigate to="/ministerial/integracao?tab=batismos" replace />} />
        <Route path="/assistente-ia" element={<SuperAdminGuard><Suspense fallback={<Loading />}><AssistenteIA /></Suspense></SuperAdminGuard>} />
        <Route path="/solicitacoes" element={<Suspense fallback={<Loading />}><Solicitacoes /></Suspense>} />
        {                                                                     }
        <Route path="/kpis" element={<Navigate to="/painel" replace />} />
        <Route path="/kpis/guia" element={<Navigate to="/painel" replace />} />
        <Route path="/painel-kpis" element={<Navigate to="/painel" replace />} />
        <Route path="/admin/cultura" element={<Navigate to="/painel" replace />} />
        <Route path="/meus-kpis" element={<Navigate to="/painel" replace />} />
        <Route path="/painel" element={<Suspense fallback={<Loading />}><Painel /></Suspense>} />
        <Route path="/painel/kpi/:id" element={<Navigate to="/painel" replace />} />
        <Route path="/painel/nsm/pessoas" element={<Suspense fallback={<Loading />}><PainelNsmPessoas /></Suspense>} />
        <Route path="/jornada" element={<Suspense fallback={<Loading />}><PainelJornada /></Suspense>} />
        <Route path="/admin/notificacao-regras" element={<Suspense fallback={<Loading />}><NotificacaoRegras /></Suspense>} />
        <Route path="/admin/destaques" element={<Navigate to="/marketing/app?t=destaques" replace />} />
        <Route path="/admin/fotos-batismo" element={<Navigate to="/marketing/app?t=batismo" replace />} />
        <Route path="/admin/cruzamentos" element={<Suspense fallback={<Loading />}><CruzamentosPessoas /></Suspense>} />
        <Route path="/admin/solicitacoes-responsaveis" element={<Suspense fallback={<Loading />}><SolicitacoesResponsaveis /></Suspense>} />
        <Route path="/admin/solicitacoes-fluxo" element={<Suspense fallback={<Loading />}><SolicitacoesFluxo /></Suspense>} />
        <Route path="/admin/permissoes" element={<Suspense fallback={<Loading />}><PermissoesAdmin /></Suspense>} />
        <Route path="/admin/feedback" element={<SuperAdminGuard><Suspense fallback={<Loading />}><FeedbackAdmin /></Suspense></SuperAdminGuard>} />
        <Route path="/admin/app-analytics" element={<SuperAdminGuard><Suspense fallback={<Loading />}><AppAnalytics /></Suspense></SuperAdminGuard>} />
        <Route path="/sistema" element={<SuperAdminGuard><Suspense fallback={<Loading />}><Sistema /></Suspense></SuperAdminGuard>} />
        {                                                  }
        <Route path="/admin/whatsapp" element={<RedirectComunicacao tab="bot" />} />
        {                                                                                          }
        <Route path="/admin/apresentacoes" element={<Navigate to="/dashboard" replace />} />
        <Route path="/admin/apresentacoes/*" element={<Navigate to="/dashboard" replace />} />
        <Route path="/admin/usuarios" element={<Navigate to="/admin/permissoes?aba=usuarios" replace />} />
        <Route path="/admin/kpi-areas" element={<Navigate to="/admin/permissoes" replace />} />
        <Route path="/permissoes" element={<Navigate to="/admin/permissoes" replace />} />
        <Route path="/ritual" element={<Suspense fallback={<Loading />}><Ritual /></Suspense>} />
        <Route path="/gestao" element={<Suspense fallback={<Loading />}><Gestao /></Suspense>} />
        {                                                                                                              }
        <Route path="/minha-area" element={<Navigate to="/painel" replace />} />
        <Route path="/dados-brutos" element={<Suspense fallback={<Loading />}><DadosBrutos /></Suspense>} />
        <Route path="/dashboard-semanal" element={<Suspense fallback={<Loading />}><DashboardSemanal /></Suspense>} />
        <Route path="/monitoramento-okr" element={<Suspense fallback={<Loading />}><MonitoramentoOkr /></Suspense>} />
        <Route path="/ata-semanal" element={<Suspense fallback={<Loading />}><AtaSemanal /></Suspense>} />
        <Route path="/admin/estrutura-okr" element={<Navigate to="/gestao?aba=estrutura" replace />} />
        <Route path="/admin/grupos/qrcode-inscricao" element={<Suspense fallback={<Loading />}><InscricaoGruposQRCode /></Suspense>} />
        <Route path="/admin/grupos/geocode" element={<Suspense fallback={<Loading />}><GruposGeocode /></Suspense>} />
        <Route path="/admin/grupos/temporadas" element={<Suspense fallback={<Loading />}><TemporadasGrupos /></Suspense>} />
        <Route path="/ministerial/*" element={<PlaceholderPage title="Ministerial" />} />
        <Route path="/criativo/*" element={<PlaceholderPage title="Criativo" />} />

        <Route path="*" element={<Suspense fallback={<Loading />}><NotFound /></Suspense>} />
      </Route>

      <Route path="/" element={<DefaultRedirect />} />
    </Routes>
  );
}



const SITE_PUBLICO_HOSTS = ['cbrio.com.br', 'www.cbrio.com.br'];
function isSitePublicoHost() {
  return typeof window !== 'undefined' && SITE_PUBLICO_HOSTS.includes(window.location.hostname);
}

function SitePublicoRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Suspense fallback={<Loading />}><NovoSite /></Suspense>} />
      <Route path="/quem-somos" element={<Suspense fallback={<Loading />}><QuemSomos /></Suspense>} />
      <Route path="/series" element={<Suspense fallback={<Loading />}><SeriesLista /></Suspense>} />
      <Route path="/series/:slug" element={<Suspense fallback={<Loading />}><SerieDetalhe /></Suspense>} />
      {                                                      }
      <Route path="/novosite" element={<Navigate to="/" replace />} />
      <Route path="/novosite/quem-somos" element={<Navigate to="/quem-somos" replace />} />
      <Route path="/suporte" element={<Suspense fallback={<Loading />}><Suporte /></Suspense>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}











const INTERVALO_CHECAGEM_VERSAO_MS = 5 * 60_000;
const SILENCIO_APOS_ADIAR_MS = 30 * 60_000;

function AvisoNovaVersao() {
  const [disponivel, setDisponivel] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const silenciadoAte = useRef(0);
  const jaAvisou = useRef(false);

  useEffect(() => {
    let cancelado = false;

    const checar = async () => {
      if (cancelado || jaAvisou.current) return;
      if (document.visibilityState !== 'visible') return;
      if (Date.now() < silenciadoAte.current) return;



      if (getAppUpdateRetryCount() > 0) return;

      const temNova = await hasNewAppVersion();
      if (cancelado || !temNova) return;
      jaAvisou.current = true;
      setDisponivel(true);
    };

    const intervalo = window.setInterval(() => { void checar(); }, INTERVALO_CHECAGEM_VERSAO_MS);
    const aoReaparecer = () => { void checar(); };
    document.addEventListener('visibilitychange', aoReaparecer);
    window.addEventListener('pageshow', aoReaparecer);

    return () => {
      cancelado = true;
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', aoReaparecer);
      window.removeEventListener('pageshow', aoReaparecer);
    };
  }, []);

  if (!disponivel) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 9999,
        maxWidth: 'calc(100vw - 32px)', width: 340,
        background: '#1f2937', color: '#fff', borderRadius: 12,
        padding: '14px 16px', boxShadow: '0 10px 30px rgba(0,0,0,.28)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600 }}>Nova versão do sistema disponível</div>
      <div style={{ fontSize: 13, color: '#d1d5db', lineHeight: 1.45 }}>
        Atualize quando puder. Se ficar na versão antiga, alguma tela pode falhar ao abrir.
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={() => {
            silenciadoAte.current = Date.now() + SILENCIO_APOS_ADIAR_MS;
            jaAvisou.current = false;
            setDisponivel(false);
          }}
          style={{ padding: '7px 14px', borderRadius: 8, background: 'transparent', color: '#d1d5db', border: '1px solid #4b5563', cursor: 'pointer', fontSize: 13 }}
        >
          Agora não
        </button>
        <button
          disabled={atualizando}
          onClick={() => {
            setAtualizando(true);
            void reloadForAppUpdate({ resetRetries: true });
          }}
          style={{ padding: '7px 16px', borderRadius: 8, background: '#00B39D', color: '#fff', border: 'none', cursor: atualizando ? 'wait' : 'pointer', opacity: atualizando ? 0.75 : 1, fontSize: 13, fontWeight: 600 }}
        >
          {atualizando ? 'Atualizando…' : 'Atualizar agora'}
        </button>
      </div>
    </div>
  );
}

export default function App() {









  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const hasUpdate = await hasNewAppVersion();
      if (!cancelled && hasUpdate && getAppUpdateRetryCount() < MAX_APP_UPDATE_RETRIES) {
        void hardReload();
      }
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);




  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has(APP_UPDATE_RETRY_PARAM) || url.searchParams.has(APP_UPDATE_CACHE_BUSTER_PARAM)) {
          url.searchParams.delete(APP_UPDATE_RETRY_PARAM);
          url.searchParams.delete(APP_UPDATE_RETRY_STARTED_PARAM);
          url.searchParams.delete(APP_UPDATE_CACHE_BUSTER_PARAM);
          window.history.replaceState(null, '', url.pathname + url.search + url.hash);
        }
      } catch {              }
    }, APP_UPDATE_RETRY_WINDOW_MS);
    return () => clearTimeout(t);
  }, []);
  if (isSitePublicoHost()) {
    return (
      <ErrorBoundary>
        <BrowserRouter>
          <SitePublicoRoutes />
        </BrowserRouter>
      </ErrorBoundary>
    );
  }
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <BrowserRouter>
              <TutorialProvider>
                <AppRoutes />
                <AvisoNovaVersao />
                <Toaster position="top-right" richColors />
              </TutorialProvider>
            </BrowserRouter>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

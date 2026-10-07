import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, AlertTriangle, Loader2, Minus, Plus, RefreshCw, Settings, X, GanttChart, Users, Moon, Sun } from 'lucide-react';
import { toast } from 'sonner';
import { marketingLinha } from '../../api';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { PortalContainerContext } from '@/hooks/useFullscreenContainer';
import { useCanvasPanZoom } from './linha/useCanvasPanZoom';
import { G, QUADROS, laneY, montarLayout, orth, ramo, ddmm, mesDe, enquadramentoInicial, semanaNoPonto, AREA_DA_FRENTE, quadroPorKey, quadroDaFrente } from './linha/layout';
import { BlocosFrentes, NotaPerfil, BlocoSerie, BlocoSub, LegendaQuadro } from './linha/QuadroFrentes';
import CartaoTarefa from './linha/CartaoTarefa';
import CartaoEtapa from './linha/CartaoEtapa';
import ModalTarefa from './linha/ModalTarefa';
import PlanejamentoPostagens from './linha/PlanejamentoPostagens';
import EditorTarefa from './linha/EditorTarefa';
import ModalSolicitacao from './linha/ModalSolicitacao';
import PainelFrente from './linha/PainelFrente';
import CargaPessoas from './linha/CargaPessoas';
import MenuSemana from './linha/MenuSemana';
import { idDaSerie } from './linha/reguaPainelFrente';
import { lerTemaDemandas, gravarTemaDemandas, capturarTemaSistema, aplicarTemaDemandas, restaurarTemaSistema } from './linha/temaDemandas';
import './linha/linha.css';



const ConfigurarMarketing = lazy(() => import('./ConfigurarMarketing'));











function indexarTarefas(dados) {
  const m = new Map();
  if (!dados) return m;
  for (const s of dados.frentes?.ins?.series || []) {
    for (const e of s.etapas || []) for (const t of e.faixas || []) m.set(String(t.id), t);
  }
  for (const k of ['sis', 'rot', 'red', 'prd']) {
    for (const t of dados.frentes?.[k]?.tarefas || []) m.set(String(t.id), t);
  }
  return m;
}

function Cabecalhos({ layout, CH }) {
  let mesAnterior = null;
  return layout.colunas.map((c) => {
    const mes = c.antes ? '' : mesDe(c.inicio);
    const mostraMes = mes && mes !== mesAnterior ? mes : '';
    if (mes) mesAnterior = mes;
    const cls = c.atrasada ? 'late' : c.atual ? 'now' : '';
    return (
      <div key={`c-${c.n}`}>
        {(c.atrasada || c.atual) && (
          <div className={`ml-abs ml-band ${c.atrasada ? 'late' : 'now'}`}
            style={{ left: c.x + 4, top: G.HY - 16, width: G.COLW - 8, height: CH - G.HY + 6 }} />
        )}
        <div className="ml-abs ml-vdiv" style={{ left: c.x, top: G.HY - 16, height: CH - G.HY + 6 }} />
        <div className={`ml-abs ml-colhead ${cls}`} style={{ left: c.x + G.SPX, top: G.HY }}>
          <i className="mo" style={{ fontStyle: 'normal' }}>{mostraMes}</i>
          <b>{c.antes ? 'Antes do ano' : `Semana ${c.n}`}</b>
          <span>{c.antes ? 'pendências antigas' : `${ddmm(c.inicio)} – ${ddmm(c.fim)}`}</span>
          {c.atual ? <em>Esta semana</em> : c.atrasada ? <em>Atrasada</em> : null}
        </div>
      </div>
    );
  });
}

function Arestas({ layout, aberta, CW, CH }) {
  const quadro = quadroPorKey(aberta);
  if (!quadro || !layout.grupos.length) return null;


  const corDo = (g) => `l-${g.sub || (g.serie ? 'ins' : quadro.frentes[0])}`;
  const cols = layout.colunas;
  const xEnd = (cols.length ? cols[cols.length - 1].x + G.COLW : G.BX + G.BW + 200) - 20;
  const idxFut = cols.findIndex(c => c.futura);
  const splitX = idxFut < 0 ? xEnd : cols[idxFut].x + G.SPX;
  const multi = !!layout.multi;
  const yLane = laneY(layout.li);
  const partes = [];
  layout.grupos.forEach((g) => {
    const lc = corDo(g);
    if (multi) partes.push(<path key={`sp-${g.gi}`} className={`${lc} spine`} d={orth(G.BX + G.BW, yLane, G.SBX, g.yc, G.BX + G.BW + 34)} />);
    const ate = Math.min(splitX, xEnd);
    if (ate > g.x0) partes.push(<path key={`h-${g.gi}`} className={`${lc} spine`} d={`M${g.x0},${g.yc} L${ate},${g.yc}`} />);
    if (splitX < xEnd) partes.push(<path key={`f-${g.gi}`} className={`${lc} spine fut`} d={`M${Math.max(splitX, g.x0)},${g.yc} L${xEnd},${g.yc}`} />);
  });
  layout.nos.forEach((n) => {
    const g = layout.grupos[n.gi];
    const sx = cols[n.ci].x + G.SPX;
    partes.push(<path key={`b-${n.key}`} className={`${corDo(g)} br ${n.fut ? 'fut' : ''}`} d={ramo(sx, g.yc, n.x, n.y + 30)} />);
  });
  layout.grupos.forEach((g) => {
    const lc = corDo(g);
    cols.forEach((c, i) => {
      const cls = c.futura ? 'fut' : c.atrasada && g.colsComNo.has(i) ? 'late' : '';
      partes.push(<circle key={`o-${g.gi}-${c.n}`} className={`${lc} ${cls}`} cx={c.x + G.SPX} cy={g.yc} r={c.atual ? 7 : 5} />);
    });
  });
  return <svg className="ml-edges" width={CW} height={CH}>{partes}</svg>;
}

export default function MarketingLinhaDoTempo() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [aberta, setAberta] = useState(null);


  const [esconder, setEsconder] = useState(true);
  const [tarefaId, setTarefaId] = useState(null);

  const [planejamento, setPlanejamento] = useState(null);
  const [editor, setEditor] = useState(null);
  const [solicitacaoId, setSolicitacaoId] = useState(null);


  const [painel, setPainel] = useState(null);

  const [configurar, setConfigurar] = useState(null);

  const [areaRotina, setAreaRotina] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();





  const [modo, setModo] = useState(() => (searchParams.get('modo') === 'pessoa' ? 'pessoa' : 'demanda'));



  const [raizEl, setRaizEl] = useState(null);


  const [verComo, setVerComo] = useState('');
  const iniciadoAno = useRef(null);


  const seqCarga = useRef(0);
  const navigate = useNavigate();




  const [tema, setTema] = useState(() => lerTemaDemandas(typeof window !== 'undefined' ? window.localStorage : null));
  const escuro = tema === 'escuro';
  useLayoutEffect(() => {
    const html = document.documentElement;
    const salvo = capturarTemaSistema(html, document.body);
    document.body.style.overflow = 'hidden';
    return () => restaurarTemaSistema(html, document.body, salvo);
  }, []);

  useLayoutEffect(() => { aplicarTemaDemandas(document.documentElement, tema); }, [tema]);
  const alternarTema = () => {
    const novo = escuro ? 'claro' : 'escuro';
    setTema(novo);
    gravarTemaDemandas(typeof window !== 'undefined' ? window.localStorage : null, novo);
  };

  const carregar = useCallback(async (silencioso = false) => {
    const minha = ++seqCarga.current;
    if (!silencioso) setCarregando(true);
    try {
      const r = await marketingLinha.get(ano, verComo || undefined);
      if (minha !== seqCarga.current) return;
      setDados(r);
      setErro(null);
    } catch (e) {
      if (minha !== seqCarga.current) return;
      if (verComo) {



        toast.error(`Não foi possível ver como esta pessoa: ${e?.message || 'erro'}`);
        setVerComo('');
        return;
      }


      if (silencioso) toast.error(`Não foi possível atualizar: ${e?.message || 'erro'}`);
      else { setErro(e?.message || 'Erro ao carregar'); setDados(null); }
    } finally {
      if (!silencioso && minha === seqCarga.current) setCarregando(false);
    }
  }, [ano, verComo]);

  useEffect(() => { carregar(); }, [carregar]);



  useEffect(() => {
    const pedido = searchParams.get('configurar');
    if (!pedido || !dados) return;
    if (dados.perfil?.lider && !dados.perfil?.ver_como) setConfigurar(pedido);
    else toast.info('Só o líder do Marketing configura a equipe, a rotina e a matriz.');
    const sp = new URLSearchParams(searchParams);
    sp.delete('configurar');
    setSearchParams(sp, { replace: true });
  }, [searchParams, setSearchParams, dados]);

  const trocarModo = useCallback((m) => {
    setModo(m);
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev);
      if (m === 'pessoa') sp.set('modo', m); else sp.delete('modo');
      return sp;
    }, { replace: true });
  }, [setSearchParams]);



  useEffect(() => {
    if (!dados || modo !== 'pessoa') return;
    if (dados.perfil?.lider && !dados.perfil?.ver_como) return;
    if (!dados.perfil?.ver_como) toast.info('A carga por pessoa é só do líder do Marketing.');
    trocarModo('demanda');
  }, [dados, modo, trocarModo]);

  const lider = !!dados?.perfil?.lider;
  const avisos = dados?.avisos || [];


  const podeVerComo = !!dados?.perfil?.pode_ver_como;
  const opcoesVerComo = dados?.perfil?.ver_como_opcoes || [];
  const vendoComo = dados?.perfil?.ver_como || null;
  const porPessoa = modo === 'pessoa' && lider && !vendoComo;
  const podePorPessoa = lider && !vendoComo;



  const podeCriarNaSemana = lider && !vendoComo && !porPessoa;
  const [menuSemana, setMenuSemana] = useState(null);
  const fecharMenuSemana = useCallback(() => setMenuSemana(null), []);

  const pz = useCanvasPanZoom(!!dados, { toqueLongo: podeCriarNaSemana });
  const layout = useMemo(() => (dados ? montarLayout(dados, aberta, esconder) : null), [dados, aberta, esconder]);
  const tarefas = useMemo(() => indexarTarefas(dados), [dados]);
  const tarefaAberta = tarefaId ? tarefas.get(String(tarefaId)) : null;



  const { viewportRef, setView } = pz;
  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (!dados || !vp) return;
    if (iniciadoAno.current === dados.ano) return;
    iniciadoAno.current = dados.ano;
    setView(enquadramentoInicial(vp.clientWidth, vp.clientHeight, QUADROS.length));
  }, [dados, viewportRef, setView]);




  const abrirTarefa = (t) => {




    if (t.solicitacao_id && !vendoComo) { setSolicitacaoId(t.solicitacao_id); return; }
    if (t.tipo_rotina === 'planejamento_postagens' && t.mes_planejado) { setPlanejamento(t.mes_planejado); return; }
    if (t.tipo !== 'pedido') { setTarefaId(t.id); return; }
    const alocavel = t.pedido_status === 'aguardando_alocacao' || t.pedido_status === 'sem_tarefa';
    if (alocavel && t.campanha_id && dados?.perfil?.lider) {
      setEditor({ modo: 'alocar', pendente: { ...t, id: t.campanha_id } });
    } else if (t.pedido_status === 'aguardando_aprovacao') {
      toast.info('Esta solicitação ainda espera a aprovação do diretor da área de quem pediu.');
    } else {
      toast.info('Só o líder do Marketing aloca este pedido.');
    }
  };

  const aoMenuDoQuadro = (e) => {
    if (!podeCriarNaSemana || !layout) return;
    if (e.target?.closest?.('input, textarea, select, [data-no-pan]')) return;
    const semana = semanaNoPonto(layout, pz.paraCanvas(e.clientX, e.clientY));
    if (!semana) return;
    e.preventDefault();
    setMenuSemana({ semana, x: e.clientX, y: e.clientY });
  };
  const novaTarefaNaSemana = (semana) => {
    setPainel(null);


    setEditor({ modo: 'nova', semana: { n: semana.n, inicio: semana.inicio, fim: semana.fim }, area: aberta === 'redes' ? 'redes' : null });
  };





  const clicarQuadro = (key) => {
    const q = quadroPorKey(key);
    if (!q) return;
    const doQuadro = !!painel && q.frentes.includes(painel.frente);
    if (aberta === key && doQuadro && !painel.serieId) {
      setAberta(null);
      setPainel(null);
      return;
    }
    setAberta(key);
    setPainel({ frente: aberta === key && doQuadro ? painel.frente : q.frentes[0], serieId: null });
  };
  const abrirSerie = (serieId) => {
    setAberta('cal');
    setPainel({ frente: 'ins', serieId });
  };

  const abrirSub = (fk) => {
    const q = quadroDaFrente(fk);
    if (q) setAberta(q.key);
    setPainel({ frente: fk, serieId: null });
  };

  const botaoModo = (ativo) => `flex h-7 items-center gap-1 rounded px-2 text-sm font-medium ${ativo ? 'bg-[#00B39D] text-white dark:bg-[hsl(var(--lab-azul,243_98%_49%))]' : 'text-muted-foreground hover:text-foreground'}`;



  const verPessoa = (id) => {
    setTarefaId(null);
    setSolicitacaoId(null);
    setEditor(null);
    setPainel(null);
    trocarModo('demanda');
    if (opcoesVerComo.some(o => o.id === id)) setVerComo(id);
  };

  return createPortal(
    <PortalContainerContext.Provider value={raizEl}>
    <div ref={setRaizEl} className={`mkt-linha fixed inset-0 z-[900] flex flex-col text-foreground ${escuro ? 'bg-background' : 'bg-white'}`} role="dialog" aria-label="Demandas do Marketing">
      {

                                                                      }
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border pl-3 pr-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1">
          <select
            aria-label="Ano"
            title="Ano"
            className="h-8 shrink-0 rounded-md border border-input bg-background px-2 text-sm font-semibold text-foreground"
            value={ano}
            onChange={(e) => { setAberta(null); setPainel(null); setMenuSemana(null); setSolicitacaoId(null); setAno(Number(e.target.value)); }}
          >
            {[anoAtual, anoAtual + 1].map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          {dados && layout && (
            <>
              {
                                                                      }
              <div className="flex shrink-0 items-center rounded-md border border-input p-0.5" role="group" aria-label="Modo de visualização">
                <button type="button" aria-pressed={!porPessoa} className={botaoModo(!porPessoa)}
                  onClick={() => trocarModo('demanda')} title="As demandas das frentes na linha do tempo">
                  <GanttChart className="h-4 w-4" /><span className="hidden sm:inline">Por demanda</span>
                </button>
                {podePorPessoa && (
                  <button type="button" aria-pressed={porPessoa} className={botaoModo(porPessoa)}
                    onClick={() => { setPainel(null); trocarModo('pessoa'); }} title="Quantas tarefas e quantas horas cada pessoa tem por semana">
                    <Users className="h-4 w-4" /><span className="hidden sm:inline">Por pessoa</span>
                  </button>
                )}
              </div>
              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
              {

                                                     }
              {lider && !vendoComo && (
                <Button size="sm" variant="outline" className="h-8 shrink-0 px-2.5" onClick={() => setConfigurar('equipe')}
                  title="Configurar a equipe, a rotina, as férias, a matriz do ciclo e os tipos de entrega">
                  <Settings className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Configurar</span>
                </Button>
              )}
              {
                                                              }
              <div className={`${porPessoa ? 'hidden' : 'flex'} shrink-0 items-center gap-1`}>
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => pz.zoomStep(1 / 1.2)} aria-label="Diminuir zoom"><Minus className="h-4 w-4" /></Button>
                <span ref={pz.labelRef} className="w-11 text-center text-xs tabular-nums text-muted-foreground">100%</span>
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => pz.zoomStep(1.2)} aria-label="Aumentar zoom"><Plus className="h-4 w-4" /></Button>
              </div>
              {!porPessoa && (
                <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm text-muted-foreground">
                  <input type="checkbox" className="h-4 w-4 accent-[#00B39D] dark:accent-[hsl(var(--lab-azul,243_98%_49%))]" checked={esconder} onChange={(e) => setEsconder(e.target.checked)} />
                  Esconder semanas concluídas
                </label>
              )}
              {
                                                                                              }
              {podeVerComo && opcoesVerComo.length > 0 && (
                <label className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground" title="Ver o quadro como outra pessoa da equipe vê">
                  <span>Visão</span>
                  <select
                    aria-label="Ver a linha do tempo como"
                    className={`h-8 rounded-md border px-2 text-sm font-medium ${vendoComo
                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-800 dark:text-amber-200'
                      : 'border-input bg-background text-foreground'}`}
                    value={verComo}
                    onChange={(e) => { setTarefaId(null); setSolicitacaoId(null); setEditor(null); if (e.target.value && modo === 'pessoa') trocarModo('demanda'); setVerComo(e.target.value); }}
                  >
                    <option value="">Minha visão</option>
                    {opcoesVerComo.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
                  </select>
                  {carregando && <Loader2 className="h-4 w-4 animate-spin" aria-label="Carregando" />}
                </label>
              )}
              {dados.sem_data > 0 && (
                <span className="shrink-0 whitespace-nowrap rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-700 dark:text-amber-300"
                  title="Tarefas sem prazo definido não têm semana na linha do tempo">
                  {dados.sem_data} sem data
                </span>
              )}
              {
                                                                                             }
              {avisos.length > 0 && (
                <button
                  type="button"
                  className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs text-amber-700 dark:text-amber-300"
                  title={avisos.join('\n')}
                  onClick={() => avisos.forEach(a => toast.warning(a))}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {avisos.length === 1 ? '1 aviso' : `${avisos.length} avisos`}
                </button>
              )}
            </>
          )}
        </div>
        {
                                                              }
        <Button size="sm" variant="outline" className="h-8 shrink-0 px-2.5" onClick={alternarTema}
          aria-pressed={escuro} aria-label={escuro ? 'Voltar ao tema claro' : 'Usar o tema escuro'}
          title={escuro ? 'Voltar ao tema claro' : 'Usar o tema escuro (cores do Lab22)'}>
          {escuro ? <Sun className="h-4 w-4 sm:mr-1" /> : <Moon className="h-4 w-4 sm:mr-1" />}
          <span className="hidden sm:inline">{escuro ? 'Claro' : 'Escuro'}</span>
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => navigate('/marketing')} aria-label="Fechar demandas" title="Fechar">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="relative flex-1 min-h-0">
        {carregando && !dados && (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        )}

        {!carregando && erro && !dados && (
          <div className="p-3">
            <Card className="p-4 border-destructive/50 bg-destructive/10">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                <div className="space-y-2">
                  <p className="font-medium text-destructive">Não foi possível carregar a linha do tempo.</p>
                  <p className="text-sm text-muted-foreground">{erro}</p>
                  <Button size="sm" variant="outline" onClick={() => carregar()}><RefreshCw className="h-4 w-4 mr-1" /> Tentar de novo</Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {dados && layout && (
          <div className="mkt-linha absolute inset-0">
            <div ref={pz.viewportRef} className="ml-viewport h-full w-full" onContextMenu={aoMenuDoQuadro}>
              <div ref={pz.canvasRef} className="ml-canvas" style={{ width: layout.CW, height: layout.CH }}>
                <Arestas layout={layout} aberta={aberta} CW={layout.CW} CH={layout.CH} />
                <LegendaQuadro />
                <Cabecalhos layout={layout} CH={layout.CH} />
                <BlocosFrentes dados={dados} aberta={aberta} onToggle={clicarQuadro} />
                <NotaPerfil dados={dados} />
                {layout.multi && layout.grupos.map(g => (g.sub ? (
                  <BlocoSub
                    key={`b-${g.gi}`}
                    grupo={g}
                    dados={dados}
                    onAbrir={abrirSub}
                    selecionada={painel?.frente === g.sub}
                  />
                ) : g.serie ? (
                  <BlocoSerie
                    key={`s-${g.gi}`}
                    grupo={g}
                    semanaAtual={layout.semanaAtual}
                    onAbrir={abrirSerie}
                    selecionada={painel?.frente === 'ins' && painel?.serieId === idDaSerie(g.serie)}
                  />
                ) : null))}
                {layout.notaSemSeries && (
                  <div className="ml-abs ml-note" style={{ left: layout.notaSemSeries.x, top: layout.notaSemSeries.y, width: G.SBW }}>
                    Nenhuma série com ciclo criativo neste ano.
                  </div>
                )}
                {aberta && layout.nos.length === 0 && (
                  <div className="ml-abs ml-note" style={{ left: layout.X0 + G.NX, top: laneY(layout.li) - 30, width: 260 }}>
                    Nenhuma pendência nem previsão nas semanas mostradas para {QUADROS[layout.li]?.nome}.
                  </div>
                )}
                {layout.nos.map(no => (no.tipo === 'etapa'
                  ? <CartaoEtapa key={no.key} no={no} semanaAtual={layout.semanaAtual} membros={dados.membros} onAbrir={(t) => setTarefaId(t.id)} />
                  : <CartaoTarefa key={no.key} no={no} membros={dados.membros} onAbrir={abrirTarefa} />
                ))}
              </div>
              <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 rounded-full border border-border bg-card/90 px-3 py-1 text-[11px] text-muted-foreground md:block">
                {podeCriarNaSemana
                  ? 'Arraste para mover · role para aproximar · clique num quadrado para ver as demandas · botão direito numa semana para criar tarefa'
                  : 'Arraste para mover · role para aproximar · clique num quadrado para ver as demandas'}
              </div>
            </div>
          </div>
        )}

        {
                                                                               }
        {dados && porPessoa && (
          <CargaPessoas dados={dados} onVerPessoa={verPessoa} />
        )}

        {dados && painel && !porPessoa && (
          <PainelFrente
            key={painel.frente}
            dados={dados}
            frente={painel.frente}
            serieId={painel.serieId}
            somenteLeitura={!!vendoComo}
            onFechar={() => setPainel(null)}
            onTrocarSerie={(id) => setPainel({ frente: 'ins', serieId: id })}
            onAbrirTarefa={abrirTarefa}
            onEditar={(t) => setEditor({ modo: 'editar', tarefa: t })}
            onNovaTarefa={() => setEditor({ modo: 'nova', area: painel.frente === 'prd' ? 'redes' : null })}
            onTrocarFrente={(fk) => setPainel({ frente: fk, serieId: null })}
            onGerenciarRotina={(f) => { setAreaRotina(AREA_DA_FRENTE[f] || null); setConfigurar('rotina'); }}
          />
        )}
      </div>

      {menuSemana && podeCriarNaSemana && (
        <MenuSemana
          semana={menuSemana.semana}
          x={menuSemana.x}
          y={menuSemana.y}
          onNovaTarefa={novaTarefaNaSemana}
          onFechar={fecharMenuSemana}
        />
      )}

      {solicitacaoId && dados && (
        <ModalSolicitacao
          key={solicitacaoId}
          solicitacaoId={solicitacaoId}
          dados={dados}
          onClose={() => setSolicitacaoId(null)}
          onChanged={() => carregar(true)}
          onAlocar={(pendente) => {


            const doQuadro = [...tarefas.values()].find(x => x.tipo === 'pedido' && x.solicitacao_id === solicitacaoId);
            const voltar = solicitacaoId;
            setSolicitacaoId(null);
            setEditor({ modo: 'alocar', pendente: doQuadro ? { ...doQuadro, id: doQuadro.campanha_id } : pendente, voltarSolicitacao: voltar });
          }}
          onEditar={lider ? (tarefa) => {
            const voltar = solicitacaoId;
            setSolicitacaoId(null);
            setEditor({ modo: 'editar', tarefa: tarefas.get(String(tarefa.id)) || tarefa, voltarSolicitacao: voltar });
          } : undefined}
        />
      )}

      {tarefaAberta && dados && (
        <ModalTarefa
          tarefa={tarefaAberta}
          dados={dados}
          somenteLeitura={!!vendoComo}
          onClose={() => setTarefaId(null)}
          onChanged={() => carregar(true)}
          onEditar={lider ? () => { setEditor({ modo: 'editar', tarefa: tarefaAberta }); setTarefaId(null); } : undefined}
        />
      )}

      {planejamento && dados && (
        <PlanejamentoPostagens
          mes={planejamento}
          dados={dados}
          onClose={() => setPlanejamento(null)}
          onSalvo={() => carregar(true)}
        />
      )}

      {configurar && lider && !vendoComo && (
        <Suspense fallback={null}>
          <ConfigurarMarketing
            aba={configurar}
            onAba={setConfigurar}
            areaRotina={areaRotina}
            onClose={() => { setConfigurar(null); setAreaRotina(null); carregar(true); }}
          />
        </Suspense>
      )}

      {editor && dados && (
        <EditorTarefa
          {...editor}
          dados={dados}
          onClose={() => {

            const voltar = editor.voltarSolicitacao;
            setEditor(null);
            if (voltar) setSolicitacaoId(voltar);
          }}
          onSalvo={async () => {
            toast.success(editor.modo === 'alocar' ? 'Pedido alocado' : editor.modo === 'nova' ? 'Tarefa criada' : 'Tarefa atualizada');
            const voltar = editor.voltarSolicitacao;
            setEditor(null);
            await carregar(true);
            if (voltar) setSolicitacaoId(voltar);
          }}
        />
      )}
    </div>
    </PortalContainerContext.Provider>,
    document.body,
  );
}

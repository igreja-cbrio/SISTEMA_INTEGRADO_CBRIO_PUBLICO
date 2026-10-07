












import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { censo } from '../../api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, BarChart3, Lock, Search, MessageSquareText, MapPin, IdCard, AlertTriangle, Filter, X } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import { useModoQuadroCenso } from '@/hooks/useModoQuadroCenso';
import CruzamentoPainel, { type FiltroRotulado } from './CruzamentoPainel';
import {
  alternarFiltro, campoDemografia, campoPergunta, CAMPO_MAPA, decodificarCruzamento,
  filtrarPessoas, recontarDemografia, recontarGrafico, recontarMapa, temFiltro,
  LARGURA_COLUNA_PERGUNTAS, LARGURA_QUADRO, VAO_QUADRO,
  type CruzamentoBruto, type Filtros, type PessoaCruzamento,
} from '@/lib/censoCruzamento';




const MapaBairros = lazy(() => import('../membresia/MapaBairros'));

type Valor = { valor: string; total: number; pct: number; neutra: boolean };
type Grafico = {
  tipo: string; id: string; texto: string; sensivel?: boolean;
  base?: number; neutras?: number; total?: number; media?: number | null;
  aberta?: boolean; valores?: Valor[];
  valores_ocultos?: number; valores_ocultos_pessoas?: number;
};
type Identificacao = {
  id: string; texto: string; tipo: string; desconhecido?: boolean;


  no_bloco_demografico?: boolean;
};

type FonteSexo = { declarado: number; cadastro: number; sem: number };
type Orfa = { id: string; texto: string; respostas: number };
type Mapa = {
  bairros: { bairro: string; norm: string; total: number; lat: number; lng: number }[];
  total: number; pessoas_no_mapa: number; pessoas_sem_bairro: number;
  pessoas_sem_coordenada: number; pessoas_sem_cadastro: number; pessoas_fora_da_base: number;
};
type Perfil = {
  titulo: string; respondentes: number; graficos: Grafico[];
  demografia: Record<string, { valor: string; total: number }[]>;

  demografia_ocultos?: Record<string, { valores: number; pessoas: number }>;
  sexo_fonte?: FonteSexo;

  identificacao?: Identificacao[]; orfas?: Orfa[]; leitura_incompleta?: boolean;
};




function Barras({ valores, base, selecionados, onAlternar }: {
  valores: Valor[]; base: number;

  selecionados?: string[];

  onAlternar?: (valor: string) => void;
}) {
  const maior = Math.max(1, ...valores.filter((v) => !v.neutra).map((v) => v.total));
  return (
    <div className="space-y-1.5">
      {valores.map((v) => {
        const marcada = !!selecionados?.includes(v.valor);
        const conteudo = (
          <>
            <span className={`text-xs w-40 shrink-0 truncate text-left ${v.neutra ? 'text-muted-foreground italic' : ''} ${marcada ? 'font-semibold text-primary' : ''}`}
              title={v.valor}>
              {v.valor}
            </span>
            <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
              <div className={`h-full ${v.neutra ? 'bg-muted-foreground/30' : 'bg-primary/75'}`}
                style={{ width: `${v.neutra ? (v.pct) : (v.total / maior) * 100}%` }} />
            </div>
            <span className="text-xs w-24 text-right tabular-nums text-muted-foreground">
              {v.total} · {v.pct}%
            </span>
          </>
        );
        return onAlternar ? (
          <button key={v.valor} type="button" onClick={() => onAlternar(v.valor)}
            aria-pressed={marcada}
            title={marcada ? 'Tirar do filtro' : 'Filtrar por esta resposta'}
            className={`w-full flex items-center gap-2.5 rounded px-1 -mx-1 transition-colors ${
              marcada ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted/60'}`}>
            {conteudo}
          </button>
        ) : (
          <div key={v.valor} className="flex items-center gap-2.5">{conteudo}</div>
        );
      })}
      {base > 0 && valores.some((v) => v.neutra) && (
        <p className="text-[11px] text-muted-foreground pt-1">
          Percentuais calculados sobre {base} respostas — quem marcou a opção neutra fica fora
          da base (o cinza é % do total).
        </p>
      )}
    </div>
  );
}

export default function AbaPerfil({ pesquisaId, nivel = 1 }: { pesquisaId: string | null; nivel?: number }) {
  const [d, setD] = useState<Perfil | null>(null);


  const podeCruzar = nivel >= 2;
  const [cruz, setCruz] = useState<Omit<CruzamentoBruto, 'pessoas' | 'dicionario'> | null>(null);
  const [pessoasCruz, setPessoasCruz] = useState<PessoaCruzamento[]>([]);
  const [cruzErro, setCruzErro] = useState<string | null>(null);
  const [cruzCarregando, setCruzCarregando] = useState(false);
  const [filtros, setFiltros] = useState<Filtros>({});
  const modoQuadro = useModoQuadroCenso();
  const lateral = podeCruzar && modoQuadro === 'lateral';
  const [quadroAberto, setQuadroAberto] = useState(false);


  const [mapa, setMapa] = useState<Mapa | null>(null);
  const [mapaErro, setMapaErro] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    if (!pesquisaId) return;
    setD(null); setErro(null);
    try { setD(await censo.perfil(pesquisaId)); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
  }, [pesquisaId]);
  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (!pesquisaId) return;
    let vivo = true;
    setMapa(null); setMapaErro(false);



    Promise.resolve()
      .then(() => censo.perfilMapa(pesquisaId))
      .then((r: Mapa) => { if (vivo) setMapa(r); })


      .catch(() => { if (vivo) setMapaErro(true); });
    return () => { vivo = false; };
  }, [pesquisaId]);




  useEffect(() => {
    setFiltros({});
    setCruz(null); setPessoasCruz([]); setCruzErro(null);
    if (!pesquisaId || !podeCruzar) return;
    let vivo = true;
    setCruzCarregando(true);
    Promise.resolve()
      .then(() => censo.perfilCruzamento(pesquisaId))
      .then((r: CruzamentoBruto) => {
        if (!vivo) return;
        setPessoasCruz(decodificarCruzamento(r));
        setCruz({
          sensiveis_fora: r.sensiveis_fora, generosidade_visivel: r.generosidade_visivel,
          valores_indisponiveis: r.valores_indisponiveis, valores_desde: r.valores_desde,
        });
      })
      .catch((e: unknown) => { if (vivo) setCruzErro(e instanceof Error ? e.message : 'erro'); })
      .finally(() => { if (vivo) setCruzCarregando(false); });
    return () => { vivo = false; };
  }, [pesquisaId, podeCruzar]);

  const filtroAtivo = podeCruzar && !!cruz && temFiltro(filtros);
  const filtradas = useMemo(
    () => (filtroAtivo ? filtrarPessoas(pessoasCruz, filtros) : pessoasCruz),
    [filtroAtivo, pessoasCruz, filtros],
  );


  const filtroAntes = useRef(false);
  useEffect(() => {
    if (filtroAtivo && !filtroAntes.current) setQuadroAberto(true);
    if (!filtroAtivo) setQuadroAberto(false);
    filtroAntes.current = filtroAtivo;
  }, [filtroAtivo]);
  const alternar = useCallback((campo: string, valor: string) => {
    setFiltros((f) => alternarFiltro(f, campo, valor));
  }, []);

  const graficosView = useMemo(() => {
    if (!d) return [];
    if (!filtroAtivo) return d.graficos;
    return d.graficos.map((g) => recontarGrafico(g, filtradas));
  }, [d, filtroAtivo, filtradas]);
  const demoView = useMemo(() => {
    if (!d) return { demografia: {} as Perfil['demografia'], ocultos: {} as NonNullable<Perfil['demografia_ocultos']> };
    if (!filtroAtivo) return { demografia: d.demografia, ocultos: d.demografia_ocultos || {} };
    return recontarDemografia(filtradas);
  }, [d, filtroAtivo, filtradas]);
  const mapaView = useMemo(() => {
    if (!mapa || !filtroAtivo) return mapa;
    const r = recontarMapa(mapa.bairros, filtradas);
    return { ...mapa, bairros: r.bairros, pessoas_no_mapa: r.pessoas_no_mapa };
  }, [mapa, filtroAtivo, filtradas]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return graficosView;

    return graficosView.filter((g) => g.tipo !== 'secao' && g.texto.toLowerCase().includes(t));
  }, [graficosView, busca]);

  if (!pesquisaId) {
    return <EmptyState icone={BarChart3} titulo="Escolha uma pesquisa"
      mensagem="Selecione a pesquisa acima para ver o perfil." />;
  }
  if (erro) return <p className="text-sm text-destructive py-6 text-center">{erro}</p>;
  if (!d) {
    return (
      <div className="py-10 flex items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando perfil…
      </div>
    );
  }
  if (!d.respondentes) {
    return <EmptyState icone={BarChart3} titulo="Sem respostas para agregar"
      mensagem="Os gráficos aparecem sozinhos assim que houver resposta concluída." />;
  }

  const sensivelFora = (g: Grafico) => !!(cruz?.sensiveis_fora && g.sensivel);
  const filtrosRotulados: FiltroRotulado[] = Object.entries(filtros).map(([campo, valores]) => {
    let campoLabel = campo;
    if (campo.startsWith('p:')) campoLabel = d.graficos.find((g) => g.id === campo.slice(2))?.texto || 'Pergunta';
    else if (campo.startsWith('d:')) campoLabel = ROTULO_DEMO[campo.slice(2)] || campo.slice(2);
    else if (campo === CAMPO_MAPA) campoLabel = 'Bairro (mapa)';
    return {
      campo, campoLabel,
      valores: valores.map((valor) => ({
        valor,
        label: campo === CAMPO_MAPA ? (mapa?.bairros.find((b) => b.norm === valor)?.bairro || valor) : valor,
      })),
    };
  });
  const respondentesView = filtroAtivo ? filtradas.length : d.respondentes;

  const demo: [string, string][] = [




    ['faixa_etaria', 'Faixa etária'], ['genero', 'Sexo'],
    ['estado_civil', 'Estado civil'], ['bairro', 'Bairro'], ['status_membro', 'Vínculo'],
  ];

  return (



    <div className={lateral ? 'grid items-start' : ''}
      style={lateral ? {
        gridTemplateColumns: `minmax(0, ${LARGURA_COLUNA_PERGUNTAS}px) ${LARGURA_QUADRO}px`,
        columnGap: VAO_QUADRO,
      } : undefined}>
    <div className="space-y-5 min-w-0">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{respondentesView}</span>
          {filtroAtivo ? <> de {d.respondentes} respostas · filtradas</> : <> respostas recebidas</>}
          {d.leitura_incompleta && (
            <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-500">
              <AlertTriangle className="size-3.5" /> leitura incompleta — recarregue
            </span>
          )}
        </p>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar uma pergunta" className="pl-8 h-9 text-sm" />
        </div>
      </div>

      {



                                             }
      {!busca && (mapa || mapaErro) && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <MapPin className="size-4 text-muted-foreground" /> De onde vêm
            </h3>
            {mapaErro ? (
              <p className="text-sm text-amber-600 dark:text-amber-500 flex items-center gap-1.5">
                <AlertTriangle className="size-4" />
                Não foi possível carregar o mapa. Os gráficos abaixo não dependem dele.
              </p>
            ) : mapa && mapa.bairros.length > 0 ? (
              <>
                <Suspense fallback={
                  <div className="h-[320px] grid place-items-center text-sm text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" />
                  </div>
                }>
                  {


                                                                               }
                  <MapaBairros bairros={mapaView?.bairros || []} unidade="bairro" unidadePlural="bairros"
                    selecionado={filtros[CAMPO_MAPA]?.[0] ?? null}
                    onSelecionar={podeCruzar && cruz
                      ? (norm) => {
                        if (!norm) { setFiltros((f) => { const n = { ...f }; delete n[CAMPO_MAPA]; return n; }); return; }
                        alternar(CAMPO_MAPA, norm);
                      }
                      : undefined} />
                </Suspense>
                {
                                                                        }
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  <span className="font-medium text-foreground">{mapaView?.pessoas_no_mapa ?? 0}</span> de{' '}
                  {filtroAtivo ? `${filtradas.length} do filtro` : mapa.total} no mapa, em {mapaView?.bairros.length ?? 0} bairros.
                  {!filtroAtivo && mapa.pessoas_sem_coordenada > 0 && <> {mapa.pessoas_sem_coordenada} têm bairro que ainda não tem coordenada.</>}
                  {!filtroAtivo && mapa.pessoas_sem_bairro > 0 && <> {mapa.pessoas_sem_bairro} não informaram bairro.</>}
                  {!filtroAtivo && mapa.pessoas_sem_cadastro > 0 && <> {mapa.pessoas_sem_cadastro} responderam sem cadastro ligado.</>}
                  {!filtroAtivo && mapa.pessoas_fora_da_base > 0 && <> {mapa.pessoas_fora_da_base} têm cadastro inativo.</>}
                  {podeCruzar && cruz && <> Toque num bairro para filtrar.</>}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ninguém posicionado ainda — os bairros de quem respondeu ainda não têm coordenada.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {

                                }
      {!busca && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Quem respondeu</h3>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {demo.map(([k, label]) => (
                (demoView.demografia?.[k]?.length || 0) > 0 && (
                  <div key={k}>
                    <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
                    <Barras base={respondentesView}
                      valores={(demoView.demografia[k] || []).map((v) => ({
                        ...v, neutra: false,
                        pct: respondentesView ? Math.round((v.total / respondentesView) * 1000) / 10 : 0,
                      }))}
                      selecionados={filtros[campoDemografia(k as Parameters<typeof campoDemografia>[0])]}
                      onAlternar={podeCruzar && cruz
                        ? (valor) => alternar(campoDemografia(k as Parameters<typeof campoDemografia>[0]), valor)
                        : undefined} />
                    {





                                                                               }

                    {



                                                                      }
                    {(demoView.ocultos?.[k]?.valores || 0) > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                        + {demoView.ocultos?.[k]?.valores} outros valores
                        ({demoView.ocultos?.[k]?.pessoas} pessoas) fora das barras
                      </p>
                    )}
                  </div>
                )
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {visiveis.length === 0 && (
        <EmptyState icone={Search} titulo="Nenhuma pergunta com esse texto"
          mensagem="Tente outra palavra." />
      )}

      {visiveis.map((g) => (
        g.tipo === 'secao' ? (
          <h2 key={g.id} className="text-sm font-semibold text-primary pt-3 border-b border-border pb-1.5">
            {g.texto}
          </h2>
        ) : (
          <Card key={g.id}>
            <CardContent className="p-4">
              <div className="flex items-start gap-2 mb-3 flex-wrap">
                <h3 className="text-sm font-medium flex-1 min-w-0">{g.texto}</h3>
                {g.sensivel && (
                  <Badge variant="secondary" className="bg-rose-500/15 text-rose-600 shrink-0">
                    <Lock className="size-3 mr-1" /> sensível
                  </Badge>
                )}
                {g.media !== null && g.media !== undefined && (
                  <Badge variant="secondary" className="shrink-0">média {g.media}</Badge>
                )}
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {g.base} resposta{g.base === 1 ? '' : 's'}
                </span>
              </div>

              {g.aberta && !(g.valores?.length) ? (
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <MessageSquareText className="size-3.5 mt-0.5 shrink-0" />
                  <p>
                    {g.total} resposta(s) em texto livre. Barra não diz nada sobre texto aberto —
                    a síntese está na <span className="font-medium">Leitura da IA</span>, no fim da aba Relatório.
                  </p>
                </div>
              ) : (
                <>
                  {filtroAtivo && sensivelFora(g) ? (
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <Lock className="size-3.5 mt-0.5 shrink-0" />
                      Pergunta sensível — fica fora do filtro para quem não tem acesso ao bloco sensível.
                    </p>
                  ) : (
                    <Barras valores={g.valores || []} base={g.base || 0}
                      selecionados={filtros[campoPergunta(g.id)]}
                      onAlternar={podeCruzar && cruz && !sensivelFora(g)
                        ? (valor) => alternar(campoPergunta(g.id), valor)
                        : undefined} />
                  )}
                  {(g.valores_ocultos || 0) > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      + {g.valores_ocultos} outras respostas ({g.valores_ocultos_pessoas} pessoas),
                      fora da lista para a tela continuar legível.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )
      ))}

      {



                                                                       }
      {!busca && (d.identificacao?.length || 0) > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <IdCard className="size-4 text-muted-foreground" /> Campos de identificação
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Estas perguntas foram respondidas e ficam no cadastro da pessoa. Não viram gráfico
              porque cada resposta é única — a barra seria a lista de quem respondeu.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(d.identificacao || []).map((c) => (
                <Badge key={c.id} variant="secondary" className="font-normal">
                  {c.texto}{c.desconhecido && ' · tipo novo'}
                  {c.no_bloco_demografico && ' · está em "Quem respondeu"'}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {

                                                                            }
      {!busca && (d.orfas?.length || 0) > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" /> Respostas de perguntas removidas
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Estas perguntas não estão mais no questionário, mas têm resposta guardada. Elas não
              aparecem nos gráficos acima porque a tela segue o questionário de hoje.
            </p>
            <div className="space-y-1.5">
              {(d.orfas || []).map((o) => (
                <div key={o.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-foreground truncate">{o.texto}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">{o.respostas}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    {podeCruzar && (() => {
      const painel = (
        <CruzamentoPainel carregando={cruzCarregando} erro={cruzErro}
          total={pessoasCruz.length} filtradas={filtradas} filtrando={filtroAtivo}
          filtros={filtrosRotulados} onRemover={alternar} onLimpar={() => setFiltros({})}
          generosidadeVisivel={!!cruz?.generosidade_visivel}
          valoresIndisponiveis={cruz?.valores_indisponiveis || []}
          sensiveisFora={!!cruz?.sensiveis_fora} />
      );


      if (lateral) {


        return (
          <aside className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
            {painel}
          </aside>
        );
      }
      return quadroAberto ? (
        <aside className="fixed z-40 bottom-[6.5rem] right-6 w-[min(360px,calc(100vw-3rem))] max-h-[calc(100vh-11rem)] overflow-y-auto shadow-xl rounded-[16px]">
          <div className="relative">
            <button type="button" onClick={() => setQuadroAberto(false)} aria-label="Fechar o quadro do filtro"
              className="absolute right-2 top-2 z-10 rounded-full p-1 text-muted-foreground hover:bg-muted">
              <X className="size-4" />
            </button>
            {painel}
          </div>
        </aside>
      ) : (
        <button type="button" onClick={() => setQuadroAberto(true)}
          className="fixed z-40 bottom-[6.5rem] right-6 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium shadow-lg">
          <Filter className="size-4" />
          {filtroAtivo ? `Filtro · ${filtradas.length} de ${pessoasCruz.length}` : 'Filtro e 5 valores'}
        </button>
      );
    })()}
    </div>
  );
}

const ROTULO_DEMO: Record<string, string> = {
  faixa_etaria: 'Faixa etária', genero: 'Sexo', estado_civil: 'Estado civil',
  bairro: 'Bairro', status_membro: 'Vínculo',
};

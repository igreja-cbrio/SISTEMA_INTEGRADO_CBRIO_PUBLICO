import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { marketing as api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { avisosDaBarra, seloDoEstado, estadoDaCampanha, hojeBrt } from '../../lib/campanhaBarra';
import MarketingPagina from './MarketingPagina';
import MarketingGenerosidade from './MarketingGenerosidade';
import { fmtMoeda, fmtPercentual, fmtDataBr } from './formatos';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { AlertCircle, ExternalLink, HandCoins, Info, RefreshCw, Target, Users, HeartHandshake } from 'lucide-react';




















const ABAS = [
  { key: 'campanhas', label: 'Campanhas', icon: Target },
  { key: 'generosidade', label: 'Generosidade no culto', icon: HeartHandshake },
];

const SUBTITULO = {
  campanhas: 'O resultado de cada campanha da igreja · custo, engajamento e resultado',
  generosidade: 'Percentuais oficiais para as telas do culto, atualizados pelo balanço financeiro.',
};

const FILTROS = [
  { key: 'em_curso', label: 'Em curso' },
  { key: 'encerradas', label: 'Encerradas' },
  { key: 'todas', label: 'Todas' },
];

function passaFiltro(c, filtro) {
  if (filtro === 'em_curso') return c.em_curso;
  if (filtro === 'encerradas') return !c.em_curso;
  return true;
}

function Metrica({ icon: Icon, titulo, children, emDefinicao = false }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {titulo}
        {emDefinicao && (
          <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            em definição
          </span>
        )}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}



function seloDaCampanha(campanha, hoje, emDinheiro) {
  const selo = seloDoEstado(campanha, hoje);
  return !emDinheiro && selo === 'Arrecadando' ? 'Em andamento' : selo;
}

function plural(n, um, varios) {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
}

export function CartaoCampanha({ campanha, hoje, podeAbrirModulo = false }) {


  const emDinheiro = campanha.em_dinheiro === true;



  const avisos = emDinheiro ? avisosDaBarra(campanha, hoje) : [];
  const selo = seloDaCampanha(campanha, hoje, emDinheiro);
  const arrecadando = estadoDaCampanha(campanha, hoje) === 'arrecadando';
  const pctBarra = Number(campanha.pct_barra || 0);
  const contribuicoes = campanha.engajamento?.contribuicoes;
  const tipoNome = campanha.tipo?.nome || 'Campanha';

  const linhaInfo = [];


  if (emDinheiro) linhaInfo.push(campanha.digito ? `Dígito ,${campanha.digito}` : 'Sem dígito definido');
  if (campanha.data_inicio) {
    linhaInfo.push(`de ${fmtDataBr(campanha.data_inicio)}${campanha.data_fim ? ` a ${fmtDataBr(campanha.data_fim)}` : ''}`);
  } else if (campanha.data_fim) {
    linhaInfo.push(`até ${fmtDataBr(campanha.data_fim)}`);
  }
  if (campanha.data_lancamento) linhaInfo.push(`lança em ${fmtDataBr(campanha.data_lancamento)}`);

  return (
    <Card className="glass-solid">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground">{campanha.nome}</p>
            {linhaInfo.length > 0 && (
              <p className="text-xs text-muted-foreground">{linhaInfo.join(' · ')}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="outline">{tipoNome}</Badge>
            <Badge variant={arrecadando ? 'default' : 'secondary'}>{selo}</Badge>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Metrica icon={HandCoins} titulo="Custo" emDefinicao>
            <p className="text-sm text-muted-foreground">Ainda não medido.</p>
          </Metrica>

          <Metrica icon={Users} titulo="Engajamento" emDefinicao>
            {contribuicoes != null ? (
              <>
                <p className="text-xl font-semibold tabular-nums">{contribuicoes.toLocaleString('pt-BR')}</p>
                {
                                                                        }
                <p className="text-xs text-muted-foreground">
                  {contribuicoes === 1 ? 'contribuição registrada' : 'contribuições registradas'} · não é o número de pessoas
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Ainda não medido.</p>
            )}
          </Metrica>

          <Metrica icon={Target} titulo="Resultado">
            {emDinheiro ? (
              <>
                <div className="flex items-end justify-between gap-2">
                  <p className="text-xl font-semibold tabular-nums">
                    {campanha.tem_meta_em_reais ? fmtPercentual(campanha.pct) : fmtMoeda((campanha.total_centavos || 0) / 100)}
                  </p>
                  <p className="text-right text-xs text-muted-foreground">
                    {campanha.tem_meta_em_reais
                      ? `${fmtMoeda((campanha.total_centavos || 0) / 100)} de ${fmtMoeda(campanha.meta_centavos / 100)}`
                      : 'sem meta em reais definida'}
                  </p>
                </div>
                {campanha.tem_meta_em_reais && (
                  <div
                    className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={`${campanha.nome}: ${fmtPercentual(campanha.pct)} da meta`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pctBarra}
                  >
                    {
                                                               }
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${arrecadando ? 'bg-primary' : 'bg-muted-foreground/40'}`}
                      style={{ width: `${pctBarra}%` }}
                    />
                  </div>
                )}
                {campanha.falta_centavos > 0 && campanha.em_curso && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Faltam {fmtMoeda(campanha.falta_centavos / 100)}
                    {arrecadando && campanha.por_domingo_centavos
                      ? ` · ${fmtMoeda(campanha.por_domingo_centavos / 100)} por domingo`
                      : ''}
                  </p>
                )}
                {campanha.pct_conciliando > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtPercentual(campanha.pct_conciliando)} do total ainda esperando conferência da fila.
                  </p>
                )}
              </>
            ) : (
              <>
                {

                                                         }
                <p className="text-xl font-semibold tabular-nums">
                  {campanha.meta_pessoas != null ? plural(campanha.meta_pessoas, 'pessoa', 'pessoas') : '—'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {!campanha.tipo
                    ? 'Não deu para conferir o tipo desta campanha agora.'
                    : campanha.meta_pessoas != null ? 'é o alvo desta campanha.' : 'Alvo em pessoas não informado.'}
                  {' '}Quantas pessoas se inscreveram e quantas chegaram está no módulo Campanhas.
                </p>
              </>
            )}
          </Metrica>
        </div>

        {avisos.length > 0 && (
          <div className="space-y-0.5">
            {avisos.map((aviso) => (
              <p key={aviso.texto} className={`text-xs ${aviso.tom === 'ambar' ? 'text-amber-600' : 'text-muted-foreground'}`}>
                {aviso.texto}
              </p>
            ))}
          </div>
        )}

        {podeAbrirModulo && (
          <div className="flex justify-end">
            <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
              <Link to="/campanhas"><ExternalLink className="mr-1 h-3.5 w-3.5" /> Abrir no módulo Campanhas</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CampanhasConteudo() {
  const { canAccessModule } = useAuth();
  const podeAbrirModulo = canAccessModule(['campanhas'], 'leitura', 1);
  const [campanhas, setCampanhas] = useState(null);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState(null);
  const hoje = useMemo(() => hojeBrt(), []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const r = await api.resultadoCampanhas();
      setCampanhas(Array.isArray(r?.campanhas) ? r.campanhas : []);
      setAviso(r?.aviso || '');
    } catch (e) {

      setErro(e?.message || 'Não foi possível carregar as campanhas.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);



  const filtroAtivo = filtro || (campanhas && campanhas.some(c => c.em_curso) ? 'em_curso' : 'todas');
  const contagem = useMemo(() => Object.fromEntries(FILTROS.map(f => [f.key, (campanhas || []).filter(c => passaFiltro(c, f.key)).length])), [campanhas]);
  const visiveis = (campanhas || []).filter(c => passaFiltro(c, filtroAtivo));

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          Cada campanha mostra <strong>custo</strong>, <strong>engajamento</strong> e <strong>resultado</strong>.
          Custo e engajamento ainda estão sendo definidos. Nas campanhas de arrecadação o resultado é o
          dinheiro que entrou pelo dígito dos centavos; nas de pessoas (como voluntariado) aparece o alvo, e
          quantas se inscreveram e chegaram fica no módulo Campanhas. Toda campanha criada lá aparece aqui.
        </p>
      </div>

      {carregando && !campanhas && (
        <div className="space-y-3" aria-label="Carregando campanhas">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
        </div>
      )}

      {!carregando && erro && (
        <Card className="glass-solid border-destructive/40">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
            <div className="space-y-2">
              <p className="font-medium text-destructive">Não foi possível carregar as campanhas.</p>
              <p className="text-sm text-muted-foreground">
                {erro} — isto não significa que não há campanha. Tente de novo; se persistir, avise a equipe de sistema.
              </p>
              <Button size="sm" variant="outline" onClick={carregar}><RefreshCw className="mr-1 h-4 w-4" /> Tentar de novo</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {campanhas && !erro && (
        <>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar campanhas">
            {FILTROS.map(f => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filtroAtivo === f.key}
                onClick={() => setFiltro(f.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${filtroAtivo === f.key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'}`}
              >
                {f.label} ({contagem[f.key]})
              </button>
            ))}
          </div>

          {aviso && <p className="text-xs text-amber-600">{aviso}</p>}

          {visiveis.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {campanhas.length === 0
                ? 'Nenhuma campanha cadastrada ainda. Elas nascem no módulo Campanhas.'
                : 'Nenhuma campanha neste filtro.'}
            </p>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {visiveis.map(c => (
                <CartaoCampanha key={c.id} campanha={c} hoje={hoje} podeAbrirModulo={podeAbrirModulo} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function MarketingCampanhas() {
  const [params, setParams] = useSearchParams();
  const daUrl = params.get('t');
  const aba = ABAS.some(a => a.key === daUrl) ? daUrl : 'campanhas';

  function trocar(k) {


    const p = new URLSearchParams(params);
    if (k === 'campanhas') p.delete('t'); else p.set('t', k);
    setParams(p, { replace: true });
  }

  return (
    <MarketingPagina subtitulo={SUBTITULO[aba]}>
      <div className="flex flex-wrap gap-1 border-b border-border">
        {ABAS.map(a => {
          const Icon = a.icon;
          const ativo = aba === a.key;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => trocar(a.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                ativo
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Icon className="h-4 w-4" /> {a.label}
            </button>
          );
        })}
      </div>

      {aba === 'campanhas' && <CampanhasConteudo />}
      {aba === 'generosidade' && <MarketingGenerosidade />}
    </MarketingPagina>
  );
}

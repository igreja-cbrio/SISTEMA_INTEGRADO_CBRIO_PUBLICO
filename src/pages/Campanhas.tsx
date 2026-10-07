





import { useCallback, useEffect, useMemo, useState } from 'react';
import { campanhas, inscricoesApi, links as linksApi } from '../api';
import QrLinkDialog from '../components/QrLinkDialog';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from 'sonner';
import {
  Loader2, Plus, Target, CalendarDays, Send, Wallet, Check, X, Trash2,
  ArrowLeft, Play, Pause, AlertTriangle, Copy, Heart, Pencil, Users, QrCode, ExternalLink,
  LayoutGrid, History, BarChart3,
} from 'lucide-react';

const brl = (c: number) => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho', ativa: 'Ativa', pausada: 'Pausada',
  encerrada: 'Encerrada', cancelada: 'Cancelada',
};
const statusCor = (s: string) => s === 'ativa' ? 'bg-emerald-500/15 text-emerald-600'
  : s === 'pausada' ? 'bg-amber-500/15 text-amber-600'
  : ['encerrada', 'cancelada'].includes(s) ? 'bg-foreground/10 text-muted-foreground'
  : 'bg-sky-500/15 text-sky-600';

const MARCO_TIPO: Record<string, string> = {
  marco: 'Marco', tarefa: 'Tarefa', obra: 'Obra',
  comunicacao: 'Comunicação', financeiro: 'Financeiro',
};
const MARCO_STATUS: Record<string, string> = {
  pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluído',
  bloqueado: 'Bloqueado', cancelado: 'Cancelado',
};

const TABS = [
  { id: 'geral', label: 'Visão geral', icon: Target },
  { id: 'ativacoes', label: 'Ativações (QR)', icon: QrCode },
  { id: 'inscritos', label: 'Inscritos', icon: Users },
  { id: 'cronograma', label: 'Cronograma', icon: CalendarDays },
  { id: 'disparos', label: 'Disparos', icon: Send },
  { id: 'doacoes', label: 'Doações', icon: Wallet },
  { id: 'comparativo', label: 'Comparativo', icon: BarChart3 },
];


const ABAS_LEGADO = ['geral', 'cronograma', 'disparos', 'doacoes'];

const VALOR_NOME: Record<string, string> = {
  seguir: 'Seguir a Jesus', grupos: 'Conectar com Pessoas', investir: 'Investir Tempo com Deus',
  voluntarios: 'Servir em Comunidade', generosidade: 'Viver Generosamente',
};


const VALOR_ORDEM = ['seguir', 'grupos', 'investir', 'voluntarios', 'generosidade'];
const pctTxt = (v: any) => (v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : `${Math.round(Number(v))}%`);









function Barrinha({ d }: { d: any }) {
  const pctConf = d.total_centavos > 0 ? (d.caixa_confirmado_centavos / d.total_centavos) * d.pct_barra : 0;
  const pctOnline = d.total_centavos > 0 ? (d.online_pago_centavos / d.total_centavos) * d.pct_barra : 0;
  const pctConcil = Math.max(0, d.pct_barra - pctConf - pctOnline);
  return (
    <div>
      <div className="flex items-end justify-between gap-3 mb-2">
        <div>
          <div className="text-3xl font-semibold tabular-nums">{brl(d.total_centavos)}</div>
          <div className="text-sm text-muted-foreground">de {brl(d.meta_centavos)}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">{d.pct}%</div>
          {d.falta_centavos > 0 && (
            <div className="text-xs text-muted-foreground">faltam {brl(d.falta_centavos)}</div>
          )}
        </div>
      </div>
      <div className="h-3 w-full rounded-full overflow-hidden flex" style={{ background: 'var(--track)' }}>
        <div style={{ width: `${pctConf}%`, background: '#00B39D' }} title="Já classificado no financeiro" />
        <div style={{ width: `${pctOnline}%`, background: '#0891b2' }} title="Doação online" />
        <div style={{ width: `${pctConcil}%`, background: '#00B39D', opacity: 0.42 }} title="No banco, aguardando a fila de classificação" />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
        <span><span className="inline-block h-2 w-2 rounded-full mr-1" style={{ background: '#00B39D' }} />
          Classificado {brl(d.caixa_confirmado_centavos)}</span>
        {d.online_pago_centavos > 0 && (
          <span><span className="inline-block h-2 w-2 rounded-full mr-1" style={{ background: '#0891b2' }} />
            Online {brl(d.online_pago_centavos)}</span>
        )}
        {d.caixa_conciliando_centavos > 0 && (
          <span><span className="inline-block h-2 w-2 rounded-full mr-1" style={{ background: '#00B39D', opacity: 0.42 }} />
            Aguardando conciliação {brl(d.caixa_conciliando_centavos)}</span>
        )}
      </div>
      <Ritmo d={d} />
    </div>
  );
}








function rotuloDono(m: any) {
  const nomes = (m?.responsaveis || []).map((r: any) => r.nome).filter(Boolean);
  if (!nomes.length && !m?.area_nome) return { texto: 'sem responsável', tem_dono: false };
  if (!nomes.length) return { texto: `${m.area_nome} (área toda)`, tem_dono: true };


  const visiveis = nomes.slice(0, 2).join(', ');
  const resto = nomes.length - 2;
  const pessoas = resto > 0 ? `${visiveis} +${resto}` : visiveis;
  return { texto: m.area_nome ? `${pessoas} · ${m.area_nome}` : pessoas, tem_dono: true };
}











function Ritmo({ d }: { d: any }) {
  if (d?.falta_centavos === 0) {
    return (
      <div className="mt-3 text-sm text-emerald-600">
        Meta alcançada — não falta mais nada.
      </div>
    );
  }


  if (d?.por_domingo_centavos == null && d?.por_dia_centavos == null) return null;

  const antesDeComecar = !!d.parte_do_inicio;

  return (
    <div className="mt-3 space-y-1">
      {d.por_domingo_centavos != null ? (
        <div className="text-sm">
          Faltam <strong>{d.domingos_restantes} domingos</strong> — o ritmo para bater a meta é{' '}
          <strong className="text-base">{brl(d.por_domingo_centavos)} por domingo</strong>.
        </div>
      ) : (
        <div className="text-sm text-amber-600">
          Não há mais domingo até o fim da campanha ({dataBr(d.data_fim)}) —
          faltam <strong>{brl(d.falta_centavos)}</strong>.
        </div>
      )}
      {d.por_dia_centavos != null && (
        <div className="text-xs text-muted-foreground">
          {d.dias_restantes} dias de campanha · equivale a {brl(d.por_dia_centavos)}/dia
          {
                                                                          }
          {antesDeComecar ? ` · contado a partir de ${dataBr(d.inicio_efetivo)}, quando a arrecadação abre` : ''}
        </div>
      )}
    </div>
  );
}

function Chip({ children, cor }: { children: any; cor: string }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cor}`}>{children}</span>;
}

export default function Campanhas() {
  const { getAccessLevel } = useAuth() as any;
  const nivel = typeof getAccessLevel === 'function' ? getAccessLevel(['campanhas']) : 5;
  const podeEditar = nivel >= 3;
  const podeAtivar = nivel >= 4;

  const [lista, setLista] = useState<any[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [det, setDet] = useState<any | null>(null);
  const [tab, setTab] = useState('geral');
  const [criando, setCriando] = useState(false);
  const [criandoValor, setCriandoValor] = useState<string>('');


  const [modo, setModo] = useState<'todas' | 'valor'>(() => {
    try { return (localStorage.getItem('cbrio.campanhas.modo') as any) === 'valor' ? 'valor' : 'todas'; } catch { return 'todas'; }
  });
  const mudarModo = (m: 'todas' | 'valor') => { setModo(m); try { localStorage.setItem('cbrio.campanhas.modo', m); } catch {                   } };
  const [catalogoValores, setCatalogoValores] = useState<any[] | null>(null);
  useEffect(() => {
    campanhas.templates().then((r: any) => setCatalogoValores(r?.por_valor || null)).catch(() => setCatalogoValores(null));
  }, []);

  const carregar = useCallback(async () => {
    try { setErro(null); setLista(await campanhas.list()); }
    catch (e: any) {


      setErro(e?.message || 'Erro ao carregar as campanhas');
      setLista([]);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const abrir = useCallback(async (id: string) => {
    setSel(id); setDet(null); setTab('geral');
    try { setDet(await campanhas.get(id)); }
    catch (e: any) { toast.error(e?.message || 'Erro ao abrir a campanha'); setSel(null); }
  }, []);

  const recarregarDet = useCallback(async () => {
    if (!sel) return;
    try { setDet(await campanhas.get(sel)); } catch {                                 }
    carregar();
  }, [sel, carregar]);

  if (lista === null) {
    return <div className="p-6 flex items-center gap-2 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
    </div>;
  }


  if (sel) {
    if (!det) {
      return <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando a campanha…
      </div>;
    }
    const c = det.campanha;
    return (
      <div className="p-4 md:p-6 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setSel(null); setDet(null); carregar(); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Campanhas
          </Button>
          <h1 className="text-xl font-semibold">{c.nome}</h1>
          <Chip cor={statusCor(c.status)}>{STATUS_LABEL[c.status] || c.status}</Chip>
          {c.digito && <Chip cor="bg-foreground/10 text-foreground">dígito {c.digito}</Chip>}
          {det.template && det.template.id !== 'legado' && (
            <Chip cor="bg-violet-500/15 text-violet-600">{det.template.nome}{c.edicao_rotulo ? ` · ${c.edicao_rotulo}` : ''}</Chip>
          )}
          {det.valor_nome && <Chip cor="bg-sky-500/15 text-sky-600">{det.valor_nome}</Chip>}
          {det.programa && det.programa.nome !== c.nome && (
            <Chip cor="bg-foreground/10 text-foreground" >programa: {det.programa.nome}</Chip>
          )}
          {!det.no_ar && c.status === 'ativa' && (
            <Chip cor="bg-amber-500/15 text-amber-600">fora da janela de datas</Chip>
          )}
        </div>

        <div className="flex gap-1 border-b overflow-x-auto">
          {TABS.filter((t) => (det.template?.abas || ABAS_LEGADO).includes(t.id)).map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px flex items-center gap-1.5 ${
                tab === t.id ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground'}`}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'geral' && (
          <AbaGeral det={det} podeEditar={podeEditar} podeAtivar={podeAtivar} onMudou={recarregarDet} onAbrir={abrir} />
        )}
        {tab === 'ativacoes' && (
          <AbaAtivacoes det={det} podeEditar={podeEditar} />
        )}
        {tab === 'inscritos' && (
          <AbaInscritos det={det} />
        )}
        {tab === 'cronograma' && (
          <AbaCronograma det={det} podeEditar={podeEditar} onMudou={recarregarDet} />
        )}
        {tab === 'disparos' && (
          <AbaDisparos det={det} podeEditar={podeEditar} podeAtivar={podeAtivar} onMudou={recarregarDet} />
        )}
        {tab === 'doacoes' && (
          <AbaDoacoes det={det} podeEditar={podeEditar} onMudou={recarregarDet} />
        )}
        {tab === 'comparativo' && (
          <AbaComparativo det={det} podeAtivar={podeAtivar} onMudou={recarregarDet} onVerAtivacoes={() => setTab('ativacoes')} />
        )}
      </div>
    );
  }


  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Campanhas</h1>
          <p className="text-sm text-muted-foreground">
            Cada campanha incentiva um valor da mandala: alvo × inscritos × realizado, QR por local, cronograma e disparos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border overflow-hidden text-sm">
            <button type="button" onClick={() => mudarModo('todas')}
              className={`px-3 py-1.5 flex items-center gap-1.5 ${modo === 'todas' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
              <LayoutGrid className="h-4 w-4" /> Todas
            </button>
            <button type="button" onClick={() => mudarModo('valor')}
              className={`px-3 py-1.5 flex items-center gap-1.5 ${modo === 'valor' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
              <BarChart3 className="h-4 w-4" /> Por valor
            </button>
          </div>
          {podeEditar && (
            <Button onClick={() => setCriando(true)}><Plus className="h-4 w-4 mr-1" /> Nova campanha</Button>
          )}
        </div>
      </div>

      {erro && (
        <Card className="border-amber-500/40">
          <CardContent className="p-4 flex gap-2 text-sm text-amber-600">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>Não foi possível carregar as campanhas: {erro}. O que aparece abaixo pode estar incompleto.</div>
          </CardContent>
        </Card>
      )}

      {criando && (
        <FormCampanha onFechar={() => { setCriando(false); setCriandoValor(''); }} valorInicial={criandoValor}
          onCriada={(id) => { setCriando(false); setCriandoValor(''); carregar(); abrir(id); }} />
      )}

      {!lista.length && !erro && (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">
          Nenhuma campanha cadastrada ainda.
        </CardContent></Card>
      )}

      {modo === 'todas' ? (
        <div className="grid gap-4 md:grid-cols-2">
          {lista.map((c) => <CardCampanha key={c.campanha_id} c={c} onAbrir={abrir} />)}
        </div>
      ) : (
        <ListaPorValor lista={lista} catalogo={catalogoValores} onAbrir={abrir}
          onNova={podeEditar ? (v) => { setCriandoValor(v); setCriando(true); window.scrollTo({ top: 0, behavior: 'smooth' }); } : undefined} />
      )}
    </div>
  );
}


function CardCampanha({ c, onAbrir, compacto }: { c: any; onAbrir: (id: string) => void; compacto?: boolean }) {
  const dinheiro = c.unidade !== 'pessoas';
  return (
    <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => onAbrir(c.campanha_id)}>
      <CardContent className={compacto ? 'p-4 space-y-2' : 'p-5 space-y-3'}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium truncate">{c.nome}{c.edicao_rotulo ? <span className="text-muted-foreground font-normal"> · {c.edicao_rotulo}</span> : null}</div>
            <div className="text-xs text-muted-foreground">
              {dataBr(c.data_lancamento || c.data_inicio)} → {dataBr(c.data_fim)}
              {!compacto && c.valor_nome ? ` · ${c.valor_nome}` : ''}
              {!compacto && c.template_nome && c.template !== 'legado' ? ` · ${c.template_nome}` : ''}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Chip cor={statusCor(c.status)}>{STATUS_LABEL[c.status] || c.status}</Chip>
            {c.digito && <span className="text-xs text-muted-foreground">dígito {c.digito}</span>}
          </div>
        </div>
        {dinheiro ? <Barrinha d={c} /> : (
          <div className="text-xs text-muted-foreground">
            alvo {c.meta_pessoas ? `${c.meta_pessoas} pessoa(s)` : '—'} · o realizado está na campanha
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function ListaPorValor({ lista, catalogo, onAbrir, onNova }: { lista: any[]; catalogo: any[] | null; onAbrir: (id: string) => void; onNova?: (valor: string) => void }) {
  const grupos = useMemo(() => {
    const porValor = new Map<string, Map<string, any[]>>();
    for (const c of lista) {
      const v = c.valor || 'generosidade';
      if (!porValor.has(v)) porValor.set(v, new Map());
      const pk = c.programa_id || `sem:${c.campanha_id}`;
      const m = porValor.get(v)!;
      if (!m.has(pk)) m.set(pk, []);
      m.get(pk)!.push(c);
    }


    const ordem = [...VALOR_ORDEM, ...[...porValor.keys()].filter((v) => !VALOR_ORDEM.includes(v))];
    return ordem.map((v) => {
      const progs = [...(porValor.get(v) || new Map()).entries()].map(([pk, eds]) => {
        const sorted = [...eds].sort((a, b) => String(b.data_inicio || b.data_lancamento || '').localeCompare(String(a.data_inicio || a.data_lancamento || '')));
        return { pk, nome: sorted[0]?.programa?.nome || sorted[0]?.nome, recorrente: sorted[0]?.programa?.recorrente !== false, edicoes: sorted };
      }).sort((a, b) => a.nome.localeCompare(b.nome));
      return { valor: v, progs };
    });
  }, [lista]);
  const info = (v: string) => (catalogo || []).find((x: any) => x.id === v) || null;
  return (
    <div className="space-y-6">
      {grupos.map(({ valor, progs }) => {
        const i = info(valor);
        const semTemplate = i && !i.template;
        return (
          <section key={valor} className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-base font-semibold">{VALOR_NOME[valor] || i?.nome || valor}</h2>
              <span className="text-xs text-muted-foreground">
                {progs.length ? `${progs.length} campanha(s) · ${progs.reduce((n, p) => n + p.edicoes.length, 0)} edição(ões)` : 'ainda sem campanha'}
                {i?.indicador?.manutencao_label ? ` · indicador-chave: ${i.indicador.manutencao_label}` : ''}
              </span>
              {semTemplate && <Chip cor="bg-amber-500/15 text-amber-600">sem porta de inscrição</Chip>}
            </div>
            {!progs.length && (
              <div className="rounded-md border border-dashed p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="space-y-0.5">
                  <div className="font-medium text-muted-foreground">O lugar deste valor está reservado — ainda não há campanha aqui.</div>
                  <div className="text-xs text-muted-foreground">
                    {i?.template_nome
                      ? `Template ${i.template_nome} · ${i.sinal ? 'com sinal (promessa + realização)' : 'sem sinal (a inscrição é a ação)'}${i.porta ? ` · porta: ${i.porta}` : ''}`
                      : 'Este valor ainda não tem porta de inscrição.'}
                  </div>
                </div>
                {onNova && i?.template && (
                  <Button variant="outline" size="sm" onClick={() => onNova(valor)}>
                    <Plus className="h-4 w-4 mr-1" /> Nova campanha de {VALOR_NOME[valor] || valor}
                  </Button>
                )}
              </div>
            )}
            {progs.map((p) => (
              <div key={p.pk} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{p.nome}</span>
                  <span className="text-xs text-muted-foreground">{p.recorrente ? 'recorrente' : 'única'} · {p.edicoes.length} edição(ões)</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {p.edicoes.map((c: any) => <CardCampanha key={c.campanha_id} c={c} onAbrir={onAbrir} compacto />)}
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}



function FormCampanha({ onFechar, onCriada, valorInicial }: { onFechar: () => void; onCriada: (id: string) => void; valorInicial?: string }) {
  const [f, setF] = useState<any>({
    nome: '', meta: '', meta_pessoas: '', digito: '', data_inicio: '', data_lancamento: '', data_fim: '',
    edicao_rotulo: '', meses: '', faixas: [] as any[],
  });
  const [templates, setTemplates] = useState<any[] | null>(null);
  const [porValor, setPorValor] = useState<any[] | null>(null);
  const [tpl, setTpl] = useState<string>('');



  const [valor, setValor] = useState<string>('');
  const [soDigito, setSoDigito] = useState(false);
  const [programas, setProgramas] = useState<any[] | null>(null);
  const [programaId, setProgramaId] = useState<string>('');
  const [progNovo, setProgNovo] = useState({ nome: '', recorrente: true });
  const [digitos, setDigitos] = useState<any | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    campanhas.digitos().then((d: any) => {
      setDigitos(d);
      setF((p: any) => ({ ...p, digito: p.digito || d.sugestao || '' }));
    }).catch(() => setDigitos({ ocupados: [], sugestao: null }));

    campanhas.templates().then((r: any) => {
      const lista = r?.templates || [];
      setTemplates(lista);
      setPorValor(r?.por_valor || null);

      if (valorInicial && (r?.por_valor || []).some((x: any) => x.id === valorInicial && x.template)) {
        setValor(valorInicial); setSoDigito(false); setProgramaId('');
        const info = (r.por_valor || []).find((x: any) => x.id === valorInicial);
        escolherTemplate(info?.template || (null as any), lista);
      }
      if (!r?.por_valor && lista[0]) escolherTemplate(lista[0], lista);
    }).catch(() => { setTemplates([]); setPorValor(null); });


    campanhas.programas().then((r: any) => setProgramas(Array.isArray(r) ? r : [])).catch(() => setProgramas([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = useMemo(() => (templates || []).find((x: any) => x.id === tpl) || null, [templates, tpl]);
  const valorInfo = useMemo(() => (porValor || []).find((x: any) => x.id === valor) || null, [porValor, valor]);
  const programasDoValor = useMemo(() => (programas || []).filter((p: any) => p.valor === valor), [programas, valor]);

  function escolherValor(v: string) {
    setValor(v); setSoDigito(false); setProgramaId('');
    const info = (porValor || []).find((x: any) => x.id === v);
    escolherTemplate(info?.template || (null as any));
  }
  function escolherSoDigito() { setSoDigito(true); setTpl(''); }

  function escolherTemplate(id: any, lista?: any[]) {
    const item = typeof id === 'string' ? (lista || templates || []).find((x: any) => x.id === id) : id;
    setTpl(item?.id || '');
    if (!item) return;
    setF((p: any) => ({
      ...p,
      faixas: (item.faixas_padrao || []).map((x: any) => ({
        rotulo: x.rotulo, outro: !!x.outro, reais: x.outro ? '' : String(Number(x.centavos || 0) / 100),
      })),
      meses: item.meses_padrao ? String(item.meses_padrao) : '',
    }));
  }

  const parseReais = (v: any) => Math.round(Number(String(v ?? '').replace(/\./g, '').replace(',', '.')) * 100);

  const salvar = async () => {
    if (!f.nome.trim()) return toast.error('Dê um nome à campanha.');
    setSalvando(true);
    try {
      let payload: any;
      if (porValor && !valor) { setSalvando(false); return toast.error('Escolha o valor que a campanha incentiva.'); }
      if (!t) {

        const meta = parseReais(f.meta);
        if (!(meta > 0)) { setSalvando(false); return toast.error('Informe a meta em reais.'); }
        payload = { nome: f.nome.trim(), meta_centavos: meta, digito: f.digito || null };

        if (valor) Object.assign(payload, { valor, template: 'legado', edicao_rotulo: f.edicao_rotulo || null });
      } else {
        payload = { template: t.id, valor: valor || t.valor, nome: f.nome.trim(), edicao_rotulo: f.edicao_rotulo || null };
        if (t.unidade === 'centavos') {
          const meta = parseReais(f.meta);
          if (!(meta > 0)) { setSalvando(false); return toast.error('Informe o alvo em reais.'); }
          payload.meta_centavos = meta;
          payload.faixas = (f.faixas || []).map((x: any) => x.outro
            ? { rotulo: x.rotulo, outro: true }
            : { rotulo: x.rotulo, centavos: parseReais(x.reais) });
          payload.meses = f.meses ? Number(f.meses) : null;
          if (t.dinheiro) payload.digito = f.digito || null;
        } else {
          const n = Math.round(Number(f.meta_pessoas));
          if (!(n > 0)) { setSalvando(false); return toast.error('Informe o alvo em pessoas.'); }
          payload.meta_pessoas = n;
        }
      }
      Object.assign(payload, {
        descricao_curta: f.descricao_curta || null,
        data_inicio: f.data_inicio || null,
        data_lancamento: f.data_lancamento || null,
        data_fim: f.data_fim || null,
      });

      if (valor) {
        if (programaId) payload.programa_id = programaId;
        else Object.assign(payload, { programa_nome: progNovo.nome.trim() || f.nome.trim(), recorrente: progNovo.recorrente });
      }
      const c = await campanhas.criar(payload);
      if (c?.aviso) toast.warning(c.aviso);
      if (c?.aviso_ciclo) toast.warning(c.aviso_ciclo);
      toast.success(c?.ciclo_ativado ? 'Campanha criada como rascunho · ciclo criativo ativado em Eventos.' : 'Campanha criada como rascunho.');
      onCriada(c.id);
    } catch (e: any) { toast.error(e?.message || 'Erro ao criar a campanha'); }
    finally { setSalvando(false); }
  };

  const setFaixa = (i: number, patch: any) => setF((p: any) => ({
    ...p, faixas: p.faixas.map((x: any, j: number) => (j === i ? { ...x, ...patch } : x)),
  }));

  const dinheiro = !t || t.dinheiro;

  return (
    <Card className="glass-solid">
      <CardContent className="p-5 space-y-4">
        <div className="font-medium">Nova campanha</div>

        {porValor && porValor.length > 0 && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm mb-1">Qual valor esta campanha incentiva?</label>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {porValor.map((x: any) => (
                  <button key={x.id} type="button" disabled={!x.template} onClick={() => escolherValor(x.id)}
                    title={x.template ? '' : 'Este valor ainda não tem porta de inscrição: a decisão acontece no culto.'}
                    className={`text-left rounded-md border p-3 text-sm disabled:opacity-50 ${valor === x.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
                    <div className="font-medium">{x.nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {x.template ? `${x.template_nome} · ${x.sinal ? 'com sinal (promessa + realização)' : 'sem sinal (a inscrição é a ação)'}` : 'sem template ainda'}
                    </div>
                    {x.indicador?.manutencao_label && <div className="text-xs text-muted-foreground mt-1">indicador-chave: {x.indicador.manutencao_label}</div>}
                  </button>
                ))}
              </div>
            </div>
            {valor === 'generosidade' && (
              <div className="flex flex-wrap gap-2 text-sm">
                <button type="button" onClick={() => escolherValor('generosidade')}
                  className={`rounded-md border px-3 py-1.5 ${!soDigito ? 'border-primary bg-primary/5' : 'border-border'}`}>Com adesão (formulário + QR por local)</button>
                <button type="button" onClick={escolherSoDigito}
                  className={`rounded-md border px-3 py-1.5 ${soDigito ? 'border-primary bg-primary/5' : 'border-border'}`}>Só o dígito (modelo anterior)</button>
              </div>
            )}
            {valor && (
              <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">É uma edição de campanha que já existe, ou uma campanha nova?</div>
                <div className="text-xs text-muted-foreground">
                  Mesmo objetivo e mesmos indicadores = a mesma campanha, mesmo com nomes diferentes por ano. A edição entra no histórico dela.
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <label className="block text-xs mb-1">Continuar uma campanha existente</label>
                    <Select value={programaId || 'nova'} onValueChange={(v) => setProgramaId(v === 'nova' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Campanha nova" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nova">— Campanha nova (programa novo) —</SelectItem>
                        {programasDoValor.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.nome} · {p.edicoes?.length || 0} edição(ões)</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {programas && !programasDoValor.length && (
                      <div className="text-xs text-muted-foreground mt-1">Nenhuma campanha deste valor ainda — esta será a primeira.</div>
                    )}
                  </div>
                  {!programaId && (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs mb-1">Nome da campanha (programa) — vazio = o nome da edição</label>
                        <Input value={progNovo.nome} onChange={(e) => setProgNovo({ ...progNovo, nome: e.target.value })}
                          placeholder={valor === 'voluntarios' ? 'Campanha de voluntários' : 'Generosidade'} maxLength={120} />
                      </div>
                      <label className="flex items-center gap-2 text-xs">
                        <input type="checkbox" checked={progNovo.recorrente} onChange={(e) => setProgNovo({ ...progNovo, recorrente: e.target.checked })} />
                        Recorrente (vai ter outras edições — compara ano a ano)
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {!porValor && templates && templates.length > 0 && (
          <div>
            <label className="block text-sm mb-1">Tipo de campanha</label>
            <div className="grid gap-2 md:grid-cols-3">
              {templates.map((x: any) => (
                <button key={x.id} type="button" onClick={() => escolherTemplate(x.id)}
                  className={`text-left rounded-md border p-3 text-sm ${tpl === x.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <div className="font-medium">{x.nome}</div>
                  <div className="text-xs text-muted-foreground">Valor: {x.valor_nome} · alvo em {x.unidade === 'centavos' ? 'reais' : 'pessoas'}</div>
                  {x.descricao && <div className="text-xs text-muted-foreground mt-1">{x.descricao}</div>}
                </button>
              ))}
              <button type="button" onClick={() => escolherTemplate(null as any)}
                className={`text-left rounded-md border p-3 text-sm ${!tpl ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <div className="font-medium">Só o dígito (modelo anterior)</div>
                <div className="text-xs text-muted-foreground">Sem formulário de adesão nem QR por local — mede só o dinheiro que chega.</div>
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="block text-sm mb-1">Nome</label>
            <Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })}
              placeholder={t?.unidade === 'pessoas' ? 'Voluntariado 2027' : 'Generosidade 2027'} />
          </div>
          {t && (
            <div>
              <label className="block text-sm mb-1">Edição (rótulo)</label>
              <Input value={f.edicao_rotulo} onChange={(e) => setF({ ...f, edicao_rotulo: e.target.value })}
                placeholder={t.unidade === 'pessoas' ? '2027' : '2027 · 1º semestre'} maxLength={40} />
              <div className="text-xs text-muted-foreground mt-1">É o que separa as edições da mesma campanha na página do valor.</div>
            </div>
          )}
          {(!t || t.unidade === 'centavos') ? (
            <div>
              <label className="block text-sm mb-1">Alvo (R$) — planejado ANTES das inscrições</label>
              <Input value={f.meta} onChange={(e) => setF({ ...f, meta: e.target.value })} placeholder="500000" />
            </div>
          ) : (
            <div>
              <label className="block text-sm mb-1">Alvo (pessoas) — planejado ANTES das inscrições</label>
              <Input value={f.meta_pessoas} inputMode="numeric" onChange={(e) => setF({ ...f, meta_pessoas: e.target.value.replace(/\D/g, '') })} placeholder="150" />
            </div>
          )}
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">Frase curta (aparece no agradecimento e na página)</label>
            <Input value={f.descricao_curta || ''} onChange={(e) => setF({ ...f, descricao_curta: e.target.value })}
              placeholder="transformar o espaço onde as nossas crianças são cuidadas" />
          </div>
          {dinheiro && (
            <div>
              <label className="block text-sm mb-1">Dígito verificador</label>
              <Input value={f.digito} maxLength={2} onChange={(e) => setF({ ...f, digito: e.target.value.replace(/\D/g, '') })}
                placeholder="07" className="w-24" />
              {digitos?.ocupados?.length ? (
                <div className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
                  <div>Já em uso:</div>
                  {digitos.ocupados.map((o: any) => (
                    <div key={o.digito}><strong>{o.digito}</strong> — {o.descricao}</div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div><label className="block text-sm mb-1">Início</label>
              <DatePicker value={f.data_inicio} onChange={(v: any) => setF({ ...f, data_inicio: v })} placeholder="Início" /></div>
            <div><label className="block text-sm mb-1">Lançamento</label>
              <DatePicker value={f.data_lancamento} onChange={(v: any) => setF({ ...f, data_lancamento: v })} placeholder="Lançamento" /></div>
            <div><label className="block text-sm mb-1">Fim</label>
              <DatePicker value={f.data_fim} onChange={(v: any) => setF({ ...f, data_fim: v })} placeholder="Fim" /></div>
          </div>
        </div>

        {t?.unidade === 'centavos' && (
          <div className="rounded-md border p-3 space-y-2">
            <div className="text-sm font-medium">Faixas de compromisso mensal (o que a pessoa escolhe ao aderir)</div>
            {(f.faixas || []).map((x: any, i: number) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input className="w-44" value={x.rotulo} placeholder="R$ 100 por mês"
                  onChange={(e) => setFaixa(i, { rotulo: e.target.value })} />
                {x.outro ? (
                  <span className="text-xs text-muted-foreground">a pessoa digita o valor</span>
                ) : (
                  <Input className="w-32" value={x.reais} placeholder="100" inputMode="decimal"
                    onChange={(e) => setFaixa(i, { reais: e.target.value })} />
                )}
                <Button variant="ghost" size="icon" onClick={() => setF({ ...f, faixas: f.faixas.filter((_: any, j: number) => j !== i) })}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={(f.faixas || []).length >= 8}
                onClick={() => setF({ ...f, faixas: [...f.faixas, { rotulo: '', reais: '', outro: false }] })}>
                <Plus className="h-4 w-4 mr-1" /> Faixa
              </Button>
              {!(f.faixas || []).some((x: any) => x.outro) && (
                <Button variant="outline" size="sm" disabled={(f.faixas || []).length >= 8}
                  onClick={() => setF({ ...f, faixas: [...f.faixas, { rotulo: 'Outro valor', reais: '', outro: true }] })}>
                  <Plus className="h-4 w-4 mr-1" /> "Outro valor"
                </Button>
              )}
              <div className="flex items-center gap-2 ml-auto">
                <label className="text-sm">Meses do compromisso</label>
                <Input className="w-20" value={f.meses} inputMode="numeric"
                  onChange={(e) => setF({ ...f, meses: e.target.value.replace(/\D/g, '') })} placeholder="12" />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Prometido = soma das faixas escolhidas × meses. É a régua do meio: entre o alvo (planejado) e o realizado (o que caiu na conta).
            </div>
          </div>
        )}

        {dinheiro ? (
          <p className="text-xs text-muted-foreground">
            O <strong>dígito verificador</strong> são os centavos que identificam a doação: com o dígito 07,
            quem quiser doar R$ 500 transfere <strong>R$ 500,07</strong> e o sistema reconhece sozinho que é desta campanha.
            Quem doar pelo link também é contado, sem precisar dos centavos.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Campanha de <strong>pessoas</strong> (sem sinal): ninguém avisa antes — a inscrição É a ação. Os inscritos vêm da
            porta do valor ({t?.porta === 'grupos' ? 'inscrição em grupos' : t?.porta === 'batismo' ? 'inscrição de batismo' : t?.porta === 'devocional' ? 'inscrição em plano de devocional pelo app' : 'formulário de voluntariado'})
            dentro da janela de datas (início → fim), e a campanha mostra 12 meses da porta: o que veio pelos QRs contra os outros meses.
          </p>
        )}
        <div className="flex gap-2">
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Criar como rascunho
          </Button>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  );
}



function AbaGeral({ det, podeEditar, podeAtivar, onMudou, onAbrir }: any) {
  const c = det.campanha;
  const [salvando, setSalvando] = useState(false);

  const mudarStatus = async (status: string) => {
    setSalvando(true);
    try {
      await campanhas.status(c.id, status);
      toast.success(`Campanha ${STATUS_LABEL[status]?.toLowerCase()}.`);
      onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao mudar o status'); }
    finally { setSalvando(false); }
  };

  const togglePublica = async () => {
    setSalvando(true);
    try {
      await campanhas.atualizar(c.id, { publica: !c.publica });
      toast.success(c.publica ? 'A barrinha saiu do ar.' : 'A barrinha está no ar.');
      onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao atualizar'); }
    finally { setSalvando(false); }
  };

  const linkPublico = `${window.location.origin}/campanha/${c.slug}`;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2 glass-solid">
        <CardContent className="p-5 space-y-4">
          {det.reguas && det.template?.id !== 'legado' && <Reguas det={det} />}
          {det.indicador_chave && <IndicadorChave ind={det.indicador_chave} />}
          {det.serie_porta && <SeriePorta serie={det.serie_porta} campanha={c} />}
          {det.template?.dinheiro !== false && <Barrinha d={det} />}
          {det.lancamentos_em_conciliacao > 0 && (
            <div className="text-xs flex gap-2 rounded-md p-3" style={{ background: 'var(--surface)' }}>
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <div>
                <strong>{det.lancamentos_em_conciliacao} crédito(s)</strong> já estão na conta da igreja com o
                dígito {c.digito}, mas ainda não passaram pela fila de classificação do financeiro — por isso
                o total daqui pode estar à frente do DRE. A aba <strong>Doações</strong> lista quais são.
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><div className="text-muted-foreground text-xs">Lançamentos</div>
              <div className="font-medium tabular-nums">{det.total_lancamentos}</div></div>
            <div><div className="text-muted-foreground text-xs">Doadores (aprox.)</div>
              <div className="font-medium tabular-nums">{det.doadores_aprox}</div></div>
            <div><div className="text-muted-foreground text-xs">Lançamento</div>
              <div className="font-medium">{dataBr(c.data_lancamento)}</div></div>
            <div><div className="text-muted-foreground text-xs">Encerra</div>
              <div className="font-medium">{dataBr(c.data_fim)}</div>
              {
                                                                                               }
              {det.template?.dinheiro !== false && c.digito && det.fim_credito && (
                <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                  inclui créditos até {dataBr(det.fim_credito)} — o Pix do último domingo cai na segunda
                </div>
              )}
            </div>
          </div>
          {c.descricao && <p className="text-sm text-muted-foreground whitespace-pre-line">{c.descricao}</p>}
          {c.observacao && (
            <div className="text-xs rounded-md p-3" style={{ background: 'var(--surface)' }}>
              <strong>Observação interna:</strong> {c.observacao}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <ConfigIdentidade det={det} podeEditar={podeAtivar} onMudou={onMudou} />
        {det.template?.dinheiro !== false && <ConfigDigito det={det} podeAtivar={podeAtivar} onMudou={onMudou} />}
        {det.template?.dinheiro !== false && <ConfigContabil det={det} podeEditar={podeEditar} onMudou={onMudou} />}
        {det.adesao && det.template?.id !== 'legado' && (
          <CardAdesao det={det} podeEditar={podeEditar} onMudou={onMudou} />
        )}
        {det.programa && <CardHistorico det={det} onAbrir={onAbrir} />}

        <Card><CardContent className="p-5 space-y-3">
          <div className="font-medium text-sm">Barrinha pública</div>
          <div className="text-xs text-muted-foreground">
            É o que aparece nas telas do culto e na página que a igreja compartilha.
          </div>
          {c.publica && (
            <div className="flex items-center gap-2">
              <Input readOnly value={linkPublico} className="text-xs" />
              <Button variant="ghost" size="icon" title="Copiar"
                onClick={() => { navigator.clipboard?.writeText(linkPublico); toast.success('Link copiado.'); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
          {podeEditar && (
            <Button variant={c.publica ? 'outline' : 'default'} size="sm" disabled={salvando} onClick={togglePublica}>
              {c.publica ? 'Tirar do ar' : 'Publicar a barrinha'}
            </Button>
          )}
          {

                                                                                }
          {c.publica && c.status !== 'ativa' && (
            <div className="text-xs text-amber-600">
              A barrinha só aparece de verdade com a campanha <strong>ativa</strong> e dentro da janela de datas.
            </div>
          )}
        </CardContent></Card>

        {podeAtivar && (
          <Card><CardContent className="p-5 space-y-3">
            <div className="font-medium text-sm">Status da campanha</div>
            <div className="flex flex-wrap gap-2">
              {c.status !== 'ativa' && (
                <Button size="sm" disabled={salvando} onClick={() => mudarStatus('ativa')}>
                  <Play className="h-4 w-4 mr-1" /> Ativar
                </Button>
              )}
              {c.status === 'ativa' && (
                <Button size="sm" variant="outline" disabled={salvando} onClick={() => mudarStatus('pausada')}>
                  <Pause className="h-4 w-4 mr-1" /> Pausar
                </Button>
              )}
              {!['encerrada', 'cancelada'].includes(c.status) && (
                <Button size="sm" variant="outline" disabled={salvando} onClick={() => mudarStatus('encerrada')}>
                  Encerrar
                </Button>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Ativar é o que faz o dígito começar a classificar as doações e libera os disparos.
            </div>
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}
























function ConfigIdentidade({ det, podeEditar, onMudou }: any) {
  const c = det?.campanha || det || {};
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState('');
  const [desc, setDesc] = useState('');
  const [salvando, setSalvando] = useState(false);

  const abrir = () => {
    setNome(c.nome || '');
    setDesc(c.descricao_curta || '');
    setEditando(true);
  };

  const salvar = async () => {
    const n = nome.replace(/\s+/g, ' ').trim();


    if (!n) return toast.error('Dê um nome à campanha.');
    if (n.length > 80) return toast.error('O nome cabe em até 80 caracteres.');
    setSalvando(true);
    try {
      await campanhas.atualizar(c.id, { nome: n, descricao_curta: desc.trim() });
      toast.success('Campanha atualizada');
      setEditando(false);
      onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  };

  return (
    <Card><CardContent className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm">Nome e descrição</div>
        {podeEditar && !editando && (
          <Button variant="ghost" size="sm" onClick={abrir}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
        )}
      </div>

      {!editando ? (
        <div className="text-sm space-y-1">
          <div className="font-medium">{c.nome}</div>
          {c.descricao_curta
            ? <div className="text-xs text-muted-foreground">{c.descricao_curta}</div>
            : <div className="text-xs text-muted-foreground">Sem descrição curta.</div>}
          <div className="text-xs text-muted-foreground pt-1">
            A descrição curta aparece embaixo do seletor de campanha na tela de doar.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Nome da campanha</label>
            <Input value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Descrição curta <span className="text-muted-foreground">(opcional)</span>
            </label>
            <Input value={desc} maxLength={160} onChange={(e) => setDesc(e.target.value)}
              placeholder="transformar o espaço onde as crianças são cuidadas" />
          </div>

          {                                                                                }
          <div className="text-xs rounded-md p-3 space-y-1" style={{ background: 'var(--surface)' }}>
            <div>
              O nome novo aparece <strong>em todos os lugares</strong>: barrinha, telas do culto,
              seletor de campanha na tela de doar e no app.
            </div>
            <div className="text-muted-foreground">
              ⚠️ O <strong>link público não muda</strong> — cartaz e QR já impressos continuam
              funcionando.
            </div>
            <div className="text-muted-foreground">
              ⚠️ Quem <strong>já doou</strong> mantém no recibo o nome de quando doou. O valor
              continua somando nesta campanha.
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={salvando}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </CardContent></Card>
  );
}

function ConfigDigito({ det, podeAtivar, onMudou }: any) {
  const c = det.campanha;
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(c.digito || '');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [ocupados, setOcupados] = useState<any[] | null>(null);
  const [historico, setHistorico] = useState<any[] | null>(null);

  useEffect(() => {
    if (!editando) return;
    campanhas.digitos().then((d: any) => setOcupados(d.ocupados || [])).catch(() => setOcupados([]));
    campanhas.digitoHistorico(c.id).then(setHistorico).catch(() => setHistorico([]));
  }, [editando, c.id]);

  const jaTemDinheiro = (det.total_centavos || 0) > 0;

  const salvar = async () => {
    const novo = String(valor || '').trim();
    if (novo && novo === c.digito) { setEditando(false); return; }
    if (jaTemDinheiro && !confirm(
      `Esta campanha já tem ${brl(det.total_centavos)} identificados pelo dígito ${c.digito}.\n\n` +
      `Ao trocar, o sistema vai FIXAR esses lançamentos na campanha para que o total não caia — ` +
      `e as doações novas passam a ser reconhecidas pelo dígito ${novo || '(nenhum)'}.\n\nConfirma?`
    )) return;

    setSalvando(true);
    try {
      const r = await campanhas.definirDigito(c.id, novo || null, motivo || null);
      if (r?.sem_mudanca) toast.info('O dígito já era esse.');
      else if (r?.fixados) toast.success(`Dígito alterado. ${r.fixados} lançamento(s) foram fixados na campanha para o total não cair.`);
      else toast.success('Dígito configurado.');
      setEditando(false); setMotivo(''); onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao configurar o dígito'); }
    finally { setSalvando(false); }
  };

  return (
    <Card><CardContent className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm">Como o dinheiro é identificado</div>
        {podeAtivar && !editando && (
          <Button variant="ghost" size="sm" onClick={() => { setValor(c.digito || ''); setEditando(true); }}>
            <Pencil className="h-4 w-4 mr-1" /> Configurar
          </Button>
        )}
      </div>

      {!editando && (c.digito ? (
        <div className="text-sm space-y-1">
          <div>Dígito <strong className="text-lg">{c.digito}</strong></div>
          <div className="text-muted-foreground text-xs">
            Quem transferir pelo banco põe esses centavos no valor.
            Doar R$ 500 = transferir <strong>R$ 500,{c.digito}</strong>.
          </div>
          {

                                                                                }
          {c.status === 'rascunho' && (
            <div className="text-xs text-amber-600 flex gap-1.5 mt-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Enquanto a campanha está em rascunho, este dígito ainda NÃO identifica
              doação nenhuma. Ative a campanha para ele começar a valer.
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-amber-600 flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          Sem dígito configurado — quem transferir pelo banco não vai ser reconhecido nesta campanha.
        </div>
      ))}

      {editando && (
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs mb-1 text-muted-foreground">Centavos (01 a 99)</label>
              <Input value={valor} maxLength={2} className="w-20 text-center text-lg"
                onChange={(e) => setValor(e.target.value.replace(/\D/g, ''))} placeholder="07" />
            </div>
            <div className="text-xs text-muted-foreground pb-2">
              Doar R$ 500 = transferir <strong>R$ 500,{valor || '__'}</strong>
            </div>
          </div>

          {ocupados === null ? (
            <div className="text-xs text-muted-foreground">Conferindo os dígitos em uso…</div>
          ) : ocupados.length ? (
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>Já em uso (o sistema recusa repetir):</div>
              {ocupados.map((o: any) => (
                <div key={o.digito}><strong>{o.digito}</strong> — {o.descricao}</div>
              ))}
            </div>
          ) : null}

          {jaTemDinheiro && (
            <div className="text-xs rounded-md p-3 text-amber-700 dark:text-amber-400"
              style={{ background: 'var(--surface)' }}>
              <strong>Atenção:</strong> já há {brl(det.total_centavos)} identificados pelo
              dígito {c.digito}. Ao trocar, esses lançamentos são <strong>fixados</strong> nesta
              campanha para o total não cair — e as doações novas passam a usar o dígito novo.
            </div>
          )}

          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por que está trocando? (fica registrado)" />

          <div className="flex gap-2">
            <Button size="sm" onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Salvar dígito
            </Button>
            {c.digito && (
              <Button size="sm" variant="outline" disabled={salvando}
                onClick={() => { setValor(''); }}>
                Tirar o dígito
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => { setEditando(false); setMotivo(''); }}>
              Cancelar
            </Button>
          </div>

          {historico && historico.length > 0 && (
            <div className="text-xs text-muted-foreground space-y-0.5 pt-2 border-t">
              <div>Trocas anteriores:</div>
              {historico.map((h: any) => (
                <div key={h.id}>
                  {dataBr(h.created_at)} · {h.digito_anterior || '(nenhum)'} → {h.digito_novo || '(nenhum)'}
                  {h.lancamentos_fixados ? ` · ${h.lancamentos_fixados} fixado(s)` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {c.aceita_online
          ? 'Quem doa pelo link/QR é contado com atribuição exata, sem depender dos centavos.'
          : 'Doação online está desligada nesta campanha.'}
      </div>
    </CardContent></Card>
  );
}












function SeletorPessoas({ aux, valor, onChange, max }: any) {
  const [busca, setBusca] = useState('');
  const sel: string[] = Array.isArray(valor) ? valor : [];




  const norm = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(busca);

  const filtrar = (lista: any[]) => (lista || []).filter((p: any) =>
    !q || norm(p.nome).includes(q) || norm(p.email).includes(q) || norm(p.area).includes(q));

  const alternar = (id: string) => {
    if (sel.includes(id)) return onChange(sel.filter((x) => x !== id));
    if (max && sel.length >= max) {
      toast.error(`Máximo de ${max} responsáveis. Para mais gente que isso, atribua a uma ÁREA.`);
      return;
    }
    onChange([...sel, id]);
  };

  const nomeDe = (id: string) => {
    const t = [...(aux?.equipe || []), ...(aux?.fora_da_equipe || [])].find((p: any) => p.id === id);
    return t?.nome || 'pessoa';
  };

  const equipe = filtrar(aux?.equipe);
  const fora = filtrar(aux?.fora_da_equipe);

  return (
    <div className="space-y-2">
      {sel.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sel.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/15 text-primary">
              {nomeDe(id)}
              <button type="button" onClick={() => alternar(id)} className="opacity-60 hover:opacity-100">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input value={busca} onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar pessoa por nome, e-mail ou área…" />
      <div className="max-h-52 overflow-y-auto rounded-md border divide-y">
        {!equipe.length && !fora.length && (
          <div className="p-3 text-xs text-muted-foreground">Ninguém encontrado com esse termo.</div>
        )}
        {equipe.map((p: any) => (
          <button type="button" key={p.id} onClick={() => alternar(p.id)}
            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-foreground/5 ${
              sel.includes(p.id) ? 'bg-primary/10' : ''}`}>
            <span>
              {p.nome}
              <span className="text-xs text-muted-foreground">
                {p.cargo ? ` · ${p.cargo}` : ''}{p.area ? ` · ${p.area}` : ''}
              </span>
            </span>
            {sel.includes(p.id) && <Check className="h-4 w-4 text-primary shrink-0" />}
          </button>
        ))}
        {fora.length > 0 && (
          <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground bg-foreground/5">
            Fora da definição de equipe
          </div>
        )}
        {fora.map((p: any) => (
          <button type="button" key={p.id} onClick={() => alternar(p.id)}
            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-foreground/5 ${
              sel.includes(p.id) ? 'bg-primary/10' : ''}`}>
            <span>{p.nome}<span className="text-xs text-muted-foreground"> · {p.email}</span></span>
            {sel.includes(p.id) && <Check className="h-4 w-4 text-primary shrink-0" />}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Quem for adicionado recebe um aviso. Atribuir a uma <strong>área</strong> avisa
        quem cuida dela — mas só quando ninguém é nomeado.
      </p>
    </div>
  );
}


function FormMarco({ aux, inicial, onSalvar, onCancelar, salvando }: any) {
  const [f, setF] = useState<any>(() => ({
    titulo: inicial?.titulo || '',
    descricao: inicial?.descricao || '',
    tipo: inicial?.tipo || 'tarefa',
    status: inicial?.status || 'pendente',
    data_prevista: inicial?.data_prevista || '',
    area_id: inicial?.area_id ? String(inicial.area_id) : '',
    responsaveis: (inicial?.responsaveis || []).map((r: any) => r.profile_id),
  }));

  return (
    <Card className="glass-solid"><CardContent className="p-5 space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="block text-sm mb-1">Tarefa</label>
          <Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })}
            placeholder="O que precisa ser feito" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm mb-1">Detalhe (opcional)</label>
          <Textarea rows={2} value={f.descricao}
            onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm mb-1">Tipo</label>
          <Select value={f.tipo} onValueChange={(v) => setF({ ...f, tipo: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1200]">
              {Object.entries(MARCO_TIPO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-sm mb-1">Situação</label>
          <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1200]">
              {Object.entries(MARCO_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-sm mb-1">Prazo</label>
          <DatePicker value={f.data_prevista}
            onChange={(v: any) => setF({ ...f, data_prevista: v })} placeholder="Prazo" />
        </div>
        <div>
          <label className="block text-sm mb-1">Área responsável</label>
          {

                                                     }
          <Select value={f.area_id || '__nenhuma'}
            onValueChange={(v) => setF({ ...f, area_id: v === '__nenhuma' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
            <SelectContent className="z-[1200]">
              <SelectItem value="__nenhuma">Nenhuma</SelectItem>
              {(aux?.areas || []).map((a: any) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm mb-1">Responsáveis</label>
          <SeletorPessoas aux={aux} valor={f.responsaveis} max={aux?.max_responsaveis}
            onChange={(v: string[]) => setF({ ...f, responsaveis: v })} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={salvando} onClick={() => onSalvar(f)}>
          {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Salvar
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
      </div>
    </CardContent></Card>
  );
}






function CardCicloCriativo({ det, podeEditar, onMudou }: any) {
  const c = det.campanha;
  const st = det.ciclo_criativo;
  const [salvando, setSalvando] = useState(false);
  const temData = !!(c.data_lancamento || c.data_inicio);
  const criar = async () => {
    setSalvando(true);
    try {
      const r = await campanhas.cicloCriativo(c.id);
      if (r?.aviso) toast.warning(r.aviso); else toast.success('Ciclo criativo ativado em Eventos.');
      onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao criar o ciclo'); }
    finally { setSalvando(false); }
  };
  return (
    <Card className="glass-solid"><CardContent className="p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="space-y-0.5">
        <div className="font-medium flex items-center gap-2"><CalendarDays className="h-4 w-4" /> Ciclo criativo do Marketing</div>
        {c.evento_id ? (
          <div className="text-xs text-muted-foreground">
            {st?.evento_apagado ? 'O evento deste ciclo foi apagado em Eventos.' : (
              <>Evento <strong>{st?.evento?.name || c.nome}</strong>{st?.evento?.date ? ` · Dia D ${dataBr(st.evento.date)}` : ''}
                {st?.ciclo ? ` · ciclo ${st.ciclo.status}` : ' · ciclo ainda não ativado (ative em Eventos)'}</>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            Cria um evento na categoria <strong>Campanhas</strong> com o Dia D = {c.data_lancamento ? 'lançamento' : c.data_inicio ? 'início' : 'lançamento (defina a data)'} e ativa as fases; as tarefas do Marketing aparecem nas Demandas.
          </div>
        )}
      </div>
      {c.evento_id && !st?.evento_apagado ? (
        <a href={`/eventos/${c.evento_id}`} className="text-xs underline flex items-center gap-1"><ExternalLink className="h-3.5 w-3.5" /> Abrir em Eventos</a>
      ) : podeEditar ? (
        <Button variant="outline" size="sm" onClick={criar} disabled={salvando || !temData} title={temData ? '' : 'Defina a data de lançamento ou o início'}>
          {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />} Criar ciclo criativo
        </Button>
      ) : null}
    </CardContent></Card>
  );
}

function AbaCronograma({ det, podeEditar, onMudou }: any) {
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aux, setAux] = useState<any | null>(null);
  const [auxErro, setAuxErro] = useState<string | null>(null);
  const marcos = det.marcos || [];

  useEffect(() => {
    campanhas.aux()
      .then((a: any) => { setAux(a); setAuxErro(null); })



      .catch((e: any) => setAuxErro(e?.message || 'Erro ao carregar pessoas e áreas'));
  }, []);

  const declararResultado = (r: any) => {
    if (r?.truncados) toast.warning(`${r.truncados} responsável(is) não entrou: o máximo é ${r.max_responsaveis}. Para mais gente, atribua a uma área.`);
    if (r?.invalidos?.length) toast.warning(`${r.invalidos.length} responsável(is) não foi reconhecido e ficou de fora.`);
    if (r?.avisados) toast.success(`Salvo · ${r.avisados} pessoa(s) avisada(s).`);
    else if (r?.avisados_area) toast.success(`Salvo · ${r.avisados_area} pessoa(s) da área avisada(s).`);
    else toast.success('Salvo.');
  };

  const criar = async (f: any) => {
    if (!f.titulo?.trim()) return toast.error('Dê um título à tarefa.');
    setSalvando(true);
    try {
      const r = await campanhas.marcos.criar(det.campanha.id, {
        titulo: f.titulo.trim(), descricao: f.descricao || null, tipo: f.tipo,
        status: f.status, data_prevista: f.data_prevista || null,
        area_id: f.area_id ? Number(f.area_id) : null,
        responsaveis: f.responsaveis,
        ordem: (marcos.at(-1)?.ordem || 0) + 10,
      });
      declararResultado(r); setNovo(false); onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao criar a tarefa'); }
    finally { setSalvando(false); }
  };

  const salvarEdicao = async (marcoId: string, f: any) => {
    if (!f.titulo?.trim()) return toast.error('O título não pode ficar vazio.');
    setSalvando(true);
    try {
      const r = await campanhas.marcos.atualizar(marcoId, {
        titulo: f.titulo.trim(), descricao: f.descricao || null, tipo: f.tipo,
        status: f.status, data_prevista: f.data_prevista || null,
        area_id: f.area_id ? Number(f.area_id) : null,
        responsaveis: f.responsaveis,
      });
      declararResultado(r); setEditando(null); onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  };

  const alternarConcluido = async (m: any) => {
    try {
      await campanhas.marcos.atualizar(m.id, { status: m.status === 'concluido' ? 'pendente' : 'concluido' });
      onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao atualizar'); }
  };

  const remover = async (m: any) => {
    if (!confirm(`Excluir a tarefa "${m.titulo}"?`)) return;
    try { await campanhas.marcos.remover(m.id); toast.success('Tarefa excluída.'); onMudou(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao excluir'); }
  };

  const hoje = det.hoje;
  const semDono = marcos.filter((m: any) => !m.responsaveis?.length && !m.area_id
    && !['concluido', 'cancelado'].includes(m.status)).length;

  return (
    <div className="space-y-4">
      <CardCicloCriativo det={det} podeEditar={podeEditar} onMudou={onMudou} />
      {auxErro && (
        <Card className="border-amber-500/40"><CardContent className="p-4 text-sm text-amber-600 flex gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>Não foi possível carregar as pessoas e áreas: {auxErro}. Sem isso não dá para atribuir responsável.</div>
        </CardContent></Card>
      )}
      {det.atribuicao_incompleta && (
        <Card className="border-amber-500/40"><CardContent className="p-4 text-sm text-amber-600 flex gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {
                                                                     }
          <div>Os responsáveis não carregaram ({det.atribuicao_incompleta}). As tarefas
          abaixo podem aparecer como "sem responsável" sem estar.</div>
        </CardContent></Card>
      )}
      {semDono > 0 && !det.atribuicao_incompleta && (
        <Card><CardContent className="p-4 text-sm flex gap-2 text-muted-foreground">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
          <div><strong>{semDono}</strong> tarefa(s) em aberto sem responsável nem área.
          Tarefa sem dono é trabalho que ninguém pegou.</div>
        </CardContent></Card>
      )}

      {podeEditar && (
        novo ? (
          <FormMarco aux={aux} inicial={null} salvando={salvando}
            onSalvar={criar} onCancelar={() => setNovo(false)} />
        ) : (
          <Button size="sm" onClick={() => setNovo(true)} disabled={!aux}>
            <Plus className="h-4 w-4 mr-1" /> Nova tarefa
          </Button>
        )
      )}

      {!marcos.length && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma tarefa no cronograma.
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {marcos.map((m: any) => {
          const atrasado = m.status !== 'concluido' && m.status !== 'cancelado'
            && m.data_prevista && String(m.data_prevista) < hoje;
          const atrib = rotuloDono(m);
          if (editando === m.id) {
            return (
              <FormMarco key={m.id} aux={aux} inicial={m} salvando={salvando}
                onSalvar={(f: any) => salvarEdicao(m.id, f)} onCancelar={() => setEditando(null)} />
            );
          }
          return (
            <Card key={m.id} className={atrasado ? 'border-red-500/40' : ''}>
              <CardContent className="p-4 flex flex-wrap items-start gap-3">
                <button type="button" title={m.status === 'concluido' ? 'Reabrir' : 'Concluir'}
                  disabled={!podeEditar}
                  onClick={() => podeEditar && alternarConcluido(m)}
                  className={`h-6 w-6 shrink-0 rounded-full border flex items-center justify-center ${
                    m.status === 'concluido' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600' : 'border-foreground/25'}`}>
                  {m.status === 'concluido' ? <Check className="h-3.5 w-3.5" /> : null}
                </button>
                <div className="flex-1 min-w-[220px]">
                  <div className={`font-medium text-sm ${m.status === 'concluido' ? 'line-through text-muted-foreground' : ''}`}>
                    {m.titulo}
                  </div>
                  {m.descricao && <div className="text-xs text-muted-foreground mt-0.5">{m.descricao}</div>}
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                    <Chip cor="bg-foreground/10 text-foreground">{MARCO_TIPO[m.tipo] || m.tipo}</Chip>
                    {m.data_prevista && (
                      <span className={atrasado ? 'text-red-600 font-medium' : ''}>
                        prazo {dataBr(m.data_prevista)}{atrasado ? ' · atrasado' : ''}
                      </span>
                    )}
                    {m.data_conclusao && <span>concluído em {dataBr(m.data_conclusao)}</span>}
                    <span className={atrib.tem_dono ? '' : 'text-amber-600'}>· {atrib.texto}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Chip cor={m.status === 'concluido' ? 'bg-emerald-500/15 text-emerald-600'
                    : m.status === 'bloqueado' ? 'bg-red-500/15 text-red-600'
                    : m.status === 'em_andamento' ? 'bg-sky-500/15 text-sky-600' : 'bg-foreground/10 text-muted-foreground'}>
                    {MARCO_STATUS[m.status] || m.status}
                  </Chip>
                  {podeEditar && (
                    <>
                      <Button variant="ghost" size="icon" title="Editar"
                        disabled={!aux} onClick={() => setEditando(m.id)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Excluir" onClick={() => remover(m)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}




function AbaDisparos({ det, podeEditar, podeAtivar, onMudou }: any) {
  const [novo, setNovo] = useState<any | null>(null);
  const [previa, setPrevia] = useState<any | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [segmentos, setSegmentos] = useState<any>({ segmentos: {}, canais: [] });
  const disparos = det.disparos || [];

  useEffect(() => { campanhas.segmentos().then(setSegmentos).catch(() => {}); }, []);

  const verPrevia = async () => {
    setCarregandoPrevia(true); setPrevia(null);
    try {
      setPrevia(await campanhas.disparos.previa(det.campanha.id, {
        canal: novo?.canal || 'email', segmento: novo?.segmento || 'todos',
      }));
    } catch (e: any) { toast.error(e?.message || 'Erro ao calcular a prévia'); }
    finally { setCarregandoPrevia(false); }
  };

  const salvarNovo = async () => {
    if (!novo?.nome?.trim()) return toast.error('Dê um nome ao disparo.');
    if (!novo?.corpo_texto?.trim() && !novo?.wa_template) return toast.error('Escreva a mensagem.');
    try {
      await campanhas.disparos.criar(det.campanha.id, {
        nome: novo.nome.trim(), canal: novo.canal || 'email', segmento: novo.segmento || 'todos',
        assunto: novo.assunto || null, corpo_texto: novo.corpo_texto || null,
        wa_template: novo.wa_template || null, recorrencia: novo.recorrencia || 'unico',
      });
      toast.success('Disparo criado como rascunho.'); setNovo(null); setPrevia(null); onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao criar o disparo'); }
  };

  const agendar = async (d: any) => {
    if (!confirm(`Enviar "${d.nome}" agora? A mensagem vai para o público do segmento escolhido.`)) return;
    try { await campanhas.disparos.agendar(d.id); toast.success('Disparo agendado — sai na próxima rodada do envio.'); onMudou(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao agendar'); }
  };

  const cancelar = async (d: any) => {
    try { await campanhas.disparos.cancelar(d.id); toast.success('Disparo cancelado.'); onMudou(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao cancelar'); }
  };

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 text-xs text-muted-foreground flex gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
        <div>
          O e-mail é o canal principal desta campanha. O WhatsApp só alcança quem deu
          <strong> opt-in</strong> (é exigência da Meta para mensagem de campanha) e depende de um
          template aprovado. Para desligar tudo de uma vez, use o interruptor em
          <strong> Comunicação → Disparos → Automáticas</strong>.
        </div>
      </CardContent></Card>

      {podeEditar && (
        novo ? (
          <Card className="glass-solid"><CardContent className="p-5 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Input placeholder="Nome do disparo (só aparece no histórico)" value={novo.nome || ''}
                onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Select value={novo.canal || 'email'} onValueChange={(v) => { setNovo({ ...novo, canal: v }); setPrevia(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[1200]">
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={novo.segmento || 'todos'} onValueChange={(v) => { setNovo({ ...novo, segmento: v }); setPrevia(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[1200]">
                    {Object.entries(segmentos.segmentos || {}).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{String(v)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(novo.canal || 'email') === 'email' && (
                <Input className="md:col-span-2" placeholder="Assunto do e-mail" value={novo.assunto || ''}
                  onChange={(e) => setNovo({ ...novo, assunto: e.target.value })} />
              )}
              {(novo.canal || 'email') === 'whatsapp' && (
                <Input className="md:col-span-2" placeholder="Nome do template aprovado na Meta"
                  value={novo.wa_template || ''} onChange={(e) => setNovo({ ...novo, wa_template: e.target.value })} />
              )}
              <Textarea className="md:col-span-2" rows={6} value={novo.corpo_texto || ''}
                onChange={(e) => setNovo({ ...novo, corpo_texto: e.target.value })}
                placeholder={'Mensagem…\n\nVocê pode usar: {{campanha}} {{meta}} {{arrecadado}} {{falta}} {{pct}} {{link}}'} />
              <Select value={novo.recorrencia || 'unico'} onValueChange={(v) => setNovo({ ...novo, recorrencia: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200]">
                  <SelectItem value="unico">Enviar uma vez</SelectItem>
                  <SelectItem value="semanal_segunda">Modelo do pocket de toda segunda</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {

                                                  }
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={verPrevia} disabled={carregandoPrevia}>
                {carregandoPrevia ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Ver quem vai receber
              </Button>
              <Button size="sm" onClick={salvarNovo}>Salvar como rascunho</Button>
              <Button size="sm" variant="ghost" onClick={() => { setNovo(null); setPrevia(null); }}>Cancelar</Button>
            </div>

            {previa && (
              <div className="rounded-md p-3 text-sm space-y-2" style={{ background: 'var(--surface)' }}>
                <div>
                  <strong className="text-lg tabular-nums">{previa.total_alvo}</strong> pessoas recebem,
                  de {previa.total_base} na base do segmento.
                </div>
                {previa.exemplo?.length ? (
                  <div className="text-xs text-muted-foreground">Ex.: {previa.exemplo.join(' · ')}…</div>
                ) : null}
                {Object.keys(previa.motivos || {}).length ? (
                  <div className="text-xs space-y-0.5">
                    <div className="text-muted-foreground">Quem fica de fora, e por quê:</div>
                    {Object.entries(previa.motivos).map(([m, q]) => (
                      <div key={m}>{String(q)} — {m}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </CardContent></Card>
        ) : (
          <Button size="sm" onClick={() => setNovo({})}><Plus className="h-4 w-4 mr-1" /> Novo disparo</Button>
        )
      )}

      {!disparos.length && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhum disparo criado.
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {disparos.map((d: any) => (
          <Card key={d.id}><CardContent className="p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium text-sm">{d.nome}</div>
                <div className="text-xs text-muted-foreground">
                  {d.canal === 'email' ? 'E-mail' : d.canal === 'whatsapp' ? 'WhatsApp' : d.canal}
                  {' · '}{segmentos.segmentos?.[d.segmento] || d.segmento}
                  {d.recorrencia === 'semanal_segunda' ? ' · modelo semanal' : ''}
                  {d.agendado_para ? ` · agendado ${new Date(d.agendado_para).toLocaleString('pt-BR')}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Chip cor={d.status === 'enviado' ? 'bg-emerald-500/15 text-emerald-600'
                  : d.status === 'enviando' ? 'bg-sky-500/15 text-sky-600'
                  : d.status === 'falhou' ? 'bg-red-500/15 text-red-600'
                  : d.status === 'agendado' ? 'bg-amber-500/15 text-amber-600' : 'bg-foreground/10 text-muted-foreground'}>
                  {d.status}
                </Chip>
                {podeAtivar && ['rascunho', 'agendado'].includes(d.status) && (
                  <>
                    {d.status === 'rascunho' && (
                      <Button size="sm" onClick={() => agendar(d)}><Send className="h-4 w-4 mr-1" /> Enviar</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => cancelar(d)} title="Cancelar">
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            {(d.total_alvo > 0 || d.total_enviado > 0) && (
              <div className="text-xs text-muted-foreground">
                {d.total_enviado} de {d.total_alvo} enviados
                {d.total_falha > 0 ? ` · ${d.total_falha} falharam` : ''}
                {d.total_pulado > 0 ? ` · ${d.total_pulado} fora do público` : ''}
              </div>
            )}
            {d.motivos_fora && Object.keys(d.motivos_fora).length > 0 && (
              <div className="text-xs text-muted-foreground">
                Fora: {Object.entries(d.motivos_fora).map(([m, q]) => `${q} ${m}`).join(' · ')}
              </div>
            )}
            {d.erro && <div className="text-xs text-red-600">{d.erro}</div>}
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}



function AbaDoacoes({ det, podeEditar, onMudou }: any) {
  const [linhas, setLinhas] = useState<any[] | null>(null);
  const [agrads, setAgrads] = useState<any[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    campanhas.lancamentos(det.campanha.id)
      .then(setLinhas)
      .catch((e: any) => { setErro(e?.message || 'Erro ao carregar'); setLinhas([]); });
    campanhas.agradecimentos.list(det.campanha.id).then(setAgrads).catch(() => setAgrads([]));
  }, [det.campanha.id]);

  const vetar = async (l: any) => {
    const motivo = prompt('Por que este crédito NÃO é desta campanha? (fica registrado)');
    if (motivo === null) return;
    try {
      await campanhas.vincular(det.campanha.id, {
        lancamento_bruto_id: l.lancamento_bruto_id || null,
        transacao_id: l.transacao_id || null,
        incluir: false, motivo,
      });
      toast.success('Crédito tirado da campanha.');
      setLinhas(null);
      campanhas.lancamentos(det.campanha.id).then(setLinhas).catch(() => setLinhas([]));
      onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao vetar'); }
  };

  const enviados = (agrads || []).filter((a) => a.status === 'enviado').length;
  const pulados = (agrads || []).filter((a) => a.status === 'pulado').length;

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 text-xs text-muted-foreground flex gap-2">
        <Heart className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <div>
          O agradecimento ao doador é automático, por e-mail, e a mensagem é
          <strong> genérica de propósito</strong>: não cita nome nem valor, porque telefone e e-mail
          nesta base estão cadastrados em nome de familiares e filhos.
          {agrads !== null && (
            <> Até agora: <strong>{enviados} enviados</strong>
              {pulados > 0 ? `, ${pulados} sem para onde mandar (doação anônima ou sem contato)` : ''}.</>
          )}
        </div>
      </CardContent></Card>

      {erro && (
        <Card className="border-amber-500/40"><CardContent className="p-4 text-sm text-amber-600 flex gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> Não foi possível carregar os lançamentos: {erro}
        </CardContent></Card>
      )}

      {linhas === null ? (
        <div className="p-6 flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando os lançamentos…
        </div>
      ) : !linhas.length ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhum lançamento identificado nesta campanha ainda.
        </CardContent></Card>
      ) : (
        <Card className="glass-solid"><CardContent className="p-0 overflow-x-auto">
          <div className="px-3 pt-3 text-xs text-muted-foreground">
            {linhas.length} lançamento(s) · {brl(linhas.reduce((s: number, l: any) => s + (Number(l.valor_centavos) || 0), 0))}
            {det.fim_credito ? ` · créditos com o dígito até ${dataBr(det.fim_credito)}` : ''}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b">
              <th className="p-3">Data</th>
              <th className="p-3">Descrição</th>
              <th className="p-3">Situação</th>
              <th className="p-3 text-right">Valor</th>
              {podeEditar && <th className="p-3" />}
            </tr></thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={l.transacao_id || l.lancamento_bruto_id || l.cobranca_id || i} className="border-b last:border-0">
                  <td className="p-3 whitespace-nowrap">{dataBr(l.data)}</td>
                  <td className="p-3">{l.descricao}</td>
                  <td className="p-3">
                    <Chip cor={l.situacao === 'confirmado' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'}>
                      {l.situacao === 'confirmado'
                        ? (l.origem === 'online' ? 'online' : 'classificado')
                        : 'aguardando o financeiro'}
                    </Chip>
                  </td>
                  <td className="p-3 text-right tabular-nums">{brl(l.valor_centavos)}</td>
                  {podeEditar && (
                    <td className="p-3 text-right">
                      {
                                                                                }
                      {l.origem === 'caixa' && (
                        <Button variant="ghost" size="sm" onClick={() => vetar(l)}
                          title="Este crédito não é desta campanha">
                          Não é daqui
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  );
}








function ConfigContabil({ det, podeEditar, onMudou }: any) {
  const c = det.campanha;
  const [aux, setAux] = useState<any | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [pc, setPc] = useState<string>('');
  const [cc, setCc] = useState<string>('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!editando || aux) return;
    campanhas.auxContabil().then(setAux).catch((e: any) => setErro(e?.message || 'Não foi possível carregar o plano de contas'));
  }, [editando, aux]);
  const nomePc = useMemo(() => (aux?.plano_contas || []).find((x: any) => x.id === c.plano_contas_id), [aux, c.plano_contas_id]);
  const nomeCc = useMemo(() => (aux?.centros_custo || []).find((x: any) => x.id === c.centro_custo_id), [aux, c.centro_custo_id]);
  const abrir = () => { setPc(c.plano_contas_id || ''); setCc(c.centro_custo_id || ''); setEditando(true); };
  const salvar = async () => {
    setSalvando(true);
    try {
      await campanhas.atualizar(c.id, { plano_contas_id: pc || null, centro_custo_id: cc || null });
      toast.success('Conta da campanha salva.'); setEditando(false); onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  };
  return (
    <Card><CardContent className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm">Conta contábil</div>
        {podeEditar && !editando && <Button variant="ghost" size="sm" onClick={abrir}><Pencil className="h-4 w-4 mr-1" /> Editar</Button>}
      </div>
      {!editando ? (
        <div className="text-sm space-y-1">
          <div>Plano de contas: <span className="font-medium">{c.plano_contas_id ? (nomePc ? `${nomePc.codigo} · ${nomePc.nome}` : 'definido') : '—'}</span></div>
          <div>Centro de custo: <span className="font-medium">{c.centro_custo_id ? (nomeCc ? `${nomeCc.codigo} · ${nomeCc.nome}` : 'definido') : '—'}</span></div>
          {!c.plano_contas_id && (
            <div className="text-xs text-amber-600 flex gap-1.5 pt-1"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Sem a conta, a fila do financeiro só avisa que o CPF é de um aderente — o botão "Aprovar na conta da campanha" não aparece.</div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {erro && <div className="text-xs text-amber-600">{erro}</div>}
          {!aux && !erro && <div className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> carregando…</div>}
          {aux && (
            <>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Plano de contas (receita)</label>
                <Select value={pc || 'nenhum'} onValueChange={(v) => setPc(v === 'nenhum' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">— nenhuma —</SelectItem>
                    {aux.plano_contas.map((x: any) => <SelectItem key={x.id} value={x.id}>{x.codigo} · {x.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Centro de custo</label>
                <Select value={cc || 'nenhum'} onValueChange={(v) => setCc(v === 'nenhum' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">— nenhum —</SelectItem>
                    {aux.centros_custo.map((x: any) => <SelectItem key={x.id} value={x.id}>{x.codigo} · {x.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="text-xs text-muted-foreground">É decisão contábil (qual conta recebe a receita desta campanha). Se tiver dúvida, confirme com o financeiro antes de salvar.</div>
          <div className="flex gap-2">
            <Button size="sm" onClick={salvar} disabled={salvando || !aux}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={salvando}>Cancelar</Button>
          </div>
        </div>
      )}
    </CardContent></Card>
  );
}






function AbaComparativo({ det, podeAtivar, onMudou, onVerAtivacoes }: any) {
  const c = det.campanha;
  const [dados, setDados] = useState<any | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const carregar = useCallback(() => {
    setErro(null);
    campanhas.comparativo(c.id).then(setDados).catch((e: any) => setErro(e?.message || 'Não foi possível montar o comparativo'));
  }, [c.id]);
  useEffect(() => { carregar(); }, [carregar]);

  const encerrar = async () => {
    setSalvando(true);
    try { await campanhas.status(c.id, 'encerrada'); toast.success('Campanha encerrada.'); setConfirmando(false); onMudou(); carregar(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao encerrar'); }
    finally { setSalvando(false); }
  };

  if (erro) return <Card className="border-amber-500/40"><CardContent className="p-4 text-sm text-amber-600 flex gap-2"><AlertTriangle className="h-4 w-4 mt-0.5" /> {erro}</CardContent></Card>;
  if (!dados) return <div className="p-4 flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Montando o comparativo…</div>;

  const din = dados.dinheiro;
  const fmt = (v: any) => (v == null ? '—' : din ? brl(v) : `${Number(v)} pessoa(s)`);
  const a = dados.alvo;
  const podeEncerrar = podeAtivar && ['ativa', 'pausada'].includes(c.status);
  const rotuloProm = din ? 'PROMETIDO' : 'INSCRITOS';

  return (
    <div className="space-y-4">
      {            }
      <Card className="glass-solid"><CardContent className="p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="space-y-0.5">
          <div className="font-medium">
            {dados.encerrada ? 'Campanha encerrada' : dados.janela_terminou ? 'A janela terminou — a campanha ainda está aberta' : 'Campanha em curso'}
            {' '}<span className="text-muted-foreground font-normal">· {dataBr(c.data_inicio)} → {dataBr(c.data_fim)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Números calculados agora, nunca gravados: reabrir esta aba depois dá o mesmo resultado enquanto os dados não mudarem.
            {!dados.encerrada && ' Encerrar não muda o número — só fecha a porta de adesão e o dígito.'}
          </div>
        </div>
        {podeEncerrar && !confirmando && <Button variant="outline" size="sm" onClick={() => setConfirmando(true)}>Encerrar campanha</Button>}
        {confirmando && (
          <div className="flex flex-wrap items-center gap-2 text-xs rounded-md border p-2">
            <span>Encerra a campanha (a adesão fecha, o dígito deixa de identificar). Confirma?</span>
            <Button size="sm" onClick={encerrar} disabled={salvando}>{salvando ? 'Encerrando…' : 'Sim, encerrar'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)} disabled={salvando}>Cancelar</Button>
          </div>
        )}
      </CardContent></Card>

      {dados.avisos?.length > 0 && (
        <Card className="border-amber-500/40"><CardContent className="p-3 text-xs text-amber-600 space-y-1">
          {dados.avisos.map((m: string, i: number) => <div key={i} className="flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{m}</div>)}
        </CardContent></Card>
      )}

      {                                         }
      <Card className="glass-solid"><CardContent className="p-5 space-y-3">
        <div className="text-sm font-medium">Planejado × {din ? 'prometido' : 'inscrito'} × realizado</div>
        <div className="grid gap-3 md:grid-cols-4 text-sm">
          <div className="rounded-md p-3" style={{ background: 'var(--surface)' }}>
            <div className="text-xs text-muted-foreground">ALVO ORIGINAL</div>
            <div className="text-lg font-semibold tabular-nums">{fmt(a.original)}</div>
            {a.mudou
              ? <div className="text-xs text-amber-600">mudou {a.mudancas}× · final {fmt(a.final)}</div>
              : <div className="text-xs text-muted-foreground">nunca mudou</div>}
          </div>
          <div className="rounded-md p-3" style={{ background: 'var(--surface)' }}>
            <div className="text-xs text-muted-foreground">{rotuloProm}</div>
            <div className="text-lg font-semibold tabular-nums">{fmt(dados.prometido)}</div>
            <div className="text-xs text-muted-foreground">{pctTxt(dados.pct.prometido_vs_original)} do alvo original{a.mudou ? ` · ${pctTxt(dados.pct.prometido_vs_final)} do final` : ''}</div>
          </div>
          <div className="rounded-md p-3" style={{ background: 'var(--surface)' }}>
            <div className="text-xs text-muted-foreground">REALIZADO</div>
            <div className="text-lg font-semibold tabular-nums">{fmt(dados.realizado)}</div>
            <div className="text-xs text-muted-foreground">{pctTxt(dados.pct.realizado_vs_original)} do alvo original{a.mudou ? ` · ${pctTxt(dados.pct.realizado_vs_final)} do final` : ''}</div>
          </div>
          <div className="rounded-md p-3" style={{ background: 'var(--surface)' }}>
            <div className="text-xs text-muted-foreground">REALIZADO ÷ {rotuloProm}</div>
            <div className="text-lg font-semibold tabular-nums">{pctTxt(dados.pct.realizado_vs_prometido)}</div>
            <div className="text-xs text-muted-foreground">{din ? 'quanto do prometido virou dinheiro na conta' : 'quantos inscritos chegaram ao fim'}</div>
          </div>
        </div>
        {a.historico?.length > 0 && (
          <div className="text-xs space-y-1">
            <div className="text-muted-foreground">Mudanças do alvo (com o motivo registrado):</div>
            {a.historico.map((h: any, i: number) => (
              <div key={i}>{dataBr(h.em)} · {fmt(h.de)} → {fmt(h.para)} — <span className="text-muted-foreground">{h.motivo}</span></div>
            ))}
          </div>
        )}
        {din && dados.inscritos_resumo && (
          <div className="text-xs text-muted-foreground">
            Aderentes: {dados.inscritos_resumo.total} · em dia {dados.inscritos_resumo.em_dia} · atrasados {dados.inscritos_resumo.atrasado} ·
            sem entrada {dados.inscritos_resumo.sem_entrada} · sem valor {dados.inscritos_resumo.sem_compromisso} · ainda não venceu {dados.inscritos_resumo.aguardando}.
            ⚠️ O realizado inclui quem doou sem aderir; a soma dos aderentes é {brl(dados.inscritos_resumo.total_entradas_centavos || 0)}.
          </div>
        )}
      </CardContent></Card>

      {                  }
      {(dados.por_ativacao?.length > 0 || dados.sem_qr?.inscritos > 0) && (
        <Card className="glass-solid"><CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">Por ativação (de onde veio cada inscrito)</div>
            <Button variant="ghost" size="sm" onClick={onVerAtivacoes}><QrCode className="h-4 w-4 mr-1" /> Ativações</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground text-left">
                <th className="py-1 pr-2">Ativação</th><th className="py-1 pr-2 text-right">Acessos</th><th className="py-1 pr-2 text-right">Inscritos</th>
                <th className="py-1 pr-2 text-right">Conversão</th>{din && <><th className="py-1 pr-2 text-right">Prometeram</th><th className="py-1 pr-2 text-right">Trouxeram</th></>}
              </tr></thead>
              <tbody>
                {[...dados.por_ativacao, dados.sem_qr].filter((x: any) => x.slug || x.inscritos > 0).map((x: any) => (
                  <tr key={x.slug || 'sem-qr'} className="border-t">
                    <td className="py-1.5 pr-2">{x.titulo}{x.onde ? <span className="text-xs text-muted-foreground"> · {x.onde}</span> : null}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{x.acessos == null ? '—' : x.acessos}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{x.inscritos}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{x.conversao_pct == null ? '—' : pctTxt(x.conversao_pct)}</td>
                    {din && <><td className="py-1.5 pr-2 text-right tabular-nums">{brl(x.prometido_centavos || 0)}</td><td className="py-1.5 pr-2 text-right tabular-nums">{brl(x.trouxe_centavos || 0)}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-muted-foreground">Conversão = inscritos ÷ acessos ao QR. "Trouxeram" é o que o CPF desses inscritos depositou (por dígito ou link) — não é a barrinha.</div>
        </CardContent></Card>
      )}

      {                                        }
      {dados.serie_resumo && (
        <Card className="glass-solid"><CardContent className="p-5 space-y-2">
          <div className="text-sm font-medium">A porta antes × durante a campanha</div>
          <div className="grid gap-3 md:grid-cols-3 text-sm">
            <div className="rounded-md p-3" style={{ background: 'var(--surface)' }}>
              <div className="text-xs text-muted-foreground">média/mês FORA da campanha</div>
              <div className="text-lg font-semibold tabular-nums">{dados.serie_resumo.media_mes_fora == null ? '—' : dados.serie_resumo.media_mes_fora.toFixed(1)}</div>
            </div>
            <div className="rounded-md p-3" style={{ background: 'var(--surface)' }}>
              <div className="text-xs text-muted-foreground">média/mês NA campanha ({dados.serie_resumo.meses_campanha} mês(es))</div>
              <div className="text-lg font-semibold tabular-nums">{dados.serie_resumo.media_mes_campanha == null ? '—' : dados.serie_resumo.media_mes_campanha.toFixed(1)}</div>
              <div className="text-xs text-muted-foreground">{dados.serie_resumo.lift_pct == null ? '' : `${dados.serie_resumo.lift_pct > 0 ? '+' : ''}${dados.serie_resumo.lift_pct}% contra fora`}</div>
            </div>
            <div className="rounded-md p-3" style={{ background: 'var(--surface)' }}>
              <div className="text-xs text-muted-foreground">veio por QR nos meses da campanha</div>
              <div className="text-lg font-semibold tabular-nums">{dados.serie_resumo.com_qr_campanha} de {dados.serie_resumo.total_campanha}</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">A porta inteira (não só a campanha): é o que separa "a campanha trouxe gente" de "o mês já seria assim".</div>
        </CardContent></Card>
      )}
    </div>
  );
}


function IndicadorChave({ ind }: { ind: any }) {
  const m = ind.manutencao;
  return (
    <div className="rounded-md border p-3 text-sm flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-xs text-muted-foreground">Indicador-chave do valor</span>
      <span className="font-medium">{ind.manutencao_label}:</span>
      <span className="text-lg font-semibold tabular-nums">{m && m.pct != null ? `${Number(m.pct).toFixed(1)}%` : '—'}</span>
      {m && m.n != null && <span className="text-xs text-muted-foreground">{m.n} pessoa(s){m.base ? ` de ${m.base}` : ''} · base viva</span>}
      {ind.aviso && <span className="text-xs text-amber-600">{ind.aviso}</span>}
      {ind.entrada_label && <span className="text-xs text-muted-foreground w-full">Entrada: {ind.entrada_label} — é o gráfico de 12 meses abaixo.</span>}
    </div>
  );
}







function SeriePorta({ serie, campanha }: { serie: any; campanha: any }) {
  const pts: any[] = serie?.serie || [];
  if (serie?.aviso && !pts.length) {
    return <div className="text-xs text-amber-600 flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 mt-0.5" />{serie.aviso}</div>;
  }
  if (!pts.length) return null;
  const max = Math.max(1, ...pts.map((p) => Number(p.total || 0)));
  const mesTxt = (m: string) => {
    const [y, mm] = m.split('-');
    const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return `${nomes[Number(mm) - 1] || mm}/${String(y).slice(2)}`;
  };
  const naCamp = pts.filter((p) => p.na_campanha);
  const fora = pts.filter((p) => !p.na_campanha);
  const media = (xs: any[]) => (xs.length ? xs.reduce((a, p) => a + Number(p.total || 0), 0) / xs.length : null);
  const mc = media(naCamp); const mf = media(fora);
  const qrCamp = naCamp.reduce((a, p) => a + Number(p.com_qr || 0), 0);
  const totCamp = naCamp.reduce((a, p) => a + Number(p.total || 0), 0);
  return (
    <div className="rounded-md border p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-medium">12 meses da porta{serie.entrada_label ? ` · ${serie.entrada_label}` : ''}</div>
        <div className="text-xs text-muted-foreground">até {mesTxt(serie.ate || pts[pts.length - 1].mes)}</div>
      </div>
      <div className="flex items-end gap-1 h-32">
        {pts.map((p) => {
          const tot = Number(p.total || 0); const qr = Number(p.com_qr || 0);
          const h = Math.round((tot / max) * 100); const hq = tot ? Math.round((qr / tot) * h) : 0;
          return (
            <div key={p.mes} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={`${mesTxt(p.mes)}: ${tot} inscrição(ões)${qr ? ` · ${qr} por QR` : ''}${p.na_campanha ? ' · mês da campanha' : ''}`}>
              <div className="text-[10px] tabular-nums text-muted-foreground">{tot || ''}</div>
              <div className={`w-full rounded-t relative ${p.na_campanha ? 'bg-primary/35' : 'bg-foreground/15'}`} style={{ height: `${Math.max(h, tot ? 3 : 1)}%` }}>
                {hq > 0 && <div className="absolute bottom-0 left-0 right-0 bg-primary rounded-t" style={{ height: `${Math.round((qr / tot) * 100)}%` }} />}
              </div>
              <div className={`text-[10px] ${p.na_campanha ? 'font-medium' : 'text-muted-foreground'}`}>{mesTxt(p.mes)}</div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span><span className="inline-block w-3 h-3 rounded-sm bg-primary/35 align-middle mr-1" />meses da campanha{mc != null ? ` · média ${mc.toFixed(1)}/mês` : ''}</span>
        <span><span className="inline-block w-3 h-3 rounded-sm bg-foreground/15 align-middle mr-1" />outros meses{mf != null ? ` · média ${mf.toFixed(1)}/mês` : ''}</span>
        <span><span className="inline-block w-3 h-3 rounded-sm bg-primary align-middle mr-1" />veio por QR da campanha{totCamp ? ` · ${qrCamp} de ${totCamp}` : ''}</span>
      </div>
      {!campanha?.data_inicio && <div className="text-xs text-amber-600">Sem início e fim, nenhum mês é marcado como "da campanha".</div>}
      {serie.aviso && <div className="text-xs text-amber-600">{serie.aviso}</div>}
    </div>
  );
}


function CardHistorico({ det, onAbrir }: { det: any; onAbrir?: (id: string) => void }) {
  const eds: any[] = (det.edicoes || []).filter((e: any) => !e.atual);
  const p = det.programa;
  const fmt = (e: any, v: any) => (v == null ? '—' : e.unidade === 'centavos' ? brl(v) : `${Number(v)} pessoa(s)`);
  return (
    <Card className="glass-solid">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium"><History className="h-4 w-4" /> Histórico da campanha</div>
        <div className="text-xs text-muted-foreground">
          <strong>{p.nome}</strong> · {p.recorrente ? 'recorrente' : 'única'} · {VALOR_NOME[p.valor] || p.valor_nome || p.valor}
        </div>
        {!eds.length ? (
          <div className="text-xs text-muted-foreground">Esta é a única edição até agora. A próxima entra aqui para comparar.</div>
        ) : (
          <div className="space-y-2">
            {eds.map((e: any) => (
              <button key={e.id} type="button" onClick={() => onAbrir && onAbrir(e.id)}
                className="w-full text-left rounded-md border p-2.5 hover:bg-foreground/5 text-sm space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{e.nome}{e.edicao_rotulo ? ` · ${e.edicao_rotulo}` : ''}</span>
                  <Chip cor={statusCor(e.status)}>{STATUS_LABEL[e.status] || e.status}</Chip>
                  <span className="text-xs text-muted-foreground">{dataBr(e.data_inicio)} → {dataBr(e.data_fim)}</span>
                </div>
                {e.reguas ? (
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div><div className="text-muted-foreground">alvo</div><div className="tabular-nums">{fmt(e, e.reguas.alvo?.valor)}</div></div>
                    <div><div className="text-muted-foreground">{e.unidade === 'centavos' ? 'prometido' : 'inscritos'}</div>
                      <div className="tabular-nums">{e.unidade === 'centavos' ? brl(e.reguas.inscritos?.prometido_total_centavos || 0) : `${e.reguas.inscritos?.pessoas || 0}`} · {pctTxt(e.reguas.pct?.inscritos_vs_alvo)}</div></div>
                    <div><div className="text-muted-foreground">realizado</div><div className="tabular-nums">{fmt(e, e.reguas.realizado?.valor || 0)} · {pctTxt(e.reguas.pct?.realizado_vs_alvo)}</div></div>
                  </div>
                ) : e.aviso ? <div className="text-xs text-amber-600">{e.aviso}</div> : null}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Reguas({ det }: { det: any }) {
  const r = det.reguas;
  const dinheiro = r.unidade === 'centavos';
  const fmt = (v: any) => (dinheiro ? brl(v) : `${Number(v || 0)} pessoa(s)`);
  const ins = r.inscritos || {};
  return (
    <div className="rounded-md border p-4 space-y-3">
      <div className="text-sm font-medium">As três réguas</div>
      <div className="grid gap-3 md:grid-cols-3 text-sm">
        <div className="rounded-md p-3" style={{ background: 'var(--surface)' }}>
          <div className="text-xs text-muted-foreground">ALVO · planejado antes das inscrições</div>
          <div className="text-lg font-semibold tabular-nums">{r.alvo?.valor ? fmt(r.alvo.valor) : '—'}</div>
          {det.campanha?.alvo_definido_em && (
            <div className="text-xs text-muted-foreground">definido em {dataBr(det.campanha.alvo_definido_em)}</div>
          )}
        </div>
        <div className="rounded-md p-3" style={{ background: 'var(--surface)' }}>
          <div className="text-xs text-muted-foreground">{dinheiro ? 'PROMETIDO · pelos inscritos' : 'INSCRITOS'}</div>
          <div className="text-lg font-semibold tabular-nums">
            {dinheiro ? brl(ins.prometido_total_centavos || 0) : `${ins.pessoas || 0} pessoa(s)`}
          </div>
          <div className="text-xs text-muted-foreground">
            {dinheiro
              ? `${ins.pessoas || 0} inscrito(s) · ${ins.com_compromisso || 0} com valor · ${brl(ins.compromisso_mensal_centavos || 0)}/mês × ${ins.meses || '—'} meses`
              : `${pctTxt(r.pct?.inscritos_vs_alvo)} do alvo`}
          </div>
          {dinheiro && <div className="text-xs text-muted-foreground">{pctTxt(r.pct?.inscritos_vs_alvo)} do alvo</div>}
        </div>
        <div className="rounded-md p-3" style={{ background: 'var(--surface)' }}>
          <div className="text-xs text-muted-foreground">REALIZADO · {dinheiro ? 'o que caiu na conta' : 'integrados'}</div>
          <div className="text-lg font-semibold tabular-nums">{fmt(r.realizado?.valor || 0)}</div>
          <div className="text-xs text-muted-foreground">
            {pctTxt(r.pct?.realizado_vs_alvo)} do alvo · {pctTxt(r.pct?.realizado_vs_prometido)} do {dinheiro ? 'prometido' : 'inscrito'}
          </div>
          {dinheiro && ins.meses_decorridos != null && (
            <div className="text-xs text-muted-foreground">
              até hoje era pra ter entrado {brl(ins.prometido_ate_hoje_centavos || 0)} ({ins.meses_decorridos}/{ins.meses || '—'} meses)
            </div>
          )}
        </div>
      </div>
      {det.inscritos_resumo?.aviso && (
        <div className="text-xs text-amber-600 flex gap-1.5"><AlertTriangle className="h-3.5 w-3.5 mt-0.5" />{det.inscritos_resumo.aviso}</div>
      )}
    </div>
  );
}

function CardAdesao({ det, podeEditar, onMudou }: any) {
  const c = det.campanha;
  const a = det.adesao || {};
  const [salvando, setSalvando] = useState(false);
  const toggle = async () => {
    setSalvando(true);
    try { await campanhas.atualizar(c.id, { mostrar_adesoes: !c.mostrar_adesoes }); onMudou(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao atualizar'); }
    finally { setSalvando(false); }
  };
  return (
    <Card><CardContent className="p-5 space-y-3">
      <div className="font-medium text-sm">Formulário de adesão</div>
      <div className="text-xs text-muted-foreground">
        {a.porta === 'voluntariado'
          ? 'É o formulário de inscrição de voluntariado: toda inscrição dentro da janela de datas conta como adesão a esta campanha.'
          : 'Vive em Inscrições (contrato mínimo: nome, celular e CPF · quem já é da casa entra só com o CPF). Os QRs das ativações apontam para ele.'}
      </div>
      {a.url ? (
        <div className="flex items-center gap-2">
          <Input readOnly value={a.url} className="text-xs" />
          <Button variant="ghost" size="icon" title="Copiar"
            onClick={() => { navigator.clipboard?.writeText(a.url); toast.success('Link copiado.'); }}>
            <Copy className="h-4 w-4" />
          </Button>
          <a href={a.url} target="_blank" rel="noreferrer"><Button variant="ghost" size="icon" title="Abrir"><ExternalLink className="h-4 w-4" /></Button></a>
        </div>
      ) : (
        <div className="text-xs text-amber-600">O formulário ainda não foi criado — a migration 20260928170000 precisa estar aplicada.</div>
      )}
      {a.evento_status && (
        <div className="text-xs text-muted-foreground">Estado do formulário: <strong>{a.evento_status}</strong> (acompanha o status da campanha).</div>
      )}
      {podeEditar && a.porta === 'adesao' && (
        <Button variant="outline" size="sm" disabled={salvando} onClick={toggle}>
          {c.mostrar_adesoes ? 'Esconder o contador público de adesões' : 'Mostrar contador público de adesões'}
        </Button>
      )}
    </CardContent></Card>
  );
}


const CANAL_LABEL: Record<string, string> = { fisico: 'Físico (cartaz)', digital: 'Digital (post/link)', culto: 'Culto (telão)' };

function AbaAtivacoes({ det, podeEditar }: any) {
  const c = det.campanha;
  const [dados, setDados] = useState<any | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ titulo: '', canal: 'fisico', onde: '', area_id: '' });
  const [areas, setAreas] = useState<any[]>([]);
  const [linksLivres, setLinksLivres] = useState<any[]>([]);
  const [adotarId, setAdotarId] = useState('');
  const [qr, setQr] = useState<any | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmaRemover, setConfirmaRemover] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try { setErro(null); setDados(await campanhas.ativacoes.list(c.id)); }
    catch (e: any) { setErro(e?.message || 'Erro ao carregar as ativações'); setDados({ ativacoes: [] }); }
  }, [c.id]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {

    inscricoesApi.areas().then((l: any) => setAreas((l || []).filter((a: any) => typeof a.id === 'number'))).catch(() => setAreas([]));
    linksApi.listar().then((l: any) => setLinksLivres((Array.isArray(l) ? l : l?.itens || []).filter((x: any) => !x.campanha_id && x.ativo !== false)))
      .catch(() => setLinksLivres([]));
  }, []);

  const criar = async () => {
    if (!form.titulo.trim()) return toast.error('Dê um nome à ativação (ex.: "Banner do lounge").');
    setSalvando(true);
    try {
      const a = await campanhas.ativacoes.criar(c.id, {
        titulo: form.titulo.trim(), canal: form.canal, onde: form.onde || null,
        area_id: form.area_id ? Number(form.area_id) : null,
      });
      toast.success('QR criado.');
      setForm({ titulo: '', canal: 'fisico', onde: '', area_id: '' });
      await carregar();
      setQr(a);
    } catch (e: any) { toast.error(e?.message || 'Erro ao criar a ativação'); }
    finally { setSalvando(false); }
  };

  const adotar = async () => {
    if (!adotarId) return;
    setSalvando(true);
    try {
      const r = await campanhas.ativacoes.adotar(c.id, { link_id: adotarId });
      if (r?.aviso) toast.warning(r.aviso); else toast.success('QR adotado por esta campanha.');
      setAdotarId(''); await carregar();
    } catch (e: any) { toast.error(e?.message || 'Erro ao adotar o QR'); }
    finally { setSalvando(false); }
  };

  const remover = async (id: string) => {
    setSalvando(true);
    try { await campanhas.ativacoes.remover(c.id, id); toast.success('Ativação desligada da campanha.'); setConfirmaRemover(null); await carregar(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao remover'); }
    finally { setSalvando(false); }
  };

  if (!dados) return <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  const lista = dados.ativacoes || [];
  const totalAcessos = lista.reduce((s: number, a: any) => s + Number(a.acessos || 0), 0);
  const totalInscritos = lista.reduce((s: number, a: any) => s + Number(a.inscritos || 0), 0);

  return (
    <div className="space-y-4">
      {erro && <div className="text-sm text-red-600 flex gap-2"><AlertTriangle className="h-4 w-4" /> {erro}</div>}
      {dados.aviso && <div className="text-sm text-amber-600 flex gap-2"><AlertTriangle className="h-4 w-4" /> {dados.aviso}</div>}
      {!dados.adesao?.url && (
        <div className="text-sm text-amber-600 flex gap-2"><AlertTriangle className="h-4 w-4" /> Esta campanha ainda não tem formulário de adesão — o QR não tem para onde apontar.</div>
      )}

      <Card className="glass-solid"><CardContent className="p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><div className="text-muted-foreground text-xs">Ativações</div><div className="font-medium tabular-nums">{lista.length}</div></div>
          <div><div className="text-muted-foreground text-xs">Acessos (escaneadas)</div><div className="font-medium tabular-nums">{totalAcessos}</div></div>
          <div><div className="text-muted-foreground text-xs">Inscritos por QR</div><div className="font-medium tabular-nums">{totalInscritos}</div></div>
          <div><div className="text-muted-foreground text-xs">Inscritos sem QR</div><div className="font-medium tabular-nums">{dados.sem_qr ?? 0}</div></div>
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          Acesso mede quem ESCANEOU (exposição do lugar); inscrito mede quem aderiu vindo daquele QR. "Sem QR" é quem chegou pelo link direto.
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground" style={{ background: 'var(--cbrio-table-header)' }}>
            <tr>
              <th className="text-left p-3">Ativação</th>
              <th className="text-left p-3">Onde</th>
              <th className="text-left p-3">Código</th>
              <th className="text-right p-3">Acessos</th>
              <th className="text-right p-3">30d</th>
              <th className="text-right p-3">Inscritos</th>
              <th className="text-right p-3">Conversão</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Nenhum QR ainda. Crie um por lugar (lounge, estacionamento, templo…) — todos levam ao mesmo formulário.</td></tr>
            )}
            {lista.map((a: any) => (
              <tr key={a.id} className="border-t">
                <td className="p-3">
                  <div className="font-medium">{a.titulo}</div>
                  <div className="text-xs text-muted-foreground">{CANAL_LABEL[a.canal] || a.canal || '—'}{a.area_nome ? ` · ${a.area_nome}` : ''}</div>
                </td>
                <td className="p-3 text-muted-foreground">{a.onde || '—'}</td>
                <td className="p-3"><code className="text-xs">{a.slug}</code></td>
                <td className="p-3 text-right tabular-nums">{a.acessos}</td>
                <td className="p-3 text-right tabular-nums">{a.acessos_30d}</td>
                <td className="p-3 text-right tabular-nums">{a.inscritos ?? 0}</td>
                <td className="p-3 text-right tabular-nums">{pctTxt(a.conversao_pct)}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon" title="QR e cartaz" onClick={() => setQr(a)}><QrCode className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" title="Copiar link curto"
                    onClick={() => { navigator.clipboard?.writeText(a.url_curta); toast.success('Link copiado.'); }}><Copy className="h-4 w-4" /></Button>
                  {podeEditar && (confirmaRemover === a.id ? (
                    <>
                      <Button variant="destructive" size="sm" disabled={salvando} onClick={() => remover(a.id)}>Desligar</Button>
                      <Button variant="ghost" size="sm" onClick={() => setConfirmaRemover(null)}>Não</Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="icon" title="Desligar da campanha (o QR impresso continua abrindo)" onClick={() => setConfirmaRemover(a.id)}><Trash2 className="h-4 w-4" /></Button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>

      {podeEditar && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardContent className="p-5 space-y-3">
            <div className="font-medium text-sm">Novo QR</div>
            <div className="grid gap-2 md:grid-cols-2">
              <div><label className="block text-xs mb-1">Nome da ativação</label>
                <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Banner do lounge" /></div>
              <div><label className="block text-xs mb-1">Canal</label>
                <Select value={form.canal} onValueChange={(v) => setForm({ ...form, canal: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CANAL_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><label className="block text-xs mb-1">Onde fica (texto livre)</label>
                <Input value={form.onde} onChange={(e) => setForm({ ...form, onde: e.target.value })} placeholder="Lounge · parede da cafeteria" /></div>
              {areas.length > 0 && (
                <div><label className="block text-xs mb-1">Área responsável</label>
                  <Select value={form.area_id || 'none'} onValueChange={(v) => setForm({ ...form, area_id: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="(nenhuma)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">(nenhuma)</SelectItem>
                      {areas.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.nome}</SelectItem>)}
                    </SelectContent>
                  </Select></div>
              )}
            </div>
            <Button size="sm" disabled={salvando || !dados.adesao?.url} onClick={criar}>
              {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />} Criar QR
            </Button>
          </CardContent></Card>

          {linksLivres.length > 0 && (
            <Card><CardContent className="p-5 space-y-3">
              <div className="font-medium text-sm">Adotar um QR que já existe</div>
              <div className="text-xs text-muted-foreground">Cartaz já impresso (ex.: os de voluntariado de 22/09)? Adote o link curto dele: os acessos passam a contar aqui.</div>
              <div className="flex gap-2">
                <Select value={adotarId || 'none'} onValueChange={(v) => setAdotarId(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Escolha o link" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">(escolha)</SelectItem>
                    {linksLivres.map((l: any) => <SelectItem key={l.id} value={String(l.id)}>{l.slug} — {l.titulo || l.destino}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" disabled={salvando || !adotarId} onClick={adotar}>Adotar</Button>
              </div>
            </CardContent></Card>
          )}
        </div>
      )}

      {qr && (
        <QrLinkDialog
          link={qr.url_curta}
          titulo={`${c.nome} · ${qr.titulo}`}
          nomeArquivo={`qr-${c.slug}-${qr.slug}`}
          descricao={qr.onde || undefined}
          chamada="Aponte a câmera para aderir"
          semDinamico
          onClose={() => setQr(null)}
        />
      )}
    </div>
  );
}


function AbaInscritos({ det }: any) {
  const c = det.campanha;
  const [dados, setDados] = useState<any | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  useEffect(() => {
    campanhas.inscritos(c.id).then(setDados)
      .catch((e: any) => { setErro(e?.message || 'Erro ao carregar os inscritos'); setDados({ inscritos: [] }); });
  }, [c.id]);
  if (!dados) return <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  const q = busca.trim().toLowerCase();
  const lista = (dados.inscritos || [])
    .filter((i: any) => !q || String(i.nome_completo || i.nome || '').toLowerCase().includes(q))
    .filter((i: any) => filtroStatus === 'todos' || i.status_aderente === filtroStatus);
  const dinheiro = det.template?.unidade === 'centavos';
  const labels: Record<string, string> = dados.status_labels || {};
  const corStatus = (st: string) => st === 'em_dia' ? 'bg-emerald-500/15 text-emerald-600'
    : st === 'atrasado' ? 'bg-red-500/15 text-red-600'
    : st === 'sem_entrada' ? 'bg-amber-500/15 text-amber-600'
    : 'bg-foreground/10 text-muted-foreground';
  const resumo = dados.resumo;
  return (
    <div className="space-y-4">
      {erro && <div className="text-sm text-red-600 flex gap-2"><AlertTriangle className="h-4 w-4" /> {erro}</div>}
      {dados.aviso && <div className="text-sm text-amber-600 flex gap-2"><AlertTriangle className="h-4 w-4" /> {dados.aviso}</div>}
      {dinheiro && resumo && (
        <Card className="glass-solid"><CardContent className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            {(['em_dia', 'atrasado', 'sem_entrada', 'aguardando', 'sem_compromisso'] as const).map((k) => (
              <button key={k} type="button" onClick={() => setFiltroStatus(filtroStatus === k ? 'todos' : k)}
                className={`text-left rounded-md p-2 border ${filtroStatus === k ? 'border-primary' : 'border-transparent'}`}>
                <div className="text-muted-foreground text-xs">{labels[k] || k}</div>
                <div className="font-medium tabular-nums">{resumo[k] ?? 0}</div>
              </button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Entradas casadas pelo CPF dos aderentes: <strong>{brl(resumo.total_entradas_centavos || 0)}</strong> ·
            {' '}{resumo.meses_decorridos} mês(es) decorrido(s). "Atrasado" = trouxe menos que compromisso × meses; quem doou sem aderir não aparece aqui (está na barrinha).
          </div>
        </CardContent></Card>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm"><strong>{(dados.inscritos || []).length}</strong> inscrito(s) · porta: {dados.porta === 'voluntariado' ? 'formulário de voluntariado' : 'formulário de adesão'}</div>
        <Input className="max-w-xs" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome" />
        {filtroStatus !== 'todos' && <Button variant="ghost" size="sm" onClick={() => setFiltroStatus('todos')}>Limpar filtro</Button>}
      </div>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground" style={{ background: 'var(--cbrio-table-header)' }}>
            <tr>
              <th className="text-left p-3">Nome</th>
              <th className="text-left p-3">Celular</th>
              <th className="text-left p-3">CPF</th>
              {dinheiro && <th className="text-right p-3">Compromisso/mês</th>}
              {dinheiro && <th className="text-right p-3">Já trouxe</th>}
              {dinheiro && <th className="text-left p-3">Situação</th>}
              <th className="text-left p-3">Veio de</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Quando</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">Ninguém ainda.</td></tr>}
            {lista.map((i: any) => (
              <tr key={i.id} className="border-t">
                <td className="p-3">
                  <div className="font-medium">{i.nome_completo || i.nome || '—'}</div>
                  {!i.membro_id && <div className="text-xs text-amber-600">sem cadastro ligado</div>}
                </td>
                <td className="p-3 tabular-nums">{i.telefone || '—'}</td>
                <td className="p-3 tabular-nums">{i.cpf || '—'}</td>
                {dinheiro && <td className="p-3 text-right tabular-nums">{i.compromisso_centavos ? brl(i.compromisso_centavos) : '—'}</td>}
                {dinheiro && (
                  <td className="p-3 text-right tabular-nums" title={i.ultima_entrada ? `última entrada em ${dataBr(i.ultima_entrada)}` : undefined}>
                    {i.total_centavos ? brl(i.total_centavos) : '—'}{i.entradas ? <span className="text-xs text-muted-foreground"> ({i.entradas})</span> : null}
                  </td>
                )}
                {dinheiro && (
                  <td className="p-3">{i.status_aderente ? <Chip cor={corStatus(i.status_aderente)}>{labels[i.status_aderente] || i.status_aderente}</Chip> : '—'}</td>
                )}
                <td className="p-3">{i.qr_slug ? <code className="text-xs">{i.qr_slug}</code> : <span className="text-muted-foreground">link direto</span>}</td>
                <td className="p-3">{i.status || '—'}</td>
                <td className="p-3 text-muted-foreground">{dataBr(i.created_at || i.data_inscricao)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

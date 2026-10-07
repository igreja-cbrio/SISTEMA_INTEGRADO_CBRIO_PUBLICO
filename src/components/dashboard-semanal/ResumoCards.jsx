import { useState } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { dashboardSemanal as api } from '../../api';
import { Card, CardContent } from '../ui/card';
import { Loader2, Users, Baby, Tv, Sparkles, Droplets, UserPlus, Calendar, TrendingUp, TrendingDown } from 'lucide-react';

const PRIMARY = '#00B39D';
const fmtN = (v) => Number(v || 0).toLocaleString('pt-BR');
const fmtPct = (v) => v == null ? null : `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`;

function DeltaBadge({ pct, sufixo = 'vs. semana anterior' }) {
  if (pct == null) return null;
  const pos = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${pos ? 'text-emerald-600' : 'text-rose-600'}`}>
      {pos ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
      {fmtPct(pct)}
      <span className="text-muted-foreground font-normal">{sufixo}</span>
    </span>
  );
}

function MiniStat({ icon: Icon, label, valor, cor }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" style={{ color: cor }} />
        {label}
      </div>
      <div className="text-xl font-bold tabular-nums">{valor}</div>
    </div>
  );
}

function ResumoShell({ icon: Icon, titulo, subtitulo, loading, children }) {
  return (
    <Card className="relative overflow-hidden border-primary/30">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(0,179,157,0.08), transparent 55%)' }} />
      <CardContent className="pt-5 pb-5 relative">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(0,179,157,0.12)', color: PRIMARY }}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold leading-tight">{titulo}</h3>
            <p className="text-xs text-muted-foreground">{subtitulo}</p>
          </div>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary ml-auto shrink-0" />}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export function ResumoSemanaCard({ ano, semana }) {
  const { data, isLoading } = useQuery({
    queryKey: ['dash-sem', 'resumo-semana', ano, semana],
    queryFn: () => api.resumoSemana(ano, semana),
    enabled: !!ano && !!semana,
    staleTime: 60_000,
  });

  return (
    <ResumoShell
      icon={Sparkles}
      titulo="Resumo da semana"
      subtitulo={data?.label || 'Consolidado por culto'}
      loading={isLoading}
    >
      {!data ? (
        <div className="h-10 rounded bg-muted animate-pulse" />
      ) : (
        <>
          <p className="text-sm text-foreground/90 leading-relaxed mb-3">
            <strong style={{ color: PRIMARY }}>{fmtN(data.presencas)}</strong> presenças
            {data.presencas_delta_pct != null && <> ({fmtPct(data.presencas_delta_pct)} vs. a semana anterior)</>}
            {' · '}<strong style={{ color: PRIMARY }}>{fmtN(data.online)}</strong> online
            {' · '}<strong style={{ color: PRIMARY }}>{fmtN(data.decisoes)}</strong> decisões.
            {data.maior_culto && <> {data.maior_culto.nome} foi o maior público ({fmtN(data.maior_culto.valor)}).</>}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MiniStat icon={Users} label="Presenças" valor={fmtN(data.presencas)} cor={PRIMARY} />
            <MiniStat icon={Baby} label="Kids" valor={fmtN(data.kids)} cor="#8b5cf6" />
            <MiniStat icon={Tv} label="Online" valor={fmtN(data.online)} cor="#3b82f6" />
            <MiniStat icon={Sparkles} label="Decisões" valor={fmtN(data.decisoes)} cor="#10b981" />
          </div>
          {data.presencas_delta_pct != null && (
            <div className="mt-3"><DeltaBadge pct={data.presencas_delta_pct} /></div>
          )}
        </>
      )}
    </ResumoShell>
  );
}






const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function mesAnterior({ ano, mes }) {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

const pctVs = (atual, base) => (atual == null || !base ? null : ((atual - base) / base) * 100);

function DeltaCurto({ pct, rotulo }) {
  if (pct == null) return <div className="text-[11px] text-muted-foreground">— {rotulo}</div>;
  const pos = pct >= 0;
  return (
    <div className={`text-[11px] font-medium flex items-center gap-1 ${pos ? 'text-emerald-600' : 'text-rose-600'}`}>
      {pos ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {fmtPct(pct)}
      <span className="text-muted-foreground font-normal">{rotulo}</span>
    </div>
  );
}

export function ResumoMesCard() {
  const hoje = new Date();
  const corrente = { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 };
  const opcoes = [];
  let cursor = corrente;
  for (let i = 0; i < 12; i++) { opcoes.push(cursor); cursor = mesAnterior(cursor); }
  const [sel, setSel] = useState(() => mesAnterior(corrente));
  const ant = mesAnterior(sel);
  const anoAnt = { ano: sel.ano - 1, mes: sel.mes };

  const consultar = (p) => ({
    queryKey: ['dash-sem', 'resumo-mes', p.ano, p.mes],
    queryFn: () => api.resumoMes(p.ano, p.mes),
    staleTime: 60_000,
  });
  const [qAtual, qAnt, qAnoAnt] = useQueries({ queries: [consultar(sel), consultar(ant), consultar(anoAnt)] });
  const d = qAtual.data;
  const parcial = sel.ano === corrente.ano && sel.mes === corrente.mes;

  const itens = [
    { chave: 'presencas', label: 'Presenças', icon: Users, cor: PRIMARY },
    { chave: 'decisoes', label: 'Decisões', icon: Sparkles, cor: '#10b981' },
    { chave: 'batismos', label: 'Batismos', icon: Droplets, cor: '#3b82f6' },
    { chave: 'novos_membros', label: 'Novos membros', icon: UserPlus, cor: '#8b5cf6' },
  ];

  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4" style={{ color: PRIMARY }} />
          <h3 className="text-sm font-bold">Resumo do mês</h3>
          <select
            value={`${sel.ano}-${sel.mes}`}
            onChange={e => { const [a, m] = e.target.value.split('-').map(Number); setSel({ ano: a, mes: m }); }}
            className="ml-1 h-7 rounded-md border border-border bg-transparent px-2 text-xs"
            aria-label="Mês do resumo"
          >
            {opcoes.map(o => (
              <option key={`${o.ano}-${o.mes}`} value={`${o.ano}-${o.mes}`}>
                {MESES_CURTOS[o.mes - 1]}/{o.ano}{o.ano === corrente.ano && o.mes === corrente.mes ? ' (parcial)' : ''}
              </option>
            ))}
          </select>
          {parcial && <span className="text-[11px] text-amber-600">mês em andamento: a comparação ainda não é justa</span>}
          {qAtual.isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary ml-auto" />}
        </div>
        {qAtual.isError ? (
          <p className="text-sm text-rose-600">Não foi possível carregar o resumo do mês.</p>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {itens.map(({ chave, label, icon: Icon, cor }) => (
              <div key={chave} className="rounded-lg border border-border bg-card px-3 py-2">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" style={{ color: cor }} />
                  {label}
                </div>
                <div className="text-xl font-bold tabular-nums leading-tight">{d ? fmtN(d[chave]) : '…'}</div>
                <DeltaCurto pct={pctVs(d?.[chave], qAnt.data?.[chave])} rotulo={`vs ${MESES_CURTOS[ant.mes - 1]}`} />
                <DeltaCurto pct={pctVs(d?.[chave], qAnoAnt.data?.[chave])} rotulo={`vs ${MESES_CURTOS[anoAnt.mes - 1]}/${String(anoAnt.ano).slice(2)}`} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

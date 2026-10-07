import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { dashboardSemanal as api } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Loader2, TrendingUp, TrendingDown, Minus, CalendarRange, LayoutDashboard, GitCompareArrows, Table2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList,
  LineChart, Line, AreaChart, Area, ReferenceLine,
} from 'recharts';
import { INDICADORES } from '../../pages/DashboardSemanal';
import { ResumoMesCard } from './ResumoCards';
import YtdAcumuladoCard from './YtdAcumuladoCard';
import CruzamentoIndicadoresCard, { CruzamentoTabela } from './CruzamentoIndicadoresCard';

const CORES_ANO = ['#1E3A8A', '#E97A3F', '#7C3AED', '#10b981', '#ef4444', '#f59e0b', '#3b82f6'];

const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];

const TIPOS_GRAFICO = ['barra', 'linha', 'area', 'tendencia'];
const TIPO_LABEL = { barra: 'Barra', linha: 'Linha', area: 'Área', tendencia: 'Tendência' };






const SUBABAS = [
  { key: 'visao', label: 'Visão geral', icon: LayoutDashboard },
  { key: 'comparar', label: 'Comparar indicadores', icon: GitCompareArrows },
  { key: 'tabela', label: 'Tabela', icon: Table2 },
];
const CHAVE_SUB = 'dash-mensal-subaba';

function lerSubaba() {
  try {
    const v = localStorage.getItem(CHAVE_SUB);
    return SUBABAS.some(s => s.key === v) ? v : 'visao';
  } catch { return 'visao'; }
}

function rotuloMeses(meses) {
  if (meses.length === 12) return 'Ano inteiro';
  if (!meses.length) return 'Nenhum mês';
  const contiguo = meses.every((m, i) => i === 0 || m === meses[i - 1] + 1);
  if (contiguo) return meses.length === 1 ? MESES[meses[0] - 1] : `${MESES[meses[0] - 1]} a ${MESES[meses[meses.length - 1] - 1]}`;
  return `${meses.length} meses`;
}

export default function DashMensalAba() {
  const anoAtual = new Date().getFullYear();
  const [indicador, setIndicador] = useState('aceitacoes');
  const [culto, setCulto] = useState('todos');
  const [tipoGrafico, setTipoGrafico] = useState('barra');
  const [anos, setAnos] = useState([anoAtual - 2, anoAtual - 1, anoAtual]);
  const [mesesAtivos, setMesesAtivos] = useState([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const [sub, setSubState] = useState(lerSubaba);
  const setSub = (v) => {
    setSubState(v);
    try { localStorage.setItem(CHAVE_SUB, v); } catch {                                  }
  };


  const [comparar, setComparar] = useState(['frequencia']);
  useEffect(() => { setComparar(prev => prev.filter(k => k !== indicador)); }, [indicador]);

  const { data: cultos } = useQuery({
    queryKey: ['dash-sem', 'cultos'],
    queryFn: () => api.cultos(),
    staleTime: 30 * 60_000,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['dash-sem', 'mensal', anos.join(','), indicador, culto, mesesAtivos.join(',')],
    queryFn: () => api.mensal({
      anos: anos.join(','),
      indicador,
      culto,
      meses: mesesAtivos.join(','),
    }),
    staleTime: 60_000,
  });

  const indDef = INDICADORES.find(i => i.key === indicador);
  const series = data?.series || [];


  const [mesSel, setMesSel] = useState(null);


  const mesesComDado = useMemo(
    () => series.filter(r => anos.some(a => r[String(a)] != null && r[String(a)] > 0)),
    [series, anos]
  );




  useEffect(() => {
    if (!mesesComDado.length) { setMesSel(null); return; }
    setMesSel(prev => {
      if (prev != null && mesesComDado.some(r => r.mes === prev)) return prev;
      const anoMaisRecente = String(Math.max(...anos));
      const hoje = new Date();
      const fechados = mesesComDado.filter(r => r[anoMaisRecente] != null
        && !(Number(anoMaisRecente) === hoje.getFullYear() && r.mes === hoje.getMonth() + 1));
      return (fechados.length ? fechados : mesesComDado)[(fechados.length ? fechados : mesesComDado).length - 1].mes;
    });
  }, [mesesComDado, anos]);

  const linhaSel = useMemo(
    () => series.find(r => r.mes === mesSel) || null,
    [series, mesSel]
  );



  const cardsComparativo = useMemo(() => {
    if (!linhaSel) return [];
    return anos.map((ano, idx) => {
      const valor = linhaSel[String(ano)] ?? null;
      let deltaPct = null;
      let baseAno = null;
      for (let j = idx - 1; j >= 0; j--) {
        const prev = linhaSel[String(anos[j])];
        if (valor != null && prev != null && prev !== 0) {
          deltaPct = ((valor - prev) / prev) * 100;
          baseAno = anos[j];
          break;
        }
      }
      return { ano, valor, deltaPct, baseAno, cor: CORES_ANO[idx % CORES_ANO.length] };
    });
  }, [linhaSel, anos]);




  const tendencia = useMemo(() => {
    if (!series.length) return { pontos: [], slope: 0, deltaPct: null };
    const anosOrd = [...anos].sort((a, b) => a - b);
    const seriesOrd = [...series].sort((a, b) => a.mes - b.mes);
    const pontos = [];
    for (const a of anosOrd) {
      for (const r of seriesOrd) {
        const v = r[String(a)];
        if (v == null) continue;
        pontos.push({
          label: anosOrd.length > 1 ? `${MESES[r.mes - 1]}/${String(a).slice(2)}` : MESES[r.mes - 1],
          valor: Number(v),
        });
      }
    }
    const n = pontos.length;
    if (n < 2) {
      pontos.forEach(p => { p.tendencia = p.valor; });
      return { pontos, slope: 0, deltaPct: null };
    }
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    pontos.forEach((p, i) => { sx += i; sy += p.valor; sxy += i * p.valor; sxx += i * i; });
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const intercept = (sy - slope * sx) / n;
    pontos.forEach((p, i) => { p.tendencia = Math.round((intercept + slope * i) * 10) / 10; });
    const yIni = intercept;
    const yFim = intercept + slope * (n - 1);
    const deltaPct = yIni !== 0 ? ((yFim - yIni) / Math.abs(yIni)) * 100 : null;
    return { pontos, slope, deltaPct };
  }, [series, anos]);

  const onClickGrafico = (state) => {
    const p = state?.activePayload?.[0]?.payload;
    if (p?.mes != null) setMesSel(p.mes);
  };

  const toggleMes = (m) => {
    setMesesAtivos(prev => prev.includes(m)
      ? (prev.length === 1 ? prev : prev.filter(x => x !== m))
      : [...prev, m].sort((a, b) => a - b));
  };

  const toggleAno = (a) => {
    setAnos(prev => prev.includes(a)
      ? (prev.length === 1 ? prev : prev.filter(x => x !== a))
      : [...prev, a].sort());
  };

  const anosCandidatos = useMemo(() => {
    const arr = [];
    for (let y = anoAtual; y >= anoAtual - 4; y--) arr.push(y);
    return arr;
  }, [anoAtual]);


  const chip = (ativo) => `px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
    ativo ? 'bg-[#00B39D]/10 border-[#00B39D] text-[#00B39D]' : 'border-border text-muted-foreground hover:border-foreground/30'
  }`;

  return (
    <div className="space-y-4">
      <ResumoMesCard />

      {                                                                       }
      <div className="sticky top-14 z-20 rounded-xl border border-border bg-card/95 backdrop-blur-md px-3 py-2.5 space-y-2.5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[250px] max-w-full">
            <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Indicador</label>
            <Select value={indicador} onValueChange={setIndicador}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {INDICADORES.map(i => <SelectItem key={i.key} value={i.key}>{i.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[200px] max-w-full">
            <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Culto</label>
            <Select value={culto} onValueChange={setCulto}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {

                                                                           }
                <SelectItem value="turno:manha">Domingo manhã (todos)</SelectItem>
                <SelectItem value="turno:noite">Domingo noite (todos)</SelectItem>
                {(cultos || []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Anos</label>
            <div className="flex flex-wrap gap-1">
              {anosCandidatos.map(a => (
                <button key={a} type="button" onClick={() => toggleAno(a)} className={chip(anos.includes(a))}>{a}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-0.5">Meses</label>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" className="h-8 inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 text-xs">
                  <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
                  {rotuloMeses(mesesAtivos)}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64">
                <div className="grid grid-cols-4 gap-1">
                  {MESES.map((nome, idx) => {
                    const m = idx + 1;
                    const ativo = mesesAtivos.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleMes(m)}
                        className={`py-1 rounded text-xs font-medium border transition-colors ${
                          ativo ? 'bg-[#00B39D] border-[#00B39D] text-white' : 'border-border text-muted-foreground hover:border-foreground/30'
                        }`}
                      >
                        {nome}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2 mt-2">
                  <button type="button" className="text-xs text-[#00B39D] hover:underline" onClick={() => setMesesAtivos([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])}>Ano inteiro</button>
                  <button
                    type="button"
                    className="text-xs text-[#00B39D] hover:underline"
                    onClick={() => setMesesAtivos(Array.from({ length: new Date().getMonth() + 1 }, (_, i) => i + 1))}
                  >
                    Até o mês atual
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mb-2" />}
        </div>
        <div className="inline-flex rounded-lg bg-muted/60 p-0.5">
          {SUBABAS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSub(key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                sub === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {sub === 'visao' && (
        <>
          <YtdAcumuladoCard
            indicador={indicador}
            indLabel={indDef?.label || 'Indicador'}
            culto={culto}
            anos={anos}
            meses={mesesAtivos}
            cores={CORES_ANO}
            compacto
          />

          {                       }
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-sm font-medium">
                {tipoGrafico === 'tendencia'
                  ? `${indDef?.label} · tendência mensal ${anos.length > 1 ? `(${[...anos].sort((a, b) => a - b).join(' → ')})` : `(${anos[0]})`}`
                  : `${indDef?.label} acumulado por mês · comparativo ${anos.join(' / ')}`}
              </CardTitle>
              <div className="flex items-center gap-3">
              {tipoGrafico === 'tendencia' && tendencia.deltaPct != null && (
                <span className={`inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap ${
                  tendencia.slope >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}>
                  {tendencia.slope >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {tendencia.deltaPct >= 0 ? '+' : ''}{tendencia.deltaPct.toFixed(1)}% no período
                </span>
              )}
                <div className="inline-flex rounded-lg border p-0.5">
                  {TIPOS_GRAFICO.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTipoGrafico(t)}
                      className={`px-2.5 py-0.5 text-xs font-medium rounded transition-colors ${
                        tipoGrafico === t ? 'bg-[#00B39D] text-white' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {TIPO_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="h-[380px] flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : series.length === 0 || (tipoGrafico === 'tendencia' && tendencia.pontos.length === 0) ? (
                <div className="h-[380px] flex items-center justify-center text-sm text-muted-foreground">
                  Sem dados para os filtros selecionados.
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={`${tipoGrafico}-${indicador}-${culto}-${anos.join(',')}-${mesesAtivos.join(',')}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="h-[380px]"
                    style={{ cursor: 'pointer' }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      {tipoGrafico === 'barra' ? (
                        <BarChart data={series} margin={{ top: 24, right: 20, left: 0, bottom: 20 }} onClick={onClickGrafico}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                          <XAxis dataKey="mes_nome" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                          <Tooltip
                            cursor={{ fill: 'rgba(0,179,157,0.06)' }}
                            contentStyle={{ borderRadius: 8, fontSize: 12 }}
                            formatter={(v, name) => [Number(v).toLocaleString('pt-BR'), name]}
                          />
                          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                          {linhaSel && (
                            <ReferenceLine x={linhaSel.mes_nome} stroke="#00B39D" strokeDasharray="4 4" strokeWidth={1.5} />
                          )}
                          {anos.map((a, idx) => (
                            <Bar
                              key={a}
                              dataKey={String(a)}
                              name={String(a)}
                              fill={CORES_ANO[idx % CORES_ANO.length]}
                              radius={[6, 6, 0, 0]}
                              animationDuration={800 + idx * 150}
                            >
                              <LabelList
                                dataKey={String(a)}
                                position="top"
                                style={{ fontSize: 10, fontWeight: 600 }}
                                formatter={v => (v > 0 ? v : '')}
                              />
                            </Bar>
                          ))}
                        </BarChart>
                      ) : tipoGrafico === 'linha' ? (
                        <LineChart data={series} margin={{ top: 24, right: 20, left: 0, bottom: 20 }} onClick={onClickGrafico}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                          <XAxis dataKey="mes_nome" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                          <Tooltip
                            contentStyle={{ borderRadius: 8, fontSize: 12 }}
                            formatter={(v, name) => [Number(v).toLocaleString('pt-BR'), name]}
                          />
                          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                          {linhaSel && (
                            <ReferenceLine x={linhaSel.mes_nome} stroke="#00B39D" strokeDasharray="4 4" strokeWidth={1.5} />
                          )}
                          {anos.map((a, idx) => (
                            <Line
                              key={a}
                              type="monotone"
                              dataKey={String(a)}
                              name={String(a)}
                              stroke={CORES_ANO[idx % CORES_ANO.length]}
                              strokeWidth={3}
                              dot={{ r: 4 }}
                              activeDot={{ r: 6 }}
                              animationDuration={1100 + idx * 200}
                            />
                          ))}
                        </LineChart>
                      ) : tipoGrafico === 'area' ? (
                        <AreaChart data={series} margin={{ top: 24, right: 20, left: 0, bottom: 20 }} onClick={onClickGrafico}>
                          <defs>
                            {anos.map((a, idx) => (
                              <linearGradient key={a} id={`g-${a}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={CORES_ANO[idx % CORES_ANO.length]} stopOpacity={0.6} />
                                <stop offset="100%" stopColor={CORES_ANO[idx % CORES_ANO.length]} stopOpacity={0.05} />
                              </linearGradient>
                            ))}
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                          <XAxis dataKey="mes_nome" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                          <Tooltip
                            contentStyle={{ borderRadius: 8, fontSize: 12 }}
                            formatter={(v, name) => [Number(v).toLocaleString('pt-BR'), name]}
                          />
                          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                          {linhaSel && (
                            <ReferenceLine x={linhaSel.mes_nome} stroke="#00B39D" strokeDasharray="4 4" strokeWidth={1.5} />
                          )}
                          {anos.map((a, idx) => (
                            <Area
                              key={a}
                              type="monotone"
                              dataKey={String(a)}
                              name={String(a)}
                              stroke={CORES_ANO[idx % CORES_ANO.length]}
                              fill={`url(#g-${a})`}
                              strokeWidth={2}
                              animationDuration={1100 + idx * 200}
                            />
                          ))}
                        </AreaChart>
                      ) : (
                        <LineChart data={tendencia.pontos} margin={{ top: 24, right: 20, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={16} />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                          <Tooltip
                            contentStyle={{ borderRadius: 8, fontSize: 12 }}
                            formatter={(v, name) => [Number(v).toLocaleString('pt-BR'), name]}
                          />
                          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                          <Line
                            type="monotone"
                            dataKey="valor"
                            name={indDef?.label || 'Valor'}
                            stroke="#00B39D"
                            strokeWidth={3}
                            dot={{ r: 3 }}
                            activeDot={{ r: 6 }}
                            animationDuration={900}
                          />
                          <Line
                            type="linear"
                            dataKey="tendencia"
                            name="Tendência"
                            stroke="#64748b"
                            strokeWidth={2}
                            strokeDasharray="6 4"
                            dot={false}
                            activeDot={false}
                            animationDuration={900}
                          />
                        </LineChart>
                      )}
                    </ResponsiveContainer>
                  </motion.div>
                </AnimatePresence>
              )}
            </CardContent>
          </Card>


          {                                              }
          {mesesComDado.length > 0 && (
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="text-sm font-medium">
                  Comparativo entre anos {linhaSel ? `· ${linhaSel.mes_nome}` : ''}
                </CardTitle>
                <div className="w-[180px]">
                  <Select
                    value={mesSel != null ? String(mesSel) : ''}
                    onValueChange={v => setMesSel(Number(v))}
                  >
                    <SelectTrigger className="h-8 text-xs capitalize"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {mesesComDado.map(r => (
                        <SelectItem key={r.mes} value={String(r.mes)} className="capitalize">{r.mes_nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <div className={`grid gap-3 ${
                  cardsComparativo.length <= 2 ? 'grid-cols-2'
                  : cardsComparativo.length === 3 ? 'grid-cols-3'
                  : 'grid-cols-2 md:grid-cols-4 lg:grid-cols-5'
                }`}>
                  {cardsComparativo.map(c => (
                    <div key={c.ano} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.cor }} />
                        <span className="text-xs font-medium text-muted-foreground">{c.ano}</span>
                      </div>
                      <div className="text-2xl font-bold tabular-nums">
                        {c.valor != null ? Number(c.valor).toLocaleString('pt-BR') : '—'}
                      </div>
                      {c.deltaPct != null ? (
                        <div className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${
                          c.deltaPct >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {c.deltaPct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                          {c.deltaPct >= 0 ? '+' : ''}{c.deltaPct.toFixed(1)}%
                          <span className="text-muted-foreground font-normal">vs {c.baseAno}</span>
                        </div>
                      ) : (
                        <div className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Minus className="h-3.5 w-3.5" />
                          {c.valor != null ? 'base' : 'sem dado'}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-3">
                  Acumulado do {indDef?.label} no mês. Clique numa barra/ponto do gráfico (ou escolha acima)
                  pra trocar o mês. A variação % compara cada ano com o anterior que tem dado no mesmo mês.
                </p>
              </CardContent>
            </Card>
          )}

        </>
      )}

      {sub === 'comparar' && (
        <CruzamentoIndicadoresCard
          principal={indicador}
          setPrincipal={setIndicador}
          comparar={comparar}
          setComparar={setComparar}
          culto={culto}
          anos={anos}
          meses={mesesAtivos}
          onVerTabela={() => setSub('tabela')}
        />
      )}

      {sub === 'tabela' && (
        <>
          <CruzamentoTabela principal={indicador} comparar={comparar} culto={culto} anos={anos} meses={mesesAtivos} />

          {                   }
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Resumo por ano</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 font-medium text-muted-foreground">Mês</th>
                      {anos.map(a => (
                        <th key={a} className="text-right py-2 px-3 font-medium text-muted-foreground">{a}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {series.map(r => (
                      <tr key={r.mes} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 px-2 font-medium capitalize">{r.mes_nome}</td>
                        {anos.map(a => (
                          <td key={a} className="text-right py-2 px-3 tabular-nums">
                            {r[String(a)] == null ? '—' : r[String(a)].toLocaleString('pt-BR')}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="font-semibold bg-muted/40">
                      <td className="py-2 px-2">Total</td>
                      {anos.map(a => (
                        <td key={a} className="text-right py-2 px-3 tabular-nums">
                          {series.reduce((s, r) => s + (r[String(a)] || 0), 0).toLocaleString('pt-BR')}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

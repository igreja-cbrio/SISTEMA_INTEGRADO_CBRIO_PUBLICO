import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { dashboardSemanal as api } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Loader2, TrendingUp, TrendingDown, Minus, Info, ChevronDown, ChevronUp, Table2 } from 'lucide-react';
import {
  ComposedChart, Line, Bar, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { INDICADORES } from '../../pages/DashboardSemanal';
import {
  montarLinhaDoTempo, variacoes, indiceBase100, razaoPor100, correlacao, variacaoPeriodo, fraseRelacao,
} from '../../lib/cruzamentoIndicadores';













const CORES = ['#00B39D', '#1E3A8A', '#E97A3F', '#7C3AED', '#ef4444'];
export const MAX_COMPARAR = 4;


const ATALHOS = [
  { label: 'Frequência × Aceitações', principal: 'frequencia', comparar: ['aceitacoes'] },
  { label: 'Frequência total × Aceitações totais', principal: 'frequencia_total', comparar: ['aceitacoes_total_kids'] },
  { label: 'Frequência × Voluntariado', principal: 'frequencia', comparar: ['voluntariado'] },
  { label: 'Aceitações presencial × online', principal: 'aceitacoes', comparar: ['aceitacoes_online'] },
];

const VISOES_BASICAS = [
  { key: 'valores', label: 'Números reais' },
  { key: 'variacao', label: 'Variação % mês a mês' },
];
const VISOES_AVANCADAS = [
  { key: 'indice', label: 'Índice (base 100)' },
  { key: 'razao', label: 'Proporção' },
];

const TIPOS_GRAFICO = [
  { key: 'linha', label: 'Linha' },
  { key: 'barra', label: 'Barra' },
  { key: 'area', label: 'Área' },
  { key: 'combinado', label: 'Combinado' },
];

export const labelIndicador = k => INDICADORES.find(i => i.key === k)?.label || k;
const fmtNum = v => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }));
const fmtRazao = v => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtPct = v => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')}%`);

function Delta({ v, compacto = false }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  const pos = v >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${pos ? 'text-emerald-600' : 'text-rose-600'}`}>
      {!compacto && (pos ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />)}
      {fmtPct(v)}
    </span>
  );
}

function Ajuda({ children }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Como ler">
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-xs leading-relaxed space-y-2">{children}</PopoverContent>
    </Popover>
  );
}

function Segmentado({ opcoes, valor, onChange }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border p-0.5">
      {opcoes.map(o => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
            valor === o.key ? 'bg-[#00B39D] text-white' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}





export function useCruzamento({ principal, comparar, culto, anos, meses }) {
  const series = useMemo(() => [principal, ...comparar.filter(k => k !== principal)], [principal, comparar]);
  const consultas = useQueries({
    queries: series.map(ind => ({
      queryKey: ['dash-sem', 'mensal', anos.join(','), ind, culto, meses.join(',')],
      queryFn: () => api.mensal({ anos: anos.join(','), indicador: ind, culto, meses: meses.join(',') }),
      staleTime: 60_000,
    })),
  });
  const carregando = consultas.some(q => q.isLoading);
  const erro = consultas.find(q => q.isError)?.error || null;
  const assinatura = consultas.map(q => q.dataUpdatedAt).join(',');

  const resultado = useMemo(() => {
    const porInd = {};
    series.forEach((k, i) => { porInd[k] = consultas[i]?.data?.series; });
    const hoje = new Date();
    const pontos = montarLinhaDoTempo(porInd, anos, { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 });
    const outros = series.slice(1);
    const vars = {}, indices = {}, periodo = {}, razoes = {}, razaoPeriodo = {}, relacoes = {};
    series.forEach(k => {
      vars[k] = variacoes(pontos, k);
      indices[k] = indiceBase100(pontos, k);
      periodo[k] = variacaoPeriodo(pontos, k);
    });
    outros.forEach(k => {
      razoes[k] = razaoPor100(pontos, k, principal);

      let sa = 0, sb = 0;
      pontos.forEach(p => {
        if (p.valores[k] != null && p.valores[principal] != null) { sa += p.valores[k]; sb += p.valores[principal]; }
      });
      razaoPeriodo[k] = sb ? (sa / sb) * 100 : null;
      const c = correlacao(pontos, principal, k);
      relacoes[k] = { ...c, ...fraseRelacao(c.r, c.n, labelIndicador(principal), labelIndicador(k)) };
    });
    const baseIndice = pontos.find(p => p.valores[principal] != null && p.valores[principal] !== 0)?.label || null;
    return { pontos, series, outros, vars, indices, periodo, razoes, razaoPeriodo, relacoes, baseIndice };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assinatura, series.join(','), anos.join(',')]);

  return { ...resultado, carregando, erro, cor: k => CORES[Math.max(0, series.indexOf(k)) % CORES.length] };
}

function TooltipCruzamento({ active, payload, label, visao, principal }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover text-popover-foreground shadow-md px-3 py-2 text-xs space-y-1">
      <div className="font-medium">{label}{row.__parcial ? ' (mês parcial)' : ''}</div>
      {payload.map(p => {
        const k = p.dataKey;
        const real = row[`__real_${k}`];
        let detalhe = null;
        if (visao === 'indice') detalhe = p.value == null ? null : `índice ${fmtNum(p.value)}`;
        if (visao === 'variacao') detalhe = p.value == null ? 'sem mês anterior' : `${fmtPct(p.value)} vs mês anterior`;
        if (visao === 'razao') {
          return (
            <div key={k} style={{ color: p.color }}>
              {labelIndicador(k)}: <strong>{fmtRazao(p.value)}</strong> a cada 100 de {labelIndicador(principal)}
              <span className="text-muted-foreground"> ({fmtNum(real)} de {fmtNum(row[`__real_${principal}`])})</span>
            </div>
          );
        }
        return (
          <div key={k} style={{ color: p.color }}>
            {labelIndicador(k)}: <strong>{fmtNum(real)}</strong>
            {detalhe && <span className="text-muted-foreground"> · {detalhe}</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function CruzamentoIndicadoresCard({
  principal, setPrincipal, comparar, setComparar, culto, anos, meses, onVerTabela,
}) {
  const [visao, setVisao] = useState('valores');
  const [avancado, setAvancado] = useState(false);
  const [tipoGrafico, setTipoGrafico] = useState('linha');
  const c = useCruzamento({ principal, comparar, culto, anos, meses });
  const { pontos, series, outros, vars, indices, razoes, periodo, razaoPeriodo, relacoes, cor } = c;

  const toggle = k => {
    if (k === principal) return;
    setComparar(prev => {
      if (prev.includes(k)) return prev.filter(x => x !== k);
      if (prev.length >= MAX_COMPARAR) return prev;
      return [...prev, k];
    });
  };

  const aplicarAtalho = a => { setPrincipal(a.principal); setComparar(a.comparar); setVisao('valores'); };
  const atalhoAtivo = a => a.principal === principal && a.comparar.join() === outros.join();

  const linhasGrafico = visao === 'razao' ? outros : series;


  const eixoDuplo = visao === 'valores' && outros.length > 0;

  const grafico = useMemo(() => pontos.map((p, i) => {
    const row = { label: p.parcial ? `${p.label}*` : p.label, __parcial: p.parcial };
    series.forEach(k => {
      row[`__real_${k}`] = p.valores[k];
      row[k] = visao === 'indice' ? indices[k][i]
        : visao === 'valores' ? p.valores[k]
        : visao === 'variacao' ? (vars[k][i].mom == null ? null : Math.round(vars[k][i].mom * 10) / 10)
        : (razoes[k] ? razoes[k][i] : undefined);
    });
    return row;
  }), [pontos, series, visao, indices, vars, razoes]);

  return (
    <Card>
      <CardHeader className="pb-2 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Comparar indicadores
              <Ajuda>
                <p><strong>Números reais</strong>: a contagem de cada mês. O indicador principal fica no eixo da esquerda e os outros no da direita.</p>
                <p><strong>Variação %</strong>: quanto cada um subiu ou caiu em relação ao mês anterior.</p>
                <p><strong>Índice (base 100)</strong>: cada indicador começa em 100 no primeiro mês. 66,7 quer dizer 33% abaixo do primeiro mês, não 66,7 pessoas.</p>
                <p><strong>Proporção</strong>: quanto o indicador representa a cada 100 do principal (ex.: aceitações a cada 100 de frequência).</p>
                <p>Mês sem culto aparece como “—”, nunca como zero. O mês em andamento (*) entra no total, mas fica fora da variação do período e da relação entre os indicadores.</p>
              </Ajuda>
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              O indicador principal é o do filtro do topo: <strong style={{ color: cor(principal) }}>{labelIndicador(principal)}</strong>.
            </p>
          </div>
          {onVerTabela && (
            <button type="button" onClick={onVerTabela} className="inline-flex items-center gap-1 text-xs font-medium text-[#00B39D] hover:underline shrink-0">
              <Table2 className="h-3.5 w-3.5" /> Ver tabela mês a mês
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Atalhos:</span>
          {ATALHOS.map(a => (
            <button
              key={a.label}
              type="button"
              onClick={() => aplicarAtalho(a)}
              className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                atalhoAtivo(a) ? 'border-[#00B39D] bg-[#00B39D]/10 text-[#00B39D]' : 'border-border text-muted-foreground hover:border-foreground/30'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div>
          <span className="text-xs text-muted-foreground block mb-1">Comparar com (até {MAX_COMPARAR}):</span>
          <div className="flex flex-wrap gap-1.5">
            {INDICADORES.filter(i => i.key !== principal).map(i => {
              const ativo = comparar.includes(i.key);
              const bloqueado = !ativo && comparar.length >= MAX_COMPARAR;
              return (
                <button
                  key={i.key}
                  type="button"
                  onClick={() => toggle(i.key)}
                  disabled={bloqueado}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                    ativo ? 'text-white' : 'border-border text-muted-foreground hover:border-foreground/30'
                  } ${bloqueado ? 'opacity-40 cursor-not-allowed' : ''}`}
                  style={ativo ? { background: cor(i.key), borderColor: cor(i.key) } : undefined}
                >
                  {i.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Segmentado opcoes={VISOES_BASICAS} valor={visao} onChange={setVisao} />
          <button
            type="button"
            onClick={() => setAvancado(v => !v)}
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Avançado {avancado ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {(avancado || VISOES_AVANCADAS.some(v => v.key === visao)) && (
            <Segmentado opcoes={VISOES_AVANCADAS} valor={visao} onChange={setVisao} />
          )}
          <div className="ml-auto w-[130px]">
            <Select value={tipoGrafico} onValueChange={setTipoGrafico}>
              <SelectTrigger className="h-8 text-xs" aria-label="Tipo de gráfico"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS_GRAFICO.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {c.erro ? (
          <div className="h-[320px] flex items-center justify-center text-sm text-rose-600">
            Não foi possível carregar os indicadores: {c.erro.message || 'erro desconhecido'}.
          </div>
        ) : c.carregando ? (
          <div className="h-[320px] flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : pontos.length === 0 ? (
          <div className="h-[320px] flex items-center justify-center text-sm text-muted-foreground">
            Sem dados para os filtros selecionados.
          </div>
        ) : (
          <>
            {                                                                 }
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
              {series.map(k => {
                const p = periodo[k];
                return (
                  <div key={k} className="rounded-lg border border-border bg-card px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: cor(k) }} />
                      <span className="text-xs font-medium text-muted-foreground truncate" title={labelIndicador(k)}>{labelIndicador(k)}</span>
                    </div>
                    <div className="text-lg font-bold tabular-nums leading-tight mt-0.5">{fmtNum(p.total)}</div>
                    <div className="text-[11px] flex items-center gap-1 flex-wrap">
                      {p.deltaPct != null ? <Delta v={p.deltaPct} /> : <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
                      {p.de && <span className="text-muted-foreground">{p.de} → {p.ate}</span>}
                    </div>
                    {k !== principal && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        <strong className="text-foreground tabular-nums">{fmtRazao(razaoPeriodo[k])}</strong> a cada 100 de {labelIndicador(principal)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {visao === 'indice' && c.baseIndice && (
              <p className="text-xs rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-1.5">
                Índice: <strong>{c.baseIndice} = 100</strong> para cada indicador. 66,7 quer dizer 33% abaixo de {c.baseIndice}, não uma contagem. O número real aparece ao passar o mouse.
              </p>
            )}

            <div className="h-[340px]">
              {visao === 'razao' && outros.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Escolha ao menos um indicador em “Comparar com”.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={grafico} margin={{ top: 12, right: eixoDuplo ? 8 : 20, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={12} />
                    <YAxis yAxisId="esq" tick={{ fontSize: 11 }} />
                    {eixoDuplo && <YAxis yAxisId="dir" orientation="right" tick={{ fontSize: 11 }} />}
                    {visao === 'indice' && <ReferenceLine yAxisId="esq" y={100} stroke="#64748b" strokeDasharray="4 4" />}
                    {visao === 'variacao' && <ReferenceLine yAxisId="esq" y={0} stroke="#64748b" strokeDasharray="4 4" />}
                    <Tooltip content={<TooltipCruzamento visao={visao} principal={principal} />} />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
                    {linhasGrafico.map((k, idx) => {
                      const comum = {
                        yAxisId: eixoDuplo && k !== principal ? 'dir' : 'esq',
                        dataKey: k,
                        name: visao === 'razao' ? `${labelIndicador(k)} a cada 100 de ${labelIndicador(principal)}`
                          : eixoDuplo ? `${labelIndicador(k)} (eixo ${k === principal ? 'esq.' : 'dir.'})` : labelIndicador(k),
                      };


                      const tipo = tipoGrafico === 'combinado' ? (idx === 0 ? 'barra' : 'linha') : tipoGrafico;
                      if (tipo === 'barra') {
                        return (
                          <Bar key={k} {...comum} fill={cor(k)} fillOpacity={tipoGrafico === 'combinado' ? 0.55 : 0.9}
                            radius={[4, 4, 0, 0]} maxBarSize={28} />
                        );
                      }
                      if (tipo === 'area') {
                        return (
                          <Area key={k} {...comum} type="monotone" stroke={cor(k)} fill={cor(k)} fillOpacity={0.15}
                            strokeWidth={k === principal ? 3 : 2} connectNulls={false} />
                        );
                      }
                      return (
                        <Line key={k} {...comum} type="monotone" stroke={cor(k)} strokeWidth={k === principal ? 3 : 2}
                          dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls={false} />
                      );
                    })}
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            {outros.length > 0 && (
              <div className="rounded-lg border border-border px-3 py-2 space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  Eles andam juntos?
                  <Ajuda>
                    <p>Compara, mês a mês, se os dois indicadores sobem e descem ao mesmo tempo (correlação de Pearson).</p>
                    <p>Isso <strong>não prova</strong> que um causa o outro: os dois podem subir juntos por um terceiro motivo, como uma série especial ou um feriado.</p>
                    <p>Com menos de 6 meses de dados, a resposta oscila demais e não é mostrada. O mês em andamento fica de fora.</p>
                  </Ajuda>
                </div>
                {outros.map(k => {
                  const rel = relacoes[k];
                  return (
                    <p key={k} className="text-sm flex items-start gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0 mt-1.5" style={{ background: cor(k) }} />
                      <span>
                        {rel.texto}
                        {rel.r != null && rel.nivel !== 'poucos' && (
                          <span className="text-[11px] text-muted-foreground"> (r = {rel.r.toFixed(2).replace('.', ',')})</span>
                        )}
                      </span>
                    </p>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}


export function CruzamentoTabela({ principal, comparar, culto, anos, meses }) {
  const c = useCruzamento({ principal, comparar, culto, anos, meses });
  const { pontos, series, outros, vars, razoes, cor } = c;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Mês a mês · {series.map(labelIndicador).join(' × ')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          Valor real de cada mês, a variação contra o mês anterior e contra o mesmo mês do ano anterior.
          Os indicadores comparados são os escolhidos em “Comparar indicadores”.
        </p>
      </CardHeader>
      <CardContent>
        {c.erro ? (
          <p className="text-sm text-rose-600 py-6 text-center">Não foi possível carregar os indicadores: {c.erro.message || 'erro desconhecido'}.</p>
        ) : c.carregando ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : pontos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Sem dados para os filtros selecionados.</p>
        ) : (
          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground" rowSpan={2}>Mês</th>
                  {series.map(k => (
                    <th key={k} colSpan={3} className="text-center py-1 px-2 font-medium border-l" style={{ color: cor(k) }}>
                      {labelIndicador(k)}
                    </th>
                  ))}
                  {outros.map(k => (
                    <th key={`r-${k}`} rowSpan={2} className="text-right py-1 px-2 font-medium text-muted-foreground border-l text-xs">
                      {labelIndicador(k)} a cada 100 de {labelIndicador(principal)}
                    </th>
                  ))}
                </tr>
                <tr className="border-b text-[11px] text-muted-foreground">
                  {series.map(k => [
                    <th key={`${k}-v`} className="text-right px-2 py-1 font-normal border-l">valor</th>,
                    <th key={`${k}-m`} className="text-right px-2 py-1 font-normal">vs mês ant.</th>,
                    <th key={`${k}-a`} className="text-right px-2 py-1 font-normal">vs ano ant.</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {pontos.map((p, i) => (
                  <tr key={p.label} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-1.5 px-2 font-medium whitespace-nowrap">
                      {p.label}
                      {p.parcial && <span className="ml-1 text-[10px] font-normal text-amber-600">parcial</span>}
                    </td>
                    {series.map(k => [
                      <td key={`${k}-v`} className="text-right px-2 py-1.5 tabular-nums border-l">{fmtNum(p.valores[k])}</td>,
                      <td key={`${k}-m`} className="text-right px-2 py-1.5 text-xs"><Delta v={vars[k][i].mom} compacto /></td>,
                      <td key={`${k}-a`} className="text-right px-2 py-1.5 text-xs"><Delta v={vars[k][i].yoy} compacto /></td>,
                    ])}
                    {outros.map(k => (
                      <td key={`r-${k}`} className="text-right py-1.5 px-2 tabular-nums border-l">{fmtRazao(razoes[k][i])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

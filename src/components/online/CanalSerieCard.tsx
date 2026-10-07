




















import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { online } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { gradFill } from '@/components/charts/ChartGradients';
import { Activity, AlertCircle, Loader2, PieChart as PieIcon } from 'lucide-react';

const ROTULO_PERIODO: Record<number, string> = { 7: '7 dias', 28: '28 dias', 90: '90 dias' };



const CORES_FONTE = [
  '#00B39D', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#10b981', '#94a3b8',
];

function num(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('pt-BR');
}




function diaCurto(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function BlocoErro({ mensagem }: { mensagem: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="text-sm text-muted-foreground">{mensagem}</div>
    </div>
  );
}

export default function CanalSerieCard() {
  const [dias, setDias] = useState(28);
  const [metrica, setMetrica] = useState<'views' | 'horas'>('views');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['online', 'canal-serie', dias],
    queryFn: () => online.canalSerie(dias),
    staleTime: 5 * 60 * 1000,
  });

  const serie = data?.serie;
  const trafego = data?.trafego;
  const pontos = (serie?.pontos || []).map((p: any) => ({
    ...p,
    label: diaCurto(p.data),
  }));

  const cor = metrica === 'views' ? '#00B39D' : '#3b82f6';
  const rotuloMetrica = metrica === 'views' ? 'Views' : 'Horas assistidas';



  const cobertura = serie ? `${serie.dias_com_dado} de ${data.dias} dias coletados` : null;

  return (
    <Card className="overflow-hidden">
      <div className="p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-xl bg-primary/10 p-2"><Activity className="h-5 w-5 text-primary" /></div>
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-tight">Desempenho do canal</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data?.inicio
                ? <>Views e horas assistidas por dia · {diaCurto(data.inicio)} a {diaCurto(data.fim)} · fonte: {data.fonte}</>
                : 'Views e horas assistidas por dia, direto do YouTube Analytics.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {(data?.periodos || [7, 28, 90]).map((p: number) => (
            <Button
              key={p}
              size="sm"
              variant={p === dias ? 'default' : 'ghost'}
              className="h-8 px-3 text-xs"
              onClick={() => setDias(p)}
            >
              {ROTULO_PERIODO[p] || `${p} dias`}
            </Button>
          ))}
        </div>
      </div>

      <CardContent className="p-4 md:p-5 space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando a série do canal…
          </div>
        )}

        {                                                             }
        {isError && !isLoading && (
          <BlocoErro mensagem="Não foi possível carregar a série do canal. Tente recarregar a página." />
        )}

        {!isLoading && !isError && (
          <>
            {                                     }
            {!serie && (
              <BlocoErro mensagem={data?.avisos?.[0] || 'Série do canal indisponível.'} />
            )}

            {serie && serie.dias_com_dado === 0 && (

              <BlocoErro mensagem="Nenhum dia deste período foi coletado ainda — o gráfico não tem o que desenhar." />
            )}

            {serie && serie.dias_com_dado > 0 && (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex gap-6">
                    <button
                      type="button"
                      onClick={() => setMetrica('views')}
                      className={`text-left transition-opacity ${metrica === 'views' ? '' : 'opacity-50 hover:opacity-80'}`}
                    >
                      <div className="text-xs text-muted-foreground">Views no período</div>
                      <div className="text-2xl font-bold tabular-nums leading-tight">{num(serie.total_views)}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetrica('horas')}
                      className={`text-left transition-opacity ${metrica === 'horas' ? '' : 'opacity-50 hover:opacity-80'}`}
                    >
                      <div className="text-xs text-muted-foreground">Horas assistidas</div>
                      <div className="text-2xl font-bold tabular-nums leading-tight">{num(serie.total_horas)}</div>
                    </button>
                  </div>
                  <div className="text-[11px] text-muted-foreground text-right">
                    {cobertura}
                    {serie.ultimo_dia && (
                      <>
                        {' · '}último dia fechado: {diaCurto(serie.ultimo_dia)}
                      </>
                    )}
                  </div>
                </div>

                <div className="h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={pontos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} fontSize={11} />
                      <YAxis tickLine={false} axisLine={false} width={48} fontSize={11}
                             tickFormatter={(v) => Number(v).toLocaleString('pt-BR')} />
                      <Tooltip
                        formatter={(v: any) => [num(v as number), rotuloMetrica]}
                        labelFormatter={(l) => `Dia ${l}`}
                      />
                      <Area
                        type="monotone"
                        dataKey={metrica}
                        name={rotuloMetrica}
                        stroke={cor}
                        strokeWidth={2}
                        fill={gradFill(cor)}
                        fillOpacity={0.9}



                        connectNulls={false}
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {serie.dias_com_dado < data.dias && (
                  <p className="text-[11px] text-muted-foreground">
                    ⚠️ {data.dias - serie.dias_com_dado} dia(s) sem coleta ficam de fora da soma e do gráfico —
                    o YouTube fecha o dia com atraso, então a ponta direita ainda vai subir.
                  </p>
                )}
              </>
            )}

            {                                                  }
            <div className="pt-2 border-t border-border">
              <div className="flex items-center gap-2 mb-3">
                <PieIcon className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">De onde vêm as views</h3>
              </div>

              {!trafego && (
                <BlocoErro mensagem={data?.avisos?.find((a: string) => a.includes('tráfego')) || 'Fontes de tráfego indisponíveis.'} />
              )}

              {trafego && trafego.total === null && (
                <p className="text-sm text-muted-foreground">
                  Nenhuma coleta de tráfego neste período.
                </p>
              )}

              {trafego && trafego.total !== null && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={trafego.itens}
                          dataKey="views"
                          nameKey="rotulo"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={2}
                        >
                          {trafego.itens.map((it: any, i: number) => (
                            <Cell key={it.fonte} fill={gradFill(CORES_FONTE[i % CORES_FONTE.length])} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: any, n: any) => [num(v as number), n]} />
                        <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-1.5">
                    {trafego.itens.map((it: any, i: number) => (
                      <div key={it.fonte} className="flex items-center gap-2 text-sm">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ background: CORES_FONTE[i % CORES_FONTE.length] }}
                        />
                        <span className="flex-1 min-w-0 truncate">{it.rotulo}</span>
                        <span className="tabular-nums text-muted-foreground">{num(it.views)}</span>
                        <span className="tabular-nums w-12 text-right font-medium">{it.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {trafego && trafego.total !== null && (



                <p className="text-[11px] text-muted-foreground mt-3">
                  Base: {num(trafego.total)} views em {trafego.videos} vídeo(s) com coleta de tráfego —
                  não é o canal inteiro. As fatias somam 100% dessa base.
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

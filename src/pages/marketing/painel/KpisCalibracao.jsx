import { AlertTriangle, CheckCircle2, Timer } from 'lucide-react';
import { Cartao, COR, SeloStatus } from './pecasPainel';
import { formatoValorKpi, textoMeta, ddmm, plural, nomeKpi } from './reguaPainel';









function Pontos({ serie }) {
  const ultimos = (serie || []).slice(-12);
  if (!ultimos.length) return null;
  return (
    <div className="flex items-center gap-1 mt-2" aria-hidden>
      {ultimos.map(p => (
        <span
          key={p.periodo}
          title={`${p.periodo}${p.em_andamento ? ' (em andamento)' : ''}: ${p.valor == null ? 'sem medição' : p.valor}`}
          className="h-2 w-2 rounded-full"
          style={p.valor == null
            ? { border: `1.5px solid ${COR.azul}` }
            : { background: COR.azul, opacity: p.em_andamento ? 0.5 : 1 }}
        />
      ))}
    </div>
  );
}

function CartaoKpi({ ind, calibrado }) {
  const mostrado = ind.ultima_fechada || ind.atual;
  const emAndamento = !ind.ultima_fechada && !!ind.atual;
  return (
    <div className="rounded-lg border p-3 min-w-0" style={{ borderColor: COR.linha }}>
      <p className="text-sm font-medium text-foreground leading-snug" title={ind.id}>{nomeKpi(ind)}</p>
      <p className="text-[11px] text-muted-foreground">{textoMeta(ind.meta, ind.unidade, ind.sentido)}</p>
      <p className="font-heading text-2xl font-semibold tabular-nums text-foreground mt-2 leading-none">
        {mostrado ? formatoValorKpi(mostrado.valor, ind.unidade) : '—'}
      </p>
      <p className="text-[11px] text-muted-foreground mt-1">
        {!mostrado ? 'nenhuma semana coletada ainda' : emAndamento ? 'semana em andamento' : `semana de ${ddmm(mostrado.inicio)}`}
      </p>
      {mostrado && mostrado.observacao && (
        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{mostrado.observacao}</p>
      )}
      <Pontos serie={ind.serie} />
      <div className="mt-2">
        {calibrado && ind.farol === 'no_alvo' && <SeloStatus tom="verde" icone={CheckCircle2}>no alvo</SeloStatus>}
        {calibrado && ind.farol === 'fora' && <SeloStatus tom="laranja" icone={AlertTriangle}>fora da meta</SeloStatus>}
        {calibrado && !ind.farol && <span className="text-[11px] text-muted-foreground">sem medição na última semana</span>}
        {!calibrado && <SeloStatus tom="azul" icone={Timer}>em calibração</SeloStatus>}
      </div>
    </div>
  );
}

export default function KpisCalibracao({ kpis }) {
  const faltam = Math.max(0, (kpis.semanas_calibracao || 0) - (kpis.semanas_fechadas || 0));
  const subtitulo = kpis.calibrado
    ? `Contando desde ${ddmm(kpis.marco_inicio)} · farol ligado`
    : `Contando desde ${ddmm(kpis.marco_inicio)} · o farol liga em ${ddmm(kpis.farol_desde)}, com ${kpis.semanas_calibracao} semanas fechadas (faltam ${plural(faltam, 'semana', 'semanas')})`;
  return (
    <Cartao titulo="Indicadores do Marketing" subtitulo={subtitulo}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(kpis.indicadores || []).map(ind => <CartaoKpi key={ind.id} ind={ind} calibrado={kpis.calibrado} />)}
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        A série recomeça em {ddmm(kpis.marco_inicio)}: o prazo passou a ser o das Demandas e o lead time passou a contar do
        pedido até a entrega. Os números anteriores mediam outra coisa.
      </p>
    </Cartao>
  );
}

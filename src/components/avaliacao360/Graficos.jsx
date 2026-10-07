import { useState } from 'react';
import { COR_PAPEL } from './Pesos';











const SERIES = [
  ['auto', 'Autoavaliação', COR_PAPEL.auto],
  ['gestor', 'Gestor', COR_PAPEL.gestor],
  ['outros', 'Pares e liderados', COR_PAPEL.outros],
];
const fmt = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));

export function Comparativo({ criterios, max }) {
  const [foco, setFoco] = useState(null);
  const series = SERIES.filter(([k]) => criterios.some((c) => c[k] != null));
  if (series.length < 2) return null;
  const pos = (v) => `${((Number(v) - 1) / (max - 1)) * 100}%`;
  const ticks = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs" aria-label="Legenda">
        {series.map(([k, nome, cor]) => (
          <span key={k} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: cor }} />{nome}</span>
        ))}
        <span className="flex items-center gap-1.5 text-muted-foreground"><span className="h-3 w-0.5 bg-foreground/70" />nota final</span>
      </div>
      <div className="space-y-1">
        <div className="grid grid-cols-[minmax(110px,32%)_1fr] items-end gap-3">
          <span />
          <div className="relative h-4 text-[10px] text-muted-foreground">
            {ticks.map((t) => <span key={t} className="absolute -translate-x-1/2" style={{ left: pos(t) }}>{t}</span>)}
          </div>
        </div>
        {criterios.map((c) => {
          const vals = series.map(([k]) => c[k]).filter((v) => v != null).map(Number);
          const lo = Math.min(...vals); const hi = Math.max(...vals);
          const ativo = foco === c.competencia_id;
          return (
            <div key={c.competencia_id} className={`grid grid-cols-[minmax(110px,32%)_1fr] items-center gap-3 rounded-md px-1 py-1.5 ${ativo ? 'bg-muted/60' : ''}`}
              onMouseEnter={() => setFoco(c.competencia_id)} onMouseLeave={() => setFoco(null)}>
              <span className="truncate text-xs" title={c.nome}>{c.nome}</span>
              <div className="relative h-6" role="img"
                aria-label={`${c.nome}: ${series.map(([k, n]) => `${n} ${fmt(c[k])}`).join(', ')}; final ${fmt(c.final)}`}>
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
                {ticks.map((t) => <span key={t} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-border" style={{ left: pos(t) }} />)}
                {vals.length > 1 && (
                  <span className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted-foreground/30"
                    style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />
                )}
                {c.final != null && (
                  <span className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-foreground/70" style={{ left: pos(c.final) }} title={`Final ${fmt(c.final)}`} />
                )}
                {series.map(([k, nome, cor], i) => {
                  if (c[k] == null) return null;

                  const iguais = series.filter(([k2]) => c[k2] != null && Math.abs(Number(c[k2]) - Number(c[k])) < 0.12).map(([k2]) => k2);
                  const desloc = iguais.length > 1 ? (iguais.indexOf(k) - (iguais.length - 1) / 2) * 7 : 0;
                  return (
                    <span key={k} title={`${nome}: ${fmt(c[k])}`}
                      className="absolute top-1/2 size-3 -translate-x-1/2 rounded-full ring-2 ring-card"
                      style={{ left: pos(c[k]), background: cor, transform: `translate(-50%, calc(-50% + ${desloc}px))`, zIndex: 3 - i }} />
                  );
                })}
                {ativo && (
                  <span className="absolute -top-1 right-0 rounded bg-popover px-1.5 py-0.5 text-[10px] shadow ring-1 ring-border">
                    {series.map(([k, n]) => `${n.split(' ')[0]} ${fmt(c[k])}`).join(' · ')} · final {fmt(c.final)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


export function pontosCegos(criterios, minimo = 0.5) {
  return criterios
    .map((c) => {
      const outros = [c.gestor, c.outros].filter((v) => v != null).map(Number);
      if (c.auto == null || !outros.length) return null;
      const media = outros.reduce((a, b) => a + b, 0) / outros.length;
      return { nome: c.nome, auto: Number(c.auto), outros: media, diff: Number(c.auto) - media };
    })
    .filter((x) => x && Math.abs(x.diff) >= minimo)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 3);
}

export function PontosCegos({ criterios }) {
  const lista = pontosCegos(criterios);
  if (!lista.length) return null;
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="mb-2 text-sm font-medium">Onde a autoavaliação mais se distancia dos outros</p>
      <ul className="space-y-1.5">
        {lista.map((x) => (
          <li key={x.nome} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-medium">{x.nome}</span>
            <span className="text-muted-foreground">
              autoavaliação {fmt(x.auto)} · os outros {fmt(Math.round(x.outros * 100) / 100)} →{' '}
              <b className="text-foreground">{x.diff > 0 ? `${fmt(Math.round(x.diff * 10) / 10)} acima` : `${fmt(Math.round(-x.diff * 10) / 10)} abaixo`}</b>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">Bom ponto de partida para a conversa de devolutiva.</p>
    </div>
  );
}



export function MapaEquipe({ pessoas, max, onPessoa }) {
  const crits = [];
  for (const p of pessoas) for (const c of p.criterios || []) if (!crits.some((x) => x.competencia_id === c.competencia_id)) crits.push(c);
  if (!crits.length || pessoas.length < 2) return null;
  const tom = (v) => (v == null ? null : Math.max(0.08, Math.min(0.92, (Number(v) - 1) / (max - 1))));
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0.5 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-card px-2 py-1 text-left font-medium" />
              {crits.map((c) => <th key={c.competencia_id} className="min-w-[72px] px-1 py-1 text-center font-normal text-muted-foreground" title={c.nome}><span className="line-clamp-2">{c.nome}</span></th>)}
              <th className="px-1 py-1 text-center font-medium">Final</th>
            </tr>
          </thead>
          <tbody>
            {pessoas.map((p) => (
              <tr key={p.avaliado.id}>
                <td className="sticky left-0 bg-card px-2 py-1">
                  <button type="button" className="text-left hover:text-primary" onClick={() => onPessoa?.(p)}>{p.avaliado.nome.split(' ').slice(0, 2).join(' ')}</button>
                </td>
                {crits.map((c) => {
                  const v = (p.criterios || []).find((x) => x.competencia_id === c.competencia_id)?.final;
                  const a = tom(v);
                  return (
                    <td key={c.competencia_id} title={`${p.avaliado.nome} · ${c.nome}: ${fmt(v)}`}
                      className="rounded px-1 py-1.5 text-center tabular-nums"
                      style={a == null ? undefined : { background: `rgb(13 148 136 / ${a})`, color: a > 0.5 ? '#fff' : undefined }}>
                      {fmt(v)}
                    </td>
                  );
                })}
                <td className="px-1 py-1.5 text-center font-semibold tabular-nums">{fmt(p.final)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>1</span>
        <span className="h-2 w-32 rounded-full" style={{ background: 'linear-gradient(to right, rgb(13 148 136 / 0.08), rgb(13 148 136 / 0.92))' }} />
        <span>{max}</span>
        <span className="ml-2">nota final de cada critério</span>
      </div>
    </div>
  );
}

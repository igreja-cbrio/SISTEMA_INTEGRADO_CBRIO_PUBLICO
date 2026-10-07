import { AlertTriangle } from 'lucide-react';
import { ddmm } from './layout';





const fmtH = (n) => `${(Math.round((Number(n) || 0) * 10) / 10).toString().replace('.', ',')}h`;


function faixa(c) {
  const usado = (c.rotina_h || 0) + (c.demandas_h || 0);
  if (!(c.capacidade > 0)) return usado > 0 ? 'acima' : 'vazia';
  const r = usado / c.capacidade;
  if (r > 1) return 'acima';
  if (r >= 0.85) return 'cheia';
  return 'ok';
}
const COR = {
  ok: { barra: 'bg-[#00B39D] dark:bg-[hsl(var(--lab-azul,243_98%_49%))]', texto: 'text-foreground' },
  cheia: { barra: 'bg-amber-500', texto: 'text-amber-800 dark:text-amber-200' },
  acima: { barra: 'bg-red-500 dark:bg-[hsl(var(--lab-laranja,22_98%_49%))]', texto: 'text-red-700 dark:text-[hsl(var(--lab-laranja,22_98%_49%))]' },
  vazia: { barra: 'bg-slate-300 dark:bg-neutral-600', texto: 'text-muted-foreground' },
};

function Celula({ c }) {
  const usado = (c.rotina_h || 0) + (c.demandas_h || 0);
  const f = faixa(c);
  const pct = c.capacidade > 0 ? Math.min(100, Math.round((usado * 100) / c.capacidade)) : (usado > 0 ? 100 : 0);
  return (
    <td className="border-b border-border px-3 py-2.5 align-top">
      <p className={`text-sm font-semibold tabular-nums ${COR[f].texto}`}>{fmtH(usado)} <span className="font-normal text-muted-foreground">de {fmtH(c.capacidade)}</span></p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
        <div className={`h-full rounded-full ${COR[f].barra}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
        <p>
          {c.tarefas} {c.tarefas === 1 ? 'tarefa' : 'tarefas'}
          {c.rotina_h > 0 && <> · rotina {fmtH(c.rotina_h)}</>}
        </p>
        {c.atrasadas > 0 && <p className="font-medium text-red-600 dark:text-[hsl(var(--lab-laranja,22_98%_49%))]">{c.atrasadas} {c.atrasadas === 1 ? 'atrasada' : 'atrasadas'}</p>}
        {c.sem_estimativa > 0 && <p className="text-amber-700 dark:text-amber-300">{c.sem_estimativa} sem horas</p>}
        {c.folga && <p className="text-slate-600 dark:text-neutral-300">Folga: {fmtH(c.folga.horas)}{c.folga.motivo ? ` · ${c.folga.motivo}` : ''}</p>}
        <p className={c.livre < 0 ? 'font-medium text-red-600 dark:text-[hsl(var(--lab-laranja,22_98%_49%))]' : ''}>{c.livre < 0 ? `passou ${fmtH(-c.livre)}` : `livre ${fmtH(c.livre)}`}</p>
      </div>
    </td>
  );
}

export default function CargaPessoas({ dados, onVerPessoa }) {
  const pc = dados.pessoas_carga;
  const sa = Math.max(1, dados.semana_atual || 1);
  if (!pc) {
    return (
      <div className="absolute inset-0 z-10 overflow-auto bg-slate-50 dark:bg-background p-6">
        <p className="mx-auto max-w-xl rounded-lg border border-border bg-white dark:bg-card p-4 text-sm text-muted-foreground">
          A carga por pessoa aparece só na visão do líder.
        </p>
      </div>
    );
  }
  const colunas = pc.semanas.map(n => (dados.semanas || []).find(w => w.n === n) || { n });
  const semHoras = pc.pessoas.reduce((a, p) => a + pc.semanas.reduce((b, n) => b + (p.semanas[n]?.sem_estimativa || 0), 0), 0);
  return (
    <div className="absolute inset-0 z-10 overflow-auto bg-slate-50 dark:bg-background p-3 sm:p-5">
      <div className="mx-auto max-w-6xl space-y-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Carga por pessoa</h2>
          <p className="text-sm text-muted-foreground">
            Horas das subtarefas abertas no prazo de cada semana, mais a rotina, contra as horas por semana de cada pessoa
            (ou a folga daquela semana). O que está atrasado conta na semana atual. Clique no nome para ver o quadro como a pessoa vê.
          </p>
        </div>
        {semHoras > 0 && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {semHoras} {semHoras === 1 ? 'subtarefa ainda não tem horas' : 'subtarefas ainda não têm horas'} e não {semHoras === 1 ? 'pesa' : 'pesam'} na carga.
            Preencha as horas na matriz do ciclo (Configurar) ou na própria tarefa.
          </p>
        )}
        <div className="overflow-x-auto rounded-xl border border-border bg-white dark:bg-card">
          <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-background text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="sticky left-0 z-10 border-b border-border bg-slate-50 dark:bg-background px-3 py-2 font-semibold">Pessoa</th>
                {colunas.map(w => (
                  <th key={w.n} className={`border-b border-border px-3 py-2 font-semibold ${w.n === sa ? 'text-[#007a6b] dark:text-[hsl(var(--lab-azul-texto,243_100%_75%))]' : ''}`}>
                    Semana {w.n}{w.n === sa ? ' · atual' : ''}
                    {w.inicio && <span className="block text-[10px] font-normal normal-case tracking-normal">{ddmm(w.inicio)} a {ddmm(w.fim)}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pc.pessoas.map(p => (
                <tr key={p.id}>
                  <td className="sticky left-0 z-[1] border-b border-border bg-white dark:bg-card px-3 py-2.5 align-top">
                    <button type="button" className="text-left text-sm font-semibold text-foreground hover:text-[#007a6b] dark:hover:text-[hsl(var(--lab-azul-texto,243_100%_75%))] hover:underline"
                      onClick={() => onVerPessoa(p.id)} title={`Ver o quadro como ${p.nome} vê`}>
                      {p.nome}
                    </button>
                    <p className="text-[11px] text-muted-foreground">{fmtH(p.horas_semanais)} por semana{p.habilidade ? ` · ${p.habilidade}` : ''}</p>
                  </td>
                  {pc.semanas.map(n => <Celula key={n} c={p.semanas[n]} />)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pc.pessoas.length === 0 && (
          <p className="text-sm text-muted-foreground">Ninguém ativo na equipe do Marketing.</p>
        )}
      </div>
    </div>
  );
}

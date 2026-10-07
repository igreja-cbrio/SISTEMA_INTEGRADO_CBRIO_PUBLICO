import { AlertTriangle } from 'lucide-react';







export const ddmm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '—');

export const ESTADO_ROTULO = {
  triagem: 'Triagem', backlog: 'Backlog', pesquisa: 'Pesquisa', producao: 'Produção',
  revisao: 'Revisão', concluido: 'Concluído',
  fila: 'Backlog', em_producao: 'Produção', aguardando_solicitante: 'Revisão',
};




export function Faixa({ children }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

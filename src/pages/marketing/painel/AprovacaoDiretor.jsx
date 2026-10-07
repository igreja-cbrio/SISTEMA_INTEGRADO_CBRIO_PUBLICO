import { AlertTriangle } from 'lucide-react';
import { Cartao, COR, SeloStatus } from './pecasPainel';
import { plural } from './reguaPainel';





const horas = (h) => {
  const n = Number(h) || 0;
  if (n >= 48) return `${(n / 24).toFixed(1).replace('.', ',')} dias`;
  return `${String(n).replace('.', ',')} h`;
};

export default function AprovacaoDiretor({ aprovacoes, erro }) {
  return (
    <Cartao titulo="Aprovação no diretor de origem" subtitulo="Tempo médio até o pedido chegar ao Marketing · últimos 90 dias">
      {erro ? (
        <p className="text-sm text-muted-foreground">Não foi possível carregar as aprovações.</p>
      ) : !aprovacoes || !aprovacoes.length ? (
        <p className="text-sm text-muted-foreground">Nenhum pedido aprovado ou recusado no período.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: COR.linha }}>
          {aprovacoes.map(a => (
            <li key={a.diretor_id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0" style={{ borderColor: COR.linha }}>
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate">{a.diretor_nome || 'Diretor'}</p>
                <p className="text-[11px] text-muted-foreground">
                  {plural(a.total, 'decisão', 'decisões')}{a.rejeitadas ? ` · ${a.rejeitadas} recusada(s)` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {a.gargalo && <SeloStatus tom="laranja" icone={AlertTriangle}>acima de 24 h</SeloStatus>}
                <span className="text-sm font-medium tabular-nums text-foreground">{horas(a.tempo_medio_h)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

import { Card } from '../../../components/ui/card';








export const COR = {
  azul: 'hsl(var(--lab-azul-texto))',
  laranja: 'hsl(var(--lab-laranja))',
  verde: 'hsl(var(--lab-verde))',
  trilho: 'var(--track)',
  linha: 'var(--hairline)',
};

export function Cartao({ titulo, subtitulo, acao, children, className = '' }) {
  return (
    <Card className={`p-4 md:p-5 min-w-0 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="font-heading text-base md:text-lg font-semibold text-foreground leading-tight">{titulo}</h2>
          {subtitulo && <p className="text-xs text-muted-foreground mt-1">{subtitulo}</p>}
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </div>
      {children}
    </Card>
  );
}



export function SeloStatus({ tom = 'laranja', icone: Icone, children, title }) {
  const cor = COR[tom] || COR.laranja;
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium text-foreground whitespace-nowrap"
      style={{ borderColor: cor }}
    >
      {Icone ? <Icone className="h-3 w-3 shrink-0" style={{ color: cor }} aria-hidden /> : (
        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: cor }} aria-hidden />
      )}
      {children}
    </span>
  );
}




export function Balao({ x = 50, children }) {
  const alinhamento = x < 22 ? 'left-0' : x > 78 ? 'right-0' : 'left-1/2 -translate-x-1/2';
  return (
    <div
      role="tooltip"
      className={`pointer-events-none absolute bottom-full mb-2 z-20 w-max max-w-[16rem] rounded-md border bg-popover px-2.5 py-1.5 text-left text-xs text-popover-foreground shadow-md ${alinhamento}`}
    >
      {children}
    </div>
  );
}



export function TabelaSimples({ colunas, linhas, vazio = 'Nada para mostrar.' }) {
  if (!linhas || !linhas.length) return <p className="text-sm text-muted-foreground">{vazio}</p>;
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            {colunas.map(c => (
              <th key={c.chave} className={`px-1 py-1.5 font-medium ${c.direita ? 'text-right' : ''}`}>{c.rotulo}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={l.id ?? i} className="border-t" style={{ borderColor: COR.linha }}>
              {colunas.map(c => (
                <td key={c.chave} className={`px-1 py-1.5 ${c.direita ? 'text-right tabular-nums' : ''}`}>{l[c.chave]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

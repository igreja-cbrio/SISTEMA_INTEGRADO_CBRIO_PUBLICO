






export const COR_PAPEL = { gestor: '#0d9488', auto: '#6366f1', outros: '#d97706' };
const NOME = { gestor: 'Gestor', auto: 'Autoavaliação', outros: 'Pares e liderados' };
const ORDEM = ['gestor', 'auto', 'outros'];
const PASSO = 5;

const arred = (v) => Math.round(v / PASSO) * PASSO;

export function rebalancear(atual, chave, valor) {
  const v = Math.max(0, Math.min(100, arred(valor)));
  const outros = ORDEM.filter((k) => k !== chave);
  const resto = 100 - v;
  const soma = outros.reduce((n, k) => n + atual[k], 0);
  const novo = { ...atual, [chave]: v };
  if (soma === 0) {
    novo[outros[0]] = arred(resto / 2);
    novo[outros[1]] = resto - novo[outros[0]];
  } else {
    novo[outros[0]] = arred((resto * atual[outros[0]]) / soma);
    novo[outros[1]] = resto - novo[outros[0]];
    if (novo[outros[1]] < 0) { novo[outros[0]] += novo[outros[1]]; novo[outros[1]] = 0; }
  }
  return novo;
}

export default function Pesos({ valor, onChange, disabled }) {
  return (
    <div className="space-y-4">
      <div className="flex h-11 w-full gap-0.5 overflow-hidden rounded-lg" role="img"
        aria-label={ORDEM.map((k) => `${NOME[k]} ${valor[k]}%`).join(', ')}>
        {ORDEM.filter((k) => valor[k] > 0).map((k) => (
          <div key={k} className="flex items-center justify-center text-xs font-medium text-white transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${valor[k]}%`, background: COR_PAPEL[k] }} title={`${NOME[k]}: ${valor[k]}%`}>
            {valor[k] >= 14 && <span className="truncate px-2">{NOME[k]} {valor[k]}%</span>}
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {ORDEM.map((k) => (
          <label key={k} className="block">
            <span className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: COR_PAPEL[k] }} />
                {NOME[k]}
              </span>
              <span className="tabular-nums font-semibold">{valor[k]}%</span>
            </span>
            <input type="range" min={0} max={100} step={PASSO} value={valor[k]} disabled={disabled}
              onChange={(e) => onChange(rebalancear(valor, k, Number(e.target.value)))}
              className="mt-2 w-full disabled:opacity-50" style={{ accentColor: COR_PAPEL[k] }}
              aria-label={`Peso de ${NOME[k]}`} />
          </label>
        ))}
      </div>
      {!disabled && (valor.gestor !== 70 || valor.auto !== 15 || valor.outros !== 15) && (
        <button type="button" className="text-xs text-primary hover:underline"
          onClick={() => onChange({ gestor: 70, auto: 15, outros: 15 })}>
          Voltar ao padrão do Feedz (gestor 70% · auto 15% · outros 15%)
        </button>
      )}
    </div>
  );
}

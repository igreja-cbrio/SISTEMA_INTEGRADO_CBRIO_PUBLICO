import { useState } from 'react';
import { Cartao, Balao, COR, TabelaSimples } from './pecasPainel';
import {
  rotuloFaixa, janelaFaixa, alturaRelativa, faixaRotulada, composicaoCulto, composicaoFrente, plural,
} from './reguaPainel';









function detalhe(f) {
  const cultos = composicaoCulto(f.por_culto);
  const frentes = composicaoFrente(f.por_frente);
  return (
    <>
      <p className="font-medium">{rotuloFaixa(f)} · {plural(f.total, 'peça', 'peças')}</p>
      <p className="text-muted-foreground">{janelaFaixa(f)}</p>
      {cultos.length > 0 && <p className="mt-1">{cultos.map(c => `${c.rotulo} ${c.n}`).join(' · ')}</p>}
      {frentes.length > 0 && <p className="text-muted-foreground">{frentes.map(c => `${c.rotulo} ${c.n}`).join(' · ')}</p>}
    </>
  );
}

export default function HorizontePrazos({ horizonte, modo }) {
  const [ativa, setAtiva] = useState(null);
  const faixas = horizonte.faixas || [];
  const maximo = Math.max(0, ...faixas.map(f => f.total));
  const cor = (f) => (f.chave === 'vencidas' ? COR.laranja : COR.azul);
  const semPrazo = Number(horizonte.sem_prazo) || 0;

  const rodape = (
    <p className="text-xs text-muted-foreground mt-3">
      {semPrazo > 0
        ? `${plural(semPrazo, 'peça sem prazo fica', 'peças sem prazo ficam')} fora do gráfico.`
        : 'Toda peça aberta tem prazo.'}
      {' '}Toque numa semana para ver o culto e a frente.
    </p>
  );

  return (
    <Cartao
      titulo="Horizonte de prazos"
      subtitulo={`${plural(horizonte.total, 'peça aberta', 'peças abertas')}, pela semana em que vencem`}
    >
      {modo === 'tabela' ? (
        <TabelaSimples
          colunas={[
            { chave: 'semana', rotulo: 'Semana' },
            { chave: 'periodo', rotulo: 'Período' },
            { chave: 'pecas', rotulo: 'Peças', direita: true },
            { chave: 'cultos', rotulo: 'Por culto' },
          ]}
          linhas={faixas.map(f => ({
            id: String(f.chave),
            semana: rotuloFaixa(f),
            periodo: janelaFaixa(f),
            pecas: f.total,
            cultos: composicaoCulto(f.por_culto).map(c => `${c.rotulo} ${c.n}`).join(' · ') || '—',
          })).concat(semPrazo ? [{ id: 'sem', semana: 'Sem prazo', periodo: '—', pecas: semPrazo, cultos: '—' }] : [])}
        />
      ) : (
        <>
          {                                          }
          <div className="hidden md:block">
            <div className="relative flex items-end gap-1.5 h-48 pt-6 border-b" style={{ borderColor: COR.linha }}>
              {faixas.map((f, i) => {
                const h = alturaRelativa(f.total, maximo);
                const x = faixas.length > 1 ? (i / (faixas.length - 1)) * 100 : 50;
                const aberta = ativa === i;
                return (
                  <div key={String(f.chave)} className="relative flex-1 min-w-0 h-full flex items-end justify-center">
                    {aberta && f.total > 0 && <Balao x={x}>{detalhe(f)}</Balao>}
                    {faixaRotulada(f, horizonte.pico) && (
                      <span
                        className="absolute inset-x-0 text-center text-xs font-medium tabular-nums text-foreground"
                        style={{ bottom: `calc(${h}% + 4px)` }}
                      >
                        {f.total}
                      </span>
                    )}
                    <button
                      type="button"
                      className="w-full max-w-[2.5rem] rounded-t-[4px] focus-visible:outline focus-visible:outline-2"
                      style={{ height: `${h}%`, minHeight: f.total > 0 ? 3 : 0, background: cor(f) }}
                      aria-label={`${rotuloFaixa(f)}, ${janelaFaixa(f)}: ${plural(f.total, 'peça', 'peças')}`}
                      onMouseEnter={() => setAtiva(i)}
                      onMouseLeave={() => setAtiva(null)}
                      onFocus={() => setAtiva(i)}
                      onBlur={() => setAtiva(null)}
                      onClick={() => setAtiva(aberta ? null : i)}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1.5 mt-1.5">
              {faixas.map(f => (
                <span
                  key={String(f.chave)}
                  className={`flex-1 min-w-0 text-center text-[11px] leading-tight ${f.chave === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                >
                  {rotuloFaixa(f)}
                </span>
              ))}
            </div>
          </div>

          {                                                                                }
          <div className="md:hidden space-y-1">
            {faixas.map((f, i) => {
              const aberta = ativa === i;
              const w = alturaRelativa(f.total, maximo);
              return (
                <div key={String(f.chave)}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 text-left"
                    onClick={() => setAtiva(aberta ? null : i)}
                    aria-expanded={aberta}
                    aria-label={`${rotuloFaixa(f)}, ${janelaFaixa(f)}: ${plural(f.total, 'peça', 'peças')}`}
                  >
                    <span className={`w-[5.5rem] shrink-0 text-xs ${f.chave === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {rotuloFaixa(f)}
                    </span>
                    <span className="relative flex-1 h-4 rounded-[4px]" style={{ background: COR.trilho }}>
                      {f.total > 0 && (
                        <span className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: `${w}%`, background: cor(f) }} />
                      )}
                    </span>
                    <span className="w-7 shrink-0 text-right text-xs tabular-nums text-foreground">{f.total}</span>
                  </button>
                  {aberta && f.total > 0 && (
                    <div className="pl-[6rem] pr-7 pt-1 pb-1.5 text-xs">{detalhe(f)}</div>
                  )}
                </div>
              );
            })}
          </div>
          {rodape}
        </>
      )}
    </Cartao>
  );
}

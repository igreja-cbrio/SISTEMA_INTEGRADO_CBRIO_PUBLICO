import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarCheck } from 'lucide-react';
import { Cartao, COR, SeloStatus, TabelaSimples } from './pecasPainel';
import { progressoCiclo, quandoDiaD, ddmm, plural } from './reguaPainel';







const semPrefixo = (nome) => String(nome || '').replace(/^s[ée]rie:\s*/i, '');

export default function AndamentoCiclos({ ciclos, modo }) {
  const navigate = useNavigate();
  const linhas = ciclos.linhas || [];
  const aEncerrar = ciclos.a_encerrar || [];

  const encerrar = aEncerrar.length > 0 && (
    <div className="mt-4 space-y-2">
      {aEncerrar.map(c => (
        <div key={c.event_id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs" style={{ borderColor: COR.linha }}>
          <span className="text-muted-foreground min-w-0">
            <span className="font-medium text-foreground">{semPrefixo(c.nome)}</span>
            {' '}· o Dia D ({ddmm(c.dia_d)}) passou e não há tarefa aberta
          </span>
          <button type="button" className="text-primary hover:underline shrink-0" onClick={() => navigate(`/eventos/${c.event_id}`)}>
            Encerrar em Eventos →
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <Cartao
      titulo="Ciclos até o Dia D"
      subtitulo="A barra são as tarefas prontas; o traço, o que já devia estar pronto até esta semana"
    >
      {!linhas.length ? (
        <p className="text-sm text-muted-foreground">Nenhum ciclo ativo com tarefas do Marketing.</p>
      ) : modo === 'tabela' ? (
        <TabelaSimples
          colunas={[
            { chave: 'ciclo', rotulo: 'Ciclo' },
            { chave: 'diaD', rotulo: 'Dia D' },
            { chave: 'prontas', rotulo: 'Prontas', direita: true },
            { chave: 'deviam', rotulo: 'Deviam', direita: true },
            { chave: 'vencidas', rotulo: 'Vencidas', direita: true },
            { chave: 'semana', rotulo: 'Nesta semana', direita: true },
          ]}
          linhas={linhas.map(l => ({
            id: l.event_id,
            ciclo: semPrefixo(l.nome),
            diaD: ddmm(l.dia_d),
            prontas: `${l.prontas}/${l.total}`,
            deviam: l.deviam,
            vencidas: l.vencidas,
            semana: l.nesta_semana,
          }))}
        />
      ) : (
        <div className="space-y-4">
          {linhas.map(l => {
            const p = progressoCiclo(l);
            return (
              <div key={l.event_id} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium text-foreground truncate">{semPrefixo(l.nome)}</p>
                  <p className="text-xs tabular-nums text-foreground shrink-0">
                    {p ? `${l.prontas} de ${l.total} prontas` : 'sem tarefas'}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">{quandoDiaD(l)}</p>
                {p && (
                  <div
                    className="relative mt-1.5 h-3 rounded-[4px]"
                    style={{ background: COR.trilho }}
                    title={`${l.prontas} de ${l.total} prontas · ${l.deviam} já deviam estar prontas até esta semana`}
                  >
                    <div className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: `${p.pct_prontas}%`, background: COR.azul }} />
                    {l.deviam > 0 && (
                      <div
                        className="absolute -top-1 -bottom-1 w-[2px] rounded bg-foreground"
                        style={{ left: `calc(${p.pct_devia}% - 1px)` }}
                        aria-hidden
                      />
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {l.vencidas > 0 && (
                    <SeloStatus tom="laranja" icone={AlertTriangle}>{plural(l.vencidas, 'vencida', 'vencidas')}</SeloStatus>
                  )}
                  {l.nesta_semana > 0 && (
                    <SeloStatus tom="azul" icone={CalendarCheck}>{plural(l.nesta_semana, 'vence nesta semana', 'vencem nesta semana')}</SeloStatus>
                  )}
                  {l.vencidas === 0 && l.nesta_semana === 0 && l.proximo_prazo && (
                    <span className="text-[11px] text-muted-foreground">próximo prazo {ddmm(l.proximo_prazo)}</span>
                  )}
                  {l.sem_prazo > 0 && (
                    <span className="text-[11px] text-muted-foreground">{plural(l.sem_prazo, 'tarefa sem prazo', 'tarefas sem prazo')}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {encerrar}
    </Cartao>
  );
}

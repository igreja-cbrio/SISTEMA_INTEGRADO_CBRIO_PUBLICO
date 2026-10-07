import { useNavigate } from 'react-router-dom';
import { Cartao, COR } from './pecasPainel';
import { medidorPct, plural } from './reguaPainel';






function Medidor({ rotulo, parte, total, destrava, extra }) {
  const pct = medidorPct(parte, total);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-foreground">{rotulo}</p>
        <p className="text-xs tabular-nums text-foreground shrink-0">
          {pct == null ? '—' : `${parte} de ${total} · ${pct}%`}
        </p>
      </div>
      <div className="relative mt-1.5 h-2 rounded-[4px]" style={{ background: COR.trilho }}>
        {pct > 0 && <div className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: `${pct}%`, background: COR.azul }} />}
      </div>
      <p className="text-xs text-muted-foreground mt-1">{destrava}</p>
      {extra}
    </div>
  );
}

export default function ProntidaoDado({ prontidao, lider }) {
  const navigate = useNavigate();
  const sub = prontidao.subtarefas || { total: 0, com_dono: 0, com_horas: 0 };
  const cap = prontidao.capacidade;
  const mat = prontidao.matriz;
  const rot = prontidao.rotina;

  const atalhoMatriz = mat && mat.total > mat.com_horas && (
    <p className="text-xs mt-1.5">
      <span className="text-muted-foreground">
        A Matriz do ciclo tem {plural(mat.total, 'entrega', 'entregas')}, {mat.com_horas} com horas. Preencher lá propaga para as subtarefas abertas.
      </span>{' '}
      {lider ? (
        <button type="button" className="text-primary hover:underline" onClick={() => navigate('/marketing/demandas?configurar=matriz')}>
          Abrir a Matriz →
        </button>
      ) : (
        <span className="text-muted-foreground">(o líder preenche em Demandas → Configurar)</span>
      )}
    </p>
  );

  return (
    <Cartao
      titulo="O que ainda não dá para medir"
      subtitulo="Sem estes dados, a carga por pessoa e a demanda × capacidade não dizem nada"
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Medidor
          rotulo="Subtarefas com responsável"
          parte={sub.com_dono}
          total={sub.total}
          destrava="Sem responsável, a peça pesa em quem é dono da tarefa, e ninguém sabe quem vai fazer."
        />
        <Medidor
          rotulo="Subtarefas com horas estimadas"
          parte={sub.com_horas}
          total={sub.total}
          destrava="Sem horas, não existe carga por pessoa nem o indicador de demanda × capacidade."
          extra={atalhoMatriz}
        />
        {cap ? (
          <Medidor
            rotulo="Pessoas com horas por semana"
            parte={cap.com_horas}
            total={cap.pessoas}
            destrava={`${cap.horas_semana} h por semana somando a equipe. É o denominador da capacidade.`}
          />
        ) : (
          <p className="text-xs text-muted-foreground">A capacidade da equipe não carregou.</p>
        )}
        {rot ? (
          <Medidor
            rotulo="Rotina marcada nesta semana"
            parte={rot.marcadas}
            total={rot.esperadas}
            destrava={rot.esperadas
              ? 'A rotina reserva tempo mesmo sem marcar; marcar é o que mostra que ela aconteceu.'
              : 'Nenhum compromisso de rotina nesta semana.'}
          />
        ) : (
          <p className="text-xs text-muted-foreground">A rotina da semana não carregou.</p>
        )}
      </div>
    </Cartao>
  );
}

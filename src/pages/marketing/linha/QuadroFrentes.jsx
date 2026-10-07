import { ArrowRight } from 'lucide-react';
import { FRENTES, QUADROS, G, ddmm, rotuloCulto, statusSerie, statusQuadro, textoStatus } from './layout';
import { idDaSerie } from './reguaPainelFrente';





export function BlocosFrentes({ dados, aberta, onToggle }) {
  return QUADROS.map((q, i) => {
    const sq = statusQuadro(dados, q);
    const cor = sq.status === 'vermelho' ? 'red' : sq.status === 'verde' ? 'green' : 'gray';
    const st = sq.status === 'indisponivel'
      ? 'Indisponível no momento'
      : textoStatus(sq.pendentes, sq.semanas_atrasadas.length);
    const exp = aberta === q.key;
    return (
      <button
        key={q.key}
        type="button"
        className={`ml-abs ml-blk ${cor} ${exp ? 'exp' : ''}`}
        aria-expanded={exp}
        style={{ left: G.BX, top: G.TOPY + i * (G.BH + G.BGAP), width: G.BW, height: G.BH }}
        onClick={() => onToggle(q.key)}
      >
        <ArrowRight className="ar h-4 w-4" />
        <span className="k">Quadro {i + 1}</span>
        <span className="nm">{q.nome}</span>
        <span className="ds">{q.desc}</span>
        <span className="st">{st}</span>
      </button>
    );
  });
}




const LEGENDA = [
  ['lg-red', 'Com atraso'], ['lg-late', 'Semana atrasada'],
  ['lg-green', 'Em dia'], ['lg-now', 'Esta semana'],
  ['lg-gray', 'Indisponível'], ['lg-fut', 'Previsto'],
];

export function LegendaQuadro() {
  return (
    <div className="ml-abs ml-legend ml-legend-quadro" style={{ left: G.BX, top: G.HY - 2, width: G.BW + 60 }}>
      {LEGENDA.map(([cls, txt]) => (
        <span key={cls}><i className={cls} />{txt}</span>
      ))}
    </div>
  );
}

export function NotaPerfil({ dados }) {
  const lider = dados.perfil?.lider;
  const verComo = dados.perfil?.ver_como;
  return (
    <div className="ml-abs ml-note" style={{ left: G.BX, top: G.NOTE_Y, width: G.BW }}>
      {verComo
        ? <><b>Visão de {verComo.nome}.</b> É o que {verComo.nome} vê ao abrir esta página. Somente leitura: para marcar ou editar, volte para a sua visão.</>
        : lider
          ? <><b>Visão do líder.</b> Você vê todas as tarefas. Clique num quadrado para ver as demandas e o acompanhamento, e num cartão para as subtarefas.</>
          : <><b>Sua visão.</b> Aparece o que está no seu nome ou sob sua responsabilidade. Clique num quadrado para ver suas demandas, e num cartão para marcar as subtarefas.</>}
    </div>
  );
}





const KICKER_SUB = { rot: 'Toda semana', red: 'Toda semana', prd: 'Sob demanda' };
export function BlocoSub({ grupo, dados, onAbrir, selecionada = false }) {
  const f = FRENTES.find(x => x.key === grupo.sub);
  const fr = dados.frentes?.[grupo.sub] || { status: 'indisponivel' };
  const cor = fr.status === 'vermelho' ? 'red' : fr.status === 'verde' ? 'green' : 'gray';
  const st = fr.status === 'indisponivel'
    ? 'Indisponível no momento'
    : textoStatus(fr.pendentes, (fr.semanas_atrasadas || []).length) || 'Nada pendente até esta semana';
  return (
    <button
      type="button"
      className={`ml-abs ml-blk vb ${cor} ${selecionada ? 'exp' : ''}`}
      aria-pressed={selecionada}
      style={{ left: G.SBX, top: grupo.blocoY, width: G.SBW, minHeight: G.SBH }}
      onClick={() => onAbrir?.(grupo.sub)}
      title={`Ver as demandas de ${f?.nome || 'este bloco'}`}
    >
      <span className="k">{KICKER_SUB[grupo.sub] || ''}</span>
      <span className="nm">{f?.nome || ''}</span>
      <span className="ds">{f?.desc || ''}</span>
      <span className="st">{st}</span>
    </button>
  );
}



export function BlocoSerie({ grupo, semanaAtual, onAbrir, selecionada = false }) {
  const s = grupo.serie;
  const st = statusSerie(s, semanaAtual);
  const cor = st.vermelha ? 'red' : 'green';
  const prox = s.proxima_pendencia;
  const quando = prox == null ? null : prox < semanaAtual ? 'Atrasada' : prox === semanaAtual ? 'Esta semana' : 'Próxima';
  const etapaProx = prox == null ? null
    : (s.etapas || []).find(e => (e.faixas || []).some(t => t.aberta && t.semana === prox));
  return (
    <button
      type="button"
      className={`ml-abs ml-blk vb ${cor} ${selecionada ? 'exp' : ''}`}
      aria-pressed={selecionada}
      style={{ left: G.SBX, top: grupo.blocoY, width: G.SBW, minHeight: G.SBH }}
      onClick={() => onAbrir?.(idDaSerie(s))}
      title={`Ver as demandas de ${s.nome || 'esta série'}`}
    >
      <span className="k">{s.data ? `Lançamento ${ddmm(s.data)}` : 'Sem data de lançamento'}</span>
      <span className="nm">{s.nome || 'Evento sem nome'}</span>
      {st.cultos.length > 0 && (
        <span className="vchips">
          {st.cultos.map(c => (
            <span key={c || 'x'} className={st.cultosAtrasados.has(c) ? 'late' : ''}>{rotuloCulto(c)}</span>
          ))}
        </span>
      )}
      {quando && etapaProx && (
        <span className="nx">{quando}: {etapaProx.nome_fase}{prox > 0 ? ` · semana ${prox}` : ''}</span>
      )}
      <span className="st">{textoStatus(st.pendentes, st.semanasAtrasadas)}</span>
    </button>
  );
}

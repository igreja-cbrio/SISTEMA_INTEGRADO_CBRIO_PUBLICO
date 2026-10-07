import { G, ddmm, rotuloCulto, nomeMembro, ehFrenteRotina, origemDaTarefa, ROTULO_ORIGEM, ROTULO_ROTINA } from './layout';



export function tituloTarefa(t, membros) {

  if (ehFrenteRotina(t.frente) && t.mensal && t.titulo) return `${t.titulo} · ${nomeMembro(membros, t.membro_id) || 'Sem nome'}`;
  if (ehFrenteRotina(t.frente)) return `${ROTULO_ROTINA[t.frente] || 'Rotina'} · ${nomeMembro(membros, t.membro_id) || 'Sem nome'}`;
  return t.titulo || 'Sem título';
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeDoMes = (mes) => MESES[Number(String(mes || '').slice(5, 7)) - 1] || '';



const SOL_CONCLUIDA = new Set(['concluido', 'avaliado']);
export const solicitacaoJaConcluida = (t) => !!t && t.frente === 'sis' && t.tipo !== 'pedido'
  && t.estado !== 'concluido' && SOL_CONCLUIDA.has(t.solicitacao_status);

export function subTarefa(t) {
  if (ehFrenteRotina(t.frente) && t.tipo_rotina === 'planejamento_postagens') {
    return `Planejamento de ${nomeDoMes(t.mes_planejado)} · clique para abrir`;
  }
  if (ehFrenteRotina(t.frente) && t.mensal) return 'Rotina do mês';
  if (ehFrenteRotina(t.frente)) {
    const n = (t.itens || []).length;
    return `${n} ${n === 1 ? 'compromisso' : 'compromissos'} na semana`;
  }
  if (t.tipo === 'pedido') return t.solicitante ? `Pedido de ${t.solicitante}` : 'Pedido do formulário';
  if (origemDaTarefa(t) === 'externa') return solicitacaoJaConcluida(t) ? 'Solicitação já concluída' : (t.pedido?.titulo || 'Solicitação');
  return t.culto ? rotuloCulto(t.culto) : (t.descricao || (t.frente === 'prd' ? 'Produção de redes' : 'Demanda interna'));
}

const STATUS_PEDIDO = {
  aguardando_aprovacao: 'aguardando o diretor aprovar',
  aguardando_alocacao: 'aguardando alocação',
  sem_tarefa: 'triado, sem tarefa',
};

export function contagemItens(t, fut) {
  if (t.tipo === 'pedido') return STATUS_PEDIDO[t.pedido_status] || 'sem tarefa';
  const itens = t.itens || [];
  if (!itens.length) return 'Sem subtarefas';
  const abertos = itens.filter(i => !i.feito).length;
  return fut ? `${itens.length} previstas` : `${abertos} de ${itens.length} em aberto`;
}

const PAPEL = { responsavel: 'Você é responsável', dono: 'Suas subtarefas' };

export default function CartaoTarefa({ no, membros, onAbrir }) {
  const t = no.tarefa;
  const itens = t.itens || [];
  const feitos = itens.filter(i => i.feito).length;
  const pct = itens.length ? Math.round((feitos / itens.length) * 100) : 0;
  const ehPedido = t.tipo === 'pedido';
  const donoId = ehFrenteRotina(t.frente) ? t.membro_id : ehPedido ? t.sugerido_membro_id : t.atribuido_a;
  const origem = origemDaTarefa(t);
  const dono = nomeMembro(membros, donoId);
  const semDono = ehPedido ? 'Sem sugestão' : 'Sem responsável';
  return (
    <button
      type="button"
      className={`ml-abs ml-node l-${ehPedido ? 'pen' : t.frente} ${no.fut ? 'fut' : ''}`}
      style={{ left: no.x, top: no.y, width: G.NW, height: no.h }}
      onClick={() => onAbrir(t)}
      title={tituloTarefa(t, membros)}
    >
      <div className="bar" />
      <div className="body">
        <span className="ttl">{tituloTarefa(t, membros)}</span>
        <span className="sub">
          {origem && <span className={`etq ${origem}`}>{ROTULO_ORIGEM[origem]}</span>}
          {subTarefa(t)} · {contagemItens(t, no.fut)}
        </span>
        {itens.length > 0 && (
          <div className="ml-prog">
            <div className="tr"><i style={{ width: `${pct}%` }} /></div>
            <span>{feitos}/{itens.length}</span>
          </div>
        )}
        <div className="foot">
          {PAPEL[t.papel]
            ? <span className="own">{PAPEL[t.papel]}</span>
            : <span className="who">{dono ? (ehPedido ? `Sugestão: ${dono}` : dono) : semDono}</span>}
          <span>{t.semana === 0 ? 'de antes' : t.prazo ? `prazo ${ddmm(t.prazo)}` : ''}</span>
        </div>
      </div>
    </button>
  );
}

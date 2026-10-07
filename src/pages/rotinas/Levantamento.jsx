




import { toast } from 'sonner';
import { rotinas as api } from '../../api';
import { C, cardStyle, btn, hint, Badge } from '../planejamentoAnual/comum';

const STATUS = {
  pendente: { rotulo: 'Pendente', cor: C.red },
  em_andamento: { rotulo: 'Em andamento', cor: C.amber },
  concluida: { rotulo: 'Concluída', cor: C.green },
};

const fmtData = (iso) => new Date(iso).toLocaleDateString('pt-BR');

const celula = { padding: '8px 10px', fontSize: 13, color: C.text, borderBottom: '1px solid var(--hairline)', verticalAlign: 'middle' };
const cab = { ...celula, fontSize: 11.5, fontWeight: 700, color: C.t3, textTransform: 'uppercase', textAlign: 'left' };

export default function Levantamento({ dados, onMudou, onIrParaRotinas }) {
  if (!dados) return <p style={hint}>Carregando…</p>;

  const agir = async (fn, ok) => {
    try { await fn(); toast.success(ok); onMudou(); } catch (e) { toast.error(e.message || 'Não foi possível concluir'); }
  };

  if (!dados.aberto) {
    return (
      <div style={{ ...cardStyle, padding: 18, display: 'grid', gap: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Nenhum levantamento aberto</span>
        <p style={{ margin: 0, fontSize: 13, color: C.t2 }}>
          O levantamento é a "foto" das rotinas que cada área já tem hoje, feita antes das propostas, para comparar antes e depois.
          {dados.ultimo ? ` O último (${dados.ultimo.nome}) foi encerrado.` : ''}
        </p>
        {dados.pode_gerir ? (
          <div>
            <button style={btn('primary')} onClick={() => agir(() => api.abrirLevantamento(), 'Levantamento aberto')}>
              Abrir levantamento de rotinas
            </button>
          </div>
        ) : (
          <p style={{ ...hint, margin: 0 }}>Quem abre o levantamento é o PMO, a Diretoria Geral ou o Pastor.</p>
        )}
      </div>
    );
  }

  const concluidas = dados.areas.filter((a) => a.status === 'concluida').length;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ ...cardStyle, padding: 16, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{dados.aberto.nome}</span>
          <Badge texto="Aberto" cor={C.green} />
          <span style={{ ...hint, margin: 0 }}>desde {fmtData(dados.aberto.aberto_em)} · {concluidas} de {dados.areas.length} áreas concluíram</span>
          {dados.pode_gerir && (
            <button style={{ ...btn('ghost'), marginLeft: 'auto' }} onClick={() => agir(() => api.encerrarLevantamento(), 'Levantamento encerrado')}>
              Encerrar levantamento
            </button>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 13, color: C.t2 }}>
          Cada área declara as rotinas que já tem na aba <button style={{ background: 'none', border: 'none', color: C.primary, cursor: 'pointer', fontWeight: 600, padding: 0 }} onClick={onIrParaRotinas}>Rotinas</button> ("Nova rotina" + os itens do checklist).
          Durante o levantamento elas são só <strong>declaradas</strong>: não geram tarefas no Minhas Tarefas até alguém clicar em "Ativar acompanhamento".
          Quando terminar, a área clica em "Concluí a declaração".
        </p>
      </div>

      <div style={{ ...cardStyle, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr><th style={cab}>Área</th><th style={cab}>Líder</th><th style={cab}>Rotinas</th><th style={cab}>Itens</th><th style={cab}>Situação</th><th style={cab} /></tr>
          </thead>
          <tbody>
            {dados.areas.map((a) => {
              const st = STATUS[a.status];
              return (
                <tr key={a.area}>
                  <td style={{ ...celula, fontWeight: 600 }}>{a.rotulo}</td>
                  <td style={celula}>{a.lider_nome || '—'}</td>
                  <td style={celula}>{a.rotinas}</td>
                  <td style={celula}>{a.itens}</td>
                  <td style={celula}>
                    <span style={{ color: st.cor, fontWeight: 700, fontSize: 12.5 }}>
                      <span aria-hidden style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: st.cor, marginRight: 6 }} />
                      {st.rotulo}
                    </span>
                    {a.concluida_em && <span style={{ ...hint, marginLeft: 8 }}>{fmtData(a.concluida_em)}</span>}
                  </td>
                  <td style={{ ...celula, textAlign: 'right' }}>
                    {a.pode && (a.status === 'concluida' ? (
                      <button style={btn('ghost')} onClick={() => agir(() => api.declarar(a.area, false), 'Declaração reaberta')}>Reabrir</button>
                    ) : (
                      <button style={btn('primary')} onClick={() => agir(() => api.declarar(a.area, true), `Declaração de ${a.rotulo} concluída`)}>
                        Concluí a declaração
                      </button>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

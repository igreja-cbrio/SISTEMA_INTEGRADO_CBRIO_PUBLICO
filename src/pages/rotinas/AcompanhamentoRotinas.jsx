








import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Repeat, Plus, Trash2, Pencil } from 'lucide-react';
import { rotinas as api } from '../../api';
import ModuleHeader from '../../components/layout/ModuleHeader';
import { C, cardStyle, input, btn, hint, Badge } from '../planejamentoAnual/comum';
import PainelCumprimento from './PainelCumprimento';
import Levantamento from './Levantamento';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const FREQ = [
  { valor: 'diaria', rotulo: 'Todo dia útil (seg a sex)' },
  { valor: 'semanal', rotulo: 'Toda semana' },
  { valor: 'quinzenal', rotulo: 'A cada 15 dias' },
  { valor: 'mensal', rotulo: 'Todo mês' },
];

export function descreverFrequencia(i) {
  if (i.frequencia === 'diaria') return 'Seg a sex';
  if (i.frequencia === 'semanal') return `Toda ${DIAS[i.dia_semana]?.toLowerCase() || '?'}`;
  if (i.frequencia === 'quinzenal') return `A cada 15 dias (${DIAS[i.dia_semana]?.toLowerCase() || '?'})`;
  if (i.frequencia === 'mensal') return `Dia ${i.dia_mes} de cada mês`;
  return i.frequencia;
}

const ITEM_VAZIO = { titulo: '', frequencia: 'semanal', dia_semana: 1, dia_mes: 1, responsavel_id: '', descricao: '' };

function FormItem({ inicial, pessoas, salvando, onSalvar, onCancelar }) {
  const [f, setF] = useState(inicial);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 10, background: 'var(--cbrio-bg)', border: '1px solid var(--hairline)' }}>
      <input style={input} placeholder="O que precisa ser feito (ex.: Conferir estoque do Kids)" value={f.titulo} onChange={(e) => set('titulo', e.target.value)} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select style={{ ...input, width: 'auto' }} value={f.frequencia} onChange={(e) => set('frequencia', e.target.value)} aria-label="Frequência">
          {FREQ.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
        </select>
        {(f.frequencia === 'semanal' || f.frequencia === 'quinzenal') && (
          <select style={{ ...input, width: 'auto' }} value={f.dia_semana ?? 1} onChange={(e) => set('dia_semana', Number(e.target.value))} aria-label="Dia da semana">
            {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        )}
        {f.frequencia === 'mensal' && (
          <input style={{ ...input, width: 110 }} type="number" min={1} max={31} value={f.dia_mes ?? 1}
            onChange={(e) => set('dia_mes', Number(e.target.value))} aria-label="Dia do mês" />
        )}
        <select style={{ ...input, width: 'auto', minWidth: 200 }} value={f.responsavel_id} onChange={(e) => set('responsavel_id', e.target.value)} aria-label="Responsável">
          <option value="">Responsável…</option>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={btn('primary')} disabled={salvando} onClick={() => onSalvar(f)}>{salvando ? 'Salvando…' : 'Salvar item'}</button>
        <button style={btn('ghost')} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

function CartaoRotina({ r, pessoas, rotuloArea, onMudou }) {
  const [editandoItem, setEditandoItem] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);

  const salvarItem = async (f) => {
    setSalvando(true);
    try {
      const corpo = { titulo: f.titulo, frequencia: f.frequencia, dia_semana: f.dia_semana, dia_mes: f.dia_mes, responsavel_id: f.responsavel_id, descricao: f.descricao || '' };
      if (editandoItem === 'novo') await api.criarItem(r.id, corpo);
      else await api.atualizarItem(r.id, editandoItem.id, corpo);
      toast.success('Item salvo — as tarefas dos próximos 7 dias já estão no Minhas Tarefas do responsável');
      setEditandoItem(null);
      onMudou();
    } catch (e) { toast.error(e.message || 'Não foi possível salvar o item'); }
    finally { setSalvando(false); }
  };
  const acao = async (fn, ok) => {
    try { await fn(); toast.success(ok); onMudou(); } catch (e) { toast.error(e.message || 'Não foi possível concluir'); }
  };

  return (
    <div style={{ ...cardStyle, padding: 16, opacity: r.ativa ? 1 : 0.65 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{r.nome}</span>
        <Badge texto={rotuloArea(r.area)} cor={C.t2} />
        <Badge texto={r.origem === 'proposta' ? 'Do Planejamento Anual' : 'Cadastro direto'} cor={r.origem === 'proposta' ? C.purple : C.blue} />
        {!r.ativa && <Badge texto="Pausada" cor={C.amber} />}
        {r.linha_base && <Badge texto="Linha de base" cor={C.blue} />}
        {r.acompanhamento_ativo === false && <Badge texto="Só declarada · sem tarefas" cor={C.amber} />}
        {r.pode_gerir && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {r.acompanhamento_ativo === false && (
              <button
                style={btn('primary')} disabled={r.itens.length === 0}
                title={r.itens.length === 0 ? 'Inclua os itens do checklist antes de ativar' : undefined}
                onClick={() => acao(() => api.acompanhamento(r.id, true), 'Acompanhamento ativado — as tarefas dos próximos 7 dias já estão no Minhas Tarefas')}
              >Ativar acompanhamento</button>
            )}
            <button style={btn('ghost')} onClick={() => acao(() => api.update(r.id, { ativa: !r.ativa }), r.ativa ? 'Rotina pausada' : 'Rotina reativada')}>
              {r.ativa ? 'Pausar' : 'Reativar'}
            </button>
            {confirmarExcluir ? (
              <button style={btn('danger')} onClick={() => acao(() => api.remove(r.id), 'Rotina excluída')}>Confirmar exclusão</button>
            ) : (
              <button style={{ ...btn('ghost'), color: C.red }} onClick={() => setConfirmarExcluir(true)}><Trash2 size={14} /></button>
            )}
          </div>
        )}
      </div>
      {r.descricao && <p style={{ margin: '6px 0 0', fontSize: 13, color: C.t2 }}>{r.descricao}</p>}

      <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        {r.itens.length === 0 && editandoItem !== 'novo' && (
          <p style={{ ...hint, margin: 0 }}>Sem itens ainda. Cada item vira uma tarefa planejada no Minhas Tarefas do responsável.</p>
        )}
        {r.itens.map((i) => (editandoItem?.id === i.id ? (
          <FormItem key={i.id} inicial={{ ...ITEM_VAZIO, ...i }} pessoas={pessoas} salvando={salvando} onSalvar={salvarItem} onCancelar={() => setEditandoItem(null)} />
        ) : (
          <div key={i.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--hairline)', fontSize: 13 }}>
            <Repeat size={13} color={C.t3} />
            <span style={{ fontWeight: 600, color: C.text }}>{i.titulo}</span>
            <span style={{ color: C.t2 }}>{descreverFrequencia(i)}</span>
            <span style={{ color: C.t3 }}>{i.responsavel_nome || '—'}</span>
            {r.pode_gerir && (
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                <button style={btn('ghost')} title="Editar item" onClick={() => setEditandoItem(i)}><Pencil size={13} /></button>
                <button style={{ ...btn('ghost'), color: C.red }} title="Remover item" onClick={() => acao(() => api.removerItem(r.id, i.id), 'Item removido')}><Trash2 size={13} /></button>
              </span>
            )}
          </div>
        )))}
        {editandoItem === 'novo' && (
          <FormItem inicial={ITEM_VAZIO} pessoas={pessoas} salvando={salvando} onSalvar={salvarItem} onCancelar={() => setEditandoItem(null)} />
        )}
        {r.pode_gerir && editandoItem === null && (
          <div><button style={btn('soft')} onClick={() => setEditandoItem('novo')}><Plus size={14} /> Item</button></div>
        )}
      </div>
    </div>
  );
}

export default function AcompanhamentoRotinas() {
  const [escopo, setEscopo] = useState(null);
  const [lista, setLista] = useState([]);
  const [pessoas, setPessoas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [area, setArea] = useState('');
  const [nova, setNova] = useState(null);
  const [criando, setCriando] = useState(false);
  const [aba, setAba] = useState(null);
  const [lev, setLev] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const esc = await api.escopo();
      setEscopo(esc);
      if (!esc.pode_ver) return;
      const [rs, ps, lv] = await Promise.all([api.list(), api.pessoas().catch(() => []), api.levantamento().catch(() => null)]);
      setLev(lv);

      setAba((atual) => atual || (lv?.aberto ? 'levantamento' : 'painel'));
      setLista(Array.isArray(rs) ? rs : []);
      setPessoas(Array.isArray(ps) ? ps : []);
    } catch (e) {
      toast.error(e.message || 'Erro ao carregar as rotinas');
    } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const rotuloArea = useCallback((a) => escopo?.areas?.find((x) => x.area === a)?.rotulo || a, [escopo]);
  const visiveis = useMemo(() => (area ? lista.filter((r) => r.area === area) : lista), [lista, area]);

  const criar = async () => {
    if (!nova?.nome?.trim() || !nova.area) { toast.error('Informe o nome e a área'); return; }
    setCriando(true);
    try {
      await api.create(nova);
      toast.success('Rotina criada — agora inclua os itens do checklist');
      setNova(null);
      carregar();
    } catch (e) { toast.error(e.message || 'Não foi possível criar a rotina'); }
    finally { setCriando(false); }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 40px' }}>
      <ModuleHeader
        icon={Repeat}
        title="Acompanhamento de Rotinas"
        subtitle="Rotinas operacionais das equipes · cada item vira tarefa planejada no Minhas Tarefas do responsável"
      />

      {carregando && !escopo && <p style={hint}>Carregando…</p>}
      {escopo && !escopo.pode_ver && (
        <div style={{ ...cardStyle, padding: 18 }}>
          <p style={{ margin: 0, fontSize: 14, color: C.t2 }}>
            O acompanhamento de rotinas é para líderes de área, diretores, PMO e Pastor. Suas tarefas planejadas aparecem no Minhas Tarefas.
          </p>
        </div>
      )}

      {escopo?.pode_ver && (
        <div style={{ display: 'flex', gap: 0, borderBottom: `2px solid ${C.border}`, marginBottom: 16 }}>
          {[['painel', 'Painel de cumprimento'], ['rotinas', 'Rotinas'], ['levantamento', lev?.aberto ? 'Levantamento (aberto)' : 'Levantamento']].map(([k, rotulo]) => (
            <button
              key={k} onClick={() => setAba(k)}
              style={{
                padding: '9px 16px', fontSize: 13, fontWeight: aba === k ? 700 : 500, cursor: 'pointer',
                background: 'transparent', border: 'none', borderBottom: aba === k ? `2px solid ${C.primary}` : '2px solid transparent',
                color: aba === k ? C.primary : C.t2, marginBottom: -2,
              }}
            >{rotulo}</button>
          ))}
        </div>
      )}

      {escopo?.pode_ver && aba === 'painel' && <PainelCumprimento />}
      {escopo?.pode_ver && aba === 'levantamento' && <Levantamento dados={lev} onMudou={carregar} onIrParaRotinas={() => setAba('rotinas')} />}

      {escopo?.pode_ver && aba === 'rotinas' && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select style={{ ...input, width: 'auto', minWidth: 200 }} value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área">
              <option value="">Todas as áreas</option>
              {escopo.areas.map((a) => <option key={a.area} value={a.area}>{a.rotulo}</option>)}
            </select>
            <button style={{ ...btn('primary'), marginLeft: 'auto' }} onClick={() => setNova({ nome: '', area: area || escopo.areas[0]?.area || '', descricao: '' })}>
              <Plus size={14} /> Nova rotina
            </button>
          </div>

          {nova && (
            <div style={{ ...cardStyle, padding: 16, display: 'grid', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Nova rotina (cadastro direto)</span>
              <p style={{ ...hint, margin: 0 }}>
                Para rotinas que já existem hoje. Rotina nova, com custo ou mudança de processo, entra pelo Planejamento Anual.
                {lev?.aberto && <strong> Levantamento aberto: ela entra como declarada (linha de base), sem gerar tarefas até você ativar o acompanhamento.</strong>}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input style={{ ...input, flex: '1 1 260px', width: 'auto' }} placeholder="Nome (ex.: Encontrão da equipe)" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
                <select style={{ ...input, width: 'auto' }} value={nova.area} onChange={(e) => setNova({ ...nova, area: e.target.value })} aria-label="Área da rotina">
                  {escopo.areas.map((a) => <option key={a.area} value={a.area}>{a.rotulo}</option>)}
                </select>
              </div>
              <textarea style={{ ...input, minHeight: 56 }} placeholder="Descrição (opcional)" value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btn('primary')} disabled={criando} onClick={criar}>{criando ? 'Criando…' : 'Criar rotina'}</button>
                <button style={btn('ghost')} onClick={() => setNova(null)}>Cancelar</button>
              </div>
            </div>
          )}

          {!carregando && visiveis.length === 0 && (
            <div style={{ ...cardStyle, padding: 18 }}>
              <p style={{ margin: 0, fontSize: 13, color: C.t2 }}>Nenhuma rotina {area ? 'nesta área' : 'cadastrada'} ainda.</p>
            </div>
          )}
          {visiveis.map((r) => (
            <CartaoRotina key={r.id} r={r} pessoas={pessoas} rotuloArea={rotuloArea} onMudou={carregar} />
          ))}
        </div>
      )}
    </div>
  );
}

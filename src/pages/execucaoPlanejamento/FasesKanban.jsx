






























import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { Lock, Plus } from 'lucide-react';
import { projects as projectsApi, cycles as cyclesApi, planejamentoAnual as planApi } from '../../api';
import { C, cardStyle, btn, hint } from '../planejamentoAnual/comum';
import { useArrastoKanban } from '../marketing/useArrastoKanban';
import FaseStepper from '../../components/FaseStepper';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';

const COLUNAS = [
  { key: 'pendente', label: 'Pendente', cor: C.t3 },
  { key: 'em-andamento', label: 'Em andamento', cor: C.blue },
  { key: 'concluida', label: 'Concluída', cor: C.green },
  { key: 'bloqueada', label: 'Bloqueada', cor: C.red },
];





const PHASE_NAMES_PROJETO = ['Concepção', 'Planejamento', 'Mobilização', 'Comunicação', 'Execução', 'Monitoramento', 'Encerramento'];
const PHASE_ABBREVS_PROJETO = ['CON', 'PLA', 'MOB', 'COM', 'EXE', 'MON', 'ENC'];

function abrevDoNome(nome) {
  const limpo = (nome || '').trim();
  if (!limpo) return '???';
  return limpo.slice(0, 3).toUpperCase();
}






function statusDaFase(nomeFase, cards) {
  const itens = cards.filter((c) => c.fase === nomeFase);
  if (itens.length === 0) return 'pendente';
  if (itens.every((c) => c.status === 'concluida')) return 'concluida';
  if (itens.some((c) => c.status === 'bloqueada')) return 'bloqueada';
  if (itens.some((c) => c.status === 'em-andamento' || c.status === 'concluida')) return 'em-andamento';
  return 'pendente';
}


function statusDeTarefa(t) { return COLUNAS.some((c) => c.key === t.status) ? t.status : 'pendente'; }




function faseDaTarefaProjeto(t, fases) {
  for (const ph of fases) {
    const nome = ph.name || '';
    const phStart = ph.date_start || ph.start_date;
    const phEnd = ph.date_end || ph.end_date;
    if (t.description && nome && t.description.includes('Fase: ' + nome)) return nome;
    if (phStart && phEnd && (t.start_date || t.deadline)) {
      const tStart = t.start_date || t.deadline;
      const tEnd = t.deadline || t.start_date;
      if (tStart && tEnd && tStart <= phEnd && tEnd >= phStart) return nome;
    }
  }
  return null;
}

function faseDaTarefaEvento(t, fases) {
  const f = fases.find((ph) => ph.id === t.event_phase_id);
  return f ? (f.nome_fase || `Fase ${f.numero_fase}`) : null;
}





const SEM_FASE = '__sem_fase__';

const PRIORIDADE_PROJETO = [
  { valor: 'baixa', rotulo: 'Baixa' }, { valor: 'media', rotulo: 'Média' },
  { valor: 'alta', rotulo: 'Alta' }, { valor: 'urgente', rotulo: 'Urgente' },
];

const PRIORIDADE_EVENTO = [
  { valor: 'baixa', rotulo: 'Baixa' }, { valor: 'normal', rotulo: 'Normal' }, { valor: 'alta', rotulo: 'Alta' },
];

const AREA_EVENTO_OPCOES = [
  { valor: 'marketing', rotulo: 'Marketing' }, { valor: 'adm', rotulo: 'Administrativo' },
  { valor: 'compras', rotulo: 'Compras' }, { valor: 'financeiro', rotulo: 'Financeiro' },
  { valor: 'manutencao', rotulo: 'Manutenção' }, { valor: 'limpeza', rotulo: 'Limpeza' },
  { valor: 'cozinha', rotulo: 'Cozinha' }, { valor: 'producao', rotulo: 'Produção' },
];

function normDate(d) { return d ? String(d).slice(0, 10) : ''; }



function extrairFaseEDescricao(descricaoBruta, nomesFases) {
  const desc = descricaoBruta || '';
  for (const nome of nomesFases) {
    const marca = `Fase: ${nome}`;
    if (desc === marca) return { fase: nome, resto: '' };
    if (desc.startsWith(marca + '\n')) return { fase: nome, resto: desc.slice(marca.length + 1) };
  }
  return { fase: null, resto: desc };
}
function montarDescricaoComFase(faseNome, resto) {
  const corpo = (resto || '').trim();
  if (!faseNome) return corpo;
  return corpo ? `Fase: ${faseNome}\n${corpo}` : `Fase: ${faseNome}`;
}

export default function FasesKanban({ proposta, onMaterializado }) {
  const vinculo = proposta.vinculo || { tipo: null, id: null };

  const modo = proposta.natureza === 'rotina' ? 'rotina' : vinculo.tipo;



  const podeGerir = Boolean(proposta.pode_gerir);
  const [carregando, setCarregando] = useState(Boolean(modo));
  const [cards, setCards] = useState([]);
  const [fasesBrutas, setFasesBrutas] = useState([]);
  const [faseSelecionada, setFaseSelecionada] = useState(null);
  const [materializando, setMaterializando] = useState(false);
  const [iniciandoFases, setIniciandoFases] = useState(false);
  const [modalTarefa, setModalTarefa] = useState(null);
  const [salvandoTarefa, setSalvandoTarefa] = useState(false);
  const [operacional, setOperacional] = useState(null);
  const [colocando, setColocando] = useState(false);
  const containerRef = useRef(null);

  const carregar = useCallback(async () => {
    if (!modo) { setCards([]); setFasesBrutas([]); return; }
    setCarregando(true);
    try {
      if (modo === 'rotina') {
        const r = await planApi.execucao.rotina(proposta.id);
        const fases = r?.fases || [];
        const nomePorId = Object.fromEntries(fases.map((f) => [f.id, f.nome]));
        setFasesBrutas(fases);
        setOperacional(r?.operacional || null);
        setCards((r?.tarefas || []).map((t) => ({
          id: t.id, titulo: t.titulo || 'Tarefa',
          status: statusDeTarefa(t), fase: nomePorId[t.fase_id] || null, raw: t,
        })));
      } else if (vinculo.tipo === 'projeto') {
        const proj = await projectsApi.get(vinculo.id);
        const fases = proj?.phases || [];
        const tarefas = proj?.tasks || [];
        setFasesBrutas([...fases].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)));
        setCards(tarefas.map((t) => ({
          id: t.id, titulo: t.title || t.name || 'Tarefa',
          status: statusDeTarefa(t), fase: faseDaTarefaProjeto(t, fases), raw: t,
        })));
      } else {
        const ciclo = await cyclesApi.get(vinculo.id);
        const fases = ciclo?.phases || [];
        const tarefas = ciclo?.tasks || [];
        setFasesBrutas([...fases].sort((a, b) => (a.numero_fase || 0) - (b.numero_fase || 0)));
        setCards(tarefas.map((t) => ({
          id: t.id, titulo: t.titulo || 'Tarefa',
          status: statusDeTarefa(t), fase: faseDaTarefaEvento(t, fases), raw: t,
        })));
      }
    } catch {
      toast.error('Erro ao carregar as fases');
    } finally { setCarregando(false); }
  }, [modo, vinculo.tipo, vinculo.id, proposta.id]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { setFaseSelecionada(null); }, [modo, vinculo.id]);




  const fasesStepper = useMemo(() => {
    if (fasesBrutas.length === 0) return [];
    if (modo === 'rotina') {
      return fasesBrutas.map((f) => ({ id: f.id, nome: f.nome, abrev: abrevDoNome(f.nome), status: statusDaFase(f.nome, cards) }));
    }
    if (modo === 'projeto') {
      return fasesBrutas.map((f, i) => {
        const nome = f.name || PHASE_NAMES_PROJETO[i] || `Fase ${i + 1}`;
        return { id: f.id, nome, abrev: PHASE_ABBREVS_PROJETO[i] || abrevDoNome(nome), status: statusDaFase(nome, cards) };
      });
    }
    return fasesBrutas.map((f) => {
      const nome = f.nome_fase || `Fase ${f.numero_fase}`;
      return { id: f.id, nome, abrev: abrevDoNome(nome), status: statusDaFase(nome, cards) };
    });
  }, [fasesBrutas, cards, modo]);








  const iniciarFasesPadrao = useCallback(async () => {
    if (!modo) return;
    setIniciandoFases(true);
    try {
      await planApi.execucao.iniciarFases(proposta.id);
      await carregar();
    } catch (e) {
      toast.error(e.message || 'Não foi possível iniciar as fases');
    } finally { setIniciandoFases(false); }
  }, [modo, proposta.id, carregar]);

  const nomeDaFaseSelecionada = faseSelecionada
    ? fasesStepper.find((f) => f.id === faseSelecionada)?.nome
    : null;

  const moverCard = useCallback(async (cardId, novoEstado) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    if (novoEstado === null) { setModalTarefa(card.raw || { id: cardId }); return; }
    if (card.status === novoEstado) return;
    setCards((cs) => cs.map((c) => (c.id === cardId ? { ...c, status: novoEstado } : c)));
    try {
      await planApi.execucao.statusTarefa(proposta.id, cardId, novoEstado);
    } catch (e) {
      toast.error(e.message || 'Não foi possível mover o card');
      carregar();
    }
  }, [cards, proposta.id, carregar]);

  const abrirNovaTarefa = useCallback(() => {
    if (modo === 'rotina') {
      setModalTarefa({ fase_id: faseSelecionada || null });
    } else if (modo === 'projeto') {
      setModalTarefa({ faseValor: nomeDaFaseSelecionada || SEM_FASE });
    } else {
      setModalTarefa({ event_phase_id: faseSelecionada || fasesStepper[0]?.id || '' });
    }
  }, [modo, nomeDaFaseSelecionada, faseSelecionada, fasesStepper]);

  const salvarTarefa = useCallback(async (form) => {
    setSalvandoTarefa(true);
    try {
      if (modo === 'rotina') {
        const payload = {
          titulo: form.titulo,
          fase_id: form.fase_id && form.fase_id !== SEM_FASE ? form.fase_id : null,
          responsavel_nome: form.responsavel_nome || '',
          prazo: form.prazo || null,
          status: form.status || 'pendente',
          prioridade: form.prioridade || 'media',
          descricao: form.descricao || '',
        };
        if (form.id) await planApi.execucao.atualizarTarefa(proposta.id, form.id, payload);
        else await planApi.execucao.criarTarefa(proposta.id, payload);
      } else if (modo === 'projeto') {
        const payload = {
          name: form.name,
          responsible: form.responsible || '',
          start_date: form.start_date || null,
          deadline: form.deadline || null,
          status: form.status || 'pendente',
          priority: form.priority || 'media',
          description: montarDescricaoComFase(form.faseValor === SEM_FASE ? null : form.faseValor, form.descricao),
        };
        if (form.id) await planApi.execucao.atualizarTarefa(proposta.id, form.id, payload);
        else await planApi.execucao.criarTarefa(proposta.id, payload);
      } else {
        const payload = {
          event_phase_id: form.event_phase_id,
          titulo: form.titulo,
          area: form.area,
          prazo: form.prazo || null,
          responsavel_nome: form.responsavel_nome || '',
          status: form.status || 'pendente',
          prioridade: form.prioridade || 'baixa',
          descricao: form.descricao || '',
        };
        if (form.id) await planApi.execucao.atualizarTarefa(proposta.id, form.id, payload);
        else await planApi.execucao.criarTarefa(proposta.id, payload);
      }
      setModalTarefa(null);
      toast.success(form.id ? 'Tarefa atualizada' : 'Tarefa criada');
      await carregar();
    } catch (e) {
      toast.error(e.message || 'Não foi possível salvar a tarefa');
    } finally { setSalvandoTarefa(false); }
  }, [modo, proposta.id, carregar]);



  const [novaFase, setNovaFase] = useState('');
  const [nomeEdicao, setNomeEdicao] = useState('');
  const [confirmandoExcluirFase, setConfirmandoExcluirFase] = useState(false);
  const [salvandoFase, setSalvandoFase] = useState(false);
  useEffect(() => { setNomeEdicao(nomeDaFaseSelecionada || ''); setConfirmandoExcluirFase(false); }, [nomeDaFaseSelecionada]);
  const acaoFase = useCallback(async (fn, sucesso) => {
    setSalvandoFase(true);
    try { await fn(); toast.success(sucesso); await carregar(); return true; }
    catch (e) { toast.error(e.message || 'Não foi possível salvar a fase'); return false; }
    finally { setSalvandoFase(false); }
  }, [carregar]);
  const criarFase = async () => {
    if (!novaFase.trim()) return;
    if (await acaoFase(() => planApi.execucao.criarFase(proposta.id, novaFase.trim()), 'Fase criada')) setNovaFase('');
  };
  const renomearFase = () => nomeEdicao.trim() && acaoFase(() => planApi.execucao.renomearFase(proposta.id, faseSelecionada, nomeEdicao.trim()), 'Fase renomeada');
  const excluirFase = async () => {
    if (await acaoFase(() => planApi.execucao.excluirFase(proposta.id, faseSelecionada), 'Fase excluída')) setFaseSelecionada(null);
  };

  const excluirTarefa = useCallback(async (taskId) => {
    setSalvandoTarefa(true);
    try {
      await planApi.execucao.excluirTarefa(proposta.id, taskId);
      setModalTarefa(null);
      toast.success('Tarefa excluída');
      await carregar();
    } catch (e) {
      toast.error(e.message || 'Não foi possível excluir a tarefa');
    } finally { setSalvandoTarefa(false); }
  }, [proposta.id, carregar]);


  const implantacaoConcluida = modo === 'rotina' && cards.length > 0 && cards.every((c) => c.status === 'concluida');
  const colocarEmOperacao = async () => {
    setColocando(true);
    try {
      await planApi.execucao.colocarEmOperacao(proposta.id);
      toast.success('Rotina em operação — monte o checklist no Acompanhamento de Rotinas');
      await carregar();
    } catch (e) {
      toast.error(e.message || 'Não foi possível colocar a rotina em operação');
    } finally { setColocando(false); }
  };

  const arrastoK = useArrastoKanban({ onMover: moverCard, habilitado: Boolean(modo) && podeGerir });

  const colunas = useMemo(() => {
    const base = nomeDaFaseSelecionada ? cards.filter((c) => c.fase === nomeDaFaseSelecionada) : cards;
    return COLUNAS.map((col) => ({ ...col, itens: base.filter((c) => c.status === col.key) }));
  }, [cards, nomeDaFaseSelecionada]);


  if (!modo) {
    const tipoAlvo = proposta.natureza;
    const rotuloTipo = tipoAlvo === 'projeto' ? 'Projeto' : 'Evento';
    const podeMaterializar = proposta.no_calendario && podeGerir;

    const materializar = async () => {
      setMaterializando(true);
      try {
        await planApi.execucao.materializar(proposta.id, tipoAlvo);
        toast.success(`${rotuloTipo} vinculado criado`);
        onMaterializado?.();
      } catch (e) {
        toast.error(e.message || `Não foi possível criar o ${rotuloTipo.toLowerCase()} vinculado`);
      } finally { setMaterializando(false); }
    };

    return (
      <div style={{ ...cardStyle, padding: 32, textAlign: 'center', display: 'grid', gap: 12, justifyItems: 'center' }}>
        <Lock size={28} color={C.t3} />
        <p style={{ margin: 0, fontSize: 14, color: C.t2, maxWidth: 420 }}>
          Esta proposta ainda não tem {rotuloTipo.toLowerCase()} vinculado. A criação só fica disponível depois
          que a proposta entra no calendário.
        </p>
        <button
          style={btn(podeMaterializar ? 'primary' : 'ghost')}
          disabled={!podeMaterializar || materializando}
          title={podeMaterializar ? undefined : (podeGerir ? 'A proposta ainda não entrou no calendário (só propostas aprovadas, com ou sem ressalvas)' : 'Só o líder da proposta, o líder da área, o PMO ou o Pastor criam o vínculo')}
          onClick={materializar}
        >
          {materializando ? 'Criando…' : `Criar ${rotuloTipo} vinculado`}
        </button>
        {!proposta.no_calendario && (
          <p style={{ ...hint, maxWidth: 420 }}>
            Aguardando calendário — a proposta precisa estar aprovada (com ou sem ressalvas) pelo Pastor
            presidente.
          </p>
        )}
        {proposta.no_calendario && !podeGerir && (
          <p style={{ ...hint, maxWidth: 420 }}>
            O vínculo é criado pelo líder da proposta, pelo líder da área ou pelo PMO.
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {carregando ? (
        <p style={{ fontSize: 13, color: C.t3 }}>Carregando fases…</p>
      ) : (
        <>
          {fasesStepper.length > 0 ? (
            <div style={cardStyle}>
              <FaseStepper fases={fasesStepper} selecionada={faseSelecionada} onSelecionar={setFaseSelecionada} />
              {faseSelecionada && (
                <div style={{ textAlign: 'center', paddingBottom: 8 }}>
                  <button style={btn('ghost')} onClick={() => setFaseSelecionada(null)}>
                    Mostrar todas as fases
                  </button>
                </div>
              )}
              {modo === 'rotina' && podeGerir && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 12px 12px', alignItems: 'center' }}>
                  {faseSelecionada ? (
                    <>
                      <div style={{ flex: '1 1 200px' }}>
                        <Input value={nomeEdicao} onChange={(e) => setNomeEdicao(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') renomearFase(); }} />
                      </div>
                      <button style={btn('ghost')} onClick={renomearFase} disabled={salvandoFase || !nomeEdicao.trim() || nomeEdicao.trim() === nomeDaFaseSelecionada}>Renomear</button>
                      {confirmandoExcluirFase ? (
                        <button style={btn('danger')} onClick={excluirFase} disabled={salvandoFase}>Confirmar (tarefas ficam sem fase)</button>
                      ) : (
                        <button style={{ ...btn('ghost'), color: C.red }} onClick={() => setConfirmandoExcluirFase(true)}>Excluir fase</button>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ flex: '1 1 200px' }}>
                        <Input placeholder="Nova fase" value={novaFase} onChange={(e) => setNovaFase(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') criarFase(); }} />
                      </div>
                      <button style={btn('ghost')} onClick={criarFase} disabled={salvandoFase || !novaFase.trim()}><Plus size={13} /> Fase</button>
                      <span style={{ ...hint, margin: 0 }}>Clique numa fase pra renomear ou excluir.</span>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 16 }}>
              <p style={{ ...hint, margin: '0 0 8px' }}>
                {modo === 'rotina'
                  ? 'Esta rotina ainda não tem fases de implantação. As fases são livres: comece pelas sugeridas (dá pra renomear e apagar) ou crie as suas.'
                  : modo === 'projeto'
                    ? 'Este projeto ainda não tem as fases iniciadas.'
                    : 'Este evento ainda não tem o ciclo ativado (fases e tarefas dos modelos).'}
              </p>
              {podeGerir ? (
                <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
                  <button style={btn('primary')} onClick={iniciarFasesPadrao} disabled={iniciandoFases}>
                    {iniciandoFases ? 'Iniciando…' : (modo === 'rotina' ? 'Começar com Preparação · Implantação · Acompanhamento' : modo === 'projeto' ? 'Iniciar Fases (7 fases)' : 'Ativar ciclo do evento')}
                  </button>
                  {modo === 'rotina' && (
                    <div style={{ display: 'flex', gap: 6, width: '100%', maxWidth: 360 }}>
                      <Input placeholder="…ou nome da primeira fase" value={novaFase} onChange={(e) => setNovaFase(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') criarFase(); }} />
                      <button style={btn('ghost')} onClick={criarFase} disabled={salvandoFase || !novaFase.trim()}>Criar</button>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ ...hint, margin: 0 }}>O líder da proposta, o líder da área ou o PMO iniciam as fases.</p>
              )}
            </div>
          )}
        {modo === 'rotina' && fasesStepper.length > 0 && (
          <div style={{ ...cardStyle, padding: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {operacional ? (
              <>
                <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>Em operação</span>
                <a href="/rotinas" style={{ fontSize: 13, color: C.primary, fontWeight: 600 }}>Ver no Acompanhamento de Rotinas →</a>
              </>
            ) : implantacaoConcluida && podeGerir ? (
              <>
                <span style={{ fontSize: 13, color: C.text }}>Implantação concluída.</span>
                <button style={btn('primary')} disabled={colocando} onClick={colocarEmOperacao}>
                  {colocando ? 'Colocando…' : 'Colocar em operação'}
                </button>
              </>
            ) : (
              <span style={{ ...hint, margin: 0 }}>Quando todas as tarefas da implantação estiverem concluídas, a rotina pode entrar em operação (vira checklist das equipes no Acompanhamento de Rotinas).</span>
            )}
          </div>
        )}
        {fasesStepper.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ ...hint, margin: 0 }}>{podeGerir ? 'Clique num card pra editar · arraste pra mudar o status.' : 'Somente leitura — quem gerencia é o líder da proposta, o líder da área ou o PMO.'}</p>
            {podeGerir && (
              <button style={{ ...btn('primary'), padding: '5px 11px', fontSize: 12 }} onClick={abrirNovaTarefa}>
                <Plus size={13} /> Tarefa
              </button>
            )}
          </div>
        )}
        <div
          ref={arrastoK.containerRef}
          className={`flex gap-3 overflow-x-auto pb-2 ${arrastoK.arrastando ? 'select-none' : ''}`}
        >
          {colunas.map((col) => (
            <div
              key={col.key}
              data-coluna={col.key}
              style={{
                flex: '0 0 240px', width: 240, borderRadius: 12,
                background: 'var(--cbrio-bg)', border: arrastoK.colunaSobre === col.key ? `2px solid ${C.primary}` : '1px solid var(--hairline)',
                display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 380px)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.cor }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{col.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: C.t3, background: 'var(--cbrio-card)', borderRadius: 999, padding: '1px 7px' }}>{col.itens.length}</span>
              </div>
              <div style={{ overflowY: 'auto', padding: '0 8px 8px', display: 'grid', gap: 6, minHeight: 30 }}>
                {col.itens.length === 0 && (
                  <p style={{ fontSize: 11.5, color: C.t3, textAlign: 'center', padding: '10px 0', margin: 0 }}>—</p>
                )}
                {col.itens.map((c) => (
                  <div
                    key={c.id}
                    onPointerDown={podeGerir ? (e) => arrastoK.aoPressionar(e, c) : undefined}
                    style={{
                      background: 'var(--cbrio-card)', border: '1px solid var(--hairline)', borderRadius: 8,
                      padding: '8px 10px', fontSize: 12.5, color: C.text, touchAction: podeGerir ? 'none' : 'auto', cursor: podeGerir ? 'grab' : 'default',
                      opacity: arrastoK.cardArrastado === c.id ? 0.4 : 1,
                    }}
                  >
                    <div>{c.titulo}</div>
                    {c.fase && (
                      <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10.5, fontWeight: 600, color: C.primary, background: C.primaryBg, borderRadius: 999, padding: '1px 7px' }}>
                        {c.fase}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        </>
      )}
      {arrastoK.arrastando && (
        <div
          ref={arrastoK.fantasmaRef}
          className="fixed top-0 left-0 z-[1300] pointer-events-none rounded-lg border shadow-lg"
          style={{
            transform: `translate(${arrastoK.arrasto.x + 8}px, ${arrastoK.arrasto.y + 8}px)`,
            background: 'var(--cbrio-card)', borderColor: C.primary, padding: '6px 10px', fontSize: 12, fontWeight: 600, color: C.text,
          }}
        >
          Movendo…
        </div>
      )}
      <TarefaModal
        open={Boolean(modalTarefa)}
        data={modalTarefa}
        vinculoTipo={modo}
        fasesStepper={fasesStepper}
        salvando={salvandoTarefa}
        onClose={() => setModalTarefa(null)}
        onSave={salvarTarefa}
        onDelete={excluirTarefa}
      />
    </div>
  );
}






function TarefaModal({ open, data, vinculoTipo, fasesStepper, salvando, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({});
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false);
  const ehRotina = vinculoTipo === 'rotina';


  const ehEvento = vinculoTipo === 'evento' || ehRotina;
  const nomesFases = useMemo(() => fasesStepper.map((f) => f.nome), [fasesStepper]);

  useEffect(() => {
    if (!data) return;
    setConfirmandoExcluir(false);
    if (ehEvento) {
      setForm({
        id: data.id, titulo: data.titulo || '', responsavel_nome: data.responsavel_nome || '',
        prazo: normDate(data.prazo), status: data.status || 'pendente', prioridade: data.prioridade || 'baixa',
        area: data.area || '', event_phase_id: data.event_phase_id || '', descricao: data.descricao || '',
        ...(ehRotina ? { fase_id: data.fase_id || SEM_FASE, prioridade: data.prioridade || 'media' } : {}),
      });
    } else {
      const { fase, resto } = extrairFaseEDescricao(data.description, nomesFases);
      setForm({
        id: data.id, name: data.name || '', responsible: data.responsible || '',
        start_date: normDate(data.start_date), deadline: normDate(data.deadline),
        status: data.status || 'pendente', priority: data.priority || 'media',
        faseValor: data.faseValor || fase || SEM_FASE, descricao: resto,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ehEvento, ehRotina]);

  if (!open) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const editando = Boolean(form.id);

  const handleSalvar = () => {
    if (ehRotina) {
      if (!form.titulo?.trim()) { toast.error('Título é obrigatório'); return; }
    } else if (ehEvento) {
      if (!form.titulo?.trim()) { toast.error('Título é obrigatório'); return; }
      if (!form.event_phase_id) { toast.error('Escolha a fase'); return; }
      if (!form.area) { toast.error('Escolha a área'); return; }
    } else if (!form.name?.trim()) { toast.error('Nome é obrigatório'); return; }
    onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="p-6 pb-3">
          <DialogTitle>{editando ? 'Editar Tarefa' : 'Nova Tarefa'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 px-6 space-y-3">
          <div className="space-y-1">
            <Label>{ehEvento ? 'Título *' : 'Nome *'}</Label>
            {ehEvento ? (
              <Input value={form.titulo || ''} onChange={(e) => set('titulo', e.target.value)} />
            ) : (
              <Input value={form.name || ''} onChange={(e) => set('name', e.target.value)} />
            )}
          </div>

          <div className="space-y-1">
            <Label>Fase{ehEvento && !ehRotina ? ' *' : ''}</Label>
            <Select
              value={ehRotina ? (form.fase_id || SEM_FASE) : ehEvento ? (form.event_phase_id || '') : (form.faseValor || SEM_FASE)}
              onValueChange={(v) => set(ehRotina ? 'fase_id' : ehEvento ? 'event_phase_id' : 'faseValor', v)}
            >
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                {(!ehEvento || ehRotina) && <SelectItem value={SEM_FASE}>Sem fase</SelectItem>}
                {fasesStepper.map((f) => (
                  <SelectItem key={f.id} value={ehEvento ? f.id : f.nome}>{f.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Responsável</Label>
              <Input
                value={(ehEvento ? form.responsavel_nome : form.responsible) || ''}
                onChange={(e) => set(ehEvento ? 'responsavel_nome' : 'responsible', e.target.value)}
              />
            </div>
            {ehEvento && !ehRotina && (
              <div className="space-y-1">
                <Label>Área *</Label>
                <Select value={form.area || ''} onValueChange={(v) => set('area', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>
                    {AREA_EVENTO_OPCOES.map((a) => <SelectItem key={a.valor} value={a.valor}>{a.rotulo}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!ehEvento && (
              <div className="space-y-1">
                <Label>Início</Label>
                <DatePicker value={form.start_date || ''} onChange={(v) => set('start_date', v)} />
              </div>
            )}
            <div className="space-y-1">
              <Label>Prazo</Label>
              <DatePicker
                value={(ehEvento ? form.prazo : form.deadline) || ''}
                onChange={(v) => set(ehEvento ? 'prazo' : 'deadline', v)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status || 'pendente'} onValueChange={(v) => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLUNAS.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Prioridade</Label>
              <Select
                value={(ehEvento ? form.prioridade : form.priority) || (ehEvento && !ehRotina ? 'baixa' : 'media')}
                onValueChange={(v) => set(ehEvento ? 'prioridade' : 'priority', v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(ehEvento && !ehRotina ? PRIORIDADE_EVENTO : PRIORIDADE_PROJETO).map((p) => (
                    <SelectItem key={p.valor} value={p.valor}>{p.rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1 pb-4">
            <Label>Descrição</Label>
            <Textarea value={form.descricao || ''} onChange={(e) => set('descricao', e.target.value)} />
          </div>
        </div>

        <DialogFooter className="p-6 pt-3 border-t">
          {editando && (
            confirmandoExcluir ? (
              <button
                type="button"
                style={{ ...btn('danger'), marginRight: 'auto' }}
                disabled={salvando}
                onClick={() => onDelete(form.id)}
              >
                Confirmar exclusão
              </button>
            ) : (
              <button
                type="button"
                style={{ ...btn('ghost'), marginRight: 'auto', color: C.red }}
                onClick={() => setConfirmandoExcluir(true)}
              >
                Excluir
              </button>
            )
          )}
          <button type="button" style={btn('ghost')} onClick={onClose}>Cancelar</button>
          <button type="button" style={btn('primary')} disabled={salvando} onClick={handleSalvar}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

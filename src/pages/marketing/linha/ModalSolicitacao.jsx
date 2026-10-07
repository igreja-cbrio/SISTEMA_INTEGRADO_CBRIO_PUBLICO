import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Textarea } from '../../../components/ui/textarea';
import { marketingLinha } from '../../../api';
import { ddmm, ddmmaaaa, nomeMembro } from './layout';
import ListaSubtarefas from './ListaSubtarefas';










const COR_ETAPA = {
  aguardando_aprovacao: 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200',
  aguardando_alocacao: 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200',
  sem_tarefa: 'bg-amber-500/15 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200',
  em_producao: 'bg-primary/10 text-primary',
  em_revisao: 'bg-primary/10 text-primary',
  entregue: 'bg-primary/10 text-primary',
  concluida: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  recusada: 'bg-muted text-muted-foreground',
};

const ESTADO_TAREFA = {
  backlog: 'Na fila', fila: 'Na fila', pesquisa: 'Em pesquisa', producao: 'Em produção', em_producao: 'Em produção',
  revisao: 'Em revisão', aguardando_solicitante: 'Com quem pediu', concluido: 'Concluída',
};

function proximoPasso(d) {
  const quem = d.solicitacao.solicitante || 'Quem pediu';
  const abertas = d.tarefas.filter(t => t.estado !== 'concluido').length;
  switch (d.etapa) {
    case 'aguardando_aprovacao': return 'Espera o diretor da área de quem pediu aprovar. Depois disso ela chega aqui para alocar.';
    case 'aguardando_alocacao': return 'Defina quem faz, a prioridade e o prazo de cada parte — ou recuse, dizendo o motivo.';
    case 'sem_tarefa': return d.campanha
      ? 'Foi triada, mas a tarefa não existe mais. Aloque de novo para voltar à produção.'
      : 'Esta solicitação não tem registro de campanha: não dá para alocar por aqui.';
    case 'em_producao': return 'A equipe está produzindo. Ao marcar a última subtarefa, a tarefa conclui sozinha e quem pediu é avisado.';
    case 'em_revisao': return `${quem} pediu ajustes: o motivo está na tarefa.`;
    case 'entregue': return `${quem} foi avisado e pode aprovar a entrega em Solicitações. Se não responder, você pode encerrar em nome dele.`;
    case 'concluida': return abertas
      ? 'A solicitação já foi concluída, mas a tarefa ficou aberta aqui (aparece no quadro como pendente). Feche-a.'
      : 'Concluída.';
    case 'recusada': return 'Recusada ou cancelada. Nada mais a fazer aqui.';
    default: return null;
  }
}


function textoConfirmacao(acao, d) {
  const quem = d.solicitacao.solicitante || 'quem pediu';
  const abertas = d.subtarefas_abertas || 0;
  switch (acao) {
    case 'entregar': return `Conclui a tarefa e avisa ${quem} que foi entregue.${abertas ? ` ${abertas} ${abertas === 1 ? 'subtarefa aberta fica' : 'subtarefas abertas ficam'} como está.` : ''}`;
    case 'encerrar': return `Encerra a solicitação em nome de ${quem}: ela vai para Concluída e ${quem} recebe o pedido de avaliação.`;
    case 'reabrir': return 'A tarefa volta para produção. Ninguém é avisado.';
    case 'fechar_tarefa': return `Fecha a tarefa sem avisar ninguém. A entrega fica registrada na data em que a solicitação foi concluída${d.solicitacao.concluido_em ? ` (${ddmmaaaa(String(d.solicitacao.concluido_em).slice(0, 10))})` : ''}.`;
    case 'recusar': return `${quem} recebe o motivo e a solicitação sai da fila do Marketing.`;
    default: return '';
  }
}

const ROTULO_ACAO = {
  alocar: 'Alocar', recusar: 'Recusar', entregar: 'Concluir e entregar', encerrar: 'Encerrar solicitação',
  reabrir: 'Reabrir tarefa', fechar_tarefa: 'Fechar a tarefa',
};
const ACAO_SECUNDARIA = new Set(['recusar', 'reabrir']);

function Fato({ rotulo, children }) {
  return (
    <span className="text-xs text-muted-foreground">
      <b className="mr-1 text-[10px] uppercase tracking-wider font-semibold">{rotulo}</b>{children}
    </span>
  );
}

const dataCurta = (iso) => (iso ? ddmmaaaa(String(iso).slice(0, 10)) : '');

export default function ModalSolicitacao({ solicitacaoId, dados, onClose, onChanged, onAlocar, onEditar }) {
  const [d, setD] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [confirmando, setConfirmando] = useState(null);
  const [texto, setTexto] = useState('');
  const [agindo, setAgindo] = useState(false);
  const [erroAcao, setErroAcao] = useState(null);
  const escRef = useRef(null);
  const seq = useRef(0);

  const recarregar = useCallback(async (silencioso = false) => {
    const minha = ++seq.current;
    if (!silencioso) setCarregando(true);
    try {
      const r = await marketingLinha.solicitacao(solicitacaoId);
      if (minha !== seq.current) return;
      setD(r);
      setErro(null);
    } catch (e) {
      if (minha !== seq.current) return;

      if (silencioso) toast.error(`Não foi possível atualizar: ${e?.message || 'erro'}`);
      else setErro(e?.message || 'Erro ao carregar');
    } finally {
      if (!silencioso && minha === seq.current) setCarregando(false);
    }
  }, [solicitacaoId]);

  useEffect(() => { recarregar(); }, [recarregar]);


  const aposMarcar = async () => { await Promise.all([recarregar(true), onChanged?.()]); };

  function pedirAcao(acao) {
    setErroAcao(null);
    if (acao === 'alocar') {
      const c = d.campanha;
      onAlocar?.({
        id: c.id, campanha_id: c.id, solicitacao_id: d.solicitacao.id,
        titulo: d.solicitacao.titulo || c.titulo, descricao: d.solicitacao.descricao || c.dor_descricao || null,
        publico_alvo: c.publico_alvo || null, data_necessaria: d.solicitacao.data_necessaria || null,
        sugerido_membro_id: c.sugerido_membro_id || null, solicitante: d.solicitacao.solicitante || null,
      });
      return;
    }
    setTexto('');
    setConfirmando(acao);
  }

  async function confirmar() {
    if (!confirmando || agindo) return;
    setAgindo(true);
    setErroAcao(null);
    try {
      const corpo = { acao: confirmando };
      if (confirmando === 'recusar') corpo.motivo = texto.trim();
      if (confirmando === 'encerrar' && texto.trim()) corpo.observacao = texto.trim();
      await marketingLinha.acaoSolicitacao(solicitacaoId, corpo);
      toast.success({
        entregar: 'Entregue · quem pediu foi avisado', encerrar: 'Solicitação encerrada', reabrir: 'Tarefa reaberta',
        fechar_tarefa: 'Tarefa fechada', recusar: 'Solicitação recusada',
      }[confirmando] || 'Feito');
      setConfirmando(null);
      setTexto('');
      await Promise.all([recarregar(true), onChanged?.()]);
    } catch (e) {

      setErroAcao(e?.message || 'Não foi possível concluir a ação.');
      if (e?.status === 409) recarregar(true);
    } finally {
      setAgindo(false);
    }
  }

  const membros = dados.membros || [];
  const acoes = d?.acoes || [];
  const motivoCurto = confirmando === 'recusar' && texto.trim().length < 10;

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !agindo) onClose(); }}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] flex flex-col"
        onEscapeKeyDown={(e) => {
          if (escRef.current?.()) { e.preventDefault(); return; }
          if (confirmando) { e.preventDefault(); setConfirmando(null); }
        }}
      >
        <DialogHeader>
          <DialogDescription className="text-xs">Requisições · Externa · Solicitação</DialogDescription>
          <DialogTitle className="text-lg">{d?.solicitacao?.titulo || (carregando ? 'Carregando…' : 'Solicitação')}</DialogTitle>
          {d && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COR_ETAPA[d.etapa] || 'bg-muted text-muted-foreground'}`}>
                {d.etapa_rotulo}
              </span>
              {d.solicitacao.solicitante && (
                <Fato rotulo="Pedido por">{d.solicitacao.solicitante}{d.solicitacao.area ? ` · ${d.solicitacao.area}` : ''}</Fato>
              )}
              {d.solicitacao.data_necessaria && <Fato rotulo="Para">{ddmmaaaa(d.solicitacao.data_necessaria)}</Fato>}
              {d.campanha?.prazo_entrega && <Fato rotulo="Entrega final">{ddmmaaaa(d.campanha.prazo_entrega)}</Fato>}
              {d.solicitacao.eh_urgente && <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-semibold text-destructive">Urgente</span>}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1">
          {carregando && !d && (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          )}
          {!carregando && erro && !d && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p>Não foi possível carregar a solicitação: {erro}</p>
                <Button size="sm" variant="outline" onClick={() => recarregar()}><RefreshCw className="mr-1 h-4 w-4" /> Tentar de novo</Button>
              </div>
            </div>
          )}

          {d && (
            <>
              {proximoPasso(d) && (
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">{proximoPasso(d)}</p>
              )}

              {(d.solicitacao.descricao || d.campanha?.publico_alvo || d.solicitacao.justificativa_urgencia) && (
                <section className="space-y-1">
                  <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">O que foi pedido</h3>
                  <div className="border-l-2 border-border pl-3 text-sm space-y-1">
                    {d.solicitacao.descricao && <p className="whitespace-pre-wrap">{d.solicitacao.descricao}</p>}
                    {d.campanha?.publico_alvo && <p className="text-xs text-muted-foreground">Público: {d.campanha.publico_alvo}</p>}
                    {d.solicitacao.justificativa_urgencia && (
                      <p className="text-xs text-muted-foreground">Por que é urgente: {d.solicitacao.justificativa_urgencia}</p>
                    )}
                  </div>
                </section>
              )}

              {d.linha_do_tempo?.length > 0 && (
                <section className="space-y-1">
                  <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">História</h3>
                  <ol className="flex flex-wrap gap-x-4 gap-y-1">
                    {d.linha_do_tempo.map((e, i) => (
                      <li key={`${e.rotulo}-${i}`} className="flex items-center gap-1.5 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                        <span className="font-medium">{e.rotulo}</span>
                        <span className="tabular-nums text-muted-foreground">{dataCurta(e.quando)}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              <section className="space-y-3">
                <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  {d.tarefas.length === 1 ? 'Tarefa' : 'Tarefas'}
                </h3>
                {d.tarefas.length === 0 && (
                  <p className="text-sm text-muted-foreground">Ainda não virou tarefa da equipe.</p>
                )}
                {d.tarefas.map(t => (
                  <div key={t.id} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{t.titulo || 'Sem título'}</p>
                        <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                          <span>{ESTADO_TAREFA[t.estado] || t.estado}</span>
                          <span>{t.atribuido_a ? nomeMembro(membros, t.atribuido_a) : 'Sem responsável'}</span>
                          {t.prazo && <span>prazo {ddmm(t.prazo)}</span>}
                          {t.entregue_em && <span>entregue {dataCurta(t.entregue_em)}</span>}
                        </div>
                      </div>
                      {d.lider && t.estado !== 'concluido' && onEditar && (
                        <Button size="sm" variant="outline" className="h-7" onClick={() => onEditar(t)}>Editar</Button>
                      )}
                    </div>
                    {t.motivo_revisao && (
                      <p className="rounded-md bg-primary/10 px-2 py-1.5 text-xs">
                        <b className="mr-1">Ajuste pedido:</b>{t.motivo_revisao}
                      </p>
                    )}
                    <ListaSubtarefas tarefa={t} dados={dados} onChanged={aposMarcar} escRef={escRef} />
                  </div>
                ))}
              </section>

              {d.solicitacao.nps_nota != null && (
                <section className="space-y-1">
                  <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Avaliação de quem pediu</h3>
                  <p className="text-sm"><b className="tabular-nums">{d.solicitacao.nps_nota}</b> de 10{d.solicitacao.nps_comentario ? ` · "${d.solicitacao.nps_comentario}"` : ''}</p>
                </section>
              )}
            </>
          )}
        </div>

        {d && confirmando && (
          <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
            <p className="text-sm font-medium">{ROTULO_ACAO[confirmando]}</p>
            <p className="text-xs text-muted-foreground">{textoConfirmacao(confirmando, d)}</p>
            {(confirmando === 'recusar' || confirmando === 'encerrar') && (
              <Textarea
                rows={3}
                autoFocus
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={confirmando === 'recusar' ? 'Motivo da recusa (quem pediu vai ler)' : 'Observação para quem pediu (opcional)'}
              />
            )}
            {erroAcao && (
              <p className="flex items-start gap-1.5 text-xs text-destructive"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{erroAcao}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" disabled={agindo} onClick={() => { setConfirmando(null); setErroAcao(null); }}>Voltar</Button>
              <Button
                size="sm"
                variant={confirmando === 'recusar' ? 'destructive' : 'default'}
                disabled={agindo || motivoCurto}
                onClick={confirmar}
              >
                {agindo ? <Loader2 className="h-4 w-4 animate-spin" /> : `Confirmar · ${ROTULO_ACAO[confirmando]}`}
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          {d && !confirmando && acoes.map(({ acao, descricao }) => (
            <Button
              key={acao}
              variant={ACAO_SECUNDARIA.has(acao) ? 'outline' : 'default'}
              title={descricao}
              onClick={() => pedirAcao(acao)}
            >
              {ROTULO_ACAO[acao] || acao}
            </Button>
          ))}
          <Button variant="outline" disabled={agindo} onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

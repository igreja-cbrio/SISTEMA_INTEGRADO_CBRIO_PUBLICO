import { useState, useEffect, useCallback, useMemo } from 'react';
import { marketing as api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import MarketingPagina from './MarketingPagina';
import { Faixa, ddmm, ESTADO_ROTULO } from './dashboardPecas';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import {
  Loader2, CalendarDays, Check, ChevronRight, ChevronLeft, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';




















const MES_NOME = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function MarketingCalendario() {
  const { isAdmin, modulePerms } = useAuth();
  const isCoord = isAdmin || (modulePerms?.marketing?.escrita || 0) >= 5;

  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [mes, setMes] = useState('');
  const [faseAberta, setFaseAberta] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null);
    try {
      setDados(await api.dashboard.get(mes ? { mes } : undefined));
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar o calendário');
    } finally { setLoading(false); }
  }, [mes]);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <MarketingPagina subtitulo="Em que fase cada ciclo criativo está, semana a semana">

      {erro && <Faixa>{erro} <button onClick={carregar} className="underline font-medium">Tentar de novo</button></Faixa>}
      {(dados?.avisos || []).map((a, i) => <Faixa key={i}>{a}</Faixa>)}

      {loading && !dados ? (
        <div className="flex justify-center my-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : dados ? (
        <BoxCiclo
          ciclo={dados.ciclo}
          semanas={dados.semanas}
          mes={dados.mes}
          mesAnterior={dados.mes_anterior}
          mesSeguinte={dados.mes_seguinte}
          hoje={dados.hoje}
          onMes={setMes}
          onAbrirFase={setFaseAberta}
        />
      ) : null}

      <DialogFase
        celula={faseAberta}
        onClose={() => setFaseAberta(null)}
        equipe={dados?.equipe || []}
        podeEditar={isCoord}
        onMudou={carregar}
      />
    </MarketingPagina>
  );
}


function BoxCiclo({ ciclo, semanas, mes, mesAnterior, mesSeguinte, hoje, onMes, onAbrirFase }) {



  const porSemana = useMemo(() => {
    return (semanas || []).map(s => ({
      ...s,
      itens: (ciclo?.linhas || [])
        .map(l => ({ evento: l, celula: l.celulas.find(c => c.semana_idx === s.idx) }))
        .filter(x => x.celula && !x.celula.vazio),
    }));
  }, [semanas, ciclo?.linhas]);



  const rotuloMesAno = mes
    ? `${MES_NOME[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`
    : '—';
  const mesEhDeHoje = !!mes && !!hoje && mes === hoje.slice(0, 7);

  if (!ciclo) return null;

  return (
    <Card className="p-0 h-full flex flex-col overflow-hidden">
      {                                                                  }
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => mesAnterior && onMes(mesAnterior)} title="Mês anterior">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <p className="font-semibold text-sm flex items-center justify-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            {rotuloMesAno}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Fases do ciclo vigentes em cada semana · clique para ver o que o Marketing tem a entregar
          </p>
        </div>
        <div className="flex items-center gap-1">
          {
                                      }
          {!mesEhDeHoje && (
            <Button variant="ghost" size="sm" className="h-8 text-[11px]" onClick={() => onMes('')}>Hoje</Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => mesSeguinte && onMes(mesSeguinte)} title="Mês seguinte">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {

                                              }
      {!ciclo.erro && (ciclo.linhas || []).length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 border-b border-border">
          {ciclo.linhas.map(l => (
            <span key={l.id} className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: l.cor }} />
              <span className="truncate max-w-[160px]">{l.nome}</span>
            </span>
          ))}
        </div>
      )}

      {                                                              }
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {DIAS_SEMANA.map(d => (
          <div key={d} className="py-1.5 text-center text-[10px] font-bold uppercase text-muted-foreground">{d}</div>
        ))}
      </div>

      {ciclo.erro ? <div className="p-4"><Faixa>{ciclo.erro}</Faixa></div> : (
        <div className="flex-1 overflow-y-auto max-h-[calc(100vh-230px)]">
          {porSemana.map(s => (
            <div
              key={s.idx}
              className={`border-b border-border last:border-b-0 ${s.eh_semana_atual ? 'bg-primary/5' : ''}`}
            >
              {                        }
              <div className="grid grid-cols-7">
                {(s.dias || []).map(d => (
                  <div key={d.data} className="px-1.5 pt-1 pb-0.5 border-r border-border/50 last:border-r-0">
                    <span className={
                      d.eh_hoje
                        ? 'inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground'
                        : `text-[11px] tabular-nums ${d.no_mes ? 'text-foreground' : 'text-muted-foreground/40'}`
                    }>
                      {Number(d.data.slice(8, 10))}
                    </span>
                  </div>
                ))}
              </div>

              {

                                                                  }
              <div className="px-1.5 pb-1.5 space-y-1">
                {s.itens.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground/60 py-1">Nenhuma fase de ciclo nesta semana</p>
                ) : s.itens.map(({ evento, celula }) => (
                  <button
                    key={evento.id}
                    onClick={() => onAbrirFase({ ...celula, evento_nome: evento.nome, semana: s })}







                    style={{ borderLeftColor: evento.cor, backgroundColor: `${evento.cor}1A` }}
                    className="w-full text-left rounded-md border-l-[3px] px-2 py-1 flex items-center gap-2 transition-[filter] hover:brightness-105 dark:hover:brightness-125"
                    title={`${evento.nome} · Fase ${celula.numero_fase} — ${celula.nome_fase}${evento.cor_excedente ? ' · sem cor própria (paleta esgotada)' : ''}`}
                  >
                    <span className="text-[11px] font-medium truncate flex-1 min-w-0">{evento.nome}</span>
                    {                                                     }
                    <span className="text-[11px] text-muted-foreground shrink-0 truncate max-w-[45%]">
                      Fase {celula.numero_fase} · {celula.nome_fase}
                    </span>
                    {
                                                                            }
                    {celula.transicao && (
                      <span className="text-[10px] text-muted-foreground shrink-0 hidden md:inline" title={`Entra na fase ${celula.transicao.numero_fase} · ${celula.transicao.nome_fase} nesta semana`}>
                        → F{celula.transicao.numero_fase}
                      </span>
                    )}
                    {celula.mkt_pendentes > 0 ? (
                      <Badge className="h-4 px-1.5 text-[9px] bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0 tabular-nums">
                        {celula.mkt_pendentes} a entregar
                      </Badge>
                    ) : celula.mkt_total > 0 ? (
                      <Badge className="h-4 px-1.5 text-[9px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shrink-0">
                        entregue
                      </Badge>
                    ) : (
                      <span className="text-[9px] text-muted-foreground shrink-0 hidden lg:inline">sem tarefa</span>
                    )}
                    <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {
                                                    }
      {!ciclo.erro && (ciclo.fora_da_janela > 0 || ciclo.sem_data > 0 || ciclo.eventos_sem_cor_propria > 0) && (
        <p className="text-[10px] text-muted-foreground px-3 py-2 border-t border-border">
          {ciclo.fora_da_janela > 0 && `${ciclo.fora_da_janela} de ${ciclo.ciclos_ativos} ciclos ativos não têm fase neste mês. `}
          {ciclo.sem_data > 0 && `${ciclo.sem_data} fase(s) sem data prevista não puderam ser posicionadas. `}
          {

                                                      }
          {ciclo.eventos_sem_cor_propria > 0 &&
            `${ciclo.eventos_sem_cor_propria} evento(s) sem cor própria (a paleta tem ${ciclo.cores_disponiveis} cores distinguíveis) — identifique pelo nome.`}
        </p>
      )}
    </Card>
  );
}


function DialogFase({ celula, onClose, equipe = [], podeEditar = false, onMudou }) {
  const [det, setDet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(null);





  async function mudarCard(cardId, patch, ok) {
    setSalvando(cardId);
    try {
      await api.atualizarCard(cardId, patch);
      toast.success(ok);
      const d = await api.dashboard.fase(celula.fase_id);
      setDet(d);
      onMudou?.();
    } catch (e) {
      toast.error(e.message || 'Não foi possível salvar');
    } finally {
      setSalvando(null);
    }
  }

  useEffect(() => {
    if (!celula?.fase_id) { setDet(null); setErro(null); return; }
    let vivo = true;
    setLoading(true); setErro(null); setDet(null);
    api.dashboard.fase(celula.fase_id)
      .then(d => { if (vivo) setDet(d); })
      .catch(e => { if (vivo) setErro(e.message || 'Não foi possível carregar a fase'); })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [celula?.fase_id]);

  return (
    <Dialog open={!!celula} onOpenChange={o => !o && onClose()}>
      {
                                                                                    }
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base">
            {celula?.evento_nome}
            <span className="block text-xs font-normal text-muted-foreground mt-1">
              Fase {celula?.numero_fase} · {celula?.nome_fase}
              {celula?.semana && ` · semana de ${ddmm(celula.semana.ini)} a ${ddmm(celula.semana.fim)}`}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : erro ? (
            <Faixa>{erro}</Faixa>
          ) : det ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="tabular-nums">{ddmm(det.fase.de)} a {ddmm(det.fase.ate)}</span>
                {det.fase.area && <span>· área da fase: {det.fase.area}</span>}
                {det.evento?.link && (
                  <a href={det.evento.link} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 ml-auto">
                    Abrir no Eventos <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {det.vazio ? (



                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-sm font-medium">Não há atividade do Marketing programada para essa etapa.</p>
                  <p className="text-xs text-muted-foreground mt-1">{det.motivo_vazio}</p>
                  {det.entregas_padrao && (
                    <p className="text-xs text-muted-foreground mt-3">
                      <span className="font-medium text-foreground">O que essa fase normalmente entrega:</span> {det.entregas_padrao}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {det.pendentes} de {det.total} pendente{det.pendentes === 1 ? '' : 's'} nesta fase.
                  </p>
                  <div className="space-y-2">
                    {det.itens.map(it => (
                      <div key={it.tarefa_id} className={`rounded-lg border border-border p-3 ${it.feito ? 'opacity-60' : ''}`}>
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium flex items-center gap-1.5">
                              {it.feito && <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                              {it.titulo}
                            </p>
                            {it.descricao && <p className="text-xs text-muted-foreground mt-0.5">{it.descricao}</p>}
                            {it.entrega && <p className="text-xs text-muted-foreground mt-0.5"><span className="font-medium">Entrega:</span> {it.entrega}</p>}
                          </div>
                          {it.is_critical && <Badge className="text-[10px] bg-rose-500/15 text-rose-700 dark:text-rose-400 shrink-0">crítica</Badge>}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                          {it.card ? (
                            <>
                              {
                                                                          }
                              <span className="font-medium text-foreground">{ESTADO_ROTULO[it.card.estado] || it.card.estado}</span>
                              <span>{it.card.dono ? `Dono: ${it.card.dono}` : 'Sem dono'}</span>
                              {it.card.etiqueta && <span>{it.card.etiqueta}</span>}
                            </>
                          ) : (


                            <span className="text-amber-700 dark:text-amber-400">Sem tarefa nas Demandas do Marketing</span>
                          )}
                          {(it.prazo || it.card?.prazo) && <span className="tabular-nums">Prazo {ddmm(it.prazo || it.card.prazo)}</span>}
                          {it.responsavel_eventos && <span>Responsável no Eventos: {it.responsavel_eventos}</span>}
                        </div>

                        {




                                                 }
                        {podeEditar && it.card && (
                          <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-border/60">
                            <select
                              value={it.card.atribuido_a || ''}
                              disabled={salvando === it.card.id}
                              onChange={e => mudarCard(
                                it.card.id,
                                { atribuido_a: e.target.value || null },
                                e.target.value ? 'Dono definido · a pessoa foi avisada' : 'Dono removido',
                              )}
                              className="h-7 rounded border border-border bg-background px-1.5 text-[11px] max-w-[170px]"
                            >
                              <option value="">Sem dono</option>
                              {equipe.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                            </select>
                            <Button
                              size="sm"
                              variant={it.feito ? 'outline' : 'default'}
                              className="h-7 text-[11px]"
                              disabled={salvando === it.card.id}
                              onClick={() => mudarCard(
                                it.card.id,
                                { estado: it.feito ? 'producao' : 'concluido' },
                                it.feito ? 'Reaberta' : 'Concluída',
                              )}
                            >
                              {salvando === it.card.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : it.feito ? 'Reabrir' : 'Concluir'}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {det.entregas_padrao && (
                    <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
                      <span className="font-medium text-foreground">Padrão da fase:</span> {det.entregas_padrao}
                    </p>
                  )}
                </>
              )}
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useMemo, useState } from 'react';
import { X, ListPlus, Repeat, Pencil, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { FRENTES, ddmm, ddmmaaaa, nomeMembro, ehFrenteRotina, ROTULO_ORIGEM, quadroDaFrente, temSubblocos, rotuloFrente } from './layout';
import { tituloTarefa, subTarefa } from './CartaoTarefa';
import {
  SITUACOES, linhasDoPainel, separarPedidos, filtrarPorPessoa, filtrarPorSerie, filtrarPorSituacao,
  resumoPainel, agruparPorSituacao, agruparPorSerie, pessoasDoPainel, rotuloSemana,
  HORIZONTE_PROXIMAS, filtrarPorOrigem, contarOrigens,
} from './reguaPainelFrente';






const COR_SITUACAO = {
  atrasada: 'bg-red-500 dark:bg-[hsl(var(--lab-laranja,22_98%_49%))]',
  semana: 'bg-[#00B39D] dark:bg-[hsl(var(--lab-azul,243_98%_49%))]',
  proxima: 'bg-slate-300 dark:bg-neutral-600',
  sem_data: 'bg-amber-400',
  concluida: 'bg-emerald-500 dark:bg-emerald-400',
};
const NOME_SITUACAO = {
  atrasada: 'atrasada', semana: 'vence nesta semana', proxima: 'prevista', sem_data: 'sem data', concluida: 'concluída',
};



const CLS_ORIGEM = {
  externa: 'bg-sky-500/10 text-sky-800 dark:bg-[hsl(var(--lab-azul,243_98%_49%)/0.22)] dark:text-[hsl(var(--lab-azul-texto,243_100%_75%))]',
  interna: 'bg-muted text-muted-foreground',
};
const TITULO_ORIGEM = {
  externa: 'Veio de Solicitações: alguém de outra área está esperando a entrega',
  interna: 'Demanda que o líder pôs no quadro',
};



const STATUS_PEDIDO = {
  aguardando_aprovacao: { texto: 'Aguardando o diretor de quem pediu aprovar', cls: 'text-slate-600 dark:text-neutral-300' },
  aguardando_alocacao: { texto: 'Esperando você alocar', cls: 'text-amber-700 dark:text-amber-300' },
  sem_tarefa: { texto: 'Triado, mas a tarefa foi apagada · alocar de novo', cls: 'text-amber-700 dark:text-amber-300' },
};

function Numero({ n, rotulo, destaque }) {
  return (
    <div className="rounded-lg border border-border bg-white dark:bg-card px-1.5 py-2 text-center">
      <p className={`text-lg font-bold leading-none tabular-nums ${destaque || 'text-foreground'}`}>{n}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
    </div>
  );
}

function Linha({ l, dados, onAbrir, onEditar, podeEditar }) {
  const t = l.tarefa;
  const membros = dados.membros || [];
  const titulo = l.titulo || tituloTarefa(t, membros);
  const ehPedido = l.tipo === 'pedido';
  const ehRotina = l.tipo === 'rotina';
  const sub = ehRotina || l.serie ? null : subTarefa(t);
  let quem = null;
  if (ehPedido) quem = t.sugerido_membro_id ? `Sugestão: ${nomeMembro(membros, t.sugerido_membro_id)}` : 'Sem sugestão de responsável';
  else if (!ehRotina) quem = l.responsavel ? nomeMembro(membros, l.responsavel) : 'Sem responsável';
  const quando = t.prazo ? `prazo ${ddmm(t.prazo)}` : rotuloSemana(dados.semanas, l.semana, dados.ano);
  const { feitos, total } = l.progresso;
  const pct = total ? Math.round((feitos * 100) / total) : 0;
  const papel = t.papel === 'responsavel' ? 'Você é responsável' : t.papel === 'dono' ? 'Suas subtarefas' : null;
  const status = ehPedido ? STATUS_PEDIDO[t.pedido_status] : null;
  const abrir = () => onAbrir(t);
  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={abrir}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } }}
        className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-white dark:bg-card px-3 py-2.5 text-left outline-none transition-colors hover:border-[#00B39D]/60 dark:hover:border-[hsl(var(--lab-azul-texto,243_100%_75%)/0.6)] hover:bg-[#00B39D]/5 dark:hover:bg-[hsl(var(--lab-azul,243_98%_49%)/0.14)] focus-visible:ring-2 focus-visible:ring-[#00B39D]/40 dark:focus-visible:ring-[hsl(var(--lab-azul-texto,243_100%_75%)/0.55)]"
      >
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${COR_SITUACAO[l.situacao]}`} title={NOME_SITUACAO[l.situacao]} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium leading-snug text-foreground">{titulo}</p>
            {podeEditar && l.tipo === 'tarefa' && (
              <button
                type="button"
                className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:bg-slate-100 dark:hover:bg-muted hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); onEditar(t); }}
                aria-label={`Editar ${titulo}`}
                title="Editar responsável, prazos e subtarefas"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
          {status && <p className={`text-xs font-medium ${status.cls}`}>{status.texto}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {l.origem && (
              <span className={`rounded px-1.5 font-semibold uppercase tracking-wide ${CLS_ORIGEM[l.origem]}`} title={TITULO_ORIGEM[l.origem]}>
                {ROTULO_ORIGEM[l.origem]}
              </span>
            )}
            {quem && <span>{quem}</span>}
            <span>{quando}</span>
            {total > 0 && <span className="tabular-nums">{feitos}/{total} subtarefas</span>}
            {papel && <span className="rounded bg-[#00B39D]/10 dark:bg-[hsl(var(--lab-azul,243_98%_49%)/0.22)] px-1.5 font-medium text-[#007a6b] dark:text-[hsl(var(--lab-azul-texto,243_100%_75%))]">{papel}</span>}
          </div>
          {total > 0 && (
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
              <div className="h-full rounded-full bg-[#00B39D] dark:bg-[hsl(var(--lab-azul,243_98%_49%))]" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Secao({ titulo, n, children, extra }) {
  return (
    <section className="space-y-1.5">
      <h3 className="flex items-center justify-between px-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>{titulo} <span className="tabular-nums">({n})</span></span>
        {extra}
      </h3>
      {children}
    </section>
  );
}

export default function PainelFrente({
  dados, frente, serieId, somenteLeitura = false,
  onFechar, onTrocarSerie, onAbrirTarefa, onEditar, onNovaTarefa, onGerenciarRotina, onTrocarFrente,
}) {
  const [filtro, setFiltro] = useState('abertas');
  const [pessoa, setPessoa] = useState('');
  const [origem, setOrigem] = useState('');
  const [verTodasProximas, setVerTodasProximas] = useState(false);
  const [serieAberta, setSerieAberta] = useState({});

  const info = FRENTES.find(f => f.key === frente);
  const quadro = quadroDaFrente(frente);
  const fr = dados.frentes?.[frente];
  const sa = dados.semana_atual;
  const lider = !!dados.perfil?.lider;


  const acoesLider = lider && !somenteLeitura;

  const todas = useMemo(() => linhasDoPainel(dados, frente), [dados, frente]);
  const daSerie = useMemo(() => filtrarPorSerie(todas, serieId), [todas, serieId]);
  const pessoas = useMemo(() => pessoasDoPainel(daSerie, dados.membros), [daSerie, dados.membros]);
  const recorte = useMemo(() => filtrarPorPessoa(daSerie, pessoa), [daSerie, pessoa]);

  const origens = useMemo(() => contarOrigens(recorte), [recorte]);
  const porOrigem = useMemo(() => filtrarPorOrigem(recorte, origem), [recorte, origem]);
  const { pedidos, tarefas } = useMemo(() => separarPedidos(porOrigem), [porOrigem]);
  const resumo = useMemo(() => resumoPainel(tarefas, sa), [tarefas, sa]);
  const visiveis = useMemo(() => filtrarPorSituacao(tarefas, filtro), [tarefas, filtro]);


  const pedidosVisiveis = filtro === 'abertas' || filtro === 'todas' ? pedidos : [];

  const serieAtual = serieId ? (daSerie[0]?.serie || null) : null;
  const porSerie = frente === 'ins' && !serieId;
  const grupos = porSerie ? agruparPorSerie(visiveis, sa) : [];
  const secoes = porSerie ? [] : agruparPorSituacao(visiveis, { semanaAtual: sa });

  const chips = [
    { key: 'abertas', rotulo: 'Em aberto', n: resumo.abertas },
    ...SITUACOES.map(s => ({ key: s.key, rotulo: s.rotulo, n: resumo.por[s.key] })),
    { key: 'todas', rotulo: 'Todas', n: resumo.total },
  ];

  const indisponivel = !fr || fr.status === 'indisponivel';
  const nada = !visiveis.length && !pedidosVisiveis.length;
  const podeEditarTarefa = acoesLider && !ehFrenteRotina(frente);
  const ehRequisicoes = frente === 'sis';


  const ehProducao = frente === 'prd';
  const criaTarefa = ehRequisicoes || ehProducao;

  return (
    <aside
      className="absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-border bg-slate-50 dark:bg-background shadow-2xl sm:w-[440px]"
      aria-label={`Demandas de ${rotuloFrente(frente) || info?.nome || ''}`}
    >
      <div className="shrink-0 border-b border-border bg-white dark:bg-card px-4 pb-3 pt-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{temSubblocos(quadro) ? quadro.nome : 'Quadro'}</p>
            <h2 className="text-lg font-bold leading-tight text-foreground">{info?.nome || 'Frente'}</h2>
            <p className="text-xs text-muted-foreground">{info?.desc}</p>
          </div>
          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={onFechar} aria-label="Fechar o painel da frente" title="Fechar">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {
                                           }
        {temSubblocos(quadro) && onTrocarFrente && (
          <div className="mt-2 inline-flex rounded-md border border-border bg-slate-100 dark:bg-muted p-0.5" role="tablist" aria-label={`Blocos de ${quadro.nome}`}>
            {quadro.frentes.map(fk => {
              const ativo = fk === frente;
              return (
                <button
                  key={fk}
                  type="button"
                  role="tab"
                  aria-selected={ativo}
                  className={`h-7 rounded px-3 text-xs font-medium ${ativo ? 'bg-white text-foreground shadow-sm dark:bg-card' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => { if (!ativo) onTrocarFrente(fk); }}
                >
                  {FRENTES.find(x => x.key === fk)?.nome || fk}
                </button>
              );
            })}
          </div>
        )}

        {serieAtual && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-[#00B39D]/10 dark:bg-[hsl(var(--lab-azul,243_98%_49%)/0.22)] px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{serieAtual.nome}</p>
              <p className="text-xs text-muted-foreground">{serieAtual.data ? `Lançamento ${ddmmaaaa(serieAtual.data)}` : 'Sem data de lançamento'}</p>
            </div>
            <button type="button" className="shrink-0 text-xs font-medium text-[#007a6b] dark:text-[hsl(var(--lab-azul-texto,243_100%_75%))] hover:underline" onClick={() => onTrocarSerie(null)}>
              Ver todas as séries
            </button>
          </div>
        )}

        {!indisponivel && (
          <>
            <div className="mt-3 grid grid-cols-4 gap-1.5">
              <Numero n={resumo.por.atrasada} rotulo="Atrasadas" destaque={resumo.por.atrasada ? 'text-red-600 dark:text-[hsl(var(--lab-laranja,22_98%_49%))]' : undefined} />
              <Numero n={resumo.por.semana} rotulo="Esta semana" />
              <Numero n={resumo.por.proxima} rotulo="Próximas" />
              <Numero n={resumo.por.concluida} rotulo="Concluídas" destaque={resumo.por.concluida ? 'text-emerald-600 dark:text-emerald-400' : undefined} />
            </div>
            {


                                                           }
            {resumo.andamento.pct != null && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Até esta semana: {resumo.andamento.feitos} de {resumo.andamento.total} subtarefas feitas</span>
                  <span className="font-semibold tabular-nums text-foreground">{resumo.andamento.pct}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-muted">
                  <div className="h-full rounded-full bg-[#00B39D] dark:bg-[hsl(var(--lab-azul,243_98%_49%))]" style={{ width: `${resumo.andamento.pct}%` }} />
                </div>
              </div>
            )}
          </>
        )}

        {acoesLider && (criaTarefa || ehFrenteRotina(frente)) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {criaTarefa && (
              <Button size="sm" className="h-8" onClick={onNovaTarefa} title={ehProducao ? 'Entra em Redes · Produção' : 'Entra em Requisições como demanda interna'}>
                <ListPlus className="mr-1 h-4 w-4" /> Nova tarefa
              </Button>
            )}
            {ehFrenteRotina(frente) && (
              <Button size="sm" variant="outline" className="h-8" onClick={() => onGerenciarRotina(frente)}>
                <Repeat className="mr-1 h-4 w-4" /> Compromissos da rotina
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3">
        {somenteLeitura && (
          <p className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            Você está vendo como outra pessoa: só leitura. Para editar, volte para a sua visão.
          </p>
        )}

        {indisponivel ? (
          <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Esta frente não carregou agora. Os avisos da barra do topo dizem o motivo.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situação">
                {chips.map(c => (
                  <button
                    key={c.key}
                    type="button"
                    disabled={!c.n && filtro !== c.key}
                    onClick={() => setFiltro(c.key)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-40 ${filtro === c.key
                      ? 'border-[#00B39D] dark:border-[hsl(var(--lab-azul,243_98%_49%))] bg-[#00B39D] dark:bg-[hsl(var(--lab-azul,243_98%_49%))] text-white'
                      : 'border-border bg-white dark:bg-card text-muted-foreground hover:text-foreground'}`}
                  >
                    {c.rotulo} <span className="tabular-nums">{c.n}</span>
                  </button>
                ))}
              </div>
              {ehRequisicoes && (origens.externa > 0 || origens.interna > 0) && (
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar pela origem">
                  <span className="text-xs text-muted-foreground">Origem</span>
                  {[
                    { key: '', rotulo: 'Todas', n: origens.externa + origens.interna },
                    { key: 'externa', rotulo: 'Externas', n: origens.externa },
                    { key: 'interna', rotulo: 'Internas', n: origens.interna },
                  ].map(c => (
                    <button
                      key={c.key || 'todas'}
                      type="button"
                      disabled={!c.n && origem !== c.key}
                      onClick={() => setOrigem(c.key)}
                      title={c.key ? TITULO_ORIGEM[c.key] : 'Externas e internas'}
                      className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors disabled:opacity-40 ${origem === c.key
                        ? 'border-foreground/60 bg-foreground text-background'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
                    >
                      {c.rotulo} <span className="tabular-nums">{c.n}</span>
                    </button>
                  ))}
                </div>
              )}
              {lider && pessoas.length > 1 && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Pessoa</span>
                  <select
                    className="h-8 flex-1 rounded-md border border-input bg-white dark:bg-card px-2 text-sm text-foreground"
                    value={pessoa}
                    onChange={(e) => setPessoa(e.target.value)}
                  >
                    <option value="">Todas as pessoas</option>
                    {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </label>
              )}
              {!lider && (
                <p className="text-xs text-muted-foreground">
                  Aparece só o que está no seu nome ou sob sua responsabilidade. Toque numa demanda para marcar as subtarefas.
                </p>
              )}
            </div>

            {pedidosVisiveis.length > 0 && (
              <Secao titulo="Pedidos do formulário" n={pedidosVisiveis.length}>
                <ul className="space-y-1.5">
                  {[...pedidosVisiveis].sort((a, b) => (a.semana ?? 999) - (b.semana ?? 999)).map(l => (
                    <Linha key={l.key} l={l} dados={dados} onAbrir={onAbrirTarefa} onEditar={onEditar} podeEditar={false} />
                  ))}
                </ul>
              </Secao>
            )}

            {porSerie && grupos.map(g => {
              const auto = grupos.length === 1 || g.resumo.por.atrasada > 0 || g.resumo.por.semana > 0;
              const aberto = serieAberta[g.id] ?? auto;
              return (
                <section key={g.id} className="overflow-hidden rounded-xl border border-border bg-white dark:bg-card">
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-muted"
                    onClick={() => setSerieAberta(o => ({ ...o, [g.id]: !aberto }))}
                    aria-expanded={aberto}
                  >
                    {aberto ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{g.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.data ? `Lançamento ${ddmmaaaa(g.data)}` : 'Sem data de lançamento'}
                        {' · '}{g.linhas.length} {g.linhas.length === 1 ? 'demanda' : 'demandas'}
                        {g.resumo.por.atrasada > 0 && <span className="font-medium text-red-600 dark:text-[hsl(var(--lab-laranja,22_98%_49%))]"> · {g.resumo.por.atrasada} atrasadas</span>}
                      </p>
                    </div>
                    {g.resumo.andamento.pct != null && (
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground" title="Subtarefas feitas até esta semana">{g.resumo.andamento.pct}%</span>
                    )}
                  </button>
                  {aberto && (
                    <div className="space-y-2 border-t border-border bg-slate-50 dark:bg-background px-2 py-2">
                      <ul className="space-y-1.5">
                        {g.linhas.map(l => (
                          <Linha key={l.key} l={l} dados={dados} onAbrir={onAbrirTarefa} onEditar={onEditar} podeEditar={podeEditarTarefa} />
                        ))}
                      </ul>
                      <button type="button" className="px-1 text-xs font-medium text-[#007a6b] dark:text-[hsl(var(--lab-azul-texto,243_100%_75%))] hover:underline" onClick={() => onTrocarSerie(g.id)}>
                        Ver só esta série
                      </button>
                    </div>
                  )}
                </section>
              );
            })}

            {!porSerie && secoes.map(s => {
              const linhas = s.key === 'proxima' && verTodasProximas ? [...s.linhas, ...s.ocultas] : s.linhas;
              return (
                <Secao
                  key={s.key}
                  titulo={s.rotulo}
                  n={s.linhas.length + s.ocultas.length}
                  extra={s.ocultas.length > 0 && (
                    <button type="button" className="normal-case tracking-normal text-[#007a6b] dark:text-[hsl(var(--lab-azul-texto,243_100%_75%))] hover:underline" onClick={() => setVerTodasProximas(v => !v)}>
                      {verTodasProximas ? 'Mostrar só as mais perto' : `Mostrar mais ${s.ocultas.length}`}
                    </button>
                  )}
                >
                  <ul className="space-y-1.5">
                    {linhas.map(l => (
                      <Linha key={l.key} l={l} dados={dados} onAbrir={onAbrirTarefa} onEditar={onEditar} podeEditar={podeEditarTarefa} />
                    ))}
                  </ul>
                  {s.key === 'proxima' && s.ocultas.length > 0 && !verTodasProximas && (
                    <p className="px-0.5 text-[11px] text-muted-foreground">
                      Mostrando até {HORIZONTE_PROXIMAS} semanas à frente · {s.ocultas.length} mais adiante no ano.
                    </p>
                  )}
                </Secao>
              );
            })}

            {nada && (
              <p className="rounded-lg border border-dashed border-border bg-white dark:bg-card px-3 py-6 text-center text-sm text-muted-foreground">
                {filtro === 'abertas'
                  ? (pessoa ? 'Nada em aberto para esta pessoa nesta frente.' : 'Nada em aberto nesta frente.')
                  : 'Nenhuma demanda nesta situação.'}
              </p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

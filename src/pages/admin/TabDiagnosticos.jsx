






















import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { agents } from '../../api';
import { Button } from '../../components/ui/button';
import { montarPromptDiagnostico, montarPromptLote } from '../../lib/promptDiagnostico';

const C = {
  card: 'var(--cbrio-card)', bg: 'var(--cbrio-bg)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
};

const SEV = {
  critico: { c: C.red, bg: C.redBg, label: 'Crítico' },
  aviso: { c: C.amber, bg: C.amberBg, label: 'Aviso' },
  info: { c: C.blue, bg: C.blueBg, label: 'Informativo' },
};



const ESTADO = {
  aberto: { c: C.amber, bg: C.amberBg, label: 'Em aberto' },
  encerrado: { c: C.text3, bg: 'transparent', label: 'Encerrado' },
  sem_incidente: { c: C.text3, bg: 'transparent', label: 'Sem incidente aberto' },
};



const ANDAMENTO_UI = {
  resolvido: { c: C.green, bg: C.greenBg, label: 'Resolvido' },
  trabalhando: { c: C.blue, bg: C.blueBg, label: 'Sendo resolvido' },
  na_fila: { c: C.blue, bg: C.blueBg, label: 'Na fila do agente' },
  precisa_de_voce: { c: C.amber, bg: C.amberBg, label: 'Precisa da sua ação' },
  nao_iniciado: { c: C.text3, bg: 'transparent', label: 'Não despachado' },



  encerrado: { c: C.text3, bg: 'transparent', label: 'Encerrado' },
};

const FAIXA_UI = {
  auto: 'O agente corrige, abre o PR e mergeia quando o CI ficar verde.',
  pr: 'O agente corrige e abre o PR — o merge é seu.',
  humano: 'O agente não mexe neste sozinho.',
};

const fmt = (d) => d
  ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—';

function Pill({ cor, fundo, children, titulo }) {
  return (
    <span title={titulo} style={{
      fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
      background: fundo, color: cor, border: fundo === 'transparent' ? `1px solid ${C.border}` : 'none',
      whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function Lista({ titulo, itens, numerada }) {
  if (!itens?.length) return null;
  const Tag = numerada ? 'ol' : 'ul';
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: C.text3 }}>
        {titulo}
      </div>
      <Tag style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 13, color: C.text, lineHeight: 1.55 }}>
        {itens.map((x, i) => <li key={i} style={{ marginTop: i ? 4 : 0 }}>{x}</li>)}
      </Tag>
    </div>
  );
}















function BotaoCopiarPrompt({ texto, rotulo = 'Copiar prompt', titulo }) {
  const [estado, setEstado] = useState('idle');
  const [aberto, setAberto] = useState(false);

  const copiar = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('sem clipboard');
      await navigator.clipboard.writeText(texto);
      setEstado('copiado');


      setTimeout(() => setEstado('idle'), 2500);
    } catch {
      setEstado('manual');
      setAberto(true);
    }
  };

  return (
    <>
      <Button size="sm" variant="ghost" title={titulo} onClick={copiar}>
        {estado === 'copiado' ? '✓ Copiado' : rotulo}
      </Button>
      {aberto && (
        <div style={{ width: '100%', marginTop: 8 }}>
          <div style={{ fontSize: 12, color: C.amber, marginBottom: 4 }}>
            O navegador não deixou copiar automaticamente — selecione e copie daqui:
          </div>
          <textarea
            readOnly
            value={texto}
            onFocus={(e) => e.target.select()}
            ref={(el) => el && el.select()}
            style={{
              width: '100%', minHeight: 140, fontSize: 12, fontFamily: 'ui-monospace, monospace',
              padding: 8, borderRadius: 8, border: `1px solid ${C.border}`,
              background: C.bg, color: C.text, resize: 'vertical',
            }}
          />
          <Button size="sm" variant="ghost" style={{ paddingLeft: 0 }} onClick={() => setAberto(false)}>
            Fechar
          </Button>
        </div>
      )}
    </>
  );
}

function Card({ item, abertoInicial, onResolverUm, ocupado }) {
  const [aberto, setAberto] = useState(abertoInicial);
  const sev = SEV[item.severidade] || SEV.info;
  const est = ESTADO[item.estado] || ESTADO.sem_incidente;
  const and = ANDAMENTO_UI[item.andamento] || null;
  const faixa = item.autonomia?.faixa;


  const podeDespachar = !!onResolverUm && !item.tarefa && faixa && faixa !== 'humano';
  const podeTentarDeNovo = !!onResolverUm && item.tarefa?.status === 'falhou';

  return (
    <article style={{
      border: `1px solid ${abertoInicial ? C.primary : C.border}`,
      borderRadius: 14, background: C.card, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Pill cor={sev.c} fundo={sev.bg}>{sev.label}</Pill>
        <Pill cor={est.c} fundo={est.bg}>{est.label}</Pill>
        <span style={{ fontSize: 12, color: C.text2, fontWeight: 600 }}>{item.agente}</span>
        <span style={{ fontSize: 12, color: C.text3 }}>· {fmt(item.quando)}</span>
        {item.decisao_necessaria && (
          <Pill cor={C.primary} fundo={C.primaryBg} titulo="O agente deixou uma pergunta — ela não trava o conserto, mas está registrada">
            deixou uma pergunta
          </Pill>
        )}
        {and && (
          <Pill cor={and.c} fundo={and.bg} titulo={item.andamento_motivo}>{and.label}</Pill>
        )}
      </div>

      <h3 style={{ margin: '10px 0 0', fontSize: 14.5, fontWeight: 700, color: C.text, lineHeight: 1.45 }}>
        {item.incidente?.titulo || item.titulo}
      </h3>
      {item.resumo && (
        <p style={{ margin: '6px 0 0', fontSize: 13, color: C.text2, lineHeight: 1.55 }}>{item.resumo}</p>
      )}

      {item.incidente?.titulo && item.titulo !== item.incidente.titulo && (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: C.text, lineHeight: 1.5 }}>
          <strong style={{ color: C.text3, fontWeight: 700 }}>Causa provável · </strong>{item.titulo}
        </p>
      )}

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 12, color: C.text3 }}>
        {item.classificacao && <span>tipo: <strong style={{ color: C.text2 }}>{item.classificacao}</strong></span>}
        {item.confianca && <span>confiança: <strong style={{ color: C.text2 }}>{item.confianca}</strong></span>}
        {item.risco && <span>risco: <strong style={{ color: C.text2 }}>{item.risco}</strong></span>}
        {item.modulo && <span>módulo: <strong style={{ color: C.text2 }}>{item.modulo}</strong></span>}
      </div>

      {
                                                                                 }
      {item.plano_de_acao.length
        ? <Lista titulo="Plano de ação sugerido" itens={item.plano_de_acao} numerada />
        : (
          <p style={{ marginTop: 12, fontSize: 12.5, color: C.text3, lineHeight: 1.5 }}>
            O agente não registrou plano de ação para este achado.
          </p>
        )}

      {item.decisao_necessaria && (
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 10,
          border: `1px solid ${C.primary}55`, background: C.primaryBg,
          fontSize: 13, color: C.text, lineHeight: 1.5,
        }}>
          <strong>O agente precisa da sua resposta:</strong>
          <div style={{ marginTop: 4, color: C.text2 }}>{item.pergunta_de_decisao}</div>
        </div>
      )}

      <Button variant="ghost" size="sm" style={{ marginTop: 10, paddingLeft: 0 }} onClick={() => setAberto((v) => !v)}>
        {aberto ? 'Menos detalhes' : 'Evidências e como validar'}
      </Button>

      {                                                                      }
      {(item.andamento || podeDespachar) && (
        <div style={{
          marginTop: 12, padding: '10px 12px', borderRadius: 10,
          border: `1px solid ${and && and.bg !== 'transparent' ? and.c + '55' : C.border}`,
          background: and && and.bg !== 'transparent' ? and.bg : 'transparent',
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5, flex: 1, minWidth: 240 }}>
            {
                                                                      }
            {item.andamento_motivo}
            {podeDespachar && (
              <div style={{ color: C.text3, marginTop: 3 }}>{FAIXA_UI[faixa]}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {item.tarefa?.pull_request_url && (
              <a href={item.tarefa.pull_request_url} target="_blank" rel="noreferrer"
                 style={{ fontSize: 12.5, fontWeight: 700, color: C.primary }}>
                Ver o PR →
              </a>
            )}
            {podeDespachar && (
              <Button size="sm" variant="ghost" disabled={ocupado}
                      onClick={() => onResolverUm(item, false)}>
                {faixa === 'auto' ? 'Resolver e mergear' : 'Resolver (só PR)'}
              </Button>
            )}
            {podeTentarDeNovo && (
              <Button size="sm" variant="ghost" disabled={ocupado}
                      onClick={() => onResolverUm(item, true)}>
                Tentar de novo
              </Button>
            )}
            {
                                                                }
            {item.andamento !== 'resolvido' && (
              <BotaoCopiarPrompt
                texto={montarPromptDiagnostico(item)}
                titulo="Copia um prompt pronto (com o incidente, o diagnóstico e as regras da casa) para colar no Claude Code"
              />
            )}
          </div>
        </div>
      )}

      {aberto && (
        <div style={{ marginTop: 4, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <Lista titulo="Evidências que o agente viu" itens={item.evidencias} />
          <Lista titulo="Como validar antes de mexer" itens={item.passos_de_validacao} numerada />
          {item.incidente && (
            <div style={{ marginTop: 12, fontSize: 12, color: C.text3, lineHeight: 1.7 }}>
              {item.incidente.impacto && <div>Impacto: {item.incidente.impacto}</div>}
              {item.incidente.ambiente && <div>Ambiente: {item.incidente.ambiente}</div>}
              {item.incidente.request_id && <div>Rastreio: <code>{item.incidente.request_id}</code></div>}
              {item.incidente.release && <div>Release: <code>{String(item.incidente.release).slice(0, 12)}</code></div>}
              <div style={{ marginTop: 8 }}>
                {                                                                }
                <a href="/sistema" style={{ color: C.primary, fontWeight: 600, fontSize: 12.5 }}>
                  Abrir a fila de incidentes →
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}


function Faixa({ cor, fundo, children }) {
  return (
    <div style={{
      marginBottom: 14, padding: '10px 12px', borderRadius: 10,
      border: `1px solid ${cor}55`, background: fundo, fontSize: 13, color: C.text, lineHeight: 1.55,
    }}>{children}</div>
  );
}









function ConfirmarResolucao({ previa, onConfirmar, onCancelar, ocupado, erro }) {
  const plano = previa?.plano || {};
  const auto = (previa?.itens || []).filter((i) => i.autonomia?.faixa === 'auto' && !i.tarefa);
  const pr = (previa?.itens || []).filter((i) => i.autonomia?.faixa === 'pr' && !i.tarefa);
  const humano = (previa?.itens || []).filter((i) => i.autonomia?.faixa === 'humano');
  const nada = !plano.merge_automatico && !plano.so_pr;

  const Linha = ({ item }) => (
    <li style={{ marginTop: 4 }}>
      {item.incidente?.titulo || item.titulo}
      {item.autonomia?.motivo && (
        <span style={{ color: C.text3 }}> — {item.autonomia.motivo}</span>
      )}
    </li>
  );

  return (
    <div style={{
      marginBottom: 14, padding: '14px 16px', borderRadius: 14,
      border: `1px solid ${C.primary}66`, background: C.card,
    }}>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>
        {nada ? 'Não há nada para despachar agora' : 'Confira antes de despachar'}
      </div>

      {!nada && (
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          {plano.merge_automatico > 0 && (
            <div style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.green}55`, background: C.greenBg }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                {plano.merge_automatico} vão ser corrigidos, mergeados na main e publicados
              </div>
              <div style={{ fontSize: 12.5, color: C.text2, marginTop: 3, lineHeight: 1.5 }}>
                O merge só acontece com o CI verde (tipos, build, testes e os scripts do gate).
                Migrations são proibidas neste caminho, e o agente não escreve em pagamentos,
                autenticação nem no módulo Sistema.
              </div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12.5, color: C.text }}>
                {auto.map((i) => <Linha key={i.id} item={i} />)}
              </ul>
            </div>
          )}
          {plano.so_pr > 0 && (
            <div style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                {plano.so_pr} vão ser corrigidos e PARAM no PR — o merge é seu
              </div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12.5, color: C.text }}>
                {pr.map((i) => <Linha key={i.id} item={i} />)}
              </ul>
            </div>
          )}
        </div>
      )}

      {humano.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: C.text2, lineHeight: 1.55 }}>
          <strong style={{ color: C.text }}>{humano.length} ficam com você</strong> (o agente não mexe
          nesses sozinho). Eles seguem na aba marcados como “precisa da sua ação”, com o motivo.
        </div>
      )}

      {                                                  }
      {plano.adiados > 0 && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: C.amber }}>
          {plano.adiados} ficam para a próxima rodada (teto de {plano.teto_rodada} por clique).
        </div>
      )}

      {erro && (
        <div style={{ marginTop: 10, fontSize: 13, color: C.red }}><strong>Falhou:</strong> {erro}</div>
      )}

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        {!nada && (
          <Button size="sm" onClick={onConfirmar} disabled={ocupado}>
            {ocupado ? 'Despachando…' : `Resolver ${plano.merge_automatico + plano.so_pr}`}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onCancelar} disabled={ocupado}>
          {nada ? 'Fechar' : 'Cancelar'}
        </Button>
      </div>
    </div>
  );
}









function Recibo({ recibo, onFechar }) {
  const criadas = recibo?.criadas || [];
  const refila = recibo?.reenfileiradas || [];
  const pulados = recibo?.pulados || [];
  const ex = recibo?.executor || {};
  const comecou = ex.chamado && ex.executando !== false;

  return (
    <div style={{
      marginBottom: 14, padding: '14px 16px', borderRadius: 14,
      border: `1px solid ${comecou ? C.green : C.amber}55`,
      background: comecou ? C.greenBg : C.amberBg,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
        {criadas.length + refila.length > 0
          ? `${criadas.length + refila.length} correção(ões) despachada(s)`
          : 'Nada foi despachado'}
      </div>

      {criadas.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 20, fontSize: 12.5, color: C.text, lineHeight: 1.6 }}>
          {criadas.map((c) => (
            <li key={c.id}>
              {c.titulo}
              <span style={{ color: C.text3 }}>
                {' '}— {c.merge_automatico ? 'corrige e mergeia' : 'corrige e para no PR'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!comecou && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: C.text, lineHeight: 1.55 }}>
          <strong>O executor não confirmou início.</strong> {ex.motivo || 'sem detalhe'}
        </div>
      )}
      {comecou && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: C.text2 }}>
          O executor foi acordado. Ele pega até 3 tarefas por rodada — o resto entra nos tiques
          seguintes (de 10 em 10 minutos). Esta aba se atualiza sozinha enquanto houver trabalho.
        </div>
      )}

      {pulados.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: C.text2 }}>
            {pulados.length} não entraram — ver o motivo
          </summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12.5, color: C.text2, lineHeight: 1.6 }}>
            {pulados.map((p, i) => <li key={i}>{p.titulo} — {p.motivo}</li>)}
          </ul>
        </details>
      )}

      <Button size="sm" variant="ghost" style={{ marginTop: 10, paddingLeft: 0 }} onClick={onFechar}>
        Fechar
      </Button>
    </div>
  );
}

export default function TabDiagnosticos() {

  const [params] = useSearchParams();
  const runDestacada = params.get('run');
  const [filtro, setFiltro] = useState('abertos');
  const [confirmar, setConfirmar] = useState(null);
  const [recibo, setRecibo] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['agent-diagnosticos'],
    queryFn: () => agents.diagnosticos({ limite: 60 }),



    refetchInterval: (q) => {
      const r = q?.state?.data?.andamento;
      return r && r.em_andamento > 0 ? 20_000 : false;
    },
    staleTime: 60_000,
  });

  const previa = useMutation({
    mutationFn: () => agents.diagnosticosPrevia({ limite: 60 }),
    onSuccess: (p) => setConfirmar(p),
  });

  const despachar = useMutation({
    mutationFn: (body) => agents.diagnosticosResolver(body),
    onSuccess: (r) => {
      setConfirmar(null);
      setRecibo(r);
      qc.invalidateQueries({ queryKey: ['agent-diagnosticos'] });
    },
  });

  const itens = data?.itens || [];
  const resumo = data?.resumo || {};

  const visiveis = useMemo(() => {
    const base = filtro === 'abertos' ? itens.filter((i) => i.estado === 'aberto')
      : filtro === 'criticos' ? itens.filter((i) => i.severidade === 'critico')
        : filtro === 'andamento' ? itens.filter((i) => i.andamento === 'na_fila' || i.andamento === 'trabalhando')
          : filtro === 'resolvidos' ? itens.filter((i) => i.andamento === 'resolvido')
            : filtro === 'precisam' ? itens.filter((i) => i.andamento === 'precisa_de_voce')
              : itens;


    if (!runDestacada) return base;
    const dele = itens.filter((i) => i.run_id === runDestacada);
    const resto = base.filter((i) => i.run_id !== runDestacada);
    return [...dele, ...resto];
  }, [itens, filtro, runDestacada]);





  const and = data?.andamento || {};
  const FILTROS = [
    ['abertos', `Em aberto${resumo.abertos ? ` (${resumo.abertos})` : ''}`],
    ['andamento', `Sendo resolvidos${and.em_andamento ? ` (${and.em_andamento})` : ''}`],
    ['resolvidos', `Resolvidos${and.resolvidos ? ` (${and.resolvidos})` : ''}`],
    ['precisam', `Precisam da sua ação${and.precisam_de_voce ? ` (${and.precisam_de_voce})` : ''}`],
    ['criticos', 'Críticos'],
    ['todos', `Todos${resumo.total ? ` (${resumo.total})` : ''}`],
  ];



  const tituloDoChip = (id) => (id === 'todos'
    ? 'Os achados das 60 execuções de agente mais recentes. Achado de execução mais antiga não aparece nesta aba.'
    : undefined);


  const precisamDeVoce = useMemo(
    () => itens.filter((i) => i.andamento === 'precisa_de_voce'),
    [itens],
  );
  const promptDoLote = useMemo(
    () => (precisamDeVoce.length ? montarPromptLote(precisamDeVoce) : ''),
    [precisamDeVoce],
  );

  const resolverUm = (item, tentarDeNovo) => despachar.mutate(
    tentarDeNovo ? { ids: [item.id], reenfileirar: [item.id] } : { ids: [item.id] },
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>O que os agentes acharam</div>
          <div style={{ fontSize: 12.5, color: C.text2, marginTop: 2, lineHeight: 1.5, maxWidth: 660 }}>
            Cada achado com a causa provável e o plano de ação. <strong>Resolver todos</strong> manda o
            agente desenvolvedor corrigir e abrir o PR; quando o incidente é reproduzível ele também
            mergeia na main. O que ele não faz sozinho fica marcado como{' '}
            <strong>precisa da sua ação</strong>, com o motivo — e nesses o botão
            <strong> Copiar prompt</strong> monta o pedido pronto para você colar no Claude Code.
            Mudar o status do incidente é em{' '}
            <a href="/sistema" style={{ color: C.primary }}>Sistema</a>.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Atualizando…' : 'Atualizar'}
          </Button>
          <Button size="sm" onClick={() => previa.mutate()} disabled={previa.isPending || despachar.isPending}>
            {previa.isPending ? 'Conferindo…' : 'Resolver todos'}
          </Button>
          {
                                                               }
          {precisamDeVoce.length > 0 && (
            <BotaoCopiarPrompt
              texto={promptDoLote}
              rotulo={`Copiar prompt (${precisamDeVoce.length})`}
              titulo={`Copia um prompt pronto com ${precisamDeVoce.length === 1 ? 'o achado que precisa' : 'os achados que precisam'} da sua ação, para colar no Claude Code`}
            />
          )}
        </div>
      </div>

      {previa.isError && (
        <Faixa cor={C.red} fundo={C.redBg}>
          <strong>Não conseguimos montar a prévia.</strong> {previa.error?.message}
        </Faixa>
      )}

      {and.fila_travada?.qtd > 0 && (





        <Faixa cor={C.amber} fundo={C.amberBg}>
          <strong>
            A fila do agente não está andando
            {and.fila_travada.qtd > 1 ? ` (${and.fila_travada.qtd} tarefas esperando).` : '.'}
          </strong>{' '}
          {and.fila_travada.motivo} Enquanto isso, os achados seguem na fila e andam
          sozinhos quando o ambiente for corrigido — nada precisa ser reenfileirado.
        </Faixa>
      )}

      {data?.andamento_indisponivel && (


        <Faixa cor={C.amber} fundo={C.amberBg}>
          <strong>Achados carregados, andamento não.</strong> {data.aviso} Os selos de
          resolvido/em andamento podem estar faltando nesta leitura.
        </Faixa>
      )}

      {confirmar && (
        <ConfirmarResolucao
          previa={confirmar}
          ocupado={despachar.isPending}
          erro={despachar.error?.message}
          onCancelar={() => setConfirmar(null)}
          onConfirmar={() => despachar.mutate({})}
        />
      )}

      {recibo && <Recibo recibo={recibo} onFechar={() => setRecibo(null)} />}

      {runDestacada && (
        <div style={{
          marginBottom: 14, padding: '10px 12px', borderRadius: 10,
          border: `1px solid ${C.primary}55`, background: C.primaryBg, fontSize: 13, color: C.text,
        }}>
          Mostrando primeiro o achado da notificação que você abriu.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTROS.map(([id, label]) => (
          <button key={id} type="button" title={tituloDoChip(id)} onClick={() => setFiltro(id)} style={{
            padding: '6px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${filtro === id ? C.primary : C.border}`,
            background: filtro === id ? C.primaryBg : 'transparent',
            color: filtro === id ? C.primary : C.text2,
          }}>{label}</button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.text3, fontSize: 14 }}>Carregando…</div>
      ) : error ? (


        <div style={{
          padding: '14px 16px', borderRadius: 12, border: `1px solid ${C.red}55`, background: C.redBg,
          fontSize: 13.5, color: C.text, lineHeight: 1.55,
        }}>
          <strong>Não conseguimos carregar os diagnósticos.</strong>
          <div style={{ marginTop: 4, color: C.text2 }}>{error.message}</div>
          <Button variant="ghost" size="sm" style={{ marginTop: 8, paddingLeft: 0 }} onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : !visiveis.length ? (
        <div style={{ textAlign: 'center', padding: 40, color: C.text3, fontSize: 14 }}>
          {itens.length
            ? 'Nenhum achado neste recorte — troque o filtro acima.'
            : 'Nenhum agente registrou achado ainda.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {visiveis.map((item) => (
            <Card key={item.id} item={item} abertoInicial={item.run_id === runDestacada}
                  onResolverUm={resolverUm} ocupado={despachar.isPending} />
          ))}
        </div>
      )}
    </div>
  );
}

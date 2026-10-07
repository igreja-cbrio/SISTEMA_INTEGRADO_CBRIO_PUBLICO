import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, Check, ClipboardCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
import { avaliacao360 } from '../api';
import Resultado360, { Entrega } from '../components/avaliacao360/Resultado360';
import { MapaEquipe } from '../components/avaliacao360/Graficos';






const PAPEL = {
  auto: 'Autoavaliação',
  gestor: 'Como gestor(a)',
  par: 'Como colega de equipe',
  liderado: 'Como liderado(a)',
};



const SIGILO = {
  auto: 'Sua autoavaliação aparece no seu resultado, ao lado das outras avaliações.',
  gestor: 'Como você é o(a) gestor(a), sua avaliação é identificável no resultado.',
  par: 'Seu nome nunca aparece: a pessoa avaliada e o gestor dela leem notas e comentários sem saber quem escreveu. Só aparece quando pelo menos 3 colegas responderam.',
  liderado: 'Seu nome nunca aparece: seu gestor lê notas e comentários sem saber quem escreveu. Só aparece quando pelo menos 3 liderados responderam.',
};

const fmtData = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '');

function Formulario({ conviteId, comoOpcoes, onVoltar, onEnviado }) {
  const [form, setForm] = useState(null);
  const [erro, setErro] = useState('');
  const [notas, setNotas] = useState({});
  const [comentarios, setComentarios] = useState({});
  const [enviando, setEnviando] = useState(false);

  const [rascunhoEm, setRascunhoEm] = useState(null);
  const chave = `aval360:rascunho:${conviteId}`;

  useEffect(() => {
    avaliacao360.formulario(conviteId).then((f) => {
      setForm(f);
      if (f.pode_editar && Array.isArray(f.minhas_notas)) {

        setNotas(Object.fromEntries(f.minhas_notas.map((n) => [n.pergunta_id, n.nota])));
        setComentarios(Object.fromEntries(f.minhas_notas.map((n) => [n.pergunta_id, n.comentario || ''])));
        return;
      }

      try {
        const r = JSON.parse(localStorage.getItem(chave) || 'null');
        if (r) { setNotas(r.notas || {}); setComentarios(r.comentarios || {}); setRascunhoEm(r.em || null); }
      } catch {                                                   }
    }).catch((e) => setErro(e.message));
  }, [conviteId, chave]);

  useEffect(() => {
    if (!form || form.pode_editar) return;
    if (!Object.keys(notas).length && !Object.values(comentarios).some((c) => c?.trim())) return;
    const em = new Date().toISOString();
    try { localStorage.setItem(chave, JSON.stringify({ notas, comentarios, em })); setRascunhoEm(em); } catch {              }
  }, [notas, comentarios, form, chave]);

  if (erro) {
    return (
      <Card><CardContent className="p-6 space-y-3">
        <p className="text-sm text-destructive">{erro}</p>
        <Button variant="outline" onClick={onVoltar}><ArrowLeft className="size-4 mr-1" />Voltar</Button>
      </CardContent></Card>
    );
  }
  if (!form) return <p className="text-sm text-muted-foreground p-4">Carregando formulário…</p>;


  const { convite, perguntas: competencias, escala_max: max } = form;
  const rotulos = Array.isArray(form.escala_rotulos) && form.escala_rotulos.length === max ? form.escala_rotulos : null;
  const faltam = competencias.filter((c) => !notas[c.id]).length;
  const escala = Array.from({ length: max }, (_, i) => i + 1);

  async function enviar() {
    if (form.comentario_obrigatorio && competencias.some((c) => (comentarios[c.id] || '').trim().length < 3)) {
      return toast.error('Nesta avaliação o comentário é obrigatório em todas as perguntas.');
    }
    if (faltam) return toast.error(`Falta${faltam > 1 ? 'm' : ''} ${faltam} pergunta${faltam > 1 ? 's' : ''}.`);
    setEnviando(true);
    try {
      const lista = competencias.map((c) => ({ pergunta_id: c.id, nota: notas[c.id], comentario: comentarios[c.id]?.trim() || null }));
      if (form.pode_editar) await avaliacao360.editarResposta(conviteId, lista);
      else await avaliacao360.responder(conviteId, lista);
      try { localStorage.removeItem(chave); } catch {              }
      toast.success(form.pode_editar ? 'Resposta alterada.' : 'Avaliação enviada. Obrigado!');
      onEnviado();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onVoltar}><ArrowLeft className="size-4 mr-1" />Minhas avaliações</Button>
      <Card>
        <CardHeader>
          <CardDescription>{convite.ciclo?.nome} · {PAPEL[convite.papel]}</CardDescription>
          <CardTitle className="text-lg">
            {convite.papel === 'auto' ? 'Como você avalia o seu desempenho' : `Você está avaliando ${convite.avaliado?.nome}`}
          </CardTitle>
          {convite.ciclo?.descricao && <p className="text-sm text-muted-foreground whitespace-pre-line">{convite.ciclo.descricao}</p>}
          <p className="text-xs text-muted-foreground">{SIGILO[convite.papel]}</p>
        </CardHeader>
      </Card>

      {competencias.map((c, i) => (
        <Card key={c.id}>
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">Pergunta {i + 1} de {competencias.length} · {c.criterio}</p>
              <p className="font-medium">{c.texto}</p>
              {c.ajuda && <p className="text-sm text-muted-foreground mt-1">{c.ajuda}</p>}
            </div>
            {comoOpcoes && rotulos ? (

              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label={c.texto}>
                {escala.map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={notas[c.id] === n}
                    onClick={() => setNotas((s) => ({ ...s, [c.id]: n }))}
                    className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                      notas[c.id] === n ? 'border-primary bg-primary text-primary-foreground font-medium' : 'bg-background hover:bg-muted'
                    }`}>
                    {rotulos[n - 1]}
                  </button>
                ))}
              </div>
            ) : (<>
            <div className="flex gap-1.5 flex-wrap" role="radiogroup" aria-label={c.texto}>
              {escala.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={notas[c.id] === n}
                  title={rotulos?.[n - 1]}
                  onClick={() => setNotas((s) => ({ ...s, [c.id]: n }))}
                  className={`size-10 rounded-md border text-sm font-medium transition-colors ${
                    notas[c.id] === n ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'
                  }`}
                >{n}</button>
              ))}
            </div>
            {rotulos && (
              <p className="text-xs text-muted-foreground">
                {notas[c.id] ? <><span className="font-medium text-foreground">{notas[c.id]}</span> · {rotulos[notas[c.id] - 1]}</>
                  : <>1 = {rotulos[0]} · {max} = {rotulos[max - 1]}</>}
              </p>
            )}
            </>)}
            <Textarea
              placeholder={form.comentario_obrigatorio ? 'Comentário (obrigatório) — um exemplo real ajuda muito' : 'Comentário (opcional) — um exemplo real ajuda muito'}
              maxLength={5000}
              value={comentarios[c.id] || ''}
              onChange={(e) => setComentarios((s) => ({ ...s, [c.id]: e.target.value }))}
            />
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          {form.pode_editar ? 'Você está alterando uma resposta já enviada.'
            : <>Depois de enviada, a avaliação não pode ser alterada.{rascunhoEm && <> · Rascunho salvo neste navegador às {new Date(rascunhoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</>}</>}
        </p>
        <Button onClick={enviar} disabled={enviando}>
          {enviando ? 'Enviando…' : faltam ? `Faltam ${faltam}` : form.pode_editar ? 'Salvar alteração' : 'Enviar avaliação'}
        </Button>
      </div>
    </div>
  );
}

function VerResultado({ alvo, onVoltar }) {
  const [r, setR] = useState(null);
  const [erro, setErro] = useState('');
  const carregar = useCallback(() => avaliacao360.resultado(alvo.cicloId, alvo.avaliadoId).then(setR).catch((e) => setErro(e.message)),
    [alvo.cicloId, alvo.avaliadoId]);
  useEffect(() => { carregar(); }, [carregar]);
  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onVoltar}><ArrowLeft className="size-4 mr-1" />Minhas avaliações</Button>
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {!r && !erro && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {r && (
        <Resultado360 r={r} acoes={alvo.comoGestor && (
          <Entrega entrega={r.entrega} nome={r.avaliado?.nome?.split(' ')[0]}
            enviar={(dados) => avaliacao360.entregar(alvo.cicloId, alvo.avaliadoId, dados)} onPronto={carregar}
            salvarPlano={(plano) => avaliacao360.plano(alvo.cicloId, alvo.avaliadoId, plano)} />
        )} />
      )}
      {r && !alvo.comoGestor && (
        <p className="text-xs text-muted-foreground">Notas e comentários de colegas e liderados aparecem sem o nome de quem escreveu.</p>
      )}
    </div>
  );
}

export default function MinhasAvaliacoes() {
  const [dados, setDados] = useState(null);
  const [resultados, setResultados] = useState(null);
  const [erro, setErro] = useState('');
  const [aberto, setAberto] = useState(null);
  const [vendo, setVendo] = useState(null);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const [m, r] = await Promise.all([avaliacao360.minhas(), avaliacao360.meusResultados()]);
      setDados(m);
      setResultados(r);
    } catch (e) { setErro(e.message); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  if (vendo) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <VerResultado alvo={vendo} onVoltar={() => { setVendo(null); carregar(); }} />
      </div>
    );
  }

  if (aberto) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6">
        <Formulario conviteId={aberto} comoOpcoes={!![...(dados?.pendentes || []), ...(dados?.respondidos || [])].find((c) => c.id === aberto)?.ciclo?.config?.respostas_como_opcoes} onVoltar={() => setAberto(null)} onEnviado={() => { setAberto(null); carregar(); }} />
      </div>
    );
  }

  const pendentes = dados?.pendentes || [];
  const respondidos = dados?.respondidos || [];

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2"><ClipboardCheck className="size-5 text-primary" />Minhas avaliações</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Avaliação 360 · você avalia e é avaliado(a) por gestor, colegas de equipe e liderados.</p>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {!dados && !erro && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {                                                                                   }
      {(resultados?.situacao || []).filter((x) => x.etapa !== 'liberado').map((x) => (
        <Card key={x.ciclo.id}>
          <CardContent className="flex items-start gap-3 p-4">
            <BarChart3 className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium">Seu resultado · {x.ciclo.nome}</p>
              <p className="text-sm text-muted-foreground">
                {x.etapa === 'respostas' && `As respostas estão abertas${x.ciclo.coleta_ate ? ` até ${fmtData(x.ciclo.coleta_ate)}` : ''}. Depois o RH apura, e o resultado aparece aqui quando o seu gestor liberar.`}
                {x.etapa === 'apuracao' && 'O RH está apurando os resultados. Quando publicar, o seu gestor recebe o seu resultado, conversa com você e libera — aí ele aparece aqui.'}
                {x.etapa === 'aguardando_gestor' && 'Os resultados foram publicados. Falta o seu gestor liberar o seu — assim que liberar, ele aparece aqui.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}

      {resultados?.meus?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="size-4" />Meu resultado</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {resultados.meus.map((c) => (
              <button key={c.id} type="button" onClick={() => setVendo({ cicloId: c.id, avaliadoId: dados?.eu?.id, comoGestor: false })}
                className="w-full flex items-center justify-between rounded-md border px-3 py-2.5 text-left hover:bg-muted">
                <span className="text-sm font-medium">{c.nome}</span>
                <span className="text-xs text-primary font-medium">Ver resultado</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {resultados?.equipe?.map(({ ciclo, pessoas }) => (
        <Card key={ciclo.id}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Users className="size-4" />Resultados da sua equipe · {ciclo.nome}</CardTitle>
            <CardDescription>Leia cada resultado, converse com a pessoa, libere para ela ver e registre a devolutiva.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pessoas.length > 1 && (
              <div className="mb-3 rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">Mapa da equipe</p>
                <MapaEquipe pessoas={pessoas} max={pessoas.find((p) => p.escala_max)?.escala_max || 6}
                  onPessoa={(p) => setVendo({ cicloId: ciclo.id, avaliadoId: p.avaliado.id, comoGestor: true })} />
              </div>
            )}
            {pessoas.map((p) => (
              <button key={p.avaliado.id} type="button" onClick={() => setVendo({ cicloId: ciclo.id, avaliadoId: p.avaliado.id, comoGestor: true })}
                className="w-full flex items-center justify-between rounded-md border px-3 py-2.5 text-left hover:bg-muted gap-2">
                <span>
                  <span className="text-sm font-medium">{p.avaliado.nome}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.final != null ? `nota ${Number(p.final).toFixed(2)}` : 'sem respostas'}{p.quadrante ? ` · ${p.quadrante}` : ''}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.entrega?.devolutiva_dia ? '✓ devolutiva' : p.entrega?.liberado_em ? 'liberado' : 'a entregar'}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      ))}

      {dados && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Para responder</CardTitle>
            {pendentes[0]?.ciclo?.coleta_ate && <CardDescription>Prazo: {fmtData(pendentes[0].ciclo.coleta_ate)}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-2">
            {pendentes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma avaliação pendente.</p>}
            {pendentes.map((c) => (
              <button key={c.id} type="button" onClick={() => setAberto(c.id)}
                className="w-full flex items-center justify-between rounded-md border px-3 py-2.5 text-left hover:bg-muted">
                <span>
                  <span className="text-sm font-medium">{c.papel === 'auto' ? 'Você mesmo(a)' : c.avaliado?.nome}</span>
                  <span className="block text-xs text-muted-foreground">{PAPEL[c.papel]} · {c.ciclo?.nome}</span>
                </span>
                <span className="text-xs text-primary font-medium">Responder</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {respondidos.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Respondidas</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {respondidos.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span>{c.papel === 'auto' ? 'Autoavaliação' : c.avaliado?.nome}<span className="text-xs text-muted-foreground ml-2">{PAPEL[c.papel]}</span></span>
                {c.ciclo?.config?.permitir_edicao
                  ? <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setAberto(c.id)}>Editar resposta</button>
                  : <Check className="size-4 text-emerald-600" />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

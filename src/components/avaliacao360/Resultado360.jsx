import { useState } from 'react';
import { EyeOff, ListChecks, MessageSquareQuote, Plus, Printer, SlidersHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Comparativo, PontosCegos } from './Graficos';
import { imprimirResultado } from './imprimir';






const PAPEL_COLUNA = [['auto', 'Auto'], ['gestor', 'Gestor'], ['par', 'Pares'], ['liderado', 'Liderados']];
const PAPEL_COMENTARIO = { auto: 'Autoavaliação', gestor: 'Gestor', par: 'Colega', liderado: 'Liderado' };
const PAPEL_GRUPO = { par: 'pares', liderado: 'liderados' };
const EIXO = { resultado: 'Resultado', comportamento: 'Comportamento' };


export const QUADRANTES = [
  [['alto', 'baixo', 'Diamante bruto'], ['alto', 'medio', 'Forte desempenho'], ['alto', 'alto', 'Estrela']],
  [['medio', 'baixo', 'Questionável'], ['medio', 'medio', 'Mantenedor'], ['medio', 'alto', 'Forte desempenho']],
  [['baixo', 'baixo', 'Insuficiente'], ['baixo', 'medio', 'Eficaz'], ['baixo', 'alto', 'Comprometido']],
];

const fmt = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }));

function Barra({ valor, max }) {
  if (valor == null) return null;
  const w = Math.max(0, Math.min(100, ((valor - 1) / (max - 1)) * 100));
  return (
    <div className="h-1.5 w-full rounded-full bg-muted mt-1" title={`${fmt(valor)} de ${max}`}>
      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${w}%` }} />
    </div>
  );
}






export function NoveBox({ pessoas, destaque, cortes, onPessoa }) {
  return (
    <div>
      <div className="flex gap-2">
        <div className="flex items-center"><span className="text-[11px] text-muted-foreground [writing-mode:vertical-rl] rotate-180">Comportamento →</span></div>
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-1">
          {QUADRANTES.flat().map(([comp, res, nome]) => {
            const aqui = (pessoas || []).filter((p) => p.nivel_comportamento === comp && p.nivel_resultado === res);
            const marcado = destaque && destaque.nivel_comportamento === comp && destaque.nivel_resultado === res;
            return (
              <div key={`${comp}-${res}`}
                className={`min-w-0 rounded-md border p-2 min-h-[64px] ${marcado ? 'border-primary bg-primary/10' : 'bg-muted/30'}`}>
                <p lang="pt-BR" className={`hyphens-auto break-words text-[11px] font-medium leading-tight ${marcado ? 'text-primary' : 'text-muted-foreground'}`}>
                  {nome}{pessoas && <span className="ml-1 font-normal">· {aqui.length}</span>}
                </p>
                {pessoas && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {aqui.map((p) => (
                      <button key={p.id} type="button" onClick={() => onPessoa?.(p.id)} title={p.nome}
                        className="text-[11px] rounded bg-background border px-1.5 py-0.5 hover:border-primary truncate max-w-[120px]">
                        {p.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground text-center mt-1">Resultado →
        {cortes && <span className="ml-2">(baixo ≤ {fmt(cortes.baixo)} · alto ≥ {fmt(cortes.alto)})</span>}
      </p>
    </div>
  );
}

function Calibrar({ c, max, onCalibrar }) {
  const [aberto, setAberto] = useState(false);
  const [nota, setNota] = useState(c.final ?? '');
  const [just, setJust] = useState(c.justificativa || '');
  const [ocupado, setOcupado] = useState(false);
  async function salvar(valor) {
    setOcupado(true);
    try {
      await onCalibrar(c.competencia_id, valor, just);
      toast.success(valor === null ? 'Calibragem desfeita.' : 'Critério calibrado.');
      setAberto(false);
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  }
  if (!aberto) {
    return (
      <span className="flex gap-2">
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setAberto(true)}>
          <SlidersHorizontal className="size-3 inline mr-0.5" />{c.calibrado ? 'Ajustar calibragem' : 'Calibrar'}
        </button>
        {c.calibrado && <button type="button" className="text-xs text-muted-foreground hover:underline" disabled={ocupado} onClick={() => salvar(null)}>Desfazer</button>}
      </span>
    );
  }
  const n = Number(String(nota).replace(',', '.'));
  const valido = Number.isFinite(n) && n >= 1 && n <= max && just.trim().length >= 10;
  return (
    <div className="rounded-md border p-2.5 space-y-2 bg-muted/30">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Nota final calibrada (1 a {max})</span>
        <Input className="w-24 h-8" inputMode="decimal" value={nota} onChange={(e) => setNota(e.target.value)} />
        {c.calculado != null && <span className="text-xs text-muted-foreground">calculada: {fmt(c.calculado)}</span>}
      </div>
      <Textarea rows={2} maxLength={2000} placeholder="Justificativa (obrigatória, mínimo 10 caracteres) — aparece para o RH e o gestor"
        value={just} onChange={(e) => setJust(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setAberto(false)}>Cancelar</Button>
        <Button size="sm" disabled={!valido || ocupado} onClick={() => salvar(Math.round(n * 100) / 100)}>Salvar calibragem</Button>
      </div>
    </div>
  );
}



const VISOES = [['final', 'Geral'], ['gestor', 'Gestor'], ['par', 'Pares'], ['liderado', 'Liderados'], ['auto', 'Autoavaliação']];

export default function Resultado360({ r, acoes, onCalibrar }) {
  const [visao, setVisao] = useState('final');
  if (!r) return null;
  const max = r.ciclo.escala_max;
  const rotulos = r.ciclo.escala_rotulos;
  const ocultos = Object.entries(r.papeis || {}).filter(([, v]) => !v.visivel && v.respondentes > 0);
  const colunas = PAPEL_COLUNA.filter(([p]) => r.papeis?.[p]?.visivel);
  const semResposta = !r.criterios?.some((c) => c.final != null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardDescription>{r.ciclo.nome}</CardDescription>
          <CardTitle className="text-lg">{r.avaliado?.nome}</CardTitle>
          {(r.avaliado?.cargo || r.avaliado?.area) && <p className="text-xs text-muted-foreground">{[r.avaliado.cargo, r.avaliado.area].filter(Boolean).join(' · ')}</p>}
        </CardHeader>
        <CardContent className="space-y-4">
          {semResposta ? (
            <p className="text-sm text-muted-foreground">Ninguém respondeu sobre esta pessoa neste ciclo.</p>
          ) : (
            <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Nota final</p>
                  <p className="text-4xl font-semibold tracking-tight">{fmt(r.final)}<span className="text-base text-muted-foreground font-normal"> / {max}</span></p>
                </div>
                <div className="flex gap-6 text-sm">
                  <div><p className="text-xs text-muted-foreground">Resultado</p><p className="font-medium">{fmt(r.eixo_resultado)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Comportamento</p><p className="font-medium">{fmt(r.eixo_comportamento)}</p></div>
                </div>
                {r.quadrante && <p className="text-sm"><span className="text-muted-foreground">Quadrante: </span><b>{r.quadrante}</b></p>}
                <p className="text-[11px] text-muted-foreground">
                  Pesos: autoavaliação {Math.round(r.ciclo.peso_auto * 100)}% · gestor {Math.round(r.ciclo.peso_gestor * 100)}% · pares e liderados {Math.round(r.ciclo.peso_outros * 100)}%.
                  Quem não respondeu tem o peso redistribuído.
                </p>
              </div>
              {r.nivel_resultado && r.nivel_comportamento && (
                <NoveBox destaque={r} cortes={{ baixo: r.ciclo.corte_baixo, alto: r.ciclo.corte_alto }} />
              )}
            </div>
          )}
          {ocultos.length > 0 && (
            <div className="rounded-md border border-dashed p-2.5 text-xs text-muted-foreground flex gap-2">
              <EyeOff className="size-4 shrink-0" />
              <span>
                {ocultos.map(([p, v]) => (v.respondentes === 1 ? `1 ${p === 'par' ? 'par' : 'liderado'} respondeu` : `${v.respondentes} ${PAPEL_GRUPO[p] || p} responderam`)).join(' · ')} — menos de {r.ciclo.piso}, então essas
                respostas não aparecem, para proteger quem respondeu.
              </span>
            </div>
          )}
          {acoes}
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => imprimirResultado(r)}><Printer className="mr-1 size-4" />Imprimir / salvar PDF</Button>
          </div>
        </CardContent>
      </Card>

      {!semResposta && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Como cada visão avaliou</CardTitle>
            <CardDescription>Cada linha é um critério. Os pontos mostram a nota da autoavaliação, do gestor e de pares e liderados; o traço, a nota final.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Comparativo criterios={r.criterios} max={max} />
            <PontosCegos criterios={r.criterios} />
          </CardContent>
        </Card>
      )}

      {(r.entrega?.plano || []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ListChecks className="size-4" />Plano de ação combinado</CardTitle>
            <CardDescription>Combinado na conversa de devolutiva.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {r.entrega.plano.map((a, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                  <span>{a.texto}{a.prazo && <span className="ml-2 text-xs text-muted-foreground">até {new Date(`${a.prazo}T12:00:00`).toLocaleDateString('pt-BR')}</span>}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {!semResposta && (() => {
        const opcoes = VISOES.filter(([k]) => k === 'final' || (r.papeis?.[k]?.visivel && r.criterios.some((c) => c[k] != null)));
        return opcoes.length > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-base font-semibold">Resultado por critério</p>
            <div className="inline-flex flex-wrap rounded-lg border p-0.5" role="tablist" aria-label="Ver nota">
              {opcoes.map(([k, nome]) => (
                <button key={k} type="button" role="tab" aria-selected={visao === k} onClick={() => setVisao(k)}
                  className={`rounded-md px-3 py-1 text-sm ${visao === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  {k === 'final' ? 'Nota geral' : nome}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {!semResposta && ['resultado', 'comportamento'].map((eixo) => {
        const itens = r.criterios.filter((c) => c.eixo === eixo);
        if (!itens.length) return null;
        return (
          <Card key={eixo}>
            <CardHeader><CardTitle className="text-base">{EIXO[eixo]}</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              {itens.map((c) => (
                <div key={c.competencia_id} className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{c.nome}</p>
                      {                                                                         }
                      {(c.perguntas || []).filter((pq) => pq.texto && pq.texto !== c.nome).length === 1 && (
                        <p className="text-xs text-muted-foreground">{c.perguntas.find((pq) => pq.texto !== c.nome).texto}</p>
                      )}
                      {c.descricao && <p className="text-xs text-muted-foreground">{c.descricao}</p>}
                    </div>
                    <p className="shrink-0 text-sm">
                      {visao === 'final' && c.calibrado && <span className="text-[11px] rounded bg-primary/10 text-primary px-1.5 py-0.5 mr-2">calibrado</span>}
                      <span className="text-muted-foreground text-xs">{visao === 'final' ? 'final ' : `${(VISOES.find(([k]) => k === visao) || [])[1]?.toLowerCase()} `}</span>
                      <b>{fmt(c[visao])}</b>
                      {visao === 'final' && c.calibrado && c.calculado != null && <span className="text-xs text-muted-foreground"> (calculada {fmt(c.calculado)})</span>}
                    </p>
                  </div>
                  <Barra valor={c[visao]} max={max} />
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    {colunas.map(([p, nome]) => (
                      <div key={p}><span className="text-muted-foreground">{nome} </span><span className="font-medium">{fmt(c[p])}</span></div>
                    ))}
                  </div>
                  {c.perguntas?.length > 1 && (
                    <ul className="space-y-0.5 border-l-2 pl-3 text-xs">
                      {c.perguntas.map((p) => (
                        <li key={p.pergunta_id} className="flex justify-between gap-3">
                          <span className="text-muted-foreground">{p.texto}</span><span className="tabular-nums">{fmt(p.final)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {c.calibrado && c.justificativa && (
                    <p className="text-xs text-muted-foreground"><b>Por que foi calibrado:</b> {c.justificativa}</p>
                  )}
                  {onCalibrar && <Calibrar c={c} max={max} onCalibrar={onCalibrar} />}
                  {c.comentarios.length > 0 && (
                    <ul className="space-y-1.5 pt-1">
                      {c.comentarios.map((cm, i) => (
                        <li key={i} className="text-sm flex gap-2">
                          <MessageSquareQuote className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                          <span>
                            <span className="text-xs text-muted-foreground mr-1">{PAPEL_COMENTARIO[cm.papel]}{c.perguntas?.length > 1 && cm.pergunta ? ` · sobre "${cm.pergunta}"` : ''}:</span>{cm.texto}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {Array.isArray(rotulos) && rotulos.length === max && (
        <p className="text-[11px] text-muted-foreground">Escala: {rotulos.map((t, i) => `${i + 1} = ${t}`).join(' · ')}</p>
      )}
    </div>
  );
}


function EditorPlano({ plano, salvar, onPronto }) {
  const [itens, setItens] = useState(() => (plano?.length ? plano : [{ texto: '', prazo: '' }]).map((a) => ({ texto: a.texto || '', prazo: a.prazo || '' })));
  const [ocupado, setOcupado] = useState(false);
  const mudou = JSON.stringify(itens.filter((a) => a.texto.trim())) !== JSON.stringify((plano || []).map((a) => ({ texto: a.texto, prazo: a.prazo || '' })));
  async function gravar() {
    const lista = itens.filter((a) => a.texto.trim()).map((a) => ({ texto: a.texto.trim(), prazo: a.prazo || null }));
    if (lista.some((a) => a.texto.length < 3)) return toast.error('Cada ação precisa de pelo menos 3 caracteres.');
    setOcupado(true);
    try { await salvar(lista); toast.success('Plano de ação salvo.'); onPronto?.(); } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Plano de ação combinado com a pessoa (até 5). Ela também vê.</p>
      {itens.map((a, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}.</span>
          <Input className="h-8 min-w-[220px] flex-1" maxLength={300} placeholder="Ex.: ouvir a equipe antes de decidir mudanças" value={a.texto}
            onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))} />
          <Input type="date" className="h-8 w-40" value={a.prazo} onChange={(e) => setItens((l) => l.map((x, j) => (j === i ? { ...x, prazo: e.target.value } : x)))} />
          <button type="button" aria-label="Tirar ação" onClick={() => setItens((l) => l.filter((_, j) => j !== i))}><Trash2 className="size-4 text-muted-foreground hover:text-destructive" /></button>
        </div>
      ))}
      <div className="flex gap-2">
        {itens.length < 5 && <Button size="sm" variant="ghost" onClick={() => setItens((l) => [...l, { texto: '', prazo: '' }])}><Plus className="mr-1 size-3.5" />Ação</Button>}
        {mudou && <Button size="sm" variant="outline" disabled={ocupado} onClick={gravar}>Salvar plano</Button>}
      </div>
    </div>
  );
}

export function Entrega({ entrega, enviar, onPronto, nome, salvarPlano }) {
  const [dia, setDia] = useState(entrega?.devolutiva_dia || new Date().toISOString().slice(0, 10));
  const [obs, setObs] = useState(entrega?.devolutiva_obs || '');
  const [ocupado, setOcupado] = useState(false);
  const liberado = !!entrega?.liberado_em;
  async function chamar(dados, ok) {
    setOcupado(true);
    try { await enviar(dados); toast.success(ok); onPronto?.(); } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  }
  return (
    <div className="rounded-md border p-3 space-y-3 bg-muted/20">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm">
          {liberado ? <>✓ Liberado para {nome} em {new Date(entrega.liberado_em).toLocaleDateString('pt-BR')}</>
            : <>{nome} ainda não vê este resultado.</>}
        </p>
        {!liberado && (
          <Button size="sm" disabled={ocupado} onClick={() => chamar({ liberar: true }, 'Resultado enviado.')}>Enviar resultado</Button>
        )}
      </div>
      {liberado && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {entrega.devolutiva_dia ? `Devolutiva registrada em ${new Date(`${entrega.devolutiva_dia}T12:00:00`).toLocaleDateString('pt-BR')}.` : 'Registre quando conversar com a pessoa sobre o resultado.'}
          </p>
          <div className="flex gap-2 flex-wrap items-start">
            <Input type="date" className="w-40" value={dia} onChange={(e) => setDia(e.target.value)} />
            <Textarea rows={2} className="flex-1 min-w-[200px]" placeholder="Anotação da conversa (só você e o RH veem)" maxLength={5000}
              value={obs} onChange={(e) => setObs(e.target.value)} />
            <Button size="sm" variant="outline" disabled={ocupado || !dia}
              onClick={() => chamar({ devolutiva_dia: dia, devolutiva_obs: obs || null }, 'Devolutiva registrada.')}>
              {entrega.devolutiva_dia ? 'Atualizar devolutiva' : 'Registrar devolutiva'}
            </Button>
          </div>
          {salvarPlano && <EditorPlano plano={entrega.plano} salvar={salvarPlano} onPronto={onPronto} />}
        </div>
      )}
    </div>
  );
}

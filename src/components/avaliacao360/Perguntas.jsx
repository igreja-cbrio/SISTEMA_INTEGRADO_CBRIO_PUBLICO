import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, EyeOff, Minus, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import { avaliacao360 } from '../../api';
import './tema.css';






const EIXO = {
  resultado: { nome: 'Resultado', dica: 'eixo horizontal da 9-box', chip: 'a360-res' },
  comportamento: { nome: 'Comportamento', dica: 'eixo vertical da 9-box', chip: 'a360-comp' },
};
const ROTULOS_6 = ['Discordo totalmente', 'Discordo', 'Discordo em parte', 'Concordo em parte', 'Concordo', 'Concordo totalmente'];
let seq = 0;
const chave = () => `n${++seq}`;

function Chip({ c, n, cfg, ativo, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors ${EIXO[c.eixo]?.chip || ''} ${ativo ? 'outline outline-2 outline-offset-1 outline-current' : ''}`}>
      {cfg?.visivel === false && <EyeOff className="size-3.5" aria-label="oculto no resultado" />}
      {c.nome}
      {cfg && Number(cfg.peso) !== 1 && <span className="text-[11px] font-semibold">×{String(Number(cfg.peso)).replace('.', ',')}</span>}
      {n > 0 && <span className="rounded-full bg-background/70 px-1.5 text-[11px] tabular-nums">{n}</span>}
    </button>
  );
}


function DetalheCriterio({ c, cfg, cicloId, editavel, enviado, usado, onMudou, onFechar }) {
  const [desc, setDesc] = useState(c.descricao || '');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setDesc(c.descricao || ''); }, [c]);
  const peso = Number(cfg?.peso ?? 1);
  const pesoPcs = Number(c.peso_pcs ?? 1);
  async function salvarPesoPcs(v) {
    setOcupado(true);
    try {
      await avaliacao360.pesoPcs(c.id, v);
      toast.success(v === 0 ? 'Este critério não entra no aviso do PCS.' : 'Peso no PCS ajustado.');
      await onMudou();
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  }
  async function salvarCfg(dados, ok) {
    setOcupado(true);
    try { await avaliacao360.configCriterio(cicloId, c.id, dados); toast.success(ok); await onMudou(); }
    catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  }
  async function salvarDesc() {
    setOcupado(true);
    try { await avaliacao360.editarCompetencia(c.id, { descricao: desc.trim() || null }); toast.success('Descrição salva.'); await onMudou(); }
    catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  }
  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{c.nome}</p>
          <p className="text-xs text-muted-foreground">{EIXO[c.eixo]?.nome} · {EIXO[c.eixo]?.dica}{c.aplica_a === 'gestores' ? ' · só para quem é gestor' : ''}</p>
        </div>
        <button type="button" onClick={onFechar} aria-label="Fechar"><X className="size-4" /></button>
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_auto_auto_auto]">
        <div className="space-y-1.5">
          <span className="text-xs font-medium">Descrição</span>
          <Textarea rows={2} value={desc} disabled={!editavel} maxLength={2000} placeholder="O que este critério quer dizer (aparece para quem responde e no resultado)"
            onChange={(e) => setDesc(e.target.value)} />
          {editavel && desc !== (c.descricao || '') && <Button size="sm" variant="outline" disabled={ocupado} onClick={salvarDesc}>Salvar descrição</Button>}
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-medium">Peso na nota</span>
          <div className="inline-flex items-center rounded-md border">
            <button type="button" className="px-2 py-1.5 disabled:opacity-40" disabled={!usado || !editavel || ocupado || peso <= 0.5}
              onClick={() => salvarCfg({ peso: Math.max(0.5, peso - 0.5) }, 'Peso ajustado.')} aria-label="Diminuir peso"><Minus className="size-3.5" /></button>
            <span className="w-12 text-center font-semibold tabular-nums">×{String(peso).replace('.', ',')}</span>
            <button type="button" className="px-2 py-1.5 disabled:opacity-40" disabled={!usado || !editavel || ocupado || peso >= 9.5}
              onClick={() => salvarCfg({ peso: Math.min(9.5, peso + 0.5) }, 'Peso ajustado.')} aria-label="Aumentar peso"><Plus className="size-3.5" /></button>
          </div>
          <span className="block max-w-[11rem] text-[11px] text-muted-foreground">Quanto este critério pesa no eixo e na nota final.</span>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-medium">Aparece no resultado</span>
          <div className="flex items-center gap-2">
            <Switch checked={cfg?.visivel !== false} disabled={!usado || enviado === 'encerrado' || ocupado}
              onCheckedChange={(v) => salvarCfg({ visivel: v }, v ? 'O critério aparece no resultado.' : 'O critério fica oculto no resultado da pessoa.')} />
            <span className="text-sm">{cfg?.visivel === false ? 'Oculto' : 'Visível'}</span>
          </div>
          <span className="block max-w-[12rem] text-[11px] text-muted-foreground">Oculto: continua contando na nota, mas a pessoa avaliada não vê.</span>
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-medium">Peso no aviso do PCS</span>
          <div className="inline-flex items-center rounded-md border">
            <button type="button" className="px-2 py-1.5 disabled:opacity-40" disabled={ocupado || pesoPcs <= 0}
              onClick={() => salvarPesoPcs(Math.max(0, pesoPcs - 0.5))} aria-label="Diminuir peso no PCS"><Minus className="size-3.5" /></button>
            <span className="w-14 text-center font-semibold tabular-nums">{pesoPcs === 0 ? 'Fora' : `×${String(pesoPcs).replace('.', ',')}`}</span>
            <button type="button" className="px-2 py-1.5 disabled:opacity-40" disabled={ocupado || pesoPcs >= 5}
              onClick={() => salvarPesoPcs(Math.min(5, pesoPcs + 0.5))} aria-label="Aumentar peso no PCS"><Plus className="size-3.5" /></button>
          </div>
          <span className="block max-w-[12rem] text-[11px] text-muted-foreground">Quanto pesa no aviso de revisão de cargo. Não muda a nota da 360. Vale para todo ciclo.</span>
        </div>
      </div>
      {!usado && <p className="mt-3 text-xs a360-alerta">Escreva ao menos uma pergunta com este critério para ajustar peso e visibilidade.</p>}
    </div>
  );
}

function NovoCriterio({ onCriado, onCancelar }) {
  const [nome, setNome] = useState('');
  const [eixo, setEixo] = useState('comportamento');
  const [aplica, setAplica] = useState('todos');
  const [ocupado, setOcupado] = useState(false);
  async function criar() {
    setOcupado(true);
    try {
      const c = await avaliacao360.criarCompetencia({ nome, eixo, aplica_a: aplica });
      toast.success(`Critério "${c.nome}" criado.`);
      onCriado(c);
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2.5">
      <Input autoFocus className="h-9 w-56" placeholder="Nome do critério" value={nome} maxLength={200} onChange={(e) => setNome(e.target.value)} />
      <select className="h-9 rounded-md border bg-background px-2 text-sm" value={eixo} onChange={(e) => setEixo(e.target.value)}>
        <option value="resultado">Resultado (eixo horizontal)</option>
        <option value="comportamento">Comportamento (eixo vertical)</option>
      </select>
      <select className="h-9 rounded-md border bg-background px-2 text-sm" value={aplica} onChange={(e) => setAplica(e.target.value)}>
        <option value="todos">Para todos</option>
        <option value="gestores">Só para quem é gestor</option>
      </select>
      <Button size="sm" disabled={ocupado || nome.trim().length < 2} onClick={criar}>Criar critério</Button>
      <Button size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
    </div>
  );
}


export function Escala({ max, rotulos, onChange, disabled }) {
  const nomes = Array.from({ length: max }, (_, i) => rotulos?.[i] ?? '');
  function pontos(n) {
    const m = Math.max(3, Math.min(10, n));
    onChange({ escala_max: m, escala_rotulos: Array.from({ length: m }, (_, i) => nomes[i] || '') });
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-sm">Resposta de 1 a</span>
        <div className="inline-flex items-center rounded-md border">
          <button type="button" className="px-2 py-1.5 disabled:opacity-40" disabled={disabled || max <= 3} onClick={() => pontos(max - 1)} aria-label="Menos um ponto"><Minus className="size-3.5" /></button>
          <span className="w-8 text-center font-semibold tabular-nums">{max}</span>
          <button type="button" className="px-2 py-1.5 disabled:opacity-40" disabled={disabled || max >= 10} onClick={() => pontos(max + 1)} aria-label="Mais um ponto"><Plus className="size-3.5" /></button>
        </div>
        {!disabled && max === 6 && nomes.every((n) => !n) && (
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => onChange({ escala_max: 6, escala_rotulos: ROTULOS_6 })}>
            Usar os nomes do Feedz
          </button>
        )}
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${max}, minmax(0, 1fr))` }}>
        {nomes.map((n, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <span className="flex size-9 items-center justify-center rounded-full border-2 border-primary/40 text-sm font-semibold">{i + 1}</span>
            <textarea rows={2} disabled={disabled} value={n} maxLength={60} placeholder="sem nome"
              onChange={(e) => onChange({ escala_max: max, escala_rotulos: nomes.map((x, j) => (j === i ? e.target.value : x)) })}
              className="w-full resize-none rounded-md border bg-background px-1.5 py-1 text-center text-[11px] leading-tight placeholder:text-muted-foreground/60 disabled:opacity-70" />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Dê nome a todos os pontos ou deixe todos em branco (aparecem só os números).</p>
    </div>
  );
}


export default function Perguntas({ ciclo, editavel, onSalvo }) {
  const [catalogo, setCatalogo] = useState([]);
  const [lista, setLista] = useState([]);
  const [original, setOriginal] = useState('');
  const [novoCrit, setNovoCrit] = useState(false);
  const [filtro, setFiltro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    avaliacao360.competencias().then(setCatalogo).catch((e) => toast.error(e.message));
  }, []);
  useEffect(() => {
    const l = (ciclo.perguntas || []).map((p) => ({ k: chave(), competencia_id: p.competencia?.id, texto: p.texto, ajuda: p.ajuda || '' }));
    setLista(l);
    setOriginal(JSON.stringify(l.map(({ k, ...r }) => r)));
  }, [ciclo]);

  const porId = useMemo(() => {
    const m = new Map(catalogo.map((c) => [c.id, c]));
    for (const p of ciclo.perguntas || []) if (p.competencia && !m.has(p.competencia.id)) m.set(p.competencia.id, p.competencia);
    return m;
  }, [catalogo, ciclo.perguntas]);
  const usados = useMemo(() => lista.reduce((m, p) => m.set(p.competencia_id, (m.get(p.competencia_id) || 0) + 1), new Map()), [lista]);
  const sujo = editavel && JSON.stringify(lista.map(({ k, ...r }) => r)) !== original;
  const visiveis = filtro ? lista.filter((p) => p.competencia_id === filtro) : lista;
  const cfgPorId = useMemo(() => new Map((ciclo.competencias || []).map((v) => [v.competencia?.id, v])), [ciclo.competencias]);
  const semUso = [...porId.values()].filter((c) => !usados.get(c.id));

  const mudar = (k, campo, v) => setLista((l) => l.map((p) => (p.k === k ? { ...p, [campo]: v } : p)));
  const mover = (k, d) => setLista((l) => {
    const i = l.findIndex((p) => p.k === k); const j = i + d;
    if (j < 0 || j >= l.length) return l;
    const c = [...l]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });
  const adicionar = (competencia_id) => setLista((l) => [...l, { k: chave(), competencia_id: competencia_id || filtro || catalogo[0]?.id, texto: '', ajuda: '' }]);

  async function salvar() {
    if (lista.some((p) => p.texto.trim().length < 3)) return toast.error('Toda pergunta precisa de pelo menos 3 caracteres.');
    setSalvando(true);
    try {
      await avaliacao360.salvarPerguntas(ciclo.id, lista.map((p) => ({ competencia_id: p.competencia_id, texto: p.texto.trim(), ajuda: p.ajuda.trim() || null })));
      toast.success('Perguntas salvas.');
      await onSalvo();
    } catch (e) { toast.error(e.message); } finally { setSalvando(false); }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-muted/40 p-4 text-sm leading-relaxed">
        <b>Como funciona:</b> os <b>critérios</b> são etiquetas, como <i>Perseverança</i>. Cada <b>pergunta</b> do formulário leva um
        critério. A nota de um critério é a média das perguntas dele, e os critérios de <span className="a360-res-txt">Resultado</span> e
        de <span className="a360-comp-txt">Comportamento</span> formam os dois eixos da 9-box.
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="font-medium">Critérios</h4>
          {filtro ? <button type="button" className="text-xs text-primary hover:underline" onClick={() => setFiltro(null)}>Mostrar todas as perguntas</button>
            : <span className="text-xs text-muted-foreground">Clique num critério para ver as perguntas dele, a descrição, o peso e se aparece no resultado.</span>}
        </div>
        {['resultado', 'comportamento'].map((eixo) => {
          const cs = [...porId.values()].filter((c) => c.eixo === eixo && (usados.get(c.id) || editavel));
          return (
            <div key={eixo} className="flex flex-wrap items-center gap-2">
              <span className="w-32 shrink-0 text-xs text-muted-foreground">{EIXO[eixo].nome}<br />{EIXO[eixo].dica}</span>
              {cs.map((c) => <Chip key={c.id} c={c} cfg={cfgPorId.get(c.id)} n={usados.get(c.id) || 0} ativo={filtro === c.id} onClick={() => setFiltro(filtro === c.id ? null : c.id)} />)}
            </div>
          );
        })}
        {filtro && porId.get(filtro) && (
          <DetalheCriterio c={porId.get(filtro)} cfg={cfgPorId.get(filtro)} cicloId={ciclo.id} editavel={editavel} enviado={ciclo.status}
            usado={cfgPorId.has(filtro)} onFechar={() => setFiltro(null)}
            onMudou={async () => { await onSalvo(); avaliacao360.competencias().then(setCatalogo).catch(() => {}); }} />
        )}
        {editavel && (novoCrit
          ? <NovoCriterio onCancelar={() => setNovoCrit(false)} onCriado={(c) => { setCatalogo((x) => [...x, c]); setNovoCrit(false); adicionar(c.id); }} />
          : <Button size="sm" variant="outline" onClick={() => setNovoCrit(true)}><Plus className="mr-1 size-3.5" />Novo critério</Button>)}
        {editavel && semUso.length > 0 && <p className="text-xs text-muted-foreground">Critério sem pergunta não entra no ciclo.</p>}
      </div>

      <div className="space-y-3">
        <h4 className="font-medium">Perguntas <span className="font-normal text-muted-foreground">({lista.length})</span></h4>
        <ol className="space-y-2">
          {visiveis.map((p) => {
            const c = porId.get(p.competencia_id);
            const n = lista.indexOf(p) + 1;
            return (
              <li key={p.k} className="group flex gap-3 rounded-lg border bg-card p-3">
                <span className="mt-1.5 w-6 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{n}</span>
                <div className="min-w-0 flex-1 space-y-2">
                  {editavel ? (
                    <>
                      <Textarea rows={1} value={p.texto} maxLength={500} placeholder="Escreva a pergunta (ex.: Assume grandes desafios?)"
                        className="min-h-[38px] resize-y text-sm font-medium" onChange={(e) => mudar(p.k, 'texto', e.target.value)} />
                      <Input value={p.ajuda} maxLength={1000} placeholder="Explicação para quem responde (opcional)"
                        className="h-8 text-xs" onChange={(e) => mudar(p.k, 'ajuda', e.target.value)} />
                    </>
                  ) : (
                    <div><p className="text-sm font-medium">{p.texto}</p>{p.ajuda && <p className="text-xs text-muted-foreground">{p.ajuda}</p>}</div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Critério</span>
                    {editavel ? (
                      <select value={p.competencia_id || ''} onChange={(e) => mudar(p.k, 'competencia_id', e.target.value)}
                        className={`h-7 rounded-full border-0 px-3 text-xs ${EIXO[c?.eixo]?.chip || ''}`}>
                        {['resultado', 'comportamento'].map((eixo) => (
                          <optgroup key={eixo} label={EIXO[eixo].nome}>
                            {[...porId.values()].filter((x) => x.eixo === eixo).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    ) : c && <span className={`rounded-full px-3 py-0.5 text-xs ${EIXO[c.eixo]?.chip}`}>{c.nome}</span>}
                  </div>
                </div>
                {editavel && (
                  <div className="flex flex-col gap-1 opacity-60 group-hover:opacity-100 group-focus-within:opacity-100">
                    <button type="button" aria-label="Subir" onClick={() => mover(p.k, -1)}><ArrowUp className="size-4" /></button>
                    <button type="button" aria-label="Descer" onClick={() => mover(p.k, 1)}><ArrowDown className="size-4" /></button>
                    <button type="button" aria-label="Apagar pergunta" onClick={() => setLista((l) => l.filter((x) => x.k !== p.k))}>
                      <Trash2 className="size-4 text-destructive" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {editavel && (
          <Button variant="outline" className="w-full border-dashed" onClick={() => adicionar()}>
            <Plus className="mr-1 size-4" />Adicionar pergunta{filtro ? ` em ${porId.get(filtro)?.nome}` : ''}
          </Button>
        )}
      </div>

      {sujo && (
        <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
          <span className="text-sm">Você alterou as perguntas.</span>
          <span className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setLista(JSON.parse(original).map((r) => ({ ...r, k: chave() })))}>Descartar</Button>
            <Button size="sm" disabled={salvando || !lista.length} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar perguntas'}</Button>
          </span>
        </div>
      )}
    </div>
  );
}

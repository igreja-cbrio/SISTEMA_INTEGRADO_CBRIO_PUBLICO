import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Maximize2, Minus, Network, Plus, Search, Trash2, UserMinus, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { avaliacao360 } from '../../api';
import { COR_PAPEL } from './Pesos';
import './tema.css';






const PAPEL = {
  gestor: { nome: 'Gestor', cor: COR_PAPEL.gestor },
  par: { nome: 'Par', cor: COR_PAPEL.outros },
  liderado: { nome: 'Liderado', cor: '#b45309' },
};
const ALERTA = {
  sem_gestor: 'Sem gestor avaliando',
  sem_pares: 'Sem pares',
  par_abaixo_do_piso: 'Menos de 3 pares: a nota dos pares não vai aparecer (sigilo)',
  liderado_abaixo_do_piso: 'Menos de 3 liderados: a nota dos liderados não vai aparecer (sigilo)',
  par_no_limite: 'Exatamente 3 pares: se um não responder, a nota dos pares some',
  liderado_no_limite: 'Exatamente 3 liderados: se um não responder, a nota deles some',
};
const iniciais = (n) => String(n || '?').split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

function Avatar({ nome, tam = 'size-9', destaque }) {
  return (
    <span className={`${tam} inline-flex shrink-0 items-center justify-center rounded-full text-xs font-semibold ${destaque ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
      {iniciais(nome)}
    </span>
  );
}

function PapelPill({ papel, onChange, disabled }) {
  const p = PAPEL[papel];
  if (!onChange) {
    return <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs"><span className="size-2 rounded-full" style={{ background: p?.cor }} />{p?.nome}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border pl-2.5 text-xs">
      <span className="size-2 rounded-full" style={{ background: p?.cor }} />
      <select value={papel} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="h-6 rounded-full bg-transparent pr-2 text-xs focus:outline-none" aria-label="Como avalia">
        {Object.entries(PAPEL).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}
      </select>
    </span>
  );
}




function QuemAvalia({ cicloId, pessoaId, colaboradores, avaliadosIds, editavel, onFechar, onSalvo }) {
  const [dados, setDados] = useState(null);
  const [sel, setSel] = useState(new Map());
  const [incluir, setIncluir] = useState(true);
  const [busca, setBusca] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    avaliacao360.pessoa(cicloId, pessoaId).then((d) => {
      setDados(d);
      const sug = new Map(d.sugestao.map((s) => [s.avaliador.id, s.papel]));
      const base = d.no_ciclo ? d.atuais : d.sugestao;
      setSel(new Map(base.map((a) => [a.avaliador.id, { avaliador: a.avaliador, papel: a.papel, sugerido: sug.get(a.avaliador.id) || null }])));
      setIncluir(!d.no_ciclo);
    }).catch((e) => { toast.error(e.message); onFechar(); });
  }, [cicloId, pessoaId, onFechar]);

  const sugestao = useMemo(() => new Map((dados?.sugestao || []).map((s) => [s.avaliador.id, s.papel])), [dados]);
  const q = busca.trim().toLowerCase();
  const lista = useMemo(() => colaboradores
    .filter((c) => c.id !== pessoaId && (!q || `${c.nome} ${c.cargo || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => (sugestao.has(b.id) - sugestao.has(a.id)) || a.nome.localeCompare(b.nome)), [colaboradores, pessoaId, q, sugestao]);

  const marcados = [...sel.values()];
  const conta = (p) => marcados.filter((l) => l.papel === p).length;
  const novosAvaliados = marcados.filter((l) => !avaliadosIds.has(l.avaliador.id));
  const avisos = [];
  if (!conta('gestor')) avisos.push('Ninguém avalia como gestor — o peso do gestor vai para os outros.');
  if (conta('par') > 0 && conta('par') < 3) avisos.push('Menos de 3 pares: a nota dos pares não aparece (sigilo).');
  if (conta('liderado') > 0 && conta('liderado') < 3) avisos.push('Menos de 3 liderados: a nota deles não aparece (sigilo).');
  if (conta('par') === 3) avisos.push('Exatamente 3 pares: se um não responder, a nota dos pares some. Se der, inclua 4 ou 5.');
  if (conta('liderado') === 3) avisos.push('Exatamente 3 liderados: se um não responder, a nota deles some.');

  function alternar(c) {
    setSel((m) => {
      const n = new Map(m);
      if (n.has(c.id)) n.delete(c.id);
      else n.set(c.id, { avaliador: c, papel: sugestao.get(c.id) || 'par', sugerido: sugestao.get(c.id) || null });
      return n;
    });
  }
  const papel = (id, p) => setSel((m) => new Map(m).set(id, { ...m.get(id), papel: p }));

  async function salvar() {
    setOcupado(true);
    try {
      const r = await avaliacao360.definirAvaliados(cicloId, pessoaId, {
        avaliadores: marcados.map((l) => ({ avaliador_id: l.avaliador.id, papel: l.papel })),
        incluir_avaliadores: incluir,
      });
      toast.success(`${dados.pessoa.nome.split(' ')[0]}: ${r.avaliadores} avaliador${r.avaliadores === 1 ? '' : 'es'} + autoavaliação.`
        + (r.incluidos ? ` ${r.incluidos} entraram como avaliados.` : ''));
      onSalvo();
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  }
  async function tirar() {
    setOcupado(true);
    try {
      await avaliacao360.removerAvaliado(cicloId, pessoaId);
      toast.success(`${dados.pessoa.nome.split(' ')[0]} saiu da avaliação (continua avaliando os outros).`);
      onSalvo();
    } catch (e) { toast.error(e.message); } finally { setOcupado(false); }
  }

  const ordem = { gestor: 0, par: 1, liderado: 2 };
  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        {!dados ? (
          <DialogHeader><DialogTitle>Carregando…</DialogTitle><DialogDescription>Buscando quem avalia esta pessoa.</DialogDescription></DialogHeader>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Quem avalia {dados.pessoa.nome}</DialogTitle>
              <DialogDescription>Marque quem avalia e escolha como cada um avalia. O sistema sugere pela hierarquia; você muda o que quiser.</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2 lg:grid-cols-[0.9fr_1.2fr_1.2fr]">
              {              }
              <div className="space-y-4 rounded-xl border p-4">
                <p className="text-sm font-semibold">Avaliado</p>
                <div className="flex items-center gap-3">
                  <Avatar nome={dados.pessoa.nome} tam="size-11" destaque />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{dados.pessoa.nome}</span>
                    <span className="block text-xs text-muted-foreground">{dados.pessoa.cargo || '—'}</span>
                  </span>
                </div>
                <ul className="space-y-1.5 text-sm">
                  <li className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: COR_PAPEL.auto }} />Autoavaliação</li>
                  {['gestor', 'par', 'liderado'].map((p) => (
                    <li key={p} className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: PAPEL[p].cor }} />
                      {conta(p)} {p === 'gestor' ? (conta(p) === 1 ? 'gestor' : 'gestores') : p === 'par' ? (conta(p) === 1 ? 'par' : 'pares') : (conta(p) === 1 ? 'liderado' : 'liderados')}
                    </li>
                  ))}
                </ul>
                {avisos.length > 0 && (
                  <ul className="space-y-1 text-xs a360-alerta">
                    {avisos.map((a) => <li key={a} className="flex gap-1.5"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{a}</li>)}
                  </ul>
                )}
                {editavel && novosAvaliados.length > 0 && (
                  <label className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
                    <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={incluir} onChange={(e) => setIncluir(e.target.checked)} />
                    <span>Incluir também como <b>avaliados</b> os {novosAvaliados.length} avaliadores que ainda não estão no ciclo
                      <span className="mt-0.5 block text-muted-foreground">{novosAvaliados.map((l) => l.avaliador.nome.split(' ')[0]).join(', ')}</span>
                    </span>
                  </label>
                )}
              </div>

              {                   }
              <div className="flex min-h-0 flex-col rounded-xl border p-4">
                <p className="mb-2 text-sm font-semibold">Colaboradores</p>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input className="h-9 pl-8" placeholder="Buscar" value={busca} onChange={(e) => setBusca(e.target.value)} disabled={!editavel} />
                </div>
                <ul className="max-h-[52vh] flex-1 divide-y overflow-y-auto rounded-lg border">
                  {lista.map((c) => {
                    const m = sel.has(c.id);
                    return (
                      <li key={c.id}>
                        <label className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${m ? 'bg-primary/5' : 'hover:bg-muted/60'}`}>
                          <input type="checkbox" className="size-4 accent-primary" checked={m} disabled={!editavel} onChange={() => alternar(c)} />
                          <Avatar nome={c.nome} tam="size-8" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{c.nome}</span>
                            <span className="block truncate text-xs text-muted-foreground">{c.cargo || '—'}</span>
                          </span>
                          {sugestao.has(c.id) && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">sugerido · {PAPEL[sugestao.get(c.id)].nome.toLowerCase()}</span>}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {                  }
              <div className="flex flex-col rounded-xl border border-primary/25 bg-primary/[0.04] p-4">
                <p className="mb-2 text-sm font-semibold">Avaliadores selecionados <span className="font-normal text-muted-foreground">({marcados.length})</span></p>
                {!marcados.length && <p className="text-sm text-muted-foreground">Marque pessoas na lista ao lado.</p>}
                <ul className="max-h-[56vh] divide-y overflow-y-auto">
                  {marcados.sort((a, b) => ordem[a.papel] - ordem[b.papel] || a.avaliador.nome.localeCompare(b.avaliador.nome)).map((l) => (
                    <li key={l.avaliador.id} className="flex items-center gap-3 py-2.5">
                      <Avatar nome={l.avaliador.nome} tam="size-9" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{l.avaliador.nome}</span>
                        <span className="block truncate text-xs text-muted-foreground">{l.avaliador.cargo || '—'}</span>
                        {l.sugerido && l.sugerido !== l.papel && <span className="block text-[11px] text-muted-foreground">a hierarquia sugere {PAPEL[l.sugerido].nome.toLowerCase()}</span>}
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-[10px] text-muted-foreground">avalia como</span>
                        <PapelPill papel={l.papel} disabled={!editavel} onChange={editavel ? (v) => papel(l.avaliador.id, v) : undefined} />
                      </span>
                      {editavel && (
                        <button type="button" className="rounded-md p-1.5 text-destructive hover:bg-destructive/10" aria-label={`Tirar ${l.avaliador.nome}`} onClick={() => alternar(l.avaliador)}>
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {editavel && (
              <DialogFooter className="gap-2 sm:justify-between">
                {dados.no_ciclo ? (
                  <Button variant="ghost" className="text-destructive" disabled={ocupado} onClick={tirar}><UserMinus className="mr-1 size-4" />Tirar da avaliação</Button>
                ) : <span />}
                <span className="flex gap-2">
                  <Button variant="outline" onClick={onFechar}>Cancelar</Button>
                  <Button disabled={ocupado} onClick={salvar}>{dados.no_ciclo ? 'Salvar' : 'Incluir na avaliação'}</Button>
                </span>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}


function No({ p, porGestor, info, abertos, alternar, onAbrir, busca }) {
  const meus = porGestor.get(p.id) || [];
  const aberto = abertos.has(p.id);
  const i = info.get(p.id);
  const bate = busca && p.nome.toLowerCase().includes(busca);
  return (
    <li>
      <div data-bate={bate ? '1' : undefined} className={`org360-no relative inline-flex w-36 flex-col items-center gap-0.5 rounded-lg border bg-card px-1.5 pb-2 pt-2 text-center
        ${i ? 'border-primary/70 shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]' : 'border-dashed border-muted-foreground/40'} ${bate ? 'outline outline-2 outline-offset-2 outline-amber-400' : ''}`}>
        <button type="button" className="flex flex-col items-center gap-1" onClick={() => onAbrir(p.id)}>
          <Avatar nome={p.nome} destaque={!!i} tam="size-7" />
          <span className="line-clamp-2 text-[11px] font-medium leading-tight">{p.nome}</span>
          <span className="line-clamp-1 text-[11px] text-muted-foreground">{p.cargo || ' '}</span>
        </button>
        {i ? (
          <button type="button" onClick={() => onAbrir(p.id)} className="flex items-center gap-1 text-[11px] text-primary">
            {i.alertas.length > 0 && <AlertTriangle className="size-3 a360-alerta" />}
            {i.total} avaliador{i.total === 1 ? '' : 'es'}
          </button>
        ) : (
          <button type="button" onClick={() => onAbrir(p.id)} className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-primary">
            <Plus className="size-3" />Incluir
          </button>
        )}
        {meus.length > 0 && (
          <button type="button" onClick={() => alternar(p.id)} aria-label={aberto ? 'Recolher equipe' : 'Abrir equipe'}
            className="absolute -bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border bg-background px-1.5 text-[10px] text-muted-foreground">
            {aberto ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}{meus.length}
          </button>
        )}
      </div>
      {aberto && meus.length > 0 && (
        <ul>{meus.map((f) => <No key={f.id} p={f} porGestor={porGestor} info={info} abertos={abertos} alternar={alternar} onAbrir={onAbrir} busca={busca} />)}</ul>
      )}
    </li>
  );
}

const CSS_ORG = `
.org360 ul { position: relative; display: flex; justify-content: center; padding-top: 22px; margin: 0; }
.org360 > ul { padding-top: 0; }
.org360 li { position: relative; list-style: none; padding: 22px 4px 0; text-align: center; }
.org360 > ul > li { padding-top: 0; }
.org360 li::before, .org360 li::after { content: ''; position: absolute; top: 0; right: 50%; width: 50%; height: 22px; border-top: 1.5px solid hsl(var(--muted-foreground) / 0.45); }
.org360 li::after { right: auto; left: 50%; border-left: 1.5px solid hsl(var(--muted-foreground) / 0.45); }
.org360 li:only-child::before, .org360 li:only-child::after { display: none; }
.org360 li:only-child { padding-top: 22px; }
.org360 > ul > li:only-child { padding-top: 0; }
.org360 li:first-child::before, .org360 li:last-child::after { border: 0 none; }
.org360 li:last-child::before { border-right: 1.5px solid hsl(var(--muted-foreground) / 0.45); border-radius: 0 8px 0 0; }
.org360 li:first-child::after { border-radius: 8px 0 0 0; }
.org360 ul ul::before { content: ''; position: absolute; top: 0; left: 50%; height: 22px; border-left: 1.5px solid hsl(var(--muted-foreground) / 0.45); }
`;




function Organograma({ colaboradores, info, onAbrir, onFechar }) {
  const ids = useMemo(() => new Set(colaboradores.map((c) => c.id)), [colaboradores]);
  const porGestor = useMemo(() => {
    const m = new Map();
    for (const c of colaboradores) {
      if (c.gestor_id && ids.has(c.gestor_id) && c.gestor_id !== c.id) m.set(c.gestor_id, [...(m.get(c.gestor_id) || []), c]);
    }
    for (const v of m.values()) v.sort((a, b) => a.nome.localeCompare(b.nome));
    return m;
  }, [colaboradores, ids]);
  const raizes = useMemo(() => colaboradores.filter((c) => !c.gestor_id || !ids.has(c.gestor_id) || c.gestor_id === c.id)
    .sort((a, b) => a.nome.localeCompare(b.nome)), [colaboradores, ids]);



  const [abertos, setAbertos] = useState(() => {
    const ids = new Set(colaboradores.map((c) => c.id));
    const raizes = colaboradores.filter((c) => !c.gestor_id || !ids.has(c.gestor_id) || c.gestor_id === c.id).map((c) => c.id);
    const filhos = colaboradores.filter((c) => raizes.includes(c.gestor_id)).map((c) => c.id);
    return new Set([...raizes, ...filhos]);
  });
  const [busca, setBusca] = useState('');
  const [vista, setVista] = useState({ x: 0, y: 0, z: 0.85 });
  const palco = useRef(null);
  const conteudo = useRef(null);
  const arrasto = useRef(null);
  const q = busca.trim().toLowerCase();
  const alternar = (id) => setAbertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });


  const enquadrar = useCallback(() => {
    const p = palco.current; const c = conteudo.current;
    if (!p || !c) return;
    const w = c.scrollWidth; const h = c.scrollHeight;

    const z = Math.max(0.3, Math.min(0.85, (p.clientWidth - 48) / w, (p.clientHeight - 48) / h));
    setVista({ z, x: (p.clientWidth - w * z) / 2, y: 24 });
  }, []);



  useEffect(() => { const t = setTimeout(enquadrar, 60); return () => clearTimeout(t); }, [enquadrar]);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) onFechar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar]);

  function zoom(fator, cx, cy) {
    setVista((v) => {
      const z = Math.max(0.25, Math.min(2, v.z * fator));
      const px = cx ?? (palco.current?.clientWidth || 0) / 2;
      const py = cy ?? (palco.current?.clientHeight || 0) / 2;
      return { z, x: px - ((px - v.x) * z) / v.z, y: py - ((py - v.y) * z) / v.z };
    });
  }
  const aoRodar = (e) => { const r = palco.current.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top); };
  const aoApertar = (e) => {
    if (e.button !== 0) return;
    arrasto.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y, moveu: false };
  };
  const aoMover = (e) => {
    const a = arrasto.current; if (!a) return;
    const dx = e.clientX - a.x; const dy = e.clientY - a.y;


    if (!a.moveu && Math.abs(dx) + Math.abs(dy) > 4) { a.moveu = true; palco.current.setPointerCapture?.(e.pointerId); }
    if (a.moveu) setVista((v) => ({ ...v, x: a.vx + dx, y: a.vy + dy }));
  };
  const aoSoltar = () => { setTimeout(() => { arrasto.current = null; }, 0); };

  const aoClicarCaptura = (e) => { if (arrasto.current?.moveu) { e.stopPropagation(); e.preventDefault(); } };


  useEffect(() => {
    if (q.length < 2) return;
    const achado = colaboradores.find((c) => c.nome.toLowerCase().includes(q));
    if (achado) {
      const caminho = [];
      let g = achado.gestor_id;
      for (let i = 0; g && ids.has(g) && i < 20; i += 1) { caminho.push(g); g = colaboradores.find((c) => c.id === g)?.gestor_id; }
      if (caminho.some((x) => !abertos.has(x))) { setAbertos((s) => new Set([...s, ...caminho])); return; }
    }
    const alvo = conteudo.current?.querySelector('[data-bate="1"]');
    const p = palco.current;
    if (!alvo || !p) return;
    const r = alvo.getBoundingClientRect(); const pr = p.getBoundingClientRect();
    setVista((v) => ({ ...v, x: v.x + (pr.left + pr.width / 2) - (r.left + r.width / 2), y: v.y + (pr.top + pr.height / 2) - (r.top + r.height / 2) }));
  }, [q, abertos, colaboradores, ids]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background" role="region" aria-label="Organograma">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <p className="mr-2 font-semibold">Organograma · selecionar participantes</p>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="h-9 w-60 pl-8" placeholder="Achar pessoa" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <span className="inline-flex rounded-md border">
          <button type="button" className="px-2.5 py-1.5" onClick={() => zoom(1 / 1.2)} aria-label="Afastar"><Minus className="size-4" /></button>
          <span className="w-12 self-center text-center text-xs tabular-nums">{Math.round(vista.z * 100)}%</span>
          <button type="button" className="px-2.5 py-1.5" onClick={() => zoom(1.2)} aria-label="Aproximar"><Plus className="size-4" /></button>
        </span>
        <Button size="sm" variant="ghost" onClick={enquadrar}><Maximize2 className="mr-1 size-4" />Ver tudo</Button>
        <Button size="sm" variant="ghost" onClick={() => setAbertos(new Set(colaboradores.map((c) => c.id)))}>Abrir equipes</Button>
        <Button size="sm" variant="ghost" onClick={() => setAbertos(new Set(raizes.map((r) => r.id)))}>Recolher</Button>
        <span className="ml-auto hidden items-center gap-3 text-xs text-muted-foreground md:flex">
          <span className="flex items-center gap-1"><span className="size-3 rounded border border-primary/70" />na avaliação</span>
          <span className="flex items-center gap-1"><span className="size-3 rounded border border-dashed border-muted-foreground/60" />fora</span>
          <span>Arraste para mover · roda do mouse para zoom</span>
        </span>
        <Button size="sm" onClick={onFechar}><X className="mr-1 size-4" />Concluir</Button>
      </div>
      <style>{CSS_ORG}</style>
      <div ref={palco} className="relative flex-1 cursor-grab touch-none select-none overflow-hidden bg-muted/20 active:cursor-grabbing"
        onWheel={aoRodar} onPointerDown={aoApertar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}
        onClickCapture={aoClicarCaptura}>
        <div ref={conteudo} className="org360 absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.z})` }}>
          <ul className="w-max">
            {raizes.map((r) => (
              <No key={r.id} p={r} porGestor={porGestor} info={info} abertos={abertos} alternar={alternar} onAbrir={onAbrir} busca={q} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}


function Avisos({ pessoas, ciclo, onAbrir }) {
  const [aberto, setAberto] = useState(null);
  const pa = Math.round(Number(ciclo.peso_auto) * 100);
  const pg = Math.round(Number(ciclo.peso_gestor) * 100);
  const po = Math.round(Number(ciclo.peso_outros) * 100);
  const semGestorAuto = pa + po ? Math.round((pa / (pa + po)) * 100) : 0;
  const TIPOS = [
    ['sem_gestor', 'Ninguém avalia como gestor',
      `O peso do gestor (${pg}%) é redistribuído: a nota fica ${semGestorAuto}% autoavaliação e ${100 - semGestorAuto}% pares e liderados. Normal para quem está no topo; para os outros, falta cadastrar o gestor no RH ou incluir alguém como gestor.`],
    ['par_abaixo_do_piso', 'Só 1 ou 2 pares',
      'Com menos de 3, quem respondeu seria identificável. Ao enviar, esses convites saem e a pessoa fica sem a nota dos pares. Para manter, inclua pares até chegar a 3 (pode ser de outra equipe).'],
    ['liderado_abaixo_do_piso', 'Só 1 ou 2 liderados',
      'Mesmo motivo: ao enviar, esses convites saem e o gestor fica sem a avaliação da equipe. Para manter, a equipe precisa de pelo menos 3 pessoas avaliando.'],
    ['par_no_limite', 'Exatamente 3 pares',
      'É o mínimo para o sigilo: se UM não responder, a nota dos pares inteira some (aconteceu no piloto). Quando der, inclua 4 ou 5 pares — dá para usar gente de outra equipe.'],
    ['liderado_no_limite', 'Exatamente 3 liderados',
      'Mesma coisa com a equipe: uma falta e o gestor fica sem a avaliação dos liderados.'],
    ['sem_pares', 'Ninguém avalia como par',
      `Os ${po}% de "pares e liderados" ficam só com os liderados. Se também não houver liderados, esse peso vai para o gestor e a autoavaliação.`],
  ];
  const grupos = TIPOS.map(([k, titulo, impacto]) => ({ k, titulo, impacto, quem: pessoas.filter((p) => p.alertas.includes(k)) }))
    .filter((g) => g.quem.length);
  if (!grupos.length) return null;
  const total = new Set(grupos.flatMap((g) => g.quem.map((p) => p.avaliado.id))).size;
  return (
    <div className="rounded-xl a360-alerta-box p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="size-4 a360-alerta" />{total} {total === 1 ? 'pessoa tem' : 'pessoas têm'} aviso — dá para enviar assim, mas veja o que muda na nota
      </p>
      <ul className="space-y-2">
        {grupos.map((g) => (
          <li key={g.k} className="rounded-lg bg-background/60 p-3">
            <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setAberto(aberto === g.k ? null : g.k)}>
              <span>
                <span className="block text-sm font-medium">{g.titulo} <span className="a360-alerta">· {g.quem.length}</span></span>
                <span className="block text-xs text-muted-foreground">{g.impacto}</span>
              </span>
              {aberto === g.k ? <ChevronDown className="mt-0.5 size-4 shrink-0" /> : <ChevronRight className="mt-0.5 size-4 shrink-0" />}
            </button>
            {aberto === g.k && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {g.quem.map((p) => (
                  <button key={p.avaliado.id} type="button" onClick={() => onAbrir(p.avaliado.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs hover:border-primary">
                    <Avatar nome={p.avaliado.nome} tam="size-5" />{p.avaliado.nome}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}


function Avaliados({ pessoas, editavel, onAbrir, onTirar }) {
  const [busca, setBusca] = useState('');
  const [soAlerta, setSoAlerta] = useState(false);
  const q = busca.trim().toLowerCase();
  const lista = pessoas.filter((p) => (!soAlerta || p.alertas.length) && (!q || p.avaliado.nome.toLowerCase().includes(q)));
  const comAlerta = pessoas.filter((p) => p.alertas.length).length;
  if (!pessoas.length) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        Ninguém na avaliação ainda. Abra o organograma e clique numa pessoa para incluir.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="h-9 w-64 pl-8" placeholder="Buscar avaliado" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {comAlerta > 0 && (
          <button type="button" onClick={() => setSoAlerta((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${soAlerta ? 'a360-filtro-on' : ''}`}>
            <AlertTriangle className="size-3 a360-alerta" />{comAlerta} precisam de atenção
          </button>
        )}
      </div>
      <ul className="divide-y rounded-xl border">
        {lista.map((p) => {
          return (
            <li key={p.avaliado.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
              <Avatar nome={p.avaliado.nome} destaque />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{p.avaliado.nome}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.avaliado.cargo || '—'}</span>
                {p.alertas.length > 0 && (
                  <span className="mt-0.5 block text-xs a360-alerta" title={p.alertas.map((a) => ALERTA[a] || a).join(' · ')}>
                    <AlertTriangle className="mr-1 inline size-3.5" />{ALERTA[p.alertas[0]] || p.alertas[0]}{p.alertas.length > 1 ? ` (+${p.alertas.length - 1})` : ''}
                  </span>
                )}
              </span>
              <span className="col-span-3 flex flex-wrap items-center gap-1.5 text-xs md:col-span-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1"><span className="size-2 rounded-full" style={{ background: PAPEL.gestor.cor }} />{(() => { const g = p.avaliadores.find((a) => a.papel === 'gestor'); return g ? g.avaliador?.nome?.split(' ')[0] : 'sem gestor'; })()}</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1"><span className="size-2 rounded-full" style={{ background: PAPEL.par.cor }} />{p.contagem.par} pares</span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1"><span className="size-2 rounded-full" style={{ background: PAPEL.liderado.cor }} />{p.contagem.liderado} liderados</span>
              </span>
              <span className="row-start-1 col-start-3 flex gap-1 md:col-start-4">
                <Button size="sm" variant="outline" onClick={() => onAbrir(p.avaliado.id)}>{editavel ? 'Gerenciar' : 'Ver'}</Button>
                {editavel && <Button size="sm" variant="ghost" aria-label={`Tirar ${p.avaliado.nome}`} onClick={() => onTirar(p.avaliado)}><X className="size-4" /></Button>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Participantes({ ciclo }) {
  const [d, setD] = useState(null);
  const [tela, setTela] = useState(false);
  const [aberto, setAberto] = useState(null);
  const [montando, setMontando] = useState(false);
  const editavel = ciclo.status === 'rascunho';
  const carregar = useCallback(() => avaliacao360.avaliadores(ciclo.id).then(setD).catch((e) => toast.error(e.message)), [ciclo.id]);
  useEffect(() => { carregar(); }, [carregar]);

  const info = useMemo(() => new Map((d?.pessoas || []).filter((p) => !p.avaliado.inativo)
    .map((p) => [p.avaliado.id, { total: p.avaliadores.filter((a) => a.papel !== 'auto').length, alertas: p.alertas }])), [d]);
  const avaliadosIds = useMemo(() => new Set(info.keys()), [info]);
  const fechar = useCallback(() => setAberto(null), []);
  const fecharTela = useCallback(() => setTela(false), []);

  async function todos() {
    setMontando(true);
    try {
      const r = await avaliacao360.sugerir(ciclo.id);
      toast.success(`Hierarquia aplicada: ${r.gravados} avaliações sugeridas. Quem você tirou continua fora.`);
      await carregar();
    } catch (e) { toast.error(e.message); } finally { setMontando(false); }
  }
  async function tirar(p) {
    try {
      await avaliacao360.removerAvaliado(ciclo.id, p.id);
      toast.success(`${p.nome.split(' ')[0]} saiu da avaliação.`);
      carregar();
    } catch (e) { toast.error(e.message); }
  }

  if (!d) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const avaliados = d.pessoas.filter((p) => !p.avaliado.inativo);
  const formularios = d.pessoas.reduce((n, p) => n + p.avaliadores.length, 0);

  return (
    <div className="space-y-5">
      {                                                   }
      <button type="button" onClick={() => setTela(true)}
        className="group flex w-full items-center gap-5 rounded-xl border border-dashed border-primary/50 bg-primary/[0.04] p-5 text-left transition-colors hover:border-primary hover:bg-primary/[0.08]">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><Network className="size-6" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{editavel ? 'Selecionar participantes no organograma' : 'Ver o organograma'}</span>
          <span className="block text-sm text-muted-foreground">
            {avaliados.length} de {d.colaboradores.length} pessoas na avaliação · {formularios} formulários. Abre em tela cheia: arraste para navegar e clique numa pessoa para escolher quem a avalia.
          </span>
        </span>
        <Maximize2 className="size-5 shrink-0 text-primary transition-transform group-hover:scale-110" />
      </button>

      <Avisos pessoas={avaliados} ciclo={ciclo} onAbrir={setAberto} />

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium">Avaliados <span className="font-normal text-muted-foreground">({avaliados.length})</span></p>
        {editavel && (
          <Button size="sm" variant="ghost" className="ml-auto" disabled={montando} onClick={todos}>
            <Wand2 className="mr-1 size-4" />{montando ? 'Aplicando…' : 'Incluir todos pela hierarquia'}
          </Button>
        )}
      </div>
      <Avaliados pessoas={avaliados} editavel={editavel} onAbrir={setAberto} onTirar={tirar} />

      {tela && <Organograma colaboradores={d.colaboradores} info={info} onAbrir={setAberto} onFechar={fecharTela} />}
      {aberto && (
        <QuemAvalia cicloId={ciclo.id} pessoaId={aberto} colaboradores={d.colaboradores} avaliadosIds={avaliadosIds}
          editavel={editavel} onFechar={fechar} onSalvo={async () => { setAberto(null); await carregar(); }} />
      )}
    </div>
  );
}

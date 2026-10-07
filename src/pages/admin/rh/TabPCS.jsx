import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Award, Layers, ClipboardCheck, Gift, ScaleIcon as Scale, TrendingUp,
  History, AlertTriangle, CheckCircle2, ArrowUpRight, Wallet, Settings2,
  ChevronRight, Search, RotateCcw, Sparkles, X, Calculator,
} from 'lucide-react';
import TabAvaliacoes from './TabAvaliacoes';
import { pcs, rh, avaliacao360 } from '../../../api';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Select as ShadSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { ScrollArea, ScrollBar } from '../../../components/ui/scroll-area';

const C = {
  primary: '#00B39D', primaryBg: '#00B39D18',
  green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418',
  amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
  purple: '#8b5cf6', purpleBg: '#8b5cf618',
  gray: '#737373', grayBg: '#73737318',
};

const CATEGORIA_COLOR = {
  'Operacional': { c: C.blue, bg: C.blueBg },
  'Tático': { c: C.purple, bg: C.purpleBg },
  'Estratégico': { c: C.primary, bg: C.primaryBg },
};

const ADERENCIA_LABEL = {
  adequado: { label: 'Adequado', color: C.green, bg: C.greenBg, icon: CheckCircle2 },
  abaixo: { label: 'Abaixo da faixa', color: C.amber, bg: C.amberBg, icon: AlertTriangle },
  acima: { label: 'Acima do teto', color: C.red, bg: C.redBg, icon: ArrowUpRight },
  sem_enquadramento: { label: 'Sem grau enquadrado', color: C.gray, bg: C.grayBg, icon: AlertTriangle },
  sem_salario: { label: 'Sem salário cadastrado', color: C.gray, bg: C.grayBg, icon: AlertTriangle },
};

const fmtMoney = (v) => v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtPct = (v) => v == null ? '—' : `${(Number(v) * 100).toFixed(1)}%`;


function FlashMsg({ msg, kind, onClose }) {
  if (!msg) return null;
  const colors = { success: { bg: C.greenBg, fg: C.green }, error: { bg: C.redBg, fg: C.red }, info: { bg: C.blueBg, fg: C.blue } };
  const c = colors[kind] || colors.info;
  return (
    <div className="fixed top-5 right-5 z-[9999] flex items-center gap-2 rounded-xl border bg-card p-3 pr-4 shadow-lg max-w-[420px]"
      style={{ borderLeft: `4px solid ${c.fg}`, color: c.fg }}>
      <span className="text-sm font-medium flex-1">{msg}</span>
      <button onClick={onClose}><X className="h-4 w-4" /></button>
    </div>
  );
}




function GrausTab({ flash }) {
  const [graus, setGraus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null);
  const [reajusteOpen, setReajusteOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setGraus(await pcs.graus.list()); }
    catch (e) { flash('Erro ao carregar graus: ' + e.message, 'error'); }
    finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const out = { 'Operacional': [], 'Tático': [], 'Estratégico': [] };
    for (const g of graus) (out[g.categoria] || []).push(g);
    return out;
  }, [graus]);

  if (loading) return <div className="text-center py-12 text-muted-foreground">Carregando estrutura de graus...</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Estrutura de Graus e Faixas
            </CardTitle>
            <CardDescription className="text-xs mt-1">22 graus organizados em 3 categorias. Amplitude média de faixa: 50%.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setReajusteOpen(true)}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Aplicar reajuste coletivo
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {['Operacional', 'Tático', 'Estratégico'].map(cat => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{ color: CATEGORIA_COLOR[cat].c, background: CATEGORIA_COLOR[cat].bg }}>{cat}</span>
                <span className="text-xs text-muted-foreground">{(grouped[cat] || []).length} graus</span>
              </div>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Grau</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nível</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Faixa Mín.</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Referência</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Faixa Máx.</th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pontos</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Var.</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(grouped[cat] || []).map(g => (
                      <tr key={g.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono font-semibold">{g.codigo}</td>
                        <td className="px-3 py-2">{g.nivel}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(g.faixa_min)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: C.primary }}>{fmtMoney(g.faixa_ref)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(g.faixa_max)}</td>
                        <td className="px-3 py-2 text-center text-xs text-muted-foreground">{g.pontos_min}–{g.pontos_max}</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">{g.variacao_pct}</td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => setEdit(g)}>Editar</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {edit && <EditGrauModal grau={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); flash('Grau atualizado', 'success'); }} />}
      {reajusteOpen && <ReajusteColetivoModal onClose={() => setReajusteOpen(false)} onApplied={(r) => { setReajusteOpen(false); load(); flash(`Reajuste aplicado: ${r.funcsAfetados} colaboradores · ${fmtMoney(r.custoTotal)}/mês`, 'success'); }} />}
    </div>
  );
}

function EditGrauModal({ grau, onClose, onSaved }) {
  const [form, setForm] = useState({
    nivel: grau.nivel, categoria: grau.categoria,
    faixa_min: grau.faixa_min, faixa_ref: grau.faixa_ref, faixa_max: grau.faixa_max,
    pontos_min: grau.pontos_min, pontos_max: grau.pontos_max, observacao: grau.observacao || '',
  });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await pcs.graus.update(grau.id, form);
      onSaved();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-popover rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold mb-4">Editar grau {grau.codigo}</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Nível</label>
            <input className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm" value={form.nivel} onChange={e => setForm({ ...form, nivel: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <NumField label="Faixa Mín." value={form.faixa_min} onChange={v => setForm({ ...form, faixa_min: v })} />
            <NumField label="Referência" value={form.faixa_ref} onChange={v => setForm({ ...form, faixa_ref: v })} />
            <NumField label="Faixa Máx." value={form.faixa_max} onChange={v => setForm({ ...form, faixa_max: v })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumField label="Pontos Mín." value={form.pontos_min} onChange={v => setForm({ ...form, pontos_min: v })} int />
            <NumField label="Pontos Máx." value={form.pontos_max} onChange={v => setForm({ ...form, pontos_max: v })} int />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Observação</label>
            <textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" rows={2} value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, int = false }) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">{label}</label>
      <input type="number" step={int ? 1 : 0.01}
        className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm tabular-nums"
        value={value ?? ''} onChange={e => onChange(int ? parseInt(e.target.value || 0) : parseFloat(e.target.value || 0))} />
    </div>
  );
}

function ReajusteColetivoModal({ onClose, onApplied }) {
  const [pct, setPct] = useState('');
  const [aplicarFaixas, setAplicarFaixas] = useState(true);
  const [aplicarSalarios, setAplicarSalarios] = useState(true);
  const [indice, setIndice] = useState('INPC');
  const [observacao, setObservacao] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!pct || isNaN(Number(pct))) return alert('Informe o percentual');
    if (!confirm(`Aplicar reajuste de ${pct}% ${aplicarFaixas ? '· faixas' : ''} ${aplicarSalarios ? '· salários' : ''}?`)) return;
    setSaving(true);
    try {
      const r = await pcs.graus.reajusteColetivo({
        percentual: Number(pct),
        indice_referencia: indice,
        aplicar_faixas: aplicarFaixas,
        aplicar_salarios: aplicarSalarios,
        ano: new Date().getFullYear(),
        observacao,
      });
      onApplied(r);
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-popover rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold mb-1">Reajuste coletivo</h3>
        <p className="text-xs text-muted-foreground mb-4">Aplica % sobre todas as faixas e/ou salários ativos. Gera log em progressões.</p>
        <div className="space-y-3">
          <NumField label="Percentual (%)" value={pct} onChange={v => setPct(v)} />
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Índice de referência</label>
            <input className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm" value={indice} onChange={e => setIndice(e.target.value)} placeholder="INPC, IPCA, manual..." />
          </div>
          <div className="space-y-2 py-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={aplicarFaixas} onChange={e => setAplicarFaixas(e.target.checked)} /> Reajustar faixas dos graus
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={aplicarSalarios} onChange={e => setAplicarSalarios(e.target.checked)} /> Reajustar salários dos colaboradores ativos
            </label>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Observação</label>
            <textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" rows={2} value={observacao} onChange={e => setObservacao(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Aplicando...' : 'Aplicar reajuste'}</Button>
        </div>
      </div>
    </div>
  );
}




function CriteriosTab({ flash }) {
  const [criterios, setCriterios] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setCriterios(await pcs.criterios.list()); }
    catch (e) { flash(e.message, 'error'); }
    finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const pesoTotal = criterios.reduce((acc, c) => acc + Number(c.peso || 0), 0);

  if (loading) return <div className="text-center py-12 text-muted-foreground">Carregando critérios...</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" /> Metodologia de Avaliação de Cargo
          </CardTitle>
          <CardDescription className="text-xs">
            6 fatores avaliados em 5 níveis (1 a 5). Pontuação total ponderada (100-500) mapeia em grau.
            Soma dos pesos: <span className={pesoTotal > 0.99 && pesoTotal < 1.01 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>{(pesoTotal * 100).toFixed(0)}%</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Fator</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Peso</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">N1 Básico</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">N2 Elementar</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">N3 Intermediário</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">N4 Avançado</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">N5 Especialista</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Pts</th>
                </tr>
              </thead>
              <tbody>
                {criterios.map(c => (
                  <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2 font-semibold">{c.nome}<div className="text-xs text-muted-foreground font-normal">{c.descricao}</div></td>
                    <td className="px-3 py-2 text-center font-semibold tabular-nums">{(Number(c.peso) * 100).toFixed(0)}%</td>
                    {[1, 2, 3, 4, 5].map(n => {
                      const nv = c.niveis?.find(x => x.nivel === n);
                      return <td key={n} className="px-3 py-2 text-xs">{nv?.descricao || '—'}</td>;
                    })}
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">{c.pontos_min}-{c.pontos_max}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" /> Simulador de Grau
          </CardTitle>
          <CardDescription className="text-xs">Insira a pontuação total e veja em qual grau o cargo se enquadra</CardDescription>
        </CardHeader>
        <CardContent>
          <SimuladorGrau />
        </CardContent>
      </Card>
    </div>
  );
}

function SimuladorGrau() {
  const [pontos, setPontos] = useState('');
  const [grau, setGrau] = useState(null);
  useEffect(() => {
    if (!pontos || isNaN(Number(pontos))) { setGrau(null); return; }
    pcs.sugerirGrau(Number(pontos)).then(setGrau).catch(() => setGrau(null));
  }, [pontos]);
  return (
    <div className="flex items-center gap-4">
      <div className="flex-shrink-0">
        <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Pontuação</label>
        <input type="number" min={100} max={500} className="w-32 h-10 rounded-lg border border-input bg-background px-3 text-sm tabular-nums"
          value={pontos} onChange={e => setPontos(e.target.value)} placeholder="100-500" />
      </div>
      <div className="flex-1">
        {grau ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="text-xs text-muted-foreground">Grau sugerido</div>
            <div className="text-lg font-bold" style={{ color: C.primary }}>{grau.codigo} · {grau.nivel}</div>
            <div className="text-xs mt-1 text-muted-foreground">
              <span className="font-semibold">{grau.categoria}</span> · faixa {fmtMoney(grau.faixa_min)} → {fmtMoney(grau.faixa_max)} (ref. {fmtMoney(grau.faixa_ref)})
            </div>
            {grau.observacao && <div className="text-xs mt-1">{grau.observacao}</div>}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">{pontos ? 'Sem grau para essa pontuação' : 'Digite uma pontuação para ver o grau'}</div>
        )}
      </div>
    </div>
  );
}




function BeneficiosTab({ flash }) {
  const [beneficios, setBeneficios] = useState([]);
  const [graus, setGraus] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, g] = await Promise.all([pcs.beneficios.list(), pcs.graus.list()]);
      setBeneficios(b); setGraus(g);
    } catch (e) { flash(e.message, 'error'); }
    finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  const toggleElegibilidade = async (beneficioId, grauId, currentStatus) => {
    const next = currentStatus === 'sim' ? 'condicional' : currentStatus === 'condicional' ? 'nao' : 'sim';
    try {
      await pcs.beneficios.setElegibilidade(beneficioId, grauId, next);
      load();
    } catch (e) { flash(e.message, 'error'); }
  };

  if (loading) return <div className="text-center py-12 text-muted-foreground">Carregando benefícios...</div>;

  const symbolFor = (s) => s === 'sim' ? '✔' : s === 'condicional' ? '◑' : '—';
  const colorFor = (s) => s === 'sim' ? C.green : s === 'condicional' ? C.amber : C.gray;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Gift className="h-4 w-4 text-primary" /> Política de Benefícios
          </CardTitle>
          <CardDescription className="text-xs">Click numa célula da matriz para alternar elegibilidade. Cada colaborador recebe automaticamente os benefícios elegíveis pro seu grau + vínculo.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="w-full">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase sticky left-0 bg-muted z-10">Benefício</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Vínculos</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Valor</th>
                  {graus.map(g => (
                    <th key={g.id} className="text-center px-2 py-2 text-xs font-semibold text-muted-foreground" style={{ minWidth: 44 }}>{g.codigo}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {beneficios.map(b => {
                  const mapByGrau = {};
                  for (const e of b.elegibilidade || []) mapByGrau[e.grau_id] = e.status;
                  return (
                    <tr key={b.id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-2 font-semibold sticky left-0 bg-card">{b.nome}<div className="text-xs text-muted-foreground font-normal">{b.criterio}</div></td>
                      <td className="px-3 py-2 text-xs">{(b.vinculos_elegiveis || []).join(', ')}</td>
                      <td className="px-3 py-2 text-xs">{b.valor_referencia}</td>
                      {graus.map(g => {
                        const s = mapByGrau[g.id] || 'nao';
                        return (
                          <td key={g.id} className="px-1 py-1 text-center cursor-pointer"
                            onClick={() => toggleElegibilidade(b.id, g.id, s)}
                            title={`Clique para alternar (atual: ${s})`}>
                            <span className="inline-block w-7 h-7 rounded-md text-base font-bold flex items-center justify-center"
                              style={{ color: colorFor(s), background: s === 'sim' ? C.greenBg : s === 'condicional' ? C.amberBg : 'transparent', margin: '0 auto' }}>
                              {symbolFor(s)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground flex items-center gap-4 px-2">
        <span><span style={{ color: C.green }}>✔</span> Elegível</span>
        <span><span style={{ color: C.amber }}>◑</span> Condicional</span>
        <span><span style={{ color: C.gray }}>—</span> Não elegível</span>
      </div>
    </div>
  );
}







const KPIS_ADERENCIA = [
  { key: 'adequado', label: 'Adequados', color: C.green, bg: C.greenBg, icon: CheckCircle2 },
  { key: 'abaixo', label: 'Abaixo da faixa', color: C.amber, bg: C.amberBg, icon: AlertTriangle },
  { key: 'acima', label: 'Acima do teto', color: C.red, bg: C.redBg, icon: ArrowUpRight },
  { key: 'sem', label: 'Sem enquadramento', color: C.gray, bg: C.grayBg, icon: AlertTriangle },
];

const AVISO360_FILTROS = [
  ['com', 'Com aviso da 360'],
  ['alta', '360: nota alta'],
  ['baixa', '360: nota baixa'],
  ['divergencia', '360: gestor × equipe'],
];

function bateAviso360(a, filtro) {
  if (!a?.texto) return false;
  if (filtro === 'com') return true;
  if (filtro === 'divergencia') return !!a.divergencia;
  return a.aviso === filtro;
}

const PROPOSTA_FILTROS = [
  ['subir', 'Proposta: subir de grau'],
  ['manter', 'Proposta: manter grau'],
  ['descer', 'Proposta: descer de grau'],
  ['nao_pontuado', 'Ainda não pontuado'],
];


const bucketDe = (aderencia) => (aderencia === 'sem_enquadramento' || aderencia === 'sem_salario' || !aderencia) ? 'sem' : aderencia;

function propostaDe(f) {
  if (f.pts_total == null) return 'nao_pontuado';
  if (f.delta_graus == null) return 'nao_pontuado';
  return f.delta_graus > 0 ? 'subir' : f.delta_graus < 0 ? 'descer' : 'manter';
}

function GrauChip({ codigo, categoria, title }) {
  if (!codigo) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold font-mono"
      style={{ color: CATEGORIA_COLOR[categoria]?.c, background: CATEGORIA_COLOR[categoria]?.bg }} title={title}>{codigo}</span>
  );
}

const TH = 'px-2 py-2 text-xs font-semibold text-muted-foreground uppercase';


function Aviso360Cell({ a, escala, carregando }) {
  if (carregando) return <span className="text-xs text-muted-foreground">…</span>;
  if (!a) return <span className="text-xs text-muted-foreground">—</span>;
  const nota = a.nota_pcs == null ? '—' : Number(a.nota_pcs).toFixed(1).replace('.', ',');
  const cor = a.aviso === 'alta' ? C.primary : a.aviso === 'baixa' ? C.amber : a.texto ? C.purple : C.gray;
  return (
    <div className="text-xs" title={a.texto || 'Sem aviso'}>
      <span className="font-semibold tabular-nums">{nota}</span><span className="text-muted-foreground">/{escala}</span>
      {a.texto && (
        <div className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: cor, background: `${cor}18` }}>
          {a.aviso === 'alta' ? 'Nota alta' : a.aviso === 'baixa' ? 'Nota baixa' : a.divergencia ? 'Gestor × equipe' : 'Critério fora da curva'}
        </div>
      )}
    </div>
  );
}

function EnquadramentoTab({ flash }) {
  const [aderencia, setAderencia] = useState([]);
  const [pontuacao, setPontuacao] = useState([]);
  const [graus, setGraus] = useState([]);
  const [criterios, setCriterios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroArea, setFiltroArea] = useState('');
  const [filtroAder, setFiltroAder] = useState('');
  const [filtroProposta, setFiltroProposta] = useState('');
  const [filtroAviso, setFiltroAviso] = useState('');

  const [aval, setAval] = useState(null);
  const [visao, setVisao] = useState('salarial');
  const [enquadrar, setEnquadrar] = useState(null);
  const [pontuar, setPontuar] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, p, g, c] = await Promise.all([
        pcs.aderencia.list(),
        pcs.pontuacao.list('PCS 2026'),
        pcs.graus.list(),
        pcs.criterios.list(),
      ]);
      setAderencia(a); setPontuacao(p); setGraus(g); setCriterios(c);
    } catch (e) { flash('Erro ao carregar enquadramento: ' + e.message, 'error'); }
    finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    avaliacao360.avisoPcsUltimo().then(setAval).catch((e) => setAval({ erro: e.message }));
  }, []);
  const avisoPorPessoa = useMemo(() => new Map((aval?.pessoas || []).map(p => [p.avaliado?.id, p])), [aval]);

  const linhas = useMemo(() => {
    const pont = new Map(pontuacao.map(p => [p.funcionario_id, p]));
    return aderencia.map(a => ({ ...(pont.get(a.funcionario_id) || {}), ...a }));
  }, [aderencia, pontuacao]);


  const base = useMemo(() => linhas.filter(f => {
    if (filtroArea && (f.area || 'Sem área') !== filtroArea) return false;
    if (busca && !(`${f.nome} ${f.cargo}`.toLowerCase().includes(busca.toLowerCase()))) return false;
    return true;
  }), [linhas, filtroArea, busca]);

  const lista = useMemo(() => base.filter(f => {
    if (filtroAder && bucketDe(f.aderencia) !== filtroAder) return false;
    if (filtroProposta && propostaDe(f) !== filtroProposta) return false;
    if (filtroAviso && !bateAviso360(avisoPorPessoa.get(f.funcionario_id), filtroAviso)) return false;
    return true;
  }), [base, filtroAder, filtroProposta, filtroAviso, avisoPorPessoa]);

  const buckets = useMemo(() => {
    const out = { adequado: 0, abaixo: 0, acima: 0, sem: 0 };
    for (const f of base) out[bucketDe(f.aderencia)]++;
    return out;
  }, [base]);

  const plano = useMemo(() => {
    const itens = linhas.filter(f => f.aderencia === 'abaixo' && f.salario_sugerido);
    const mensal = itens.reduce((s, f) => s + Number(f.delta_correcao || 0), 0);
    return { qtd: itens.length, mensal, anual: mensal * 13 };
  }, [linhas]);

  const porArea = useMemo(() => {
    const out = {};
    for (const f of linhas) {
      const ar = f.area || 'Sem área';
      out[ar] = out[ar] || { total: 0, adequado: 0, abaixo: 0, acima: 0, sem: 0, delta: 0 };
      out[ar].total++;
      out[ar][bucketDe(f.aderencia)]++;
      out[ar].delta += Number(f.delta_correcao || 0);
    }
    return Object.entries(out).sort((a, b) => b[1].delta - a[1].delta);
  }, [linhas]);

  const areas = porArea.map(([a]) => a).sort();
  const temFiltro = busca || filtroArea || filtroAder || filtroProposta || filtroAviso;
  const total = base.length;

  const aplicarEmLote = async () => {
    if (!confirm(`Aplicar enquadramento ao mínimo em ${plano.qtd} colaboradores abaixo da faixa? Custo: ${fmtMoney(plano.mensal)}/mês`)) return;
    try {
      const r = await pcs.aderencia.aplicarEnquadramento({});
      flash(`Enquadramento aplicado em ${r.aplicados} colaboradores · custo ${fmtMoney(r.custoMensal)}/mês`, 'success');
      load();
    } catch (e) { flash(e.message, 'error'); }
  };

  if (loading) return <div className="text-center py-12 text-muted-foreground">Carregando enquadramento...</div>;

  const colSpan = visao === 'salarial' ? 10 : 11;

  return (
    <div className="space-y-4">
      {                                                          }
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {KPIS_ADERENCIA.map(k => {
          const Icon = k.icon; const ativo = filtroAder === k.key;
          return (
            <button key={k.key} type="button" onClick={() => setFiltroAder(ativo ? '' : k.key)}
              className="rounded-xl border p-3 text-left transition-shadow hover:shadow-sm"
              style={{ background: k.bg, borderColor: ativo ? k.color : 'var(--cbrio-border)', boxShadow: ativo ? `0 0 0 1px ${k.color}` : undefined }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: k.color }}>{k.label}</span>
                <Icon className="h-4 w-4" style={{ color: k.color }} />
              </div>
              <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: k.color }}>{buckets[k.key]}</div>
              <div className="text-xs text-muted-foreground">{total ? ((buckets[k.key] / total) * 100).toFixed(0) : 0}% do total</div>
            </button>
          );
        })}
      </div>

      {plano.qtd > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border p-3" style={{ borderColor: C.amber, background: C.amberBg }}>
          <Wallet className="h-4 w-4" style={{ color: C.amber }} />
          <div className="flex-1 min-w-[220px] text-sm">
            <strong>{plano.qtd} colaboradores abaixo do mínimo da faixa</strong>
            <span className="text-muted-foreground"> · levar ao mínimo custa {fmtMoney(plano.mensal)}/mês ({fmtMoney(plano.anual)}/ano, ~13 meses)</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setFiltroAder('abaixo'); setVisao('salarial'); }}>Ver quem</Button>
          <Button size="sm" onClick={aplicarEmLote}><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Aplicar em lote</Button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Award className="h-4 w-4 text-primary" /> Enquadramento
              </CardTitle>
              <CardDescription className="text-xs">
                {lista.length} de {linhas.length} colaboradores ativos · grau atual × salário e pontuação dos 6 critérios (PCS 2026)
              </CardDescription>
            </div>
            <div className="inline-flex rounded-lg border border-border p-0.5 text-xs font-medium">
              {[['salarial', 'Visão salarial'], ['pontuacao', 'Visão pontuação']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setVisao(k)}
                  className={`px-3 py-1.5 rounded-md transition-colors ${visao === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{l}</button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input className="w-full h-9 pl-9 rounded-lg border border-input bg-background px-3 text-sm" placeholder="Buscar por nome ou cargo..."
                value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
            <ShadSelect value={filtroArea || '__all__'} onValueChange={v => setFiltroArea(v === '__all__' ? '' : v)}>
              <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Área" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as áreas</SelectItem>
                {areas.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </ShadSelect>
            <ShadSelect value={filtroAder || '__all__'} onValueChange={v => setFiltroAder(v === '__all__' ? '' : v)}>
              <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Aderência" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Toda aderência</SelectItem>
                {KPIS_ADERENCIA.map(k => <SelectItem key={k.key} value={k.key}>{k.label}</SelectItem>)}
              </SelectContent>
            </ShadSelect>
            <ShadSelect value={filtroProposta || '__all__'} onValueChange={v => setFiltroProposta(v === '__all__' ? '' : v)}>
              <SelectTrigger className="w-52 h-9"><SelectValue placeholder="Proposta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Toda proposta</SelectItem>
                {PROPOSTA_FILTROS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </ShadSelect>
            {aval?.ciclo && (
              <ShadSelect value={filtroAviso || '__all__'} onValueChange={v => setFiltroAviso(v === '__all__' ? '' : v)}>
                <SelectTrigger className="w-48 h-9"><SelectValue placeholder="Aviso da 360" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todo aviso da 360</SelectItem>
                  {AVISO360_FILTROS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </ShadSelect>
            )}
            {temFiltro && (
              <Button size="sm" variant="ghost" onClick={() => { setBusca(''); setFiltroArea(''); setFiltroAder(''); setFiltroProposta(''); setFiltroAviso(''); }}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Limpar
              </Button>
            )}
          </div>

          <p className="mb-2 text-xs text-muted-foreground">
            {aval === null ? 'Carregando avisos da Avaliação 360…'
              : aval.erro ? `Avisos da Avaliação 360 indisponíveis: ${aval.erro}`
              : aval.ciclo ? <>Coluna "Avaliação 360" = ciclo <strong>{aval.ciclo.nome}</strong>. A avaliação não decide salário: o aviso pede um olhar no enquadramento.</>
              : 'Nenhuma Avaliação 360 publicada ainda: a coluna de aviso aparece quando houver.'}
          </p>
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className={`text-left ${TH} px-3`}>Colaborador</th>
                  <th className={`text-center ${TH}`}>Vínculo</th>
                  <th className={`text-center ${TH}`}>Grau</th>
                  {visao === 'salarial' ? (<>
                    <th className={`text-right ${TH}`}>Remuneração</th>
                    <th className={`text-right ${TH}`}>Faixa</th>
                    <th className={`text-center ${TH}`}>Compa-ratio</th>
                    <th className={`text-right ${TH}`}>Correção p/ mínimo</th>
                  </>) : (<>
                    <th className={`text-center ${TH}`} title="Formação · Experiência · Complexidade · Responsabilidade · Liderança · Técnicas">Critérios (1-5)</th>
                    <th className={`text-right ${TH}`}>Pts</th>
                    <th className={`text-center ${TH}`}>Grau proposto</th>
                    <th className={`text-center ${TH}`}>Δ</th>
                    <th className={`text-right ${TH}`}>Gap</th>
                  </>)}
                  <th className={`text-left ${TH}`}>Aderência</th>
                  <th className={`text-left ${TH}`}>Avaliação 360</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lista.map(f => {
                  const ad = ADERENCIA_LABEL[f.aderencia] || ADERENCIA_LABEL.sem_enquadramento;
                  const Icon = ad.icon;
                  const niveis = [f.nivel_formacao, f.nivel_experiencia, f.nivel_complexidade, f.nivel_responsabilidade, f.nivel_lideranca, f.nivel_competencias];
                  return (
                    <tr key={f.funcionario_id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="font-semibold">{f.nome}</div>
                        <div className="text-xs text-muted-foreground">{f.cargo}{f.area ? ` · ${f.area}` : ''}</div>
                      </td>
                      <td className="px-2 py-2 text-center text-xs">{f.tipo_contrato}</td>
                      <td className="px-2 py-2 text-center"><GrauChip codigo={f.grau_codigo} categoria={f.grau_categoria} title={f.grau_nivel} /></td>
                      {visao === 'salarial' ? (<>
                        <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(f.remuneracao_efetiva)}</td>
                        <td className="px-2 py-2 text-right text-xs text-muted-foreground tabular-nums">
                          {f.faixa_min ? <>{fmtMoney(f.faixa_min)}<br />→ {fmtMoney(f.faixa_max)}</> : '—'}
                        </td>
                        <td className="px-2 py-2 text-center font-semibold tabular-nums" style={{ color: ad.color }}>{fmtPct(f.compa_ratio)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-xs">
                          {Number(f.delta_correcao) > 0
                            ? <span style={{ color: C.amber }}>+{fmtMoney(f.delta_correcao)}<div className="text-muted-foreground">→ {fmtMoney(f.salario_sugerido)}</div></span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                      </>) : (<>
                        <td className="px-2 py-2 text-center font-mono text-[11px]">
                          {niveis.every(n => n == null) ? (
                            <span className="text-muted-foreground italic">não pontuado</span>
                          ) : (
                            <span className="tabular-nums" title="Formação · Experiência · Complexidade · Responsabilidade · Liderança · Técnicas">
                              {niveis.map((n, i) => (
                                <span key={i} className={`inline-block w-5 ${n == null ? 'text-muted-foreground' : ''}`}
                                  style={n != null ? { color: n >= 4 ? C.primary : n >= 3 ? C.blue : C.gray } : {}}>
                                  {n ?? '·'}
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold"
                          style={{ color: (f.pts_total || 0) >= 700 ? C.primary : (f.pts_total || 0) >= 400 ? C.blue : C.gray }}>
                          {f.pts_total != null ? Number(f.pts_total).toFixed(0) : '—'}
                        </td>
                        <td className="px-2 py-2 text-center"><GrauChip codigo={f.grau_proposto_codigo} categoria={f.grau_proposto_categoria} title={f.grau_proposto_nivel} /></td>
                        <td className="px-2 py-2 text-center font-semibold tabular-nums"
                          style={{ color: (f.delta_graus || 0) > 0 ? C.amber : (f.delta_graus || 0) < 0 ? C.gray : C.green }}>
                          {f.delta_graus == null ? '—' : f.delta_graus > 0 ? `+${f.delta_graus}` : f.delta_graus}
                        </td>
                        <td className="px-2 py-2 text-right text-xs tabular-nums" style={{ color: (f.gap_salarial || 0) < 0 ? C.amber : C.green }}>
                          {f.gap_salarial == null ? '—' : fmtMoney(f.gap_salarial)}
                        </td>
                      </>)}
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
                          style={{ color: ad.color, background: ad.bg }}>
                          <Icon className="h-3 w-3" /> {ad.label}
                        </span>
                      </td>
                      <td className="px-2 py-2"><Aviso360Cell a={avisoPorPessoa.get(f.funcionario_id)} escala={aval?.ciclo?.escala_max} carregando={aval === null} /></td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => setPontuar(f)} title="Pontuar os 6 critérios e propor grau">Pontuar</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEnquadrar(f)} title="Mudar o grau e a remuneração">Enquadrar</Button>
                      </td>
                    </tr>
                  );
                })}
                {lista.length === 0 && (
                  <tr><td colSpan={colSpan} className="text-center py-10 text-muted-foreground text-sm">Nenhum colaborador encontrado</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Aderência por área</CardTitle>
          <CardDescription className="text-xs">Clique numa área para filtrar a tabela acima.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className={`text-left ${TH} px-3`}>Área</th>
                  <th className={`text-center ${TH}`}>Total</th>
                  <th className={`text-center ${TH}`}>Adequados</th>
                  <th className={`text-center ${TH}`}>Abaixo</th>
                  <th className={`text-center ${TH}`}>Acima</th>
                  <th className={`text-center ${TH}`}>Sem grau</th>
                  <th className={`text-right ${TH} px-3`}>Custo mensal</th>
                </tr>
              </thead>
              <tbody>
                {porArea.map(([area, v]) => (
                  <tr key={area} onClick={() => setFiltroArea(filtroArea === area ? '' : area)}
                    className={`border-t border-border cursor-pointer hover:bg-muted/20 ${filtroArea === area ? 'bg-primary/5' : ''}`}>
                    <td className="px-3 py-2 font-semibold">{area}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{v.total}</td>
                    <td className="px-2 py-2 text-center tabular-nums" style={{ color: C.green }}>{v.adequado}</td>
                    <td className="px-2 py-2 text-center tabular-nums" style={{ color: C.amber }}>{v.abaixo}</td>
                    <td className="px-2 py-2 text-center tabular-nums" style={{ color: C.red }}>{v.acima}</td>
                    <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">{v.sem}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(v.delta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {enquadrar && (
        <EnquadrarModal funcionario={enquadrar} graus={graus} onClose={() => setEnquadrar(null)}
          onSaved={() => { setEnquadrar(null); load(); flash('Enquadramento atualizado', 'success'); }} />
      )}
      {pontuar && (
        <EditarPontuacaoModal pontuacao={pontuar} criterios={criterios} graus={graus} onClose={() => setPontuar(null)}
          onSaved={() => { setPontuar(null); load(); flash('Pontuação atualizada', 'success'); }} />
      )}
    </div>
  );
}

function EnquadrarModal({ funcionario, graus, onClose, onSaved }) {
  const [grauId, setGrauId] = useState(funcionario.grau_id || '');
  const [novoSalario, setNovoSalario] = useState(funcionario.remuneracao_efetiva || '');
  const [tipo, setTipo] = useState('enquadramento');
  const [motivo, setMotivo] = useState('Enquadramento PCS 2026');
  const [saving, setSaving] = useState(false);
  const grauSel = graus.find(g => g.id === grauId);

  const save = async () => {
    setSaving(true);
    try {
      await pcs.progressoes.create({
        funcionario_id: funcionario.funcionario_id,
        tipo,
        novo_grau_id: grauId,
        novo_salario: Number(novoSalario),
        motivo,
      });
      onSaved();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-popover rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold mb-1">Enquadrar {funcionario.nome}</h3>
        <p className="text-xs text-muted-foreground mb-4">{funcionario.cargo} · {funcionario.area} · {funcionario.tipo_contrato}</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Grau</label>
            <ShadSelect value={grauId || '__none__'} onValueChange={v => setGrauId(v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione um grau" /></SelectTrigger>
              <SelectContent>
                {graus.map(g => <SelectItem key={g.id} value={g.id}>{g.codigo} · {g.nivel} · {fmtMoney(g.faixa_min)}–{fmtMoney(g.faixa_max)}</SelectItem>)}
              </SelectContent>
            </ShadSelect>
          </div>
          {funcionario.grau_proposto_id && funcionario.grau_proposto_id !== grauId && (
            <button type="button" onClick={() => setGrauId(funcionario.grau_proposto_id)}
              className="w-full rounded-md border border-dashed p-2 text-left text-xs hover:bg-muted/40" style={{ borderColor: C.primary }}>
              A pontuação dos critérios propõe <strong>{funcionario.grau_proposto_codigo}</strong> ({Number(funcionario.pts_total || 0).toFixed(0)} pts) · <span style={{ color: C.primary }}>usar o grau proposto</span>
            </button>
          )}
          {grauSel && (
            <div className="rounded-md bg-muted/40 p-2 text-xs">
              Faixa atual: <strong>{fmtMoney(grauSel.faixa_min)}</strong> → <strong>{fmtMoney(grauSel.faixa_max)}</strong> (referência {fmtMoney(grauSel.faixa_ref)})
            </div>
          )}
          <NumField label="Nova remuneração" value={novoSalario} onChange={setNovoSalario} />
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Tipo de progressão</label>
            <ShadSelect value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="enquadramento">Enquadramento</SelectItem>
                <SelectItem value="merito">Mérito</SelectItem>
                <SelectItem value="promocao">Promoção</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </ShadSelect>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Motivo</label>
            <input className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm" value={motivo} onChange={e => setMotivo(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !grauId}>{saving ? 'Salvando...' : 'Aplicar'}</Button>
        </div>
      </div>
    </div>
  );
}




function ProgressaoTab({ flash }) {
  const [elegibilidade, setElegibilidade] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [reajustes, setReajustes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('elegibilidade');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, h, r] = await Promise.all([pcs.elegibilidade(), pcs.progressoes.list({ limit: 100 }), pcs.reajustes.list()]);
      setElegibilidade(e); setHistorico(h); setReajustes(r);
    } catch (er) { flash(er.message, 'error'); }
    finally { setLoading(false); }
  }, [flash]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;

  const merito = elegibilidade.filter(e => e.elegivel_merito);
  const promocao = elegibilidade.filter(e => e.elegivel_promocao);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border">
        <button onClick={() => setView('elegibilidade')}
          className={`px-3 py-2 text-sm font-medium border-b-2 ${view === 'elegibilidade' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>
          Elegibilidade
        </button>
        <button onClick={() => setView('historico')}
          className={`px-3 py-2 text-sm font-medium border-b-2 ${view === 'historico' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>
          Histórico de progressões ({historico.length})
        </button>
        <button onClick={() => setView('reajustes')}
          className={`px-3 py-2 text-sm font-medium border-b-2 ${view === 'reajustes' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>
          Reajustes coletivos ({reajustes.length})
        </button>
      </div>

      {view === 'elegibilidade' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4" style={{ color: C.blue }} /> Elegíveis a Mérito ({merito.length})
              </CardTitle>
              <CardDescription className="text-xs">≥12 meses + última avaliação ≥ 3,5/5 · ajuste sugerido: 2-5%</CardDescription>
            </CardHeader>
            <CardContent>
              <ElegibilidadeTable lista={merito} tipo="merito" flash={flash} onApplied={load} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Award className="h-4 w-4" style={{ color: C.purple }} /> Elegíveis a Promoção ({promocao.length})
              </CardTitle>
              <CardDescription className="text-xs">≥18 meses no grau + última avaliação ≥ 4,0/5 · ajuste ao mínimo do próximo grau</CardDescription>
            </CardHeader>
            <CardContent>
              <ElegibilidadeTable lista={promocao} tipo="promocao" flash={flash} onApplied={load} />
            </CardContent>
          </Card>
        </div>
      )}

      {view === 'historico' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <History className="h-4 w-4 text-primary" /> Histórico de progressões
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Data</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Colaborador</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Tipo</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Grau</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">De → Para</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Var.</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {historico.map(h => {
                  const sAnt = h.salario_anterior ?? h.remun_bruta_anterior;
                  const sNov = h.salario_novo ?? h.remun_bruta_nova;
                  return (
                    <tr key={h.id} className="border-t border-border hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs text-muted-foreground">{h.data_efetivacao}</td>
                      <td className="px-3 py-2 font-semibold">{h.funcionario?.nome || '—'}</td>
                      <td className="px-3 py-2 text-center text-xs">
                        <span className="inline-block px-2 py-0.5 rounded-full font-semibold uppercase text-[10px]"
                          style={{
                            color: h.tipo === 'promocao' ? C.purple : h.tipo === 'merito' ? C.blue : h.tipo === 'enquadramento' ? C.amber : h.tipo === 'coletivo' ? C.green : C.gray,
                            background: h.tipo === 'promocao' ? C.purpleBg : h.tipo === 'merito' ? C.blueBg : h.tipo === 'enquadramento' ? C.amberBg : h.tipo === 'coletivo' ? C.greenBg : C.grayBg,
                          }}>{h.tipo}</span>
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-xs">
                        {h.grau_anterior?.codigo}{h.grau_novo?.codigo !== h.grau_anterior?.codigo && <> → {h.grau_novo?.codigo}</>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">
                        {sAnt ? fmtMoney(sAnt) : '—'} → <strong>{sNov ? fmtMoney(sNov) : '—'}</strong>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-xs">
                        {h.variacao_pct ? `${h.variacao_pct > 0 ? '+' : ''}${Number(h.variacao_pct).toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{h.motivo || '—'}</td>
                    </tr>
                  );
                })}
                {!historico.length && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma progressão registrada ainda</td></tr>}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>
      )}

      {view === 'reajustes' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" /> Reajustes coletivos aplicados
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Ano</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">%</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Índice</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Funcs</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Custo total</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Aplicado em</th>
                </tr>
              </thead>
              <tbody>
                {reajustes.map(r => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono font-semibold">{r.ano}</td>
                    <td className="px-3 py-2 text-center tabular-nums font-semibold" style={{ color: C.primary }}>+{Number(r.percentual).toFixed(2)}%</td>
                    <td className="px-3 py-2 text-xs">{r.indice_referencia}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.total_funcs || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.custo_total ? fmtMoney(r.custo_total) : '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.aplicado_em).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
                {!reajustes.length && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum reajuste coletivo registrado</td></tr>}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ElegibilidadeTable({ lista, tipo, flash, onApplied }) {
  const [aplicando, setAplicando] = useState(null);
  if (!lista.length) return <div className="text-center py-6 text-muted-foreground text-sm">Ninguém elegível no momento</div>;

  const aplicar = async (item) => {
    const novo = tipo === 'merito'
      ? Number(prompt('Novo salário (sugestão entre ' + item.sugestao_merito_min + ' e ' + item.sugestao_merito_max + '):', item.sugestao_merito_max))
      : Number(prompt('Novo salário (mínimo do próximo grau: ' + item.sugestao_promocao + '):', item.sugestao_promocao));
    if (!novo || isNaN(novo)) return;
    setAplicando(item.funcionario_id);
    try {
      await pcs.progressoes.create({
        funcionario_id: item.funcionario_id,
        tipo,
        novo_salario: novo,
        novo_grau_id: tipo === 'promocao' ? item.grau_proximo?.id : undefined,
        motivo: tipo === 'merito' ? `Mérito · ${new Date().getFullYear()}` : `Promoção para ${item.grau_proximo?.codigo}`,
      });
      flash(`${tipo === 'merito' ? 'Mérito' : 'Promoção'} aplicado em ${item.nome}`, 'success');
      onApplied();
    } catch (e) { flash(e.message, 'error'); }
    finally { setAplicando(null); }
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Colaborador</th>
            <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Grau atual</th>
            <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">{tipo === 'promocao' ? 'Próximo grau' : 'Meses na empresa'}</th>
            <th className="text-center px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Nota</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Salário atual</th>
            <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground uppercase">Sugerido</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {lista.map(i => (
            <tr key={i.funcionario_id} className="border-t border-border">
              <td className="px-3 py-2 font-semibold">{i.nome}<div className="text-xs text-muted-foreground font-normal">{i.cargo} · {i.area}</div></td>
              <td className="px-3 py-2 text-center font-mono text-xs">{i.grau?.codigo}</td>
              <td className="px-3 py-2 text-center text-xs">{tipo === 'promocao' ? i.grau_proximo?.codigo : i.meses_empresa}</td>
              <td className="px-3 py-2 text-center tabular-nums" style={{ color: i.ultima_nota >= 4 ? C.primary : i.ultima_nota >= 3.5 ? C.green : C.gray }}>{i.ultima_nota?.toFixed(1) || '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(i.salario_atual)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: C.primary }}>
                {tipo === 'merito'
                  ? `${fmtMoney(i.sugestao_merito_min)} → ${fmtMoney(i.sugestao_merito_max)}`
                  : fmtMoney(i.sugestao_promocao)}
              </td>
              <td className="px-3 py-2 text-right">
                <Button size="sm" variant="outline" onClick={() => aplicar(i)} disabled={aplicando === i.funcionario_id}>
                  {aplicando === i.funcionario_id ? '...' : 'Aplicar'}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditarPontuacaoModal({ pontuacao, criterios, graus, onClose, onSaved }) {
  const [niveis, setNiveis] = useState({
    formacao:        pontuacao.nivel_formacao || '',
    experiencia:     pontuacao.nivel_experiencia || '',
    complexidade:    pontuacao.nivel_complexidade || '',
    responsabilidade:pontuacao.nivel_responsabilidade || '',
    lideranca:       pontuacao.nivel_lideranca || '',
    competencias:    pontuacao.nivel_competencias || '',
  });
  const [grauPropostoId, setGrauPropostoId] = useState(pontuacao.grau_proposto_id || '');
  const [statusProposta, setStatusProposta] = useState(pontuacao.status_proposta || '');
  const [decisaoObs, setDecisaoObs] = useState(pontuacao.decisao_obs || '');
  const [saving, setSaving] = useState(false);


  const pesos = { formacao: 0.15, experiencia: 0.20, complexidade: 0.20, responsabilidade: 0.20, lideranca: 0.15, competencias: 0.10 };
  const total = useMemo(() => {
    let s = 0;
    for (const k of Object.keys(pesos)) {
      const n = Number(niveis[k]);
      if (n) s += n * pesos[k] * 200;
    }
    return Math.round(s);
  }, [niveis]);


  useEffect(() => {
    if (!total) return;
    const sugerido = graus.find(g => g.pontos_min != null && g.pontos_max != null && total >= g.pontos_min && total <= g.pontos_max);
    if (sugerido && !pontuacao.grau_proposto_id) setGrauPropostoId(sugerido.id);
  }, [total, graus, pontuacao.grau_proposto_id]);

  const save = async () => {
    setSaving(true);
    try {
      await pcs.pontuacao.update(pontuacao.funcionario_id, {
        ciclo_referencia: 'PCS 2026',
        nivel_formacao:        niveis.formacao || null,
        nivel_experiencia:     niveis.experiencia || null,
        nivel_complexidade:    niveis.complexidade || null,
        nivel_responsabilidade:niveis.responsabilidade || null,
        nivel_lideranca:       niveis.lideranca || null,
        nivel_competencias:    niveis.competencias || null,
        grau_proposto_id: grauPropostoId || null,
        status_proposta: statusProposta || null,
        decisao_obs: decisaoObs || null,
      });
      onSaved();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-popover rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold mb-1 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Pontuação PCS · {pontuacao.nome}
        </h3>
        <p className="text-xs text-muted-foreground mb-4">{pontuacao.cargo} · {pontuacao.area} · {pontuacao.tipo_contrato} · Grau atual: <strong>{pontuacao.grau_atual_codigo || '—'} {pontuacao.grau_atual_nivel || ''}</strong></p>

        <div className="space-y-3">
          {criterios.map(c => (
            <div key={c.id}>
              <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">
                {c.nome} <span className="text-[10px] font-normal text-muted-foreground/70">({(c.peso * 100).toFixed(0)}% · máx {c.pontos_max} pts)</span>
              </label>
              <ShadSelect value={niveis[c.codigo] ? String(niveis[c.codigo]) : '__none__'}
                onValueChange={v => setNiveis(prev => ({ ...prev, [c.codigo]: v === '__none__' ? '' : Number(v) }))}>
                <SelectTrigger><SelectValue placeholder="Selecione o nível" /></SelectTrigger>
                <SelectContent className="z-[1100]">
                  <SelectItem value="__none__">Não avaliado</SelectItem>
                  {(c.niveis || []).map(n => (
                    <SelectItem key={n.nivel} value={String(n.nivel)}>
                      {n.nivel} · {n.descricao} · {(n.nivel * c.peso * 200).toFixed(0)} pts
                    </SelectItem>
                  ))}
                </SelectContent>
              </ShadSelect>
            </div>
          ))}

          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 mt-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Pontuação total</span>
              <span className="text-2xl font-bold tabular-nums" style={{ color: C.primary }}>{total} <span className="text-xs font-normal text-muted-foreground">/ 1000</span></span>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Grau proposto</label>
            <ShadSelect value={grauPropostoId || '__none__'} onValueChange={v => setGrauPropostoId(v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione um grau" /></SelectTrigger>
              <SelectContent className="z-[1100]">
                <SelectItem value="__none__">Sem proposta</SelectItem>
                {graus.map(g => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.codigo} · {g.nivel} · pontos {g.pontos_min}-{g.pontos_max} · ref {fmtMoney(g.faixa_ref)}
                  </SelectItem>
                ))}
              </SelectContent>
            </ShadSelect>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Status da proposta</label>
            <ShadSelect value={statusProposta || '__none__'} onValueChange={v => setStatusProposta(v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Selecione o status" /></SelectTrigger>
              <SelectContent className="z-[1100]">
                <SelectItem value="__none__">—</SelectItem>
                <SelectItem value="adequado">Adequado</SelectItem>
                <SelectItem value="abaixo_minimo">Abaixo do mínimo</SelectItem>
                <SelectItem value="abaixo_referencia">Abaixo da referência</SelectItem>
                <SelectItem value="acima_teto">Acima do teto</SelectItem>
                <SelectItem value="sem_dados">Sem dados</SelectItem>
              </SelectContent>
            </ShadSelect>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">Observação / Decisão</label>
            <textarea className="w-full min-h-[60px] rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={decisaoObs} onChange={e => setDecisaoObs(e.target.value)}
              placeholder="Ex: aguardar próximo ciclo · adequado por contexto pastoral · etc." />
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      </div>
    </div>
  );
}





const SUB_TABS = [
  { key: 'enquadramento', label: 'Enquadramento', icon: Award, desc: 'Aderência, grau e pontuação dos 6 critérios numa tabela só' },
  { key: 'ciclo', label: 'Ciclo de enquadramento', icon: ClipboardCheck, desc: 'Metas, autoavaliação, avaliação do líder e calibração' },
  { key: 'progressao', label: 'Progressão', icon: TrendingUp, desc: 'Mérito, promoção, histórico' },
  { key: 'graus', label: 'Estrutura de Graus', icon: Layers, desc: '22 graus e faixas salariais' },
  { key: 'criterios', label: 'Critérios', icon: ClipboardCheck, desc: '6 fatores de avaliação' },
  { key: 'beneficios', label: 'Benefícios', icon: Gift, desc: 'Matriz grau × benefício × vínculo' },
];

export default function TabPCS({ funcionarios = [], podeRemun = false, initialSub }) {
  const [sub, setSub] = useState(initialSub || 'enquadramento');

  const abas = SUB_TABS.filter(t => podeRemun || t.key === 'ciclo');
  const ativa = abas.some(t => t.key === sub) ? sub : 'ciclo';
  const [msg, setMsg] = useState(null);
  const flash = useCallback((message, kind = 'info') => {
    setMsg({ message, kind });
    setTimeout(() => setMsg(null), 4500);
  }, []);

  return (
    <div className="space-y-4">
      <FlashMsg msg={msg?.message} kind={msg?.kind} onClose={() => setMsg(null)} />
      <div>
        <h2 className="text-base font-semibold">Plano de Cargos e Salários</h2>
        <p className="text-sm text-muted-foreground mt-1">{podeRemun
          ? 'Enquadramento atual, ciclos de avaliação e progressão em um só lugar.'
          : 'Acompanhe as fichas e os ciclos de enquadramento.'}</p>
      </div>
      <Tabs value={ativa} onValueChange={setSub}>
        <ScrollArea className="w-full">
          <TabsList className="inline-flex flex-wrap h-auto w-auto bg-transparent p-0 gap-1 border-b border-border rounded-none">
            {abas.map(t => {
              const Icon = t.icon;
              return (
                <TabsTrigger key={t.key} value={t.key}
                  className="relative rounded-none border-b-2 border-transparent px-4 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-b-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent">
                  <Icon className="size-3.5 mr-1.5 hidden sm:inline-block" />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>

        {podeRemun && <TabsContent value="enquadramento"><EnquadramentoTab flash={flash} /></TabsContent>}
        <TabsContent value="ciclo"><TabAvaliacoes funcionarios={funcionarios} /></TabsContent>
        {podeRemun && <TabsContent value="progressao"><ProgressaoTab flash={flash} /></TabsContent>}
        {podeRemun && <TabsContent value="graus"><GrausTab flash={flash} /></TabsContent>}
        {podeRemun && <TabsContent value="criterios"><CriteriosTab flash={flash} /></TabsContent>}
        {podeRemun && <TabsContent value="beneficios"><BeneficiosTab flash={flash} /></TabsContent>}
      </Tabs>
    </div>
  );
}

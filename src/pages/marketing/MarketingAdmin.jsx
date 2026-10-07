import { useState, useEffect, useCallback } from 'react';
import { marketing as api } from '../../api';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import {
  Plus, Trash2, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../supabaseClient';

const DIAS_LABEL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const HABILIDADES = ['coordenador', 'videomaker', 'fotografo', 'designer', 'social_media', 'social_media_assistente'];





export function AbaMembros() {
  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novoOpen, setNovoOpen] = useState(false);
  const [profilesCriativo, setProfilesCriativo] = useState([]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.admin.membros.list();
      setLista(data);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);


  useEffect(() => {
    if (!supabase) return;
    supabase.from('profiles')
      .select('id, name, email, area')
      .ilike('area', 'criativo')
      .order('name')
      .then(({ data }) => setProfilesCriativo(data || []))
      .catch(() => {});
  }, []);

  async function salvarLinha(id, payload) {
    try {
      await api.admin.membros.update(id, payload);
      toast.success('Salvo');
      carregar();
    } catch (e) { toast.error(e.message); }
  }

  async function remover(id) {
    if (!confirm('Remover este membro? (soft-delete · reversível)')) return;
    try {
      await api.admin.membros.remove(id);
      toast.success('Removido');
      carregar();
    } catch (e) { toast.error(e.message); }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <p className="text-sm text-muted-foreground">{lista.length} membros · horas por semana é a capacidade de cada um · coordenador é quem lidera as Demandas</p>
        <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Novo membro</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo membro Marketing</DialogTitle></DialogHeader>
            <NovoMembroForm
              profiles={profilesCriativo}
              onSuccess={() => { setNovoOpen(false); carregar(); }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto my-8 text-muted-foreground" /> : (
        <div className="space-y-2">
          {lista.map(m => (
            <MembroRow key={m.id} membro={m} onSave={salvarLinha} onRemove={remover} />
          ))}
        </div>
      )}
    </div>
  );
}

function MembroRow({ membro, onSave, onRemove }) {
  const [horas, setHoras] = useState(String(membro.horas_semanais ?? 30));
  const [habilidade, setHabilidade] = useState(membro.habilidade);
  const [obs, setObs] = useState(membro.observacao || '');
  const [ativo, setAtivo] = useState(membro.ativo);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDirty(
      Number(String(horas).replace(',', '.')) !== Number(membro.horas_semanais ?? 30) ||
      habilidade !== membro.habilidade ||
      (obs || '') !== (membro.observacao || '') ||
      ativo !== membro.ativo
    );
  }, [horas, habilidade, obs, ativo, membro]);

  function salvar() {
    const h = Number(String(horas).replace(',', '.'));
    if (!Number.isFinite(h) || h <= 0) { toast.error('Horas por semana tem que ser um número maior que zero'); return; }
    onSave(membro.id, { horas_semanais: h, habilidade, observacao: obs, ativo });
  }

  return (
    <Card className="p-3 flex flex-col md:flex-row md:items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{membro.profile?.name || '(sem nome)'}</p>
        <p className="text-xs text-muted-foreground">{membro.profile?.email}</p>
      </div>
      <Select value={habilidade} onValueChange={setHabilidade}>
        <SelectTrigger className="w-[180px] h-8 text-xs" aria-label="Habilidade"><SelectValue /></SelectTrigger>
        <SelectContent>
          {HABILIDADES.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Label className="text-xs whitespace-nowrap">Horas/semana</Label>
        <Input
          inputMode="decimal"
          value={horas}
          onChange={e => setHoras(e.target.value)}
          className="w-16 h-8"
          aria-label="Horas por semana"
        />
      </div>
      <Input
        value={obs}
        onChange={e => setObs(e.target.value)}
        placeholder="Observação"
        className="flex-1 h-8 text-sm"
      />
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
        Ativo
      </label>
      <div className="flex gap-1">
        <Button
          size="sm"
          onClick={salvar}
          disabled={!dirty}
        >
          Salvar
        </Button>
        <Button size="icon" variant="outline" onClick={() => onRemove(membro.id)} className="text-red-600 dark:text-red-400">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

function NovoMembroForm({ profiles, onSuccess }) {
  const [tipo, setTipo] = useState('com_login');
  const [form, setForm] = useState({ profile_id: '', nome_display: '', habilidade: '', horas_semanais: '30', observacao: '' });
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    if (!form.habilidade) { toast.error('Habilidade obrigatória'); return; }
    if (tipo === 'com_login' && !form.profile_id) { toast.error('Selecione a pessoa'); return; }
    if (tipo === 'sem_login' && !form.nome_display.trim()) { toast.error('Nome obrigatório'); return; }
    setSubmitting(true);
    try {
      const payload = {
        habilidade: form.habilidade,
        horas_semanais: Number(String(form.horas_semanais).replace(',', '.')) || 30,
        observacao: form.observacao,
        profile_id: tipo === 'com_login' ? form.profile_id : null,
        nome_display: tipo === 'sem_login' ? form.nome_display.trim() : null,
      };
      await api.admin.membros.create(payload);
      toast.success('Criado');
      onSuccess();
    } catch (e) { toast.error(e.message); }
    finally { setSubmitting(false); }
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-xs">
        <button
          onClick={() => setTipo('com_login')}
          className={`flex-1 px-3 py-2 rounded border transition-colors ${tipo === 'com_login' ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}
        >Tem login no sistema</button>
        <button
          onClick={() => setTipo('sem_login')}
          className={`flex-1 px-3 py-2 rounded border transition-colors ${tipo === 'sem_login' ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}
        >Sem login (PJ · ocasional)</button>
      </div>

      {tipo === 'com_login' ? (
        <div className="space-y-2">
          <Label>Pessoa (Criativo) *</Label>
          <Select value={form.profile_id} onValueChange={v => setForm(f => ({ ...f, profile_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Nome de exibição *</Label>
          <Input
            value={form.nome_display}
            onChange={e => setForm(f => ({ ...f, nome_display: e.target.value }))}
            placeholder="Ex: Aline (fotógrafa domingo)"
          />
          <p className="text-xs text-muted-foreground">Pessoa que não acessa o sistema · só aparece no calendário/admin como referência. Informações de RH cadastradas separadamente.</p>
        </div>
      )}
      <div className="space-y-2">
        <Label>Habilidade *</Label>
        <Select value={form.habilidade} onValueChange={v => setForm(f => ({ ...f, habilidade: v }))}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {HABILIDADES.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Horas por semana</Label>
          <Input inputMode="decimal" value={form.horas_semanais}
            onChange={e => setForm(f => ({ ...f, horas_semanais: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Observação</Label>
        <Textarea rows={2} value={form.observacao}
          onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} />
      </div>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting}>{submitting ? 'Criando...' : 'Criar'}</Button>
      </div>
    </div>
  );
}




export function AbaEtiquetas() {
  const [tipos, setTipos] = useState([]);
  const [destinos, setDestinos] = useState([]);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [t, d] = await Promise.all([api.admin.etiquetasTipo.list(), api.admin.etiquetasDestino.list()]);
      setTipos(t);
      setDestinos(d);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvarTipo(id, payload) {
    try { await api.admin.etiquetasTipo.update(id, payload); toast.success('Salvo'); carregar(); }
    catch (e) { toast.error(e.message); }
  }
  async function salvarDestino(id, payload) {
    try { await api.admin.etiquetasDestino.update(id, payload); toast.success('Salvo'); carregar(); }
    catch (e) { toast.error(e.message); }
  }

  if (loading) return <Loader2 className="h-5 w-5 animate-spin mx-auto my-8 text-muted-foreground" />;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold mb-2 text-foreground">Tipos (8)</h3>
        <p className="text-xs text-muted-foreground mb-3">
          `esforco_max_h` = tempo MÁXIMO acordado (SLA interno). Usado pra estimar prazo pessimista + detectar atraso individual no card (acima de 1.5× = badge vermelho). NULL = tipo sem SLA.
        </p>
        <div className="space-y-2">
          {tipos.map(t => <TipoRow key={t.id} t={t} onSave={salvarTipo} />)}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2 text-foreground">Destinos (5)</h3>
        <div className="space-y-2">
          {destinos.map(d => <DestinoRow key={d.id} d={d} onSave={salvarDestino} />)}
        </div>
      </div>
    </div>
  );
}

function TipoRow({ t, onSave }) {
  const [esforco, setEsforco] = useState(t.esforco_max_h ?? '');
  const [hab, setHab] = useState(t.habilidade_padrao || '');
  const [cor, setCor] = useState(t.cor || '');
  const [ativo, setAtivo] = useState(t.ativo);
  const dirty =
    String(esforco) !== String(t.esforco_max_h ?? '') ||
    hab !== (t.habilidade_padrao || '') ||
    cor !== (t.cor || '') ||
    ativo !== t.ativo;

  return (
    <Card className="p-3 flex flex-col md:flex-row md:items-center gap-3">
      <div className="flex items-center gap-2 min-w-[200px]">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cor || '#888' }} />
        <p className="font-medium text-sm">{t.nome}</p>
      </div>
      <Select value={hab || '__none__'} onValueChange={v => setHab(v === '__none__' ? '' : v)}>
        <SelectTrigger className="w-[180px] h-8"><SelectValue placeholder="Habilidade padrão" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">(sem)</SelectItem>
          {HABILIDADES.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Label className="text-xs whitespace-nowrap">Máx (h)</Label>
        <Input type="number" step="0.5" value={esforco}
          onChange={e => setEsforco(e.target.value)} placeholder="—" className="w-20 h-8" />
      </div>
      <Input value={cor} onChange={e => setCor(e.target.value)} placeholder="#HEX" className="w-24 h-8" />
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
        Ativo
      </label>
      <Button size="sm" disabled={!dirty}
        onClick={() => onSave(t.id, {
          esforco_max_h: esforco === '' ? null : parseFloat(esforco),
          habilidade_padrao: hab || null,
          cor: cor || null,
          ativo,
        })}>Salvar</Button>
    </Card>
  );
}

function DestinoRow({ d, onSave }) {
  const [cor, setCor] = useState(d.cor || '');
  const [ativo, setAtivo] = useState(d.ativo);
  const dirty = cor !== (d.cor || '') || ativo !== d.ativo;
  return (
    <Card className="p-3 flex flex-col md:flex-row md:items-center gap-3">
      <div className="flex items-center gap-2 min-w-[200px]">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cor || '#888' }} />
        <p className="font-medium text-sm">{d.nome}</p>
      </div>
      <Input value={cor} onChange={e => setCor(e.target.value)} placeholder="#HEX" className="w-24 h-8" />
      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
        <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
        Ativo
      </label>
      <Button size="sm" disabled={!dirty}
        onClick={() => onSave(d.id, { cor: cor || null, ativo })}>Salvar</Button>
    </Card>
  );
}







const AREAS_ROTINA = [
  { key: 'institucional', nome: 'Institucional' },
  { key: 'redes', nome: 'Redes' },
];
const NOME_AREA = Object.fromEntries(AREAS_ROTINA.map(a => [a.key, a.nome]));
const areaDe = (r) => (r && NOME_AREA[r.area] ? r.area : 'institucional');





const ROTULO_SEMANA_DO_MES = {
  1: '1ª semana', 2: '2ª semana', 3: '3ª semana', 4: '4ª semana', 5: '5ª semana',
  '-1': 'última semana', '-2': 'penúltima semana', '-3': 'antepenúltima semana',
};
const SEMANAS_DO_MES_OPCOES = ['1', '2', '3', '4', '5', '-3', '-2', '-1'];

export function AbaRecorrentes({ areaInicial = null }) {
  const [lista, setLista] = useState([]);
  const [membros, setMembros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novoOpen, setNovoOpen] = useState(false);
  const [confirmando, setConfirmando] = useState(null);
  const [mudandoArea, setMudandoArea] = useState(null);
  const [mudandoArquivo, setMudandoArquivo] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [r, m] = await Promise.all([api.admin.recorrentes.list(), api.membros()]);
      setLista(r);
      setMembros(m);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const membroMap = Object.fromEntries(membros.map(m => [m.id, m]));


  const areaDisponivel = lista.length === 0 || lista.some(r => r.area != null);

  const arquivoDisponivel = lista.length > 0 && lista.some(r => r.exige_arquivo != null);

  const mensalDisponivel = lista.length > 0 && lista.some(r => r.frequencia != null);
  const ordemAreas = areaInicial && NOME_AREA[areaInicial]
    ? [...AREAS_ROTINA].sort((a, b) => (a.key === areaInicial ? -1 : b.key === areaInicial ? 1 : 0))
    : AREAS_ROTINA;
  const grupos = ordemAreas.map(a => ({ ...a, itens: lista.filter(r => areaDe(r) === a.key) }));



  async function remover(id) {
    try { await api.admin.recorrentes.remove(id); toast.success('Removido'); setConfirmando(null); carregar(); }
    catch (e) { toast.error(e.message); }
  }

  async function trocarArea(r, area) {
    if (area === areaDe(r)) return;
    setMudandoArea(r.id);
    try {
      await api.admin.recorrentes.update(r.id, { area });
      toast.success(`Passou para ${NOME_AREA[area]}`);
      carregar();
    } catch (e) { toast.error(e.message); }
    finally { setMudandoArea(null); }
  }



  async function trocarExigeArquivo(r, exige) {
    setMudandoArquivo(r.id);
    try {
      await api.admin.recorrentes.update(r.id, { exige_arquivo: exige });
      toast.success(exige ? 'Agora pede o arquivo da entrega' : 'Não pede mais arquivo');
      carregar();
    } catch (e) { toast.error(e.message); }
    finally { setMudandoArquivo(null); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {lista.length} recorrentes · cada um é de uma área, e cada área é um quadrado das Demandas
        </p>
        <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Novo</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo compromisso recorrente</DialogTitle></DialogHeader>
            <NovoRecorrenteForm
              membros={membros}
              areaInicial={areaInicial}
              areaDisponivel={areaDisponivel}
              arquivoDisponivel={arquivoDisponivel}
              mensalDisponivel={mensalDisponivel}
              onSuccess={() => { setNovoOpen(false); carregar(); }}
            />
          </DialogContent>
        </Dialog>
      </div>
      {!areaDisponivel && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          A área de cada compromisso ainda não pode ser gravada (falta aplicar a migration 20261001140000).
          Até lá, toda a rotina aparece na Rotina do Calendário.
        </p>
      )}
      {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto my-8 text-muted-foreground" /> : (
        <div className="space-y-4">
          {grupos.map(g => (
            <section key={g.key} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {g.nome} <span className="tabular-nums">({g.itens.length})</span>
              </h4>
              {g.itens.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Nenhum compromisso nesta área.</p>
              )}
              {g.itens.map(r => {
                const parts = (r.participantes_ids || []).map(id => membroMap[id]).filter(Boolean);
                return (
                  <Card key={r.id} className="p-3 flex flex-wrap items-center gap-3">
                    <Badge variant="secondary">{DIAS_LABEL[r.dia_semana]}</Badge>
                    {r.frequencia === 'mensal' && (
                      <Badge variant="outline" className="text-[10px]">Uma vez por mês · {ROTULO_SEMANA_DO_MES[r.semana_do_mes] || 'semana do mês'}</Badge>
                    )}
                    {r.tipo === 'planejamento_postagens' && (
                      <Badge variant="outline" className="text-[10px]">Abre o planejamento de postagens</Badge>
                    )}
                    <span className="text-sm font-mono">{r.hora_inicio?.slice(0, 5)} · {r.duracao_h}h</span>
                    <span className="text-sm text-foreground flex-1 min-w-[200px]">{r.descricao}</span>
                    <div className="flex flex-wrap gap-1 items-center">
                      {parts.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">sem participantes</span>
                      ) : (
                        parts.map(p => (
                          <Badge key={p.id} variant="outline" className="text-[10px]">
                            {p.profile?.name?.split(' ')[0] || '?'}
                          </Badge>
                        ))
                      )}
                    </div>
                    {areaDisponivel && (
                      <Select value={areaDe(r)} onValueChange={(v) => trocarArea(r, v)} disabled={mudandoArea === r.id}>
                        <SelectTrigger className="h-8 w-[150px]" aria-label="Área do compromisso"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {AREAS_ROTINA.map(a => <SelectItem key={a.key} value={a.key}>{a.nome}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                    {arquivoDisponivel && (
                      <label className="flex items-center gap-1.5 text-xs text-foreground">
                        <input
                          type="checkbox"
                          checked={!!r.exige_arquivo}
                          disabled={mudandoArquivo === r.id}
                          onChange={(e) => trocarExigeArquivo(r, e.target.checked)}
                        />
                        Exige arquivo
                      </label>
                    )}
                    {confirmando === r.id ? (
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">Remover?</span>
                        <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => remover(r.id)}>Sim</Button>
                        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setConfirmando(null)}>Não</Button>
                      </span>
                    ) : (
                      <Button size="icon" variant="outline" onClick={() => setConfirmando(r.id)} className="text-red-600 dark:text-red-400" aria-label="Remover este compromisso">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </Card>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function NovoRecorrenteForm({ membros, onSuccess, areaInicial = null, areaDisponivel = true, arquivoDisponivel = false, mensalDisponivel = false }) {
  const [form, setForm] = useState({
    participantes_ids: [], dia_semana: '1', hora_inicio: '09:00', duracao_h: 3, descricao: '',
    area: NOME_AREA[areaInicial] ? areaInicial : 'institucional',
    exige_arquivo: false,
    frequencia: 'semanal', semana_do_mes: '-1',
  });
  const [submitting, setSubmitting] = useState(false);

  function toggleMembro(id) {
    setForm(f => ({
      ...f,
      participantes_ids: f.participantes_ids.includes(id)
        ? f.participantes_ids.filter(x => x !== id)
        : [...f.participantes_ids, id],
    }));
  }

  function selecionarTodos() {
    setForm(f => ({ ...f, participantes_ids: membros.map(m => m.id) }));
  }
  function limparTodos() {
    setForm(f => ({ ...f, participantes_ids: [] }));
  }

  async function submit() {
    if (form.participantes_ids.length === 0) { toast.error('Selecione pelo menos 1 participante'); return; }
    if (!form.descricao) { toast.error('Descrição obrigatória'); return; }
    setSubmitting(true);
    try {
      await api.admin.recorrentes.create({
        participantes_ids: form.participantes_ids,
        dia_semana: parseInt(form.dia_semana),
        hora_inicio: form.hora_inicio,
        duracao_h: parseFloat(form.duracao_h),
        descricao: form.descricao,


        ...(areaDisponivel ? { area: form.area } : {}),

        ...(arquivoDisponivel && form.exige_arquivo ? { exige_arquivo: true } : {}),

        ...(mensalDisponivel && form.frequencia === 'mensal' ? { frequencia: 'mensal', semana_do_mes: Number(form.semana_do_mes) } : {}),
      });
      toast.success('Criado');
      onSuccess();
    } catch (e) { toast.error(e.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Participantes * ({form.participantes_ids.length}/{membros.length})</Label>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="ghost" onClick={selecionarTodos} className="h-6 text-[10px]">Todos</Button>
            <Button type="button" size="sm" variant="ghost" onClick={limparTodos} className="h-6 text-[10px]">Limpar</Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto border border-border rounded p-2">
          {membros.map(m => {
            const sel = form.participantes_ids.includes(m.id);
            return (
              <label key={m.id} className={`flex items-center gap-2 px-2 py-1 rounded text-sm cursor-pointer transition-colors ${sel ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() => toggleMembro(m.id)}
                  className="h-4 w-4 cursor-pointer"
                />
                <span className="flex-1">{m.profile?.name || '(sem nome)'}</span>
                <span className="text-xs text-muted-foreground">{m.habilidade}</span>
              </label>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label>Dia *</Label>
          <Select value={form.dia_semana} onValueChange={v => setForm(f => ({ ...f, dia_semana: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {DIAS_LABEL.map((l, i) => <SelectItem key={i} value={String(i)}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Hora</Label>
          <Input type="time" value={form.hora_inicio}
            onChange={e => setForm(f => ({ ...f, hora_inicio: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Duração (h)</Label>
          <Input type="number" step="0.5" value={form.duracao_h}
            onChange={e => setForm(f => ({ ...f, duracao_h: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Descrição *</Label>
        <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
      </div>
      {areaDisponivel ? (
        <div className="space-y-2">
          <Label>Área *</Label>
          <Select value={form.area} onValueChange={v => setForm(f => ({ ...f, area: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {AREAS_ROTINA.map(a => <SelectItem key={a.key} value={a.key}>{a.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">É o quadrado das Demandas em que este compromisso aparece.</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">A área ainda não pode ser escolhida: o compromisso entra na rotina institucional (Calendário).</p>
      )}
      {mensalDisponivel && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="rec-frequencia">Frequência</Label>
            <select id="rec-frequencia" className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={form.frequencia} onChange={e => setForm(f => ({ ...f, frequencia: e.target.value }))}>
              <option value="semanal">Toda semana</option>
              <option value="mensal">Uma vez por mês</option>
            </select>
          </div>
          {form.frequencia === 'mensal' && (
            <div className="space-y-2">
              <Label htmlFor="rec-semana-mes">Em que semana do mês</Label>
              <select id="rec-semana-mes" className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={form.semana_do_mes} onChange={e => setForm(f => ({ ...f, semana_do_mes: e.target.value }))}>
                {SEMANAS_DO_MES_OPCOES.map(o => <option key={o} value={o}>{ROTULO_SEMANA_DO_MES[o]}</option>)}
              </select>
              <p className="text-xs text-muted-foreground">A semana é do mês em que cai a quarta-feira.</p>
            </div>
          )}
        </div>
      )}
      {arquivoDisponivel && (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={form.exige_arquivo}
            onChange={e => setForm(f => ({ ...f, exige_arquivo: e.target.checked }))}
          />
          <span>
            Exige arquivo
            <span className="block text-xs text-muted-foreground">Só fica feito na semana quando a pessoa envia o arquivo (vai para o SharePoint).</span>
          </span>
        </label>
      )}
      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting}>{submitting ? 'Criando...' : 'Criar'}</Button>
      </div>
    </div>
  );
}




export function AbaOverrides() {
  const [lista, setLista] = useState([]);
  const [membros, setMembros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novoOpen, setNovoOpen] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [o, m] = await Promise.all([api.admin.overrides.list(), api.membros()]);
      setLista(o);
      setMembros(m);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const membroMap = Object.fromEntries(membros.map(m => [m.id, m]));

  async function remover(id) {
    if (!confirm('Remover este override?')) return;
    try { await api.admin.overrides.remove(id); toast.success('Removido'); carregar(); }
    catch (e) { toast.error(e.message); }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">{lista.length} overrides</p>
          <p className="text-xs text-muted-foreground">Semana com capacidade diferente do normal: férias = 0 horas · semana de pico = horas a mais</p>
        </div>
        <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Novo</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo override de capacidade</DialogTitle></DialogHeader>
            <NovoOverrideForm membros={membros} onSuccess={() => { setNovoOpen(false); carregar(); }} />
          </DialogContent>
        </Dialog>
      </div>
      {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto my-8 text-muted-foreground" /> : (
        <div className="space-y-2">
          {lista.map(o => (
            <Card key={o.id} className="p-3 flex flex-wrap items-center gap-3">
              <p className="font-medium text-sm min-w-[140px]">{membroMap[o.membro_id]?.profile?.name || '(membro)'}</p>
              <Badge variant="secondary">{o.semana_inicio}</Badge>
              <span className="text-sm font-mono">{o.horas_disponiveis}h disponíveis</span>
              <span className="text-sm text-muted-foreground flex-1 min-w-[200px]">{o.motivo || '—'}</span>
              <Button size="icon" variant="outline" onClick={() => remover(o.id)} className="text-red-600 dark:text-red-400">
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function NovoOverrideForm({ membros, onSuccess }) {
  function proximaSegunda() {
    const d = new Date();
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1 + 7);
    return d.toISOString().slice(0, 10);
  }
  const [form, setForm] = useState({ membro_id: '', semana_inicio: proximaSegunda(), horas_disponiveis: 0, motivo: '' });
  const [submitting, setSubmitting] = useState(false);
  async function submit() {
    if (!form.membro_id || !form.semana_inicio) { toast.error('Membro e semana obrigatórios'); return; }
    setSubmitting(true);
    try {
      await api.admin.overrides.create({
        ...form,
        horas_disponiveis: parseFloat(form.horas_disponiveis),
      });
      toast.success('Criado');
      onSuccess();
    } catch (e) { toast.error(e.message); }
    finally { setSubmitting(false); }
  }
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Membro *</Label>
        <Select value={form.membro_id} onValueChange={v => setForm(f => ({ ...f, membro_id: v }))}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {membros.map(m => <SelectItem key={m.id} value={m.id}>{m.profile?.name} · {m.habilidade}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Semana (segunda) *</Label>
          <DatePicker value={form.semana_inicio}
            onChange={v => setForm(f => ({ ...f, semana_inicio: v }))} />
        </div>
        <div className="space-y-2">
          <Label>Horas disponíveis *</Label>
          <Input type="number" step="0.5" value={form.horas_disponiveis}
            onChange={e => setForm(f => ({ ...f, horas_disponiveis: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Motivo</Label>
        <Input value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
          placeholder="Férias · feriado · pico AMI" />
      </div>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting}>{submitting ? 'Criando...' : 'Criar'}</Button>
      </div>
    </div>
  );
}





const CULTOS_LABEL = { cbrio: 'CBRio', ami: 'AMI', kids: 'Kids' };
const VISIBILIDADE_LABEL = {
  equipe: 'Equipe vê e marca',
  lider_move: 'Equipe vê, só o líder marca',
  so_lider: 'Só o líder vê',
};
const nomeMembro = (m) => (m?.profile?.name || m?.nome_display || '—');

export function AbaPadroes() {
  const [lista, setLista] = useState([]);
  const [itens, setItens] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [membros, setMembros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novoOpen, setNovoOpen] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c, t, m, i] = await Promise.all([
        api.admin.cicloPadroes.list(),
        api.admin.cicloPadroes.categorias(),
        api.admin.etiquetasTipo.list(),
        api.membros(),
        api.admin.cicloItens.list(),
      ]);
      setLista(p);

      setCategorias([{ id: 'global', name: 'Padrão · todo evento com ciclo' }, ...(c || [])]);
      setTipos((t || []).filter(x => x.ativo));
      setMembros(m);
      setItens(i || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function salvar(id, payload) {
    try { await api.admin.cicloPadroes.update(id, payload); carregar(); }
    catch (e) { toast.error(e.message); }
  }
  async function remover(id) {
    if (!confirm('Remover este padrão? A etapa deixa de gerar tarefa para este culto.')) return;
    try { await api.admin.cicloPadroes.remove(id); toast.success('Removido'); carregar(); }
    catch (e) { toast.error(e.message); }
  }
  async function aplicar() {
    if (!confirm('Aplicar os padrões aos cards de evento ativos que estão sem etiqueta e/ou sem dono?\nNão sobrescreve o que já foi classificado.')) return;
    setAplicando(true);
    try {
      const r = await api.admin.cicloPadroes.aplicar();
      toast.success(`${r?.atualizados || 0} card(s) atualizado(s)`);
    } catch (e) { toast.error(e.message); }
    finally { setAplicando(false); }
  }


  const catMap = Object.fromEntries(categorias.map(c => [c.id, c.name]));
  const grupos = {};
  const bucket = (catId, fase) => {
    const chave = catId || 'global';
    const cat = catMap[chave] || '(categoria)';
    grupos[cat] = grupos[cat] || {};
    grupos[cat][fase] = grupos[cat][fase] || { catId: chave, padroes: [], itens: [] };
    return grupos[cat][fase];
  };
  for (const p of lista) bucket(p.category_id, p.nome_fase).padroes.push(p);
  for (const i of itens) if (i.ativo !== false) bucket(i.category_id, i.nome_fase).itens.push(i);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">{lista.length} padrões · {itens.filter(i => i.ativo !== false).length} subtarefas</p>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Cada etapa do ciclo gera uma tarefa por culto, com o responsável, quem vê e as subtarefas abaixo.
            Mudanças valem para as tarefas que nascerem daqui em diante.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={aplicar} disabled={aplicando || !lista.length}>
            {aplicando ? 'Aplicando...' : 'Aplicar a cards ativos'}
          </Button>
          <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
            <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Novo padrão</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo padrão por etapa</DialogTitle></DialogHeader>
              <NovoPadraoForm categorias={categorias} tipos={tipos} membros={membros}
                onSuccess={() => { setNovoOpen(false); carregar(); }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto my-8 text-muted-foreground" /> : (
        lista.length === 0 && itens.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Nenhum padrão ainda. Crie o primeiro · ex.: (Série × Briefing × CBRio) → Cauã.
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(grupos).map(([cat, fases]) => (
              <div key={cat} className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</p>
                {Object.entries(fases).map(([fase, g]) => (
                  <Card key={fase} className="p-3 space-y-3">
                    <p className="font-semibold text-sm">{fase}</p>
                    <div className="space-y-2">
                      {g.padroes
                        .slice().sort((a, b) => (a.culto || '').localeCompare(b.culto || ''))
                        .map(p => (
                          <PadraoRow key={p.id} padrao={p} tipos={tipos} membros={membros} onSave={salvar} onRemove={remover} />
                        ))}
                      {g.padroes.length === 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">Sem padrão: esta etapa não gera tarefa. As subtarefas abaixo ficam sem uso.</p>
                      )}
                    </div>
                    <ItensEtapa categoryId={g.catId} fase={fase} itens={g.itens} membros={membros} onChange={carregar} />
                  </Card>
                ))}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function PadraoRow({ padrao, tipos, membros, onSave, onRemove }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border p-2">
      <Badge variant="secondary" className="min-w-[88px] justify-center">
        {padrao.culto ? CULTOS_LABEL[padrao.culto] : 'Todos os cultos'}
      </Badge>

      <Select value={padrao.atribuido_a || '__none__'}
        onValueChange={v => onSave(padrao.id, { atribuido_a: v === '__none__' ? null : v })}>
        <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue placeholder="Responsável..." /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">(sem responsável)</SelectItem>
          {membros.map(m => <SelectItem key={m.id} value={m.id}>{nomeMembro(m)} · {m.habilidade}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={padrao.visibilidade || 'equipe'}
        onValueChange={v => onSave(padrao.id, { visibilidade: v })}>
        <SelectTrigger className="w-[210px] h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(VISIBILIDADE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={padrao.etiqueta_tipo_id || '__none__'}
        onValueChange={v => onSave(padrao.id, { etiqueta_tipo_id: v === '__none__' ? null : v })}>
        <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue placeholder="Etiqueta..." /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">(sem etiqueta)</SelectItem>
          {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
        </SelectContent>
      </Select>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" checked={padrao.ativo} onChange={e => onSave(padrao.id, { ativo: e.target.checked })} />
        Ativo
      </label>

      <Button size="icon" variant="outline" onClick={() => onRemove(padrao.id)} className="text-red-600 dark:text-red-400 ml-auto h-8 w-8">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}


function ItensEtapa({ categoryId, fase, itens, membros, onChange }) {
  const [novoTexto, setNovoTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const ordenados = itens.slice().sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  async function salvar(id, payload) {
    try {
      const r = await api.admin.cicloItens.update(id, payload);
      const n = r?.propagacao?.subtarefas || 0;
      if (r?.propagacao?.erro) toast.warning(r.propagacao.erro);
      else if (n > 0) toast.success(`${n} ${n === 1 ? 'subtarefa aberta recebeu' : 'subtarefas abertas receberam'} o esforço novo`);
      onChange();
    }
    catch (e) { toast.error(e.message); }
  }
  async function remover(id) {
    if (!confirm('Tirar esta subtarefa da etapa? As tarefas que já existem não mudam.')) return;
    try { await api.admin.cicloItens.remove(id); onChange(); }
    catch (e) { toast.error(e.message); }
  }
  async function adicionar() {
    if (!novoTexto.trim()) return;
    setSalvando(true);
    try {
      const ordem = ordenados.length ? Math.max(...ordenados.map(i => i.ordem ?? 0)) + 1 : 1;
      await api.admin.cicloItens.create({ category_id: categoryId, nome_fase: fase, texto: novoTexto.trim(), ordem });
      setNovoTexto('');
      onChange();
    } catch (e) { toast.error(e.message); }
    finally { setSalvando(false); }
  }

  return (
    <div className="space-y-1.5 border-t pt-2">
      <p className="text-xs font-medium text-muted-foreground">Subtarefas</p>
      {ordenados.map(i => <ItemPadraoRow key={i.id} item={i} membros={membros} onSave={salvar} onRemove={remover} />)}
      {ordenados.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma subtarefa.</p>}
      <div className="flex gap-2 pt-1">
        <Input value={novoTexto} onChange={e => setNovoTexto(e.target.value)} placeholder="Nova subtarefa"
          className="h-8 text-xs" onKeyDown={e => { if (e.key === 'Enter') adicionar(); }} />
        <Button size="sm" variant="outline" onClick={adicionar} disabled={salvando || !novoTexto.trim()} className="h-8">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ItemPadraoRow({ item, membros, onSave, onRemove }) {
  const [texto, setTexto] = useState(item.texto);
  const [esforco, setEsforco] = useState(String(item.esforco_valor ?? 0));
  useEffect(() => { setTexto(item.texto); setEsforco(String(item.esforco_valor ?? 0)); }, [item.texto, item.esforco_valor]);

  function salvarEsforco() {
    const v = Number(String(esforco).replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) { toast.error('Esforço deve ser um número maior ou igual a zero'); setEsforco(String(item.esforco_valor ?? 0)); return; }
    if (v !== Number(item.esforco_valor)) onSave(item.id, { esforco_valor: v });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input value={texto} onChange={e => setTexto(e.target.value)}
        onBlur={() => { if (texto.trim() && texto.trim() !== item.texto) onSave(item.id, { texto: texto.trim() }); else setTexto(item.texto); }}
        className="h-8 text-xs flex-1 min-w-[180px]" />

      <Select value={item.membro_id || '__resp__'}
        onValueChange={v => onSave(item.id, { membro_id: v === '__resp__' ? null : v })}>
        <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__resp__">Responsável da tarefa</SelectItem>
          {membros.map(m => <SelectItem key={m.id} value={m.id}>{nomeMembro(m)}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={item.culto || '__todos__'}
        onValueChange={v => onSave(item.id, { culto: v === '__todos__' ? null : v })}>
        <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__todos__">Todos os cultos</SelectItem>
          {Object.entries(CULTOS_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
        </SelectContent>
      </Select>

      <Input value={esforco} onChange={e => setEsforco(e.target.value)} onBlur={salvarEsforco}
        inputMode="decimal" className="h-8 text-xs w-[64px]" aria-label="Esforço" />
      <Select value={item.esforco_unidade || 'horas'} onValueChange={v => onSave(item.id, { esforco_unidade: v })}>
        <SelectTrigger className="w-[88px] h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="horas">horas</SelectItem>
          <SelectItem value="dias">dias</SelectItem>
        </SelectContent>
      </Select>

      <label className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Só fecha com texto registrado (ex.: o conceito do briefing)">
        <input type="checkbox" checked={!!item.exige_registro} onChange={e => onSave(item.id, { exige_registro: e.target.checked })} />
        Exige registro
      </label>

      <Button size="icon" variant="outline" onClick={() => onRemove(item.id)} className="text-red-600 dark:text-red-400 h-8 w-8">
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function NovoPadraoForm({ categorias, tipos, membros, onSuccess }) {
  const [form, setForm] = useState({ category_id: '', nome_fase: '', etiqueta_tipo_id: '', atribuido_a: '', culto: '', visibilidade: 'equipe' });
  const [fases, setFases] = useState([]);
  const [loadingFases, setLoadingFases] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function escolherCategoria(catId) {
    setForm(f => ({ ...f, category_id: catId, nome_fase: '' }));
    setFases([]);
    if (!catId) return;
    setLoadingFases(true);
    try { setFases(await api.admin.cicloPadroes.fases(catId)); }
    catch (e) { toast.error(e.message); }
    finally { setLoadingFases(false); }
  }

  async function submit() {
    if (!form.category_id || !form.nome_fase) { toast.error('Categoria e etapa obrigatórias'); return; }
    if (!form.etiqueta_tipo_id && !form.atribuido_a) { toast.error('Informe ao menos responsável ou etiqueta'); return; }
    setSubmitting(true);
    try {
      await api.admin.cicloPadroes.create({
        category_id: form.category_id,
        nome_fase: form.nome_fase,
        etiqueta_tipo_id: form.etiqueta_tipo_id || null,
        atribuido_a: form.atribuido_a || null,
        culto: form.culto || null,
        visibilidade: form.visibilidade,
      });
      toast.success('Criado');
      onSuccess();
    } catch (e) { toast.error(e.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Categoria do evento *</Label>
        <Select value={form.category_id} onValueChange={escolherCategoria}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Etapa *</Label>
        <Select value={form.nome_fase} onValueChange={v => setForm(f => ({ ...f, nome_fase: v }))}
          disabled={!form.category_id || loadingFases}>
          <SelectTrigger>
            <SelectValue placeholder={loadingFases ? 'Carregando...' : (form.category_id ? 'Selecione a etapa' : 'Escolha a categoria antes')} />
          </SelectTrigger>
          <SelectContent>
            {fases.map(f => <SelectItem key={f.nome} value={f.nome}>{f.numero ? `${f.numero}. ` : ''}{f.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        {form.category_id && !loadingFases && fases.length === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">Sem etapas no catálogo · confira os modelos do ciclo criativo.</p>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Culto</Label>
          <Select value={form.culto || '__todos__'} onValueChange={v => setForm(f => ({ ...f, culto: v === '__todos__' ? '' : v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos__">Todos os cultos</SelectItem>
              {Object.entries(CULTOS_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Quem vê</Label>
          <Select value={form.visibilidade} onValueChange={v => setForm(f => ({ ...f, visibilidade: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(VISIBILIDADE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Responsável</Label>
          <Select value={form.atribuido_a || '__none__'}
            onValueChange={v => setForm(f => ({ ...f, atribuido_a: v === '__none__' ? '' : v }))}>
            <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">(sem responsável)</SelectItem>
              {membros.map(m => <SelectItem key={m.id} value={m.id}>{nomeMembro(m)} · {m.habilidade}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Etiqueta</Label>
          <Select value={form.etiqueta_tipo_id || '__none__'}
            onValueChange={v => setForm(f => ({ ...f, etiqueta_tipo_id: v === '__none__' ? '' : v }))}>
            <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">(sem etiqueta)</SelectItem>
              {tipos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">"Todos os cultos" vale onde o culto não tem padrão próprio.</p>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={submitting}>{submitting ? 'Criando...' : 'Criar'}</Button>
      </div>
    </div>
  );
}

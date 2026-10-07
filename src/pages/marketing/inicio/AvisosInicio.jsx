import { useState } from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { marketing as api } from '../../../api';














export const TEXTO_MAX = 600;
const DURACAO_PADRAO_DIAS = 7;

const DIA_MS = 86400000;
export function somarDias(dia, n) {
  const t = Date.parse(`${dia}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t + n * DIA_MS).toISOString().slice(0, 10) : '';
}
export const ddmmaaaa = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');

const formVazio = (hoje) => ({ id: null, texto: '', inicio: hoje || '', fim: hoje ? somarDias(hoje, DURACAO_PADRAO_DIAS - 1) : '' });

export default function AvisosInicioDialog({ dados, onClose, onMudou }) {
  const hoje = dados?.hoje || '';
  const disponivel = dados?.disponivel !== false;
  const [form, setForm] = useState(() => formVazio(hoje));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [tirando, setTirando] = useState(null);

  const editando = !!form.id;
  const texto = form.texto.trim();
  const podeSalvar = disponivel && !salvando && texto.length > 0 && texto.length <= TEXTO_MAX && !!form.inicio && !!form.fim;

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setErro(null); };

  async function salvar(e) {
    e.preventDefault();
    if (!podeSalvar) return;
    setSalvando(true); setErro(null);
    try {
      const corpo = { texto: form.texto, inicio: form.inicio, fim: form.fim };
      if (editando) await api.avisosInicio.atualizar(form.id, corpo);
      else await api.avisosInicio.criar(corpo);
      toast.success(editando ? 'Aviso salvo.' : 'Aviso publicado.');
      setForm(formVazio(hoje));
      await onMudou?.();
    } catch (err) {
      setErro(err?.message || 'Não foi possível salvar o aviso.');
    } finally { setSalvando(false); }
  }

  async function tirar(id) {
    setSalvando(true); setErro(null);
    try {
      await api.avisosInicio.remover(id);
      toast.success('Aviso tirado do Início.');
      if (form.id === id) setForm(formVazio(hoje));
      setTirando(null);
      await onMudou?.();
    } catch (err) {
      setErro(err?.message || 'Não foi possível tirar o aviso.');
    } finally { setSalvando(false); }
  }

  const editar = (a) => { setForm({ id: a.id, texto: a.texto, inicio: a.inicio, fim: a.fim }); setErro(null); setTirando(null); };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !salvando) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">Avisos do Início</DialogTitle>
          <DialogDescription>
            O aviso aparece para toda a equipe no “Aviso Importante!”, do dia inicial ao final (os dois inclusive).
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto -mx-6 px-6 space-y-6">
          {!disponivel && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100" role="status">
              {dados?.motivo || 'Os avisos do Início ainda não estão disponíveis.'}
            </p>
          )}

          <form onSubmit={salvar} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="aviso-texto">{editando ? 'Editando o aviso' : 'Novo aviso'}</Label>
              <Textarea
                id="aviso-texto"
                value={form.texto}
                onChange={set('texto')}
                rows={4}
                maxLength={TEXTO_MAX}
                placeholder="Ex.: Quinta tem reunião geral às 10h. Tragam as pautas!"
                disabled={!disponivel || salvando}
              />
              <p className="text-xs text-muted-foreground text-right tabular-nums">{form.texto.trim().length}/{TEXTO_MAX}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="aviso-inicio">Aparece de</Label>
                <Input id="aviso-inicio" type="date" value={form.inicio} onChange={set('inicio')} disabled={!disponivel || salvando} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="aviso-fim">Até</Label>
                <Input id="aviso-fim" type="date" value={form.fim} min={hoje || undefined} onChange={set('fim')} disabled={!disponivel || salvando} />
              </div>
            </div>
            {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={!podeSalvar}>
                {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {editando ? 'Salvar aviso' : 'Publicar aviso'}
              </Button>
              {editando && (
                <Button type="button" variant="ghost" disabled={salvando} onClick={() => { setForm(formVazio(hoje)); setErro(null); }}>
                  Cancelar edição
                </Button>
              )}
            </div>
          </form>

          {disponivel && (
            <>
              <ListaAvisos
                titulo="No ar agora"
                vazio="Nenhum aviso no ar."
                avisos={dados?.vigentes || []}
                editandoId={form.id}
                tirando={tirando}
                salvando={salvando}
                onEditar={editar}
                onPedirTirar={setTirando}
                onTirar={tirar}
              />
              <ListaAvisos
                titulo="Agendados"
                vazio="Nenhum aviso agendado."
                avisos={dados?.agendados || []}
                editandoId={form.id}
                tirando={tirando}
                salvando={salvando}
                onEditar={editar}
                onPedirTirar={setTirando}
                onTirar={tirar}
              />
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ListaAvisos({ titulo, vazio, avisos, editandoId, tirando, salvando, onEditar, onPedirTirar, onTirar }) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground mb-2">{titulo}</h3>
      {avisos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {avisos.map(a => (
            <li key={a.id} className={`px-3 py-2.5 ${editandoId === a.id ? 'bg-muted/60' : ''}`}>
              <p className="text-sm text-foreground whitespace-pre-line break-words line-clamp-4">{a.texto}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {a.inicio === a.fim ? `Só em ${ddmmaaaa(a.inicio)}` : `De ${ddmmaaaa(a.inicio)} a ${ddmmaaaa(a.fim)}`}
                </span>
                <span className="ml-auto flex items-center gap-1">
                  {tirando === a.id ? (
                    <>
                      <span className="text-xs text-muted-foreground">Tirar do Início?</span>
                      <Button type="button" size="sm" variant="destructive" disabled={salvando} onClick={() => onTirar(a.id)}>Tirar</Button>
                      <Button type="button" size="sm" variant="ghost" disabled={salvando} onClick={() => onPedirTirar(null)}>Manter</Button>
                    </>
                  ) : (
                    <>
                      <Button type="button" size="sm" variant="ghost" disabled={salvando} onClick={() => onEditar(a)} aria-label={`Editar o aviso de ${ddmmaaaa(a.inicio)}`}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar
                      </Button>
                      <Button type="button" size="sm" variant="ghost" disabled={salvando} onClick={() => onPedirTirar(a.id)} aria-label={`Tirar o aviso de ${ddmmaaaa(a.inicio)}`}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Tirar
                      </Button>
                    </>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Upload, X, Paperclip, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { marketingLinha } from '../../../api';
import { enviarParaSharePoint } from '../../../lib/enviarParaSharePoint';












const ddmm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');
let seq = 0;
const novaChave = () => `novo-${(seq += 1)}`;

function emBranco(semana, responsavel) {
  return { chave: novaChave(), id: null, semana: semana.n, dia_provavel: semana.primeiro_dia, nome: '', ref_url: '', descricao: '', responsavel_membro_id: responsavel || '', ref_arquivos: [] };
}

export default function PlanejamentoPostagens({ mes, dados, onClose, onSalvo }) {
  const [carga, setCarga] = useState(null);
  const [erroCarga, setErroCarga] = useState(null);
  const [posts, setPosts] = useState([]);
  const [responsavel, setResponsavel] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [enviandoRef, setEnviandoRef] = useState(null);
  const inputsRef = useRef({});

  const membros = useMemo(() => (dados?.membros || []).filter(m => m.ativo !== false), [dados]);

  useEffect(() => {
    let vivo = true;
    marketingLinha.planos.get(mes)
      .then((r) => {
        if (!vivo) return;
        setCarga(r);
        setResponsavel(r.responsavel_membro_id || '');
        setPosts((r.posts || []).map(p => ({ ...p, chave: p.id || novaChave(), responsavel_membro_id: p.responsavel_membro_id || r.responsavel_membro_id || '' })));
      })
      .catch((e) => { if (vivo) setErroCarga(e?.message || 'Não foi possível carregar o planejamento.'); });
    return () => { vivo = false; };
  }, [mes]);

  const semanas = carga?.semanas || [];
  const podeEditar = !!carga?.pode_editar;
  const bloqueado = !podeEditar || salvando;

  const mudar = (chave, campo, valor) => {
    setPosts(ps => ps.map(p => (p.chave === chave ? { ...p, [campo]: valor } : p)));
    setErro(null);
  };
  const adicionar = (semana) => setPosts(ps => [...ps, emBranco(semana, responsavel)]);
  const tirar = (chave) => setPosts(ps => ps.filter(p => p.chave !== chave));


  const trocarResponsavel = (id) => {
    setResponsavel(id);
    setPosts(ps => ps.map(p => (p.responsavel_membro_id ? p : { ...p, responsavel_membro_id: id })));
  };

  async function enviarRef(post, arquivo) {
    if (!arquivo) return;
    setEnviandoRef(post.chave);
    setErro(null);
    try {
      const s = await marketingLinha.planos.refSessao(mes, arquivo);
      const sp = await enviarParaSharePoint({ uploadUrl: s.upload_url, arquivo });
      setPosts(ps => ps.map(p => (p.chave === post.chave
        ? { ...p, ref_arquivos: [...p.ref_arquivos, { drive_id: s.drive_id, sharepoint_item_id: sp.id, nome: sp.name || arquivo.name }] }
        : p)));
    } catch (e) {
      setErro(e?.message || 'Não foi possível enviar o arquivo de referência.');
    } finally {
      setEnviandoRef(null);
      const el = inputsRef.current[post.chave];
      if (el) el.value = '';
    }
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const corpo = {
        responsavel_membro_id: responsavel || null,
        posts: posts.map(p => ({
          id: p.id || undefined, semana: p.semana, dia_provavel: p.dia_provavel, nome: p.nome,
          ref_url: p.ref_url, descricao: p.descricao, responsavel_membro_id: p.responsavel_membro_id || null,
          ref_arquivos: (p.ref_arquivos || []).map(r => (r.item_id ? { item_id: r.item_id } : { drive_id: r.drive_id, sharepoint_item_id: r.sharepoint_item_id })),
        })),
      };
      const r = await marketingLinha.planos.salvar(mes, corpo);
      toast.success(`Planejamento salvo: ${r.postagens} ${r.postagens === 1 ? 'postagem' : 'postagens'} nas tarefas de Redes · Produção.`);

      if (r.aviso) toast.warning(r.aviso);
      await onSalvo?.();
      onClose();
    } catch (e) {
      setErro(e?.message || 'Não foi possível salvar o planejamento.');
    } finally {
      setSalvando(false);
    }
  }

  const titulo = carga?.nome_mes ? `Planejamento de postagens · ${carga.nome_mes.charAt(0).toUpperCase()}${carga.nome_mes.slice(1)}` : 'Planejamento de postagens';

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !salvando) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">{titulo}</DialogTitle>
          <DialogDescription>
            Um bloco por semana do mês. Ao salvar, nascem em Redes · Produção os cards de produzir (na semana anterior à postagem) e de postar (na semana da postagem).
          </DialogDescription>
        </DialogHeader>

        {erroCarga ? (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> {erroCarga}
          </p>
        ) : !carga ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Carregando" /></div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="plano-responsavel" className="text-sm font-medium">Produção e postagem com</label>
              <select
                id="plano-responsavel"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={responsavel}
                disabled={bloqueado}
                onChange={(e) => trocarResponsavel(e.target.value)}
              >
                <option value="">Escolha…</option>
                {membros.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
              {!podeEditar && <span className="text-xs text-muted-foreground">Somente leitura: quem salva é quem faz o planejamento ou o líder.</span>}
              {carga.plano?.gerado_em && <span className="text-xs text-muted-foreground">Já gerou as tarefas · salvar de novo atualiza o que ainda não foi feito.</span>}
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6 space-y-5 py-1">
              {semanas.map(s => {
                const daSemana = posts.filter(p => p.semana === s.n);
                return (
                  <section key={s.n} aria-label={`Semana ${s.n}`} className="rounded-lg border border-border p-3 space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold">Semana {s.n}</h3>
                      <span className="text-xs text-muted-foreground">
                        posta de {ddmm(s.primeiro_dia)} a {ddmm(s.ultimo_dia)} · produz de {ddmm(s.producao?.inicio)} a {ddmm(s.producao?.fim)}
                      </span>
                    </div>
                    {daSemana.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma postagem nesta semana.</p>}
                    {daSemana.map((p, i) => (
                      <div key={p.chave} className="rounded-md bg-muted/40 p-3 space-y-2" aria-label={`Postagem ${i + 1} da semana ${s.n}`}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <label className="text-xs space-y-1">
                            <span className="font-medium">Dia provável da postagem</span>
                            <Input type="date" value={p.dia_provavel || ''} min={s.primeiro_dia} max={s.ultimo_dia}
                              disabled={bloqueado} onChange={(e) => mudar(p.chave, 'dia_provavel', e.target.value)} />
                          </label>
                          <label className="text-xs space-y-1">
                            <span className="font-medium">Responsável</span>
                            <select className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                              value={p.responsavel_membro_id || ''} disabled={bloqueado}
                              onChange={(e) => mudar(p.chave, 'responsavel_membro_id', e.target.value)}>
                              <option value="">Escolha…</option>
                              {membros.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                            </select>
                          </label>
                        </div>
                        <label className="text-xs space-y-1 block">
                          <span className="font-medium">Nome (tarefa, vídeo ou post)</span>
                          <Input value={p.nome} maxLength={200} disabled={bloqueado} placeholder="Ex.: Reels da semana · bastidores do culto"
                            onChange={(e) => mudar(p.chave, 'nome', e.target.value)} />
                        </label>
                        <div className="space-y-1">
                          <label className="text-xs space-y-1 block">
                            <span className="font-medium">Ref (link de referência)</span>
                            <Input type="url" value={p.ref_url} disabled={bloqueado} placeholder="https://…"
                              onChange={(e) => mudar(p.chave, 'ref_url', e.target.value)} />
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            {(p.ref_arquivos || []).map((r, j) => (
                              <span key={`${r.item_id || r.sharepoint_item_id}-${j}`} className="inline-flex items-center gap-1 rounded bg-background px-2 py-0.5 text-xs">
                                <Paperclip className="h-3 w-3" aria-hidden="true" />
                                {r.web_url ? <a href={r.web_url} target="_blank" rel="noreferrer" className="underline">{r.nome}</a> : r.nome}
                                {!bloqueado && (
                                  <button type="button" aria-label={`Tirar ${r.nome}`} className="text-muted-foreground hover:text-foreground"
                                    onClick={() => mudar(p.chave, 'ref_arquivos', p.ref_arquivos.filter((_, k) => k !== j))}>
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </span>
                            ))}
                            {!bloqueado && (
                              <>
                                <input ref={(el) => { inputsRef.current[p.chave] = el; }} type="file" className="hidden"
                                  aria-label={`Arquivo de referência da postagem ${i + 1} da semana ${s.n}`}
                                  onChange={(e) => enviarRef(p, e.target.files?.[0])} />
                                <Button type="button" size="sm" variant="outline" className="h-7" disabled={enviandoRef === p.chave}
                                  onClick={() => inputsRef.current[p.chave]?.click()}>
                                  {enviandoRef === p.chave ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />} Enviar arquivo
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                        <label className="text-xs space-y-1 block">
                          <span className="font-medium">Descrição</span>
                          <Textarea rows={2} value={p.descricao} maxLength={2000} disabled={bloqueado} placeholder="Observações para quem produz"
                            onChange={(e) => mudar(p.chave, 'descricao', e.target.value)} />
                        </label>
                        {!bloqueado && (
                          <div className="flex justify-end">
                            <Button type="button" size="sm" variant="ghost" className="h-7 text-muted-foreground" onClick={() => tirar(p.chave)}>
                              Tirar postagem
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                    {!bloqueado && (
                      <Button type="button" size="sm" variant="outline" onClick={() => adicionar(s)} aria-label={`Adicionar postagem na semana ${s.n}`}>
                        <Plus aria-hidden="true" /> postagem
                      </Button>
                    )}
                  </section>
                );
              })}
            </div>

            {erro && <p className="text-sm text-destructive" role="alert">{erro}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" disabled={salvando} onClick={onClose}>{podeEditar ? 'Cancelar' : 'Fechar'}</Button>
              {podeEditar && (
                <Button type="button" disabled={salvando} onClick={salvar}>
                  {salvando && <Loader2 className="animate-spin" aria-hidden="true" />} Salvar e gerar as tarefas
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

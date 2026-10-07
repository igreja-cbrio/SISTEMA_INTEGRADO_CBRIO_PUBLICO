




















import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtualizacaoAutomatica, horaCurta } from '@/hooks/useAtualizacaoAutomatica';
import { censo } from '../../api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Users, MessageCircle, AlertTriangle, Search, Lock, RefreshCw, Copy, ChevronDown, ChevronRight, Crown } from 'lucide-react';
import { hrefWhatsapp } from '@/lib/conversas';
import { contemNormalizado } from '@/lib/busca';
import { toast } from 'sonner';

type Pessoa = {
  membro_id: string; nome: string | null; telefone: string | null; telefone_fonte: string | null;
  papel: string | null; outros_grupos: string[]; mensagem: string | null;
};
type Lider = { membro_id: string | null; nome: string | null; telefone: string | null; sem_censo: boolean | null };
type Grupo = {
  grupo_id: string; nome: string | null; categoria: string; dia_semana: number | null; horario: string | null;
  lider: Lider; total: number; sem_censo: number; pessoas: Pessoa[];
};
type LiderSemCenso = {
  membro_id: string; nome: string | null; telefone: string | null; telefone_fonte: string | null;
  grupos: string[]; mensagem: string | null;
};
type Dados = {
  grupos: Grupo[];
  lideres_sem_censo: LiderSemCenso[];
  categorias: { categoria: string; grupos: number; total: number; sem_censo: number }[];
  totais: {
    pessoas: number; sem_censo: number; responderam: number; sem_telefone: number;
    grupos: number; grupos_com_faltante: number; lideres_sem_censo: number;
    vinculos_grupo_inativo: number; vinculos_sem_cadastro: number;
  };
  link: string | null; nominal: boolean;
};

const TODAS = '__todas__';
const PAGINA_PESSOAS = 15;
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function quando(g: Grupo) {
  const dia = g.dia_semana != null ? DIAS[g.dia_semana] : null;
  const hora = g.horario ? String(g.horario).slice(0, 5) : null;
  return [dia, hora].filter(Boolean).join(' · ') || null;
}

export default function GruposSemCenso({ pesquisaId, nivel }: { pesquisaId: string | null; nivel: number }) {
  const nominal = nivel >= 4;
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [categoria, setCategoria] = useState<string>(TODAS);
  const [soComFaltante, setSoComFaltante] = useState(true);
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null);
  const [mostrarTudo, setMostrarTudo] = useState<Record<string, boolean>>({});
  const [busca, setBusca] = useState('');
  const [lideresAbertos, setLideresAbertos] = useState(false);

  const [contatados, setContatados] = useState<Record<string, boolean>>({});

  const carregar = useCallback(async (opts: { silencioso?: boolean } = {}) => {
    if (!pesquisaId) return;
    if (!opts.silencioso) { setCarregando(true); setErro(null); }
    try {
      setD(await (nominal ? censo.potencialGrupos(pesquisaId) : censo.potencialGruposResumo(pesquisaId)));
      if (opts.silencioso) setErro(null);
    } catch (e: unknown) {
      if (!opts.silencioso) setErro(e instanceof Error ? e.message : 'Não foi possível carregar');
      throw e;
    } finally { if (!opts.silencioso) setCarregando(false); }
  }, [pesquisaId, nominal]);
  useEffect(() => { carregar().catch(() => {}); }, [carregar]);
  const { atualizadoEm, marcarAtualizado } = useAtualizacaoAutomatica(
    () => carregar({ silencioso: true }), { ativo: !!pesquisaId },
  );
  useEffect(() => { if (d) marcarAtualizado(); }, [d]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtrar = useCallback((lista: Pessoa[]) => (
    busca.trim()
      ? lista.filter((p) => contemNormalizado(p.nome || '', busca) || contemNormalizado(p.telefone || '', busca))
      : lista
  ), [busca]);

  const buscando = nominal && busca.trim().length > 0;


  const gruposVisiveis = useMemo(() => {
    if (!d) return [];
    return d.grupos
      .filter((g) => categoria === TODAS || g.categoria === categoria)
      .filter((g) => !soComFaltante || g.sem_censo > 0)
      .map((g) => ({ g, lista: nominal ? filtrar(g.pessoas) : [] }))
      .filter(({ g, lista }) => !buscando
        || lista.length > 0
        || contemNormalizado(g.nome || '', busca)
        || contemNormalizado(g.lider.nome || '', busca));
  }, [d, categoria, soComFaltante, nominal, filtrar, buscando, busca]);


  const recorte = useMemo(() => {
    const vistos = new Set<string>();
    let semCenso = 0;
    for (const { g, lista } of gruposVisiveis) {
      if (!nominal) { semCenso += g.sem_censo; continue; }
      for (const p of lista) if (!vistos.has(p.membro_id)) { vistos.add(p.membro_id); semCenso++; }
    }
    return { semCenso, porVinculo: !nominal };
  }, [gruposVisiveis, nominal]);

  async function copiar(p: { mensagem: string | null }) {
    if (!p.mensagem) return;
    try {
      await navigator.clipboard.writeText(p.mensagem);
      toast.success('Mensagem copiada');
    } catch {
      toast.error('Não foi possível copiar — selecione o texto e copie à mão');
    }
  }

  if (!pesquisaId) return null;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary shrink-0" />
              <span className="font-medium">Pessoas em grupo de conexão que ainda não preencheram</span>
              {d && (
                <Badge variant="secondary" className="tabular-nums">
                  {d.totais.sem_censo} de {d.totais.pessoas}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Quem tem vínculo vivo num grupo ativo e não tem resposta concluída nesta pesquisa (pelo
              cadastro ou pelo CPF digitado). Cada grupo mostra o <strong>líder</strong> ao lado — é
              por ele que a cobrança chega. Quem está em mais de um grupo aparece em cada um, então
              <strong> a soma dos grupos passa do total de pessoas</strong>. A lista encolhe sozinha
              conforme as respostas entram.
            </p>
          </div>
          {atualizadoEm && <span className="text-xs text-muted-foreground">Atualizado às {horaCurta(atualizadoEm)}</span>}
          <Button size="sm" variant="ghost" onClick={() => carregar().catch(() => {})} disabled={carregando}>
            <RefreshCw className={`size-4 mr-1.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>

        {carregando && !d && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="size-4 animate-spin" /> Cruzando os grupos com as respostas…
          </div>
        )}

        {                                         }
        {erro && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
            <span><strong>Não foi possível carregar.</strong> {erro}</span>
          </div>
        )}

        {d && !erro && (
          <>
            {!nominal && (
              <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                <Lock className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                <span>
                  Você vê as contagens por grupo e o nome do líder. <strong>A lista com nome, telefone
                  e o botão do WhatsApp exige nível 4</strong> no censo.
                </span>
              </div>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{d.totais.grupos_com_faltante} de {d.totais.grupos} grupos com alguém sem censo</span>
              {d.totais.lideres_sem_censo > 0 && (
                <button type="button" onClick={() => setLideresAbertos((v) => !v)} aria-expanded={lideresAbertos}
                  className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-500 hover:underline">
                  {lideresAbertos ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                  ⚠️ {d.totais.lideres_sem_censo} líder(es) também não preencheram — ver quem são
                </button>
              )}
              {d.totais.vinculos_grupo_inativo > 0 && (
                <span>{d.totais.vinculos_grupo_inativo} vínculo(s) em grupo inativo ficaram de fora</span>
              )}
              {d.totais.vinculos_sem_cadastro > 0 && (
                <span>{d.totais.vinculos_sem_cadastro} vínculo(s) com cadastro apagado ficaram de fora</span>
              )}
            </div>

            {                                                           }
            {lideresAbertos && d.lideres_sem_censo?.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5">
                <div className="px-3 py-2 flex items-center gap-2 text-sm">
                  <Crown className="size-4 text-amber-600 dark:text-amber-500 shrink-0" aria-hidden />
                  <span className="font-medium">Líderes que ainda não preencheram</span>
                  <Badge variant="outline" className="tabular-nums text-xs">{d.lideres_sem_censo.length}</Badge>
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    — é por eles que a cobrança do grupo chega; quem lidera mais de um grupo aparece uma vez.
                  </span>
                </div>
                <ul className="divide-y border-t">
                  {d.lideres_sem_censo.map((l) => {
                    const k = `lider:${l.membro_id}`;
                    const href = nominal && l.telefone
                      ? (l.mensagem ? hrefWhatsapp(l.telefone, l.mensagem) : hrefWhatsapp(l.telefone))
                      : null;
                    return (
                      <li key={k} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{l.nome || 'Sem nome'}</p>
                          <p className="text-xs text-muted-foreground">
                            {l.grupos.length > 0 ? `Líder de: ${l.grupos.join(', ')}` : 'Líder de grupo'}
                            {nominal && (l.telefone
                              ? <> · {l.telefone}{l.telefone_fonte ? ` (${l.telefone_fonte})` : ''}</>
                              : ' · sem telefone alcançável')}
                          </p>
                        </div>
                        {contatados[k] && <Badge variant="outline" className="text-xs">mensagem aberta</Badge>}
                        {nominal && l.mensagem && (
                          <Button size="sm" variant="ghost" onClick={() => copiar(l)} title="Copiar a mensagem">
                            <Copy className="size-4" />
                          </Button>
                        )}
                        {href && (
                          <Button asChild size="sm" variant="outline"
                            onClick={() => setContatados((m) => ({ ...m, [k]: true }))}>
                            <a href={href} target="_blank" rel="noreferrer">
                              <MessageCircle className="size-4 mr-1.5" /> WhatsApp
                            </a>
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {!nominal && (
                  <p className="px-3 py-2 border-t text-xs text-muted-foreground">
                    Telefone e botão do WhatsApp exigem nível 4 no censo.
                  </p>
                )}
              </div>
            )}

            {                                   }
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setCategoria(TODAS)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${categoria === TODAS
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border text-muted-foreground hover:text-foreground'}`}>
                Todas as categorias
              </button>
              {d.categorias.map((c) => (
                <button key={c.categoria} type="button" onClick={() => setCategoria(c.categoria)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors tabular-nums ${categoria === c.categoria
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  {c.categoria} · {c.sem_censo}/{c.total}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" className="accent-primary" checked={soComFaltante}
                  onChange={(e) => setSoComFaltante(e.target.checked)} />
                só grupos com alguém sem censo
              </label>
              {nominal && (
                <div className="relative max-w-xs flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Buscar por pessoa, líder ou grupo…"
                    value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
              )}
              <span className="text-xs text-muted-foreground tabular-nums">
                {recorte.semCenso} {recorte.porVinculo ? 'vínculo(s)' : 'pessoa(s)'} sem censo neste recorte
              </span>
            </div>

            {nominal && d.totais.sem_telefone > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-500">
                ⚠️ {d.totais.sem_telefone} de {d.totais.sem_censo} não têm telefone alcançável no cadastro —
                aparecem na lista sem o botão. Para essas pessoas o caminho é o líder do grupo.
              </p>
            )}

            <div className="space-y-2">
              {gruposVisiveis.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {d.totais.grupos === 0 ? 'Nenhum grupo ativo com vínculo vivo encontrado.' : 'Nenhum grupo neste recorte.'}
                </p>
              )}
              {gruposVisiveis.map(({ g, lista }) => {
                const aberta = buscando || grupoAberto === g.grupo_id;
                const pct = g.total ? Math.round((g.sem_censo / g.total) * 100) : 0;
                const visiveis = mostrarTudo[g.grupo_id] || buscando ? lista : lista.slice(0, PAGINA_PESSOAS);
                const hrefLider = nominal && g.lider.telefone ? hrefWhatsapp(g.lider.telefone) : null;
                return (
                  <div key={g.grupo_id} className="rounded-md border">
                    {                                                   }
                    <button type="button" className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-muted/40"
                      onClick={() => setGrupoAberto(aberta && !buscando ? null : g.grupo_id)}
                      aria-expanded={aberta} disabled={!nominal}>
                      {nominal && (aberta
                        ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                        : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />)}
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">{g.nome || 'Sem nome'}</span>
                        <span className="block text-xs text-muted-foreground truncate">
                          <Crown className="size-3 inline-block mr-1 -mt-0.5" aria-hidden />
                          {g.lider.nome ? `Líder: ${g.lider.nome}` : 'Sem líder principal cadastrado'}
                          {g.lider.sem_censo === true ? ' · também sem censo' : ''}
                          {quando(g) ? ` · ${quando(g)}` : ''}
                        </span>
                      </span>
                      <span className="hidden sm:block h-1.5 w-24 rounded-full bg-muted overflow-hidden" aria-hidden>
                        <span className="block h-full bg-amber-500" style={{ width: `${pct}%` }} />
                      </span>
                      <Badge variant="outline" className="tabular-nums text-xs shrink-0">{g.sem_censo} de {g.total} sem censo</Badge>
                    </button>

                    {nominal && aberta && (
                      <div className="border-t px-3 py-2 space-y-2">
                        {hrefLider && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="min-w-0 truncate">Falar com o líder ({g.lider.telefone})</span>
                            <Button asChild size="sm" variant="ghost">
                              <a href={hrefLider} target="_blank" rel="noreferrer">
                                <MessageCircle className="size-4 mr-1.5" /> WhatsApp do líder
                              </a>
                            </Button>
                          </div>
                        )}
                        {lista.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {g.sem_censo === 0 ? 'Todo mundo deste grupo já respondeu.' : 'Ninguém casou com a busca neste grupo.'}
                          </p>
                        ) : (
                          <ul className="divide-y rounded-md border">
                            {visiveis.map((p) => {
                              const k = `${g.grupo_id}:${p.membro_id}`;
                              const href = p.mensagem ? hrefWhatsapp(p.telefone, p.mensagem) : hrefWhatsapp(p.telefone);
                              return (
                                <li key={k} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium truncate">
                                      {p.nome || 'Sem nome'}
                                      {p.papel && <span className="ml-2 text-xs font-normal text-muted-foreground">({p.papel})</span>}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {p.telefone
                                        ? <>{p.telefone}{p.telefone_fonte ? ` · ${p.telefone_fonte}` : ''}</>
                                        : 'sem telefone alcançável'}
                                      {p.outros_grupos.length > 0 ? ` · também em: ${p.outros_grupos.join(', ')}` : ''}
                                    </p>
                                  </div>
                                  {contatados[k] && (
                                    <Badge variant="outline" className="text-xs">mensagem aberta</Badge>
                                  )}
                                  {p.mensagem && (
                                    <Button size="sm" variant="ghost" onClick={() => copiar(p)} title="Copiar a mensagem">
                                      <Copy className="size-4" />
                                    </Button>
                                  )}
                                  {href ? (
                                    <Button asChild size="sm" variant="outline"
                                      onClick={() => setContatados((m) => ({ ...m, [k]: true }))}>
                                      <a href={href} target="_blank" rel="noreferrer">
                                        <MessageCircle className="size-4 mr-1.5" /> WhatsApp
                                      </a>
                                    </Button>
                                  ) : (
                                    <Badge variant="outline" className="text-xs text-muted-foreground">sem telefone</Badge>
                                  )}
                                </li>
                              );
                            })}
                            {visiveis.length < lista.length && (
                              <li className="p-2">
                                <Button size="sm" variant="ghost" className="w-full"
                                  onClick={() => setMostrarTudo((m) => ({ ...m, [g.grupo_id]: true }))}>
                                  Mostrar mais {lista.length - visiveis.length} de {lista.length}
                                </Button>
                              </li>
                            )}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {nominal && d.link && (
              <p className="text-xs text-muted-foreground">
                A mensagem leva o link público da pesquisa ({d.link}) — o mesmo do QR, não o link pessoal.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

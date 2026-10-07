














import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtualizacaoAutomatica, horaCurta } from '@/hooks/useAtualizacaoAutomatica';
import { censo } from '../../api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, HandHeart, MessageCircle, AlertTriangle, Search, Lock, RefreshCw, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import { hrefWhatsapp } from '@/lib/conversas';
import { contemNormalizado } from '@/lib/busca';
import { toast } from 'sonner';

type Pessoa = {
  perfil_id: string | null; membro_id: string | null; nome: string | null;
  telefone: string | null; telefone_fonte: string | null; equipes: string[]; mensagem: string | null;
};
type Equipe = { team_id: string; nome: string | null; total: number; sem_censo: number; pessoas: Pessoa[] };
type Area = { area: string; total: number; sem_censo: number; equipes: Equipe[] };
type Dados = {
  areas: Area[];
  totais: { voluntarios: number; sem_censo: number; responderam: number; sem_telefone: number; vinculos_sem_equipe_ativa: number };
  link: string | null; nominal: boolean;
};

const TODAS = '__todas__';



const PAGINA_PESSOAS = 15;

export default function VoluntariosSemCenso({ pesquisaId, nivel }: { pesquisaId: string | null; nivel: number }) {
  const nominal = nivel >= 4;
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [area, setArea] = useState<string>(TODAS);



  const [areaAberta, setAreaAberta] = useState<string | null>(null);
  const [equipeAberta, setEquipeAberta] = useState<string | null>(null);
  const [mostrarTudo, setMostrarTudo] = useState<Record<string, boolean>>({});
  const [equipe, setEquipe] = useState<string>(TODAS);
  const [busca, setBusca] = useState('');


  const [contatados, setContatados] = useState<Record<string, boolean>>({});

  const carregar = useCallback(async (opts: { silencioso?: boolean } = {}) => {
    if (!pesquisaId) return;

    if (!opts.silencioso) { setCarregando(true); setErro(null); }
    try {
      setD(await (nominal ? censo.potencialVoluntarios(pesquisaId) : censo.potencialVoluntariosResumo(pesquisaId)));
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



  useEffect(() => { setEquipe(TODAS); setAreaAberta(area === TODAS ? null : area); setEquipeAberta(null); }, [area]);
  useEffect(() => { setEquipeAberta(equipe === TODAS ? null : equipe); }, [equipe]);

  const areasVisiveis = useMemo(() => {
    if (!d) return [];
    return d.areas.filter((a) => area === TODAS || a.area === area);
  }, [d, area]);

  const equipesDaArea = useMemo(() => {
    if (area === TODAS) return [];
    return areasVisiveis.flatMap((a) => a.equipes);
  }, [areasVisiveis, area]);

  const filtrar = useCallback((lista: Pessoa[]) => (
    busca.trim()
      ? lista.filter((p) => contemNormalizado(p.nome || '', busca) || contemNormalizado(p.telefone || '', busca))
      : lista
  ), [busca]);



  const recorte = useMemo(() => {
    const vistos = new Set<string>();
    let semCenso = 0;
    for (const a of areasVisiveis) {
      for (const e of a.equipes) {
        if (equipe !== TODAS && e.team_id !== equipe) continue;
        if (!nominal) { semCenso += e.sem_censo; continue; }
        for (const p of filtrar(e.pessoas)) {
          const k = p.perfil_id || `${p.nome}|${p.telefone}`;
          if (!vistos.has(k)) { vistos.add(k); semCenso++; }
        }
      }
    }
    return { semCenso, porVinculo: !nominal };
  }, [areasVisiveis, equipe, filtrar, nominal]);

  async function copiar(p: Pessoa) {
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
              <HandHeart className="size-4 text-primary shrink-0" />
              <span className="font-medium">Voluntários que ainda não preencheram o censo</span>
              {d && (
                <Badge variant="secondary" className="tabular-nums">
                  {d.totais.sem_censo} de {d.totais.voluntarios}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Quem serve numa equipe ativa e não tem resposta concluída nesta pesquisa (pelo
              cadastro ou pelo CPF digitado). Quem serve em mais de uma equipe aparece em cada
              uma delas, então <strong>a soma das equipes passa do total de pessoas</strong>.
              A pesquisa continua aberta: a lista encolhe sozinha conforme as respostas entram.
            </p>
          </div>
          {atualizadoEm && <span className="text-xs text-muted-foreground">Atualizado às {horaCurta(atualizadoEm)}</span>}
          <Button size="sm" variant="ghost" onClick={() => carregar().catch(() => {})} disabled={carregando}>
            <RefreshCw className={`size-4 mr-1.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>

        {carregando && !d && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="size-4 animate-spin" /> Cruzando as equipes com as respostas…
          </div>
        )}

        {
                                                                 }
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
                  Você vê as contagens por área e equipe. <strong>A lista com nome, telefone e o
                  botão do WhatsApp exige nível 4</strong> no censo.
                </span>
              </div>
            )}

            {d.totais.vinculos_sem_equipe_ativa > 0 && (
              <p className="text-xs text-muted-foreground">
                {d.totais.vinculos_sem_equipe_ativa} vínculo(s) em equipe aposentada ficaram de fora.
              </p>
            )}

            {                                                            }
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setArea(TODAS)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${area === TODAS
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border text-muted-foreground hover:text-foreground'}`}>
                Todas as áreas
              </button>
              {d.areas.map((a) => (
                <button key={a.area} type="button" onClick={() => setArea(a.area)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors tabular-nums ${area === a.area
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-border text-muted-foreground hover:text-foreground'}`}>
                  {a.area} · {a.sem_censo}/{a.total}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {area !== TODAS && equipesDaArea.length > 0 && (
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={equipe}
                  onChange={(e) => setEquipe(e.target.value)}
                  aria-label="Equipe"
                >
                  <option value={TODAS}>Todas as equipes de {area}</option>
                  {equipesDaArea.map((e) => (
                    <option key={e.team_id} value={e.team_id}>
                      {e.nome || 'Sem nome'} · {e.sem_censo}/{e.total}
                    </option>
                  ))}
                </select>
              )}
              {nominal && (
                <div className="relative max-w-xs flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Buscar por nome ou telefone…"
                    value={busca} onChange={(e) => setBusca(e.target.value)} />
                </div>
              )}
              <span className="text-xs text-muted-foreground tabular-nums">
                {recorte.semCenso} {recorte.porVinculo ? 'vínculo(s)' : 'pessoa(s)'} sem censo neste recorte
              </span>
            </div>

            {nominal && d.totais.sem_telefone > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-500">
                ⚠️ {d.totais.sem_telefone} de {d.totais.sem_censo} não têm telefone alcançável em nenhum
                cadastro — aparecem na lista sem o botão. Para essas pessoas o caminho é o líder da equipe.
              </p>
            )}

            <div className="space-y-2">
              {areasVisiveis.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma equipe ativa encontrada.</p>
              )}
              {areasVisiveis.map((a) => {
                const buscando = nominal && busca.trim().length > 0;


                const equipes = a.equipes
                  .filter((e) => equipe === TODAS || e.team_id === equipe)
                  .map((e) => ({ e, lista: nominal ? filtrar(e.pessoas) : [] }))
                  .filter(({ lista }) => !buscando || lista.length > 0);
                if (buscando && equipes.length === 0) return null;
                const aberta = buscando || areaAberta === a.area;
                const pct = a.total ? Math.round((a.sem_censo / a.total) * 100) : 0;
                return (
                  <div key={a.area} className="rounded-md border">
                    {                                               }
                    <button type="button" className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-muted/40"
                      onClick={() => { setAreaAberta(aberta && !buscando ? null : a.area); setEquipeAberta(null); }}
                      aria-expanded={aberta}>
                      {aberta ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                      <span className="text-sm font-medium flex-1 min-w-0 truncate">{a.area}</span>
                      <span className="hidden sm:block h-1.5 w-24 rounded-full bg-muted overflow-hidden" aria-hidden>
                        <span className="block h-full bg-amber-500" style={{ width: `${pct}%` }} />
                      </span>
                      <Badge variant="outline" className="tabular-nums text-xs shrink-0">{a.sem_censo} de {a.total} sem censo</Badge>
                    </button>

                    {aberta && (
                      <div className="divide-y border-t">
                        {equipes.map(({ e, lista }) => {
                          const equipeAbertaAgora = buscando || equipeAberta === e.team_id || equipes.length === 1;
                          const chave = `${a.area}:${e.team_id}`;
                          const visiveis = mostrarTudo[chave] || buscando ? lista : lista.slice(0, PAGINA_PESSOAS);
                          return (
                            <div key={e.team_id}>
                              {                                                                       }
                              <button type="button" className="w-full text-left px-3 py-2 pl-9 flex items-center gap-2 hover:bg-muted/30"
                                onClick={() => setEquipeAberta(equipeAbertaAgora && !buscando && equipes.length > 1 ? null : e.team_id)}
                                aria-expanded={equipeAbertaAgora} disabled={!nominal}>
                                {nominal && (equipeAbertaAgora
                                  ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                                  : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />)}
                                <span className="text-sm flex-1 min-w-0 truncate">{e.nome || 'Sem nome'}</span>
                                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                                  {e.sem_censo} de {e.total} sem censo
                                </span>
                              </button>
                              {nominal && equipeAbertaAgora && lista.length > 0 && (
                                <ul className="mx-3 mb-2 divide-y rounded-md border">
                                  {visiveis.map((p) => {
                                    const k = `${e.team_id}:${p.perfil_id || p.nome}`;
                                    const href = p.mensagem ? hrefWhatsapp(p.telefone, p.mensagem) : hrefWhatsapp(p.telefone);
                                    return (
                                      <li key={k} className="flex flex-wrap items-center gap-2 p-2 text-sm">
                                        <div className="min-w-0 flex-1">
                                          <p className="font-medium truncate">{p.nome || 'Sem nome'}</p>
                                          <p className="text-xs text-muted-foreground">
                                            {p.telefone
                                              ? <>{p.telefone}{p.telefone_fonte ? ` · ${p.telefone_fonte}` : ''}</>
                                              : 'sem telefone alcançável'}
                                            {p.equipes.length > 1 ? ` · também em: ${p.equipes.filter((x) => x !== e.nome).join(', ')}` : ''}
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
                                        onClick={() => setMostrarTudo((m) => ({ ...m, [chave]: true }))}>
                                        Mostrar mais {lista.length - visiveis.length} de {lista.length}
                                      </Button>
                                    </li>
                                  )}
                                </ul>
                              )}
                            </div>
                          );
                        })}
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

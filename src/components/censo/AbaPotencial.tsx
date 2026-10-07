















import { useCallback, useEffect, useMemo, useState } from 'react';
import { censo } from '../../api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2, Target, Download, MessageCircle, AlertTriangle, Search, Lock, Baby, Users, Droplets,
  HeartHandshake, Check, GraduationCap, HandHeart, RefreshCw, UsersRound, HandCoins,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import { hrefWhatsapp } from '@/lib/conversas';
import { exportCSV } from '@/lib/export';
import { contemNormalizado } from '@/lib/busca';
import { useAtualizacaoAutomatica, horaCurta } from '@/hooks/useAtualizacaoAutomatica';
import { toast } from 'sonner';


type CriancaKids = { nome: string; idade: number | null; ultimo_checkin: string | null; frequenta: boolean };
type KidsDaFamilia = {
  vinculo: 'membro' | 'sem_membro'; cadastradas: CriancaKids[];
  no_kids: number; cadastradas_sem_frequencia: number;
  declarados: number | null; faltam: number | null; discorda?: boolean;
};
type Pessoa = {
  resposta_id: string; membro_id: string | null;
  nome: string | null; telefone: string | null; email: string | null;
  whatsapp: 'autorizou' | 'recusou' | 'nao_perguntado';
  filhos_quantos: number | null; faixas: string[]; consta_formado_next?: boolean;
  kids?: KidsDaFamilia;
};
type Dados = {
  kids_nao?: Pessoa[]; kids_parcial?: Pessoa[]; ami?: Pessoa[]; bridge?: Pessoa[]; convertidos?: Pessoa[];
  nao_fez_next?: Pessoa[]; nao_serve?: Pessoa[]; nao_grupo?: Pessoa[]; sem_generosidade?: Pessoa[];

  totais: Record<string, number | null>; familias_distintas: number;
  generosidade_sem_vinculo?: number | null;

  generosidade_nominal?: boolean;
  cruzamento_kids?: { nao_com_crianca_no_kids: number; parcial_com_crianca_no_kids: number; nao_discorda: number; sem_membro: number } | null;
  kids_cruzamento_indisponivel?: boolean; kids_janela_dias?: number;
  base: number; esperado: number; truncado: boolean; pode_exportar?: boolean;
};

const SECOES = [
  {
    id: 'kids_nao', titulo: 'Potencial Kids', icone: Baby,
    sub: 'Tem filho de 6 meses a 12 anos e respondeu que NÃO frequenta o CBKids.',
  },
  {
    id: 'kids_parcial', titulo: 'Kids · frequenta em parte', icone: Baby,



    sub: 'Já leva algum filho ao CBKids, mas não todos. A conversa aqui é outra.',
  },
  {
    id: 'bridge', titulo: 'Potencial Bridge', icone: Users,
    sub: 'Tem filho de 13 a 17 anos.',



    ressalva: 'O censo não pergunta se eles já frequentam o Bridge — esta lista inclui quem já está lá.',
  },
  {
    id: 'ami', titulo: 'Potencial AMI', icone: Users,
    sub: 'Tem filho de 18 a 25 anos.',
    ressalva: 'O censo não pergunta se eles já frequentam o AMI — esta lista inclui quem já está lá.',
  },
  {
    id: 'convertidos', titulo: 'Convertidos não batizados', icone: Droplets,
    sub: 'Entregou a vida a Jesus e respondeu que ainda não foi batizado.',
    ressalva: 'É o que a pessoa declarou no censo. Quem foi batizado em outra igreja pode aparecer aqui.',
  },
  {
    id: 'nao_fez_next', titulo: 'Ainda não fizeram o Next', icone: GraduationCap,
    sub: 'Respondeu que ainda não fez o Next.',



    ressalva: 'É o que a pessoa declarou. Quem o sistema registra como formado aparece marcado — confira antes de ligar.',
  },
  {
    id: 'nao_serve', titulo: 'Ainda não servem', icone: HandHeart,
    sub: 'Respondeu que ainda não serve na CBRio.',
    ressalva: 'É o que a pessoa declarou no censo, não o que a escala registra.',
  },
  {
    id: 'nao_grupo', titulo: 'Ainda não estão em grupo', icone: UsersRound, unidade: 'pessoas',
    sub: 'Respondeu que não participa de um Grupo.',
    ressalva: 'É o que a pessoa declarou no censo, não o cadastro dos grupos.',
  },
  {



    id: 'sem_generosidade', titulo: 'Sem contribuição registrada', icone: HandCoins, unidade: 'pessoas',
    sub: 'Respondeu o censo e não tem dízimo nem oferta registrados no nome nos últimos 12 meses.',
    ressalva: 'Vem do cadastro de contribuições, não do censo. Contribuição sem identificação não tem nome — quem dá assim aparece aqui.',
  },
] as const;

const WPP_ROTULO: Record<Pessoa['whatsapp'], string> = {
  autorizou: 'Autorizou WhatsApp',
  recusou: 'Pediu para não receber WhatsApp',
  nao_perguntado: 'Respondeu antes de a pergunta existir',
};

export default function AbaPotencial({ pesquisaId, nivel }: { pesquisaId: string | null; nivel: number }) {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<string | null>('kids_nao');



  const [naFila, setNaFila] = useState<Record<string, boolean>>({});
  const [enviando, setEnviando] = useState<string | null>(null);




  const nominal = nivel >= 4;

  const carregar = useCallback(async (opts: { silencioso?: boolean } = {}) => {
    if (!pesquisaId) return;



    if (!opts.silencioso) { setCarregando(true); setErro(null); }
    try {
      setD(await (nominal ? censo.potencial(pesquisaId) : censo.potencialResumo(pesquisaId)));
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

  const filtrar = useMemo(() => (lista: Pessoa[]) => (
    busca.trim()
      ? lista.filter((p) => contemNormalizado(p.nome || '', busca) || contemNormalizado(p.telefone || '', busca))
      : lista
  ), [busca]);

  function baixar(secaoId: string, titulo: string, lista: Pessoa[]) {




    exportCSV(
      ['Nome', 'Telefone', 'E-mail', 'Filhos', 'Faixas', 'WhatsApp'],
      lista.map((p) => [
        p.nome || '', p.telefone || '', p.email || '',
        p.filhos_quantos ?? '', (p.faixas || []).join(' · '), WPP_ROTULO[p.whatsapp],
      ]),
      `censo_${secaoId}`,
    );
    toast.success(`${lista.length} linha(s) · ${titulo}`);
  }

  async function mandarParaCuidado(p: Pessoa, motivo: string) {
    setEnviando(p.resposta_id);
    try {
      const r = await censo.potencialParaCuidado(p.resposta_id, 'conversa', motivo);
      setNaFila((m) => ({ ...m, [p.resposta_id]: true }));


      toast.success(r?.ja_estava ? `${p.nome || 'Pessoa'} já estava na fila` : `${p.nome || 'Pessoa'} foi para a fila de cuidado`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível encaminhar');
    } finally { setEnviando(null); }
  }

  if (!pesquisaId) {
    return <EmptyState icone={Target} titulo="Escolha uma pesquisa"
      mensagem="Selecione a pesquisa acima para ver as listas de potencial." />;
  }
  if (carregando) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
      <Loader2 className="size-4 animate-spin" /> Lendo as respostas…
    </div>;
  }
  if (erro || !d) {
    return <EmptyState icone={AlertTriangle} titulo="Não foi possível carregar"
      mensagem={erro || 'Tente de novo.'} />;
  }

  return (
    <div className="space-y-5">
      {

                                                                              }
      {d.truncado && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
          <span>
            <strong>Lista incompleta.</strong> Chegaram {d.base} de {d.esperado} respostas —
            não use estes números para decidir nada até recarregar.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{d.familias_distintas}</strong> famílias no total,
            sobre {d.base} respostas concluídas.
          </p>
          {                                                                     }
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            São <strong>famílias a contatar</strong>, não crianças — o censo pergunta faixas de
            idade, não quantos filhos há em cada uma. A mesma família pode estar em mais de uma
            lista, por isso o total é menor que a soma. E a pesquisa <strong>continua aberta</strong>:
            estes números mudam a cada domingo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {atualizadoEm && (
            <span className="text-xs text-muted-foreground" title="Recarrega sozinha a cada minuto enquanto a aba está à vista">
              Atualizado às {horaCurta(atualizadoEm)} · atualiza sozinho
            </span>
          )}
          <Button size="sm" variant="ghost" onClick={() => carregar({ silencioso: true }).then(marcarAtualizado).catch(() => toast.error('Não foi possível atualizar agora'))}>
            <RefreshCw className="size-4 mr-1.5" /> Atualizar
          </Button>
          {nominal && !d.pode_exportar && (
            <Badge variant="outline" className="gap-1 text-xs">
              <Lock className="size-3" /> exportar exige permissão
            </Badge>
          )}
        </div>
      </div>

      {

                                              }
      {nominal && d.kids_cruzamento_indisponivel && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="size-4 text-amber-600 mt-0.5 shrink-0" />
          <span>Não deu para cruzar com o Kids agora — as listas abaixo estão sem a informação de quais crianças já estão lá. Recarregue em instantes.</span>
        </div>
      )}

      {!nominal && (
        <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <Lock className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
          <span>
            Você vê os números. <strong>A lista com nome e telefone exige nível 4</strong> no
            censo — ela carrega dado pessoal sensível, então o acesso é mais estreito que o
            resto do módulo.
          </span>
        </div>
      )}

      {nominal && (
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por nome ou telefone…"
            value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      )}

      {

                                                                 }

      {SECOES.map((s) => {
        const bruto = d.totais?.[s.id];
        const indisponivel = s.id === 'sem_generosidade' && bruto == null;
        const total = bruto ?? 0;
        const semNomes = s.id === 'sem_generosidade' && d.generosidade_nominal === false;
        const lista = filtrar((d as unknown as Record<string, Pessoa[]>)[s.id] || []);
        const Icone = s.icone;
        const abertaAgora = aberta === s.id;
        return (
          <Card key={s.id}>
            <CardContent className="p-4 space-y-3">
              <button type="button" className="w-full text-left"
                onClick={() => setAberta(abertaAgora ? null : s.id)}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icone className="size-4 text-primary shrink-0" />
                    <span className="font-medium">{s.titulo}</span>
                  </div>
                  <Badge variant="secondary" className="tabular-nums">
                    {indisponivel ? '—' : `${total} ${'unidade' in s ? s.unidade : 'famílias'}`}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                {'ressalva' in s && s.ressalva && (
                  <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">⚠️ {s.ressalva}</p>
                )}
                {s.id === 'sem_generosidade' && indisponivel && (
                  <p className="text-xs text-muted-foreground mt-1">Não deu para ler as contribuições agora. Recarregue em instantes.</p>
                )}
                {s.id === 'sem_generosidade' && !indisponivel && (d.generosidade_sem_vinculo ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {d.generosidade_sem_vinculo} respondente(s) sem cadastro ligado ficaram de fora — não dá para cruzar.
                  </p>
                )}
                {


                                                                           }
                {nominal && d.cruzamento_kids && s.id === 'kids_nao' && d.cruzamento_kids.nao_com_crianca_no_kids > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">
                    ⚠️ {d.cruzamento_kids.nao_com_crianca_no_kids} dessas famílias já têm criança com check-in no Kids nos últimos {d.kids_janela_dias ?? 90} dias — provavelmente responderam por OUTRO filho. Estão marcadas.
                  </p>
                )}
                {nominal && d.cruzamento_kids && s.id === 'kids_parcial' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {d.cruzamento_kids.parcial_com_crianca_no_kids} de {total} com criança identificada no Kids — cada linha diz quem já está e quantos faltam.
                    {d.cruzamento_kids.sem_membro > 0 && ` ${d.cruzamento_kids.sem_membro} sem cadastro ligado (o cruzamento não alcança).`}
                  </p>
                )}
              </button>

              {nominal && abertaAgora && semNomes && (
                <div className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
                  <Lock className="size-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <span>Contribuição é dado financeiro: <strong>os nomes só aparecem para quem tem acesso ao financeiro.</strong></span>
                </div>
              )}

              {nominal && abertaAgora && !semNomes && (
                <>
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" disabled={!d.pode_exportar || !lista.length}
                      onClick={() => baixar(s.id, s.titulo, lista)}>
                      <Download className="size-4 mr-1.5" /> Baixar CSV
                    </Button>
                  </div>
                  <div className="divide-y rounded-md border">
                    {lista.length === 0 && (
                      <p className="p-3 text-sm text-muted-foreground">
                        {busca ? 'Ninguém com esse nome nesta lista.' : 'Ninguém nesta lista.'}
                      </p>
                    )}
                    {lista.map((p) => {







                      const href = p.whatsapp === 'recusou' ? null : hrefWhatsapp(p.telefone);
                      return (
                        <div key={p.resposta_id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{p.nome || 'Sem nome'}</p>
                            <p className="text-xs text-muted-foreground">
                              {p.telefone || 'sem telefone'}
                              {p.filhos_quantos ? ` · ${p.filhos_quantos} filho(s)` : ''}
                              {p.faixas?.length ? ` · ${p.faixas.join(', ')}` : ''}
                            </p>
                          </div>
                          {p.kids && <KidsDaLinha k={p.kids} janela={d.kids_janela_dias ?? 90} />}
                          {p.consta_formado_next && (
                            <Badge variant="outline" className="text-xs text-amber-700 dark:text-amber-500">
                              consta como formado no Next
                            </Badge>
                          )}
                          {p.whatsapp === 'recusou' && (
                            <Badge variant="outline" className="text-xs">
                              pediu para não receber WhatsApp — ligue
                            </Badge>
                          )}
                          {p.whatsapp === 'nao_perguntado' && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              não foi perguntado
                            </Badge>
                          )}
                          {href && (
                            <Button asChild size="sm" variant="outline">
                              <a href={href} target="_blank" rel="noreferrer">
                                <MessageCircle className="size-4 mr-1.5" /> WhatsApp
                              </a>
                            </Button>
                          )}
                          {


                                                                     }
                          <Button size="sm" variant="ghost"
                            disabled={enviando === p.resposta_id || naFila[p.resposta_id]}
                            onClick={() => mandarParaCuidado(p, `Veio da lista "${s.titulo}" do censo.`)}>
                            {enviando === p.resposta_id
                              ? <Loader2 className="size-4 mr-1.5 animate-spin" />
                              : naFila[p.resposta_id]
                                ? <Check className="size-4 mr-1.5" />
                                : <HeartHandshake className="size-4 mr-1.5" />}
                            {naFila[p.resposta_id] ? 'na fila' : 'Cuidado'}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}




function KidsDaLinha({ k, janela }: { k: KidsDaFamilia; janela: number }) {
  if (k.vinculo === 'sem_membro') {
    return <Badge variant="outline" className="text-xs text-muted-foreground" title="A resposta ainda não está ligada a um cadastro — o cruzamento com o Kids não alcança">
      sem cadastro ligado
    </Badge>;
  }
  const noKids = k.cadastradas.filter((c) => c.frequenta);
  const paradas = k.cadastradas.filter((c) => !c.frequenta);
  const nomeIdade = (c: CriancaKids) => `${c.nome}${c.idade != null ? ` (${c.idade} a)` : ''}`;
  return (
    <div className="basis-full text-xs space-y-0.5">
      {k.discorda && (
        <p className="text-amber-700 dark:text-amber-500">
          ⚠️ Respondeu que NÃO frequenta, mas há criança com check-in recente — confira qual filho ficou de fora.
        </p>
      )}
      {noKids.length > 0 && (
        <p><span className="font-medium text-foreground">No Kids:</span>{' '}
          {noKids.map((c) => `${nomeIdade(c)} · último check-in ${c.ultimo_checkin ? c.ultimo_checkin.split('-').reverse().join('/') : '—'}`).join(' · ')}
        </p>
      )}
      {paradas.length > 0 && (
        <p className="text-muted-foreground"><span className="font-medium">Cadastrada, sem check-in há mais de {janela} dias:</span>{' '}
          {paradas.map(nomeIdade).join(' · ')}
        </p>
      )}
      {k.cadastradas.length === 0 && <p className="text-muted-foreground">Nenhuma criança desta família cadastrada no Kids.</p>}
      {k.faltam != null && k.faltam > 0 && (
        <p className="text-muted-foreground">
          <span className="font-medium">Fora do Kids:</span> {k.faltam} de {k.declarados} declarado(s) no censo ainda sem cadastro.
        </p>
      )}
    </div>
  );
}

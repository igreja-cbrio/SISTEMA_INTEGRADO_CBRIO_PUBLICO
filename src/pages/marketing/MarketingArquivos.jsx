import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Download, ExternalLink, FileText, Folder, FolderPlus, Loader2, Search } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { marketingArquivos } from '../../api';
import MarketingPagina from './MarketingPagina';
import {
  PASTAS_DO_ANO, buscarArquivos, conteudoDaPasta, rotuloArquivos, tamanhoLegivel, urlDaPasta,
} from './arquivos/arvoreArquivos';













const VISIBILIDADE = {
  'Ciclo criativo': 'O Marketing e quem acompanha o Eventos veem',
  Rotina: 'Só o Marketing vê',
  Requisições: 'Só o Marketing vê',
  Redes: 'Só o Marketing vê',
};

const dataCurta = (iso) => (iso
  ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
  : '');

function contextoDe(a) {
  const c = a.contexto || {};
  if (c.compromisso) return [c.compromisso, c.pessoa].filter(Boolean).join(' · ');
  return [c.tarefa, c.subtarefa].filter(Boolean).join(' · ');
}

function LinhaArquivo({ a, ano, mostrarPasta, baixando, onBaixar }) {
  const detalhes = [contextoDe(a), a.tamanho ? tamanhoLegivel(a.tamanho) : null, dataCurta(a.enviado_em), a.enviado_por]
    .filter(Boolean).join(' · ');
  return (
    <li className="flex flex-col sm:flex-row sm:items-center gap-2 py-2.5 border-b border-border last:border-0">
      <FileText className="hidden sm:block h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground break-words">{a.nome}</p>
        {detalhes && <p className="text-xs text-muted-foreground break-words">{detalhes}</p>}
        {mostrarPasta && <p className="text-xs text-muted-foreground break-words">{[ano, ...(a.caminho || [])].join(' › ')}</p>}
        {a.legado && <p className="text-xs text-muted-foreground">Enviado antes de 06/10: está na pasta antiga, no CBRio Hub.</p>}
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">
        {a.web_url && (
          <Button asChild size="sm" variant="outline" className="h-8">
            <a href={a.web_url} target="_blank" rel="noreferrer" aria-label={`Abrir ${a.nome} no SharePoint`}>
              <ExternalLink aria-hidden="true" /> Abrir
            </a>
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" className="h-8" disabled={baixando === a.id}
          onClick={() => onBaixar(a)} aria-label={`Baixar ${a.nome}`}>
          {baixando === a.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />} Baixar
        </Button>
      </div>
    </li>
  );
}

export default function MarketingArquivos() {
  const [params, setParams] = useSearchParams();
  const evento = params.get('evento') || '';
  const [ano, setAno] = useState(params.get('ano') || '');
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [caminho, setCaminho] = useState([]);
  const [busca, setBusca] = useState('');
  const [baixando, setBaixando] = useState(null);
  const [erroBaixar, setErroBaixar] = useState(null);
  const [estrutura, setEstrutura] = useState(null);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    marketingArquivos.listar({ ano, evento })
      .then((d) => {
        if (!vivo) return;
        setDados(d);

        if (d.abrir && d.abrir.ano === d.ano) setCaminho(d.abrir.caminho || []);
      })
      .catch((e) => { if (vivo) setErro(e?.message || 'Não foi possível carregar os arquivos.'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [ano, evento]);

  const acesso = dados?.acesso || {};
  const arquivos = useMemo(() => dados?.arquivos || [], [dados]);
  const doMarketing = acesso.marketing === true;
  const conteudo = useMemo(
    () => conteudoDaPasta(arquivos, caminho, { fixas: doMarketing ? PASTAS_DO_ANO : ['Ciclo criativo'] }),
    [arquivos, caminho, doMarketing],
  );
  const achados = useMemo(() => buscarArquivos(arquivos, busca), [arquivos, busca]);
  const raizUrl = dados?.destino?.raiz_url || null;
  const pastaUrl = urlDaPasta(raizUrl, dados?.ano, caminho);

  function trocarAno(novo) {
    setCaminho([]);
    setBusca('');
    setAno(novo);
    const p = new URLSearchParams(params);
    p.set('ano', novo);
    p.delete('evento');
    setParams(p, { replace: true });
  }



  async function criarEstrutura() {
    let desde = 0;
    let criadas = 0;
    let existiam = 0;
    setEstrutura({ rodando: true, feitas: 0, total: null });
    try {
      for (let volta = 0; volta < 200; volta += 1) {
        const r = await marketingArquivos.criarEstrutura(dados.ano, desde);
        criadas += r.criadas || 0;
        existiam += r.existiam || 0;
        setEstrutura({ rodando: r.proximo != null, feitas: r.feitas, total: r.total, criadas, existiam, destino: r.destino });
        if (r.proximo == null) break;
        desde = r.proximo;
      }
    } catch (e) {
      setEstrutura(s => ({ ...(s || {}), rodando: false, erro: e?.message || 'Não foi possível criar as pastas.' }));
    }
  }

  async function baixar(a) {
    setErroBaixar(null);
    setBaixando(a.id);
    try {
      const r = await marketingArquivos.baixar(a.id);


      window.location.assign(r.url);
    } catch (e) {
      setErroBaixar(e?.message || 'Não foi possível baixar o arquivo.');
    } finally {
      setBaixando(null);
    }
  }

  const corpo = (
    <div className="space-y-4">
      {dados?.destino?.local === 'hub' && (
        <div role="status" className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            Os envios estão indo para a biblioteca Criativo do CBRio Hub, com estas mesmas pastas, porque o ERP ainda não
            tem acesso ao site Criativo. Quando o administrador do Microsoft 365 liberar o aplicativo do ERP nesse site, o
            próximo envio já vai para lá.
          </p>
        </div>
      )}
      {(dados?.avisos || []).map(t => (
        <p key={t} role="status" className="text-sm text-amber-700 dark:text-amber-400">{t}</p>
      ))}

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <Select value={dados?.ano || ano || ''} onValueChange={trocarAno} disabled={!dados}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Ano">
            <SelectValue placeholder="Ano" />
          </SelectTrigger>
          <SelectContent>
            {(dados?.anos || []).map(o => (
              <SelectItem key={o.ano} value={o.ano}>{o.ano} · {rotuloArquivos(o.total)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar arquivo, tarefa ou pessoa"
            className="pl-8" aria-label="Buscar nos arquivos do ano" />
        </div>
        {acesso.marketing && pastaUrl && !busca && (
          <Button asChild variant="outline" className="shrink-0">
            <a href={pastaUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" /> Abrir esta pasta no SharePoint</a>
          </Button>
        )}
      </div>

      {dados?.pode_criar_estrutura && (
        <section aria-label="Pastas do ano no SharePoint" className="rounded-xl border border-border bg-card px-3 py-2.5 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <p className="text-sm flex-1">
              Criar no SharePoint as pastas que {dados.ano} ainda vai usar: os eventos daqui até dezembro (com as fases
              em que o Marketing tem tarefa) e os meses que faltam da rotina, das requisições e das redes. As que já
              existem ficam como estão.
            </p>
            <Button type="button" variant="outline" className="shrink-0" disabled={!!estrutura?.rodando} onClick={criarEstrutura}>
              {estrutura?.rodando
                ? <><Loader2 className="animate-spin" aria-hidden="true" /> Criando… {estrutura.total ? `${estrutura.feitas} de ${estrutura.total}` : ''}</>
                : <><FolderPlus aria-hidden="true" /> Criar as pastas de {dados.ano}</>}
            </Button>
          </div>
          {estrutura && !estrutura.rodando && !estrutura.erro && (
            <p role="status" className="text-sm text-muted-foreground">
              Pronto: as {estrutura.total} pastas de {dados.ano} estão no SharePoint
              ({estrutura.criadas} criadas agora, {estrutura.existiam} já existiam)
              {estrutura.destino?.local === 'hub' ? ', na biblioteca Criativo do CBRio Hub' : ''}.
              {estrutura.destino?.raiz_url && (
                <> <a className="underline underline-offset-2" href={urlDaPasta(estrutura.destino.raiz_url, dados.ano, [])} target="_blank" rel="noreferrer">Abrir no SharePoint</a></>
              )}
            </p>
          )}
          {estrutura?.erro && <p role="alert" className="text-sm text-destructive">{estrutura.erro}</p>}
        </section>
      )}

      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {erroBaixar && <p role="alert" className="text-sm text-destructive">{erroBaixar}</p>}

      {carregando && !dados ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando os arquivos…</p>
      ) : dados && busca.trim() ? (
        <section aria-label="Resultado da busca" className="rounded-xl border border-border bg-card px-3">
          {achados.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Nada em {dados.ano} com “{busca.trim()}”.</p>
          ) : (
            <ul>{achados.map(a => <LinhaArquivo key={a.id} a={a} ano={dados.ano} mostrarPasta baixando={baixando} onBaixar={baixar} />)}</ul>
          )}
        </section>
      ) : dados ? (
        <>
          <nav aria-label="Pastas" className="flex flex-wrap items-center gap-1 text-sm">
            {[dados.ano, ...caminho].map((nome, i, todos) => (
              <span key={`${i}-${nome}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
                {i === todos.length - 1 ? (
                  <span className="font-medium text-foreground" aria-current="page">{nome}</span>
                ) : (
                  <button type="button" className="text-muted-foreground underline-offset-2 hover:underline hover:text-foreground"
                    onClick={() => setCaminho(caminho.slice(0, i))}>{nome}</button>
                )}
              </span>
            ))}
          </nav>

          {conteudo.pastas.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {conteudo.pastas.map(p => (
                <li key={p.nome}>
                  <button type="button" onClick={() => setCaminho([...caminho, p.nome])}
                    className="w-full text-left rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-muted/50 flex items-center gap-3">
                    <Folder className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground truncate">{p.nome}</span>
                      <span className="block text-xs text-muted-foreground">
                        {p.total ? `${rotuloArquivos(p.total)} · ${tamanhoLegivel(p.tamanho)}` : 'Vazia'}
                        {caminho.length === 0 && acesso.marketing && VISIBILIDADE[p.nome] ? ` · ${VISIBILIDADE[p.nome]}` : ''}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {conteudo.arquivos.length > 0 && (
            <section aria-label="Arquivos desta pasta" className="rounded-xl border border-border bg-card px-3">
              <ul>{conteudo.arquivos.map(a => <LinhaArquivo key={a.id} a={a} ano={dados.ano} baixando={baixando} onBaixar={baixar} />)}</ul>
            </section>
          )}

          {conteudo.pastas.every(p => !p.total) && conteudo.arquivos.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {caminho.length ? 'Nenhum arquivo nesta pasta ainda.' : `Ainda não há arquivos em ${dados.ano}.`} Os arquivos
              entram pelas Demandas: em cada subtarefa, “Enviar arquivo” (quando o arquivo é a entrega) ou “Anexar arquivo”.
            </p>
          )}

          {                                                                                                  }
          <p className="text-xs text-muted-foreground">
            Todo arquivo ganha um nome padrão, que diz de onde ele é e o que ele é (o nome original não entra), por
            exemplo “2026 - Natal - F03 - Moodboard - AMI - v01”. Para achar, busque pelo evento, pela fase (F03) ou
            pelo entregável; cada entregável tem as suas versões (v01, v02…).
          </p>
          {acesso.marketing && (
            <p className="text-xs text-muted-foreground">
              Fim do ano: abra a pasta {dados.ano} no SharePoint e use Baixar. O SharePoint entrega um .zip com a pasta
              inteira; guarde o .zip e siga com a pasta do ano novo.
            </p>
          )}
        </>
      ) : null}
    </div>
  );




  const doEventos = !!dados && !doMarketing;
  return (
    <MarketingPagina
      semMenu={!doMarketing}
      titulo={!dados ? 'Arquivos' : doEventos ? 'Arquivos do ciclo criativo' : 'Marketing'}
      subtitulo={doEventos
        ? 'O que o Marketing entregou nos eventos, organizado por ano.'
        : 'Arquivos · tudo o que sobe pelas Demandas, nas pastas do SharePoint, ano a ano'}
    >
      {corpo}
    </MarketingPagina>
  );
}

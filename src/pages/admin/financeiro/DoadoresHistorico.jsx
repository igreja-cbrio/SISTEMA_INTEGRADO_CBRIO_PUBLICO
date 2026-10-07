











import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Search, Download, Printer, AlertTriangle, X, Check, UserCheck, Users,
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { financeiro } from '../../../api';
import { hojeBrtIso } from '@/lib/conclusaoPagamentoTela';
import { abrirJanelaRelatorio, escreverRelatorio, dataBr } from '@/lib/imprimirRelatorioDoacoes';

const fmtMoney = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const BUSCA_MIN = 3;
const POR_PAGINA = 100;

function mensagemErro(e, padrao) {
  if (e?.status === 403) return 'Você não tem permissão para ver o histórico de doadores (é preciso o financeiro nível 3).';
  return e?.message || padrao;
}

export default function DoadoresHistorico() {
  const [q, setQ] = useState('');
  const [busca, setBusca] = useState({ estado: 'ocioso', itens: [], total: 0, limite: 0, erro: null });
  const [selecionados, setSelecionados] = useState(() => new Map());
  const [abertos, setAbertos] = useState(null);
  const timer = useRef(null);
  const seq = useRef(0);

  useEffect(() => {
    clearTimeout(timer.current);
    const termo = q.trim();
    if (termo.replace(/\s/g, '').length < BUSCA_MIN) {
      seq.current += 1;
      setBusca({ estado: 'ocioso', itens: [], total: 0, limite: 0, erro: null });
      return undefined;
    }
    timer.current = setTimeout(async () => {
      const meu = ++seq.current;
      setBusca(b => ({ ...b, estado: 'buscando', erro: null }));
      try {
        const r = await financeiro.doadores.buscar(termo);
        if (meu !== seq.current) return;
        setBusca({ estado: 'pronto', itens: r?.itens || [], total: r?.total_nomes || 0, limite: r?.limite || 0, erro: null });
      } catch (e) {
        if (meu !== seq.current) return;
        setBusca({ estado: 'erro', itens: [], total: 0, limite: 0, erro: mensagemErro(e, 'Não foi possível buscar agora.') });
      }
    }, 400);
    return () => clearTimeout(timer.current);
  }, [q]);

  const alternar = (item) => {
    setSelecionados(m => {
      const n = new Map(m);
      if (n.has(item.chave)) n.delete(item.chave); else n.set(item.chave, item);
      return n;
    });
  };

  const abrir = (itens) => setAbertos(itens);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" /> Buscar doador
            </h3>
            <p className="text-[11px] text-muted-foreground mt-1">
              Busca pelo nome que aparece no extrato (dízimos, ofertas, campanhas, missões, ação social, outras contribuições e extraordinárias).
              Marque as variações do mesmo nome para ver um histórico só.
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Digite pelo menos 3 letras do nome"
              className="pl-9"
              autoComplete="off"
            />
            {busca.estado === 'buscando' && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {busca.estado === 'erro' && (
            <div className="flex items-start gap-2 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{busca.erro}</span>
            </div>
          )}

          {busca.estado === 'pronto' && busca.itens.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhum doador com esse nome.</p>
          )}

          {busca.itens.length > 0 && (
            <>
              <p className="text-[11px] text-muted-foreground">
                {busca.total > busca.itens.length
                  ? `Mostrando ${busca.itens.length} de ${busca.total} nomes. Digite mais do nome para filtrar.`
                  : `${busca.total} nome${busca.total === 1 ? '' : 's'} encontrado${busca.total === 1 ? '' : 's'}.`}
              </p>
              <ul className="divide-y divide-border rounded-md border border-border">
                {busca.itens.map(it => {
                  const marcado = selecionados.has(it.chave);
                  return (
                    <li key={it.chave} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30">
                      <button
                        type="button"
                        onClick={() => alternar(it)}
                        aria-label={marcado ? 'Desmarcar' : 'Marcar para juntar'}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${marcado ? 'bg-primary border-primary text-white' : 'border-border'}`}
                      >
                        {marcado && <Check className="h-3.5 w-3.5" />}
                      </button>
                      <button type="button" onClick={() => abrir([it])} className="min-w-0 flex-1 text-left">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium">{it.nome}</span>
                          {(it.membros || []).length === 1 && (
                            <Badge variant="outline" className="text-[10px] gap-1"><UserCheck className="h-3 w-3" /> membro</Badge>
                          )}
                          {it.qtd_cpfs > 1 && (
                            <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-700 dark:text-amber-400">
                              {it.qtd_cpfs} CPFs diferentes
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {it.qtd} doaç{it.qtd === 1 ? 'ão' : 'ões'} · {dataBr(it.primeira)} a {dataBr(it.ultima)}
                          {it.cpf_mascarado ? ` · CPF ${it.cpf_mascarado}` : ''}
                        </div>
                      </button>
                      <div className="shrink-0 text-right text-sm font-semibold tabular-nums">{fmtMoney(it.total)}</div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {selecionados.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
              <span className="text-xs">
                <Users className="mr-1 inline h-3.5 w-3.5" />
                {selecionados.size} nome{selecionados.size === 1 ? '' : 's'} marcado{selecionados.size === 1 ? '' : 's'}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Map())}>Limpar</Button>
                <Button size="sm" onClick={() => abrir([...selecionados.values()])}>Ver histórico junto</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {abertos && (
        <HistoricoDoador key={abertos.map(a => a.chave).join('|')} itens={abertos} onFechar={() => setAbertos(null)} />
      )}
    </div>
  );
}

function periodoParaDatas(modo, ano, de, ate, hoje) {
  if (modo === 'tudo') return { inicio: null, fim: null };
  if (modo === 'ano') return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
  if (modo === '12m') {
    const [y, m, d] = hoje.split('-').map(Number);
    const ini = new Date(Date.UTC(y - 1, m - 1, d + 1));
    return { inicio: ini.toISOString().slice(0, 10), fim: hoje };
  }
  return { inicio: de || null, fim: ate || null };
}

function HistoricoDoador({ itens, onFechar }) {
  const hoje = useMemo(() => hojeBrtIso(), []);
  const anoAtual = Number(hoje.slice(0, 4));
  const anos = useMemo(() => Array.from({ length: anoAtual - 2021 }, (_, i) => anoAtual - i), [anoAtual]);
  const [modo, setModo] = useState('tudo');
  const [ano, setAno] = useState(anoAtual);
  const [de, setDe] = useState(`${anoAtual}-01-01`);
  const [ate, setAte] = useState(hoje);
  const [estado, setEstado] = useState({ carregando: true, dados: null, erro: null });
  const [pagina, setPagina] = useState(1);
  const [baixando, setBaixando] = useState(null);
  const [erroDownload, setErroDownload] = useState(null);

  const chaves = useMemo(() => itens.map(i => i.chave), [itens]);
  const { inicio, fim } = periodoParaDatas(modo, ano, de, ate, hoje);
  const periodoInvalido = modo === 'faixa' && de && ate && de > ate;

  useEffect(() => {
    if (periodoInvalido) return undefined;
    let vivo = true;
    setEstado({ carregando: true, dados: null, erro: null });
    setPagina(1);
    financeiro.doadores.historico({ chaves, inicio, fim })
      .then(d => { if (vivo) setEstado({ carregando: false, dados: d, erro: null }); })
      .catch(e => { if (vivo) setEstado({ carregando: false, dados: null, erro: mensagemErro(e, 'Não foi possível carregar o histórico.') }); });
    return () => { vivo = false; };
  }, [chaves, inicio, fim, periodoInvalido]);

  const d = estado.dados;
  const r = d?.resumo;
  const linhas = d?.linhas || [];
  const paginas = Math.max(1, Math.ceil(linhas.length / POR_PAGINA));
  const visiveis = linhas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const variosCpfs = itens.some(i => (i.qtd_cpfs || 0) > 1);
  const membros = d?.membros || [];

  const baixarPlanilha = async () => {
    setErroDownload(null);
    setBaixando('xlsx');
    try { await financeiro.doadores.baixarXlsx({ chaves, inicio, fim }); }
    catch (e) { setErroDownload(mensagemErro(e, 'Não foi possível baixar a planilha.')); }
    finally { setBaixando(null); }
  };

  const imprimir = async () => {
    setErroDownload(null);

    const win = abrirJanelaRelatorio();
    if (!win) { setErroDownload('O navegador bloqueou a janela de impressão. Libere pop-ups deste site e tente de novo.'); return; }
    setBaixando('impressao');
    try {
      const dados = await financeiro.doadores.impressao({ chaves, inicio, fim });
      escreverRelatorio(win, dados);
    } catch (e) {
      win.close();
      setErroDownload(mensagemErro(e, 'Não foi possível gerar o relatório.'));
    } finally { setBaixando(null); }
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">Histórico de doações</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 break-words">
              {itens.map(i => i.nome).join(' · ')}
            </p>
            {membros.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Ligado ao cadastro: {membros.map(m => m.nome).join(', ')}
              </p>
            )}
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar histórico"><X className="h-5 w-5" /></button>
        </div>

        {variosCpfs && (
          <div className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Este nome veio de CPFs diferentes no extrato: podem ser pessoas diferentes com o mesmo nome. Confira antes de entregar o relatório a alguém.</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {[['tudo', 'Tudo'], ['12m', '12 meses'], ['ano', 'Ano'], ['faixa', 'Período']].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setModo(k)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${modo === k ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'}`}>
                {label}
              </button>
            ))}
          </div>
          {modo === 'ano' && (
            <select value={ano} onChange={e => setAno(Number(e.target.value))}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs">
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
          {modo === 'faixa' && (
            <div className="flex items-center gap-1.5 text-xs">
              <input type="date" value={de} max={hoje} onChange={e => setDe(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2" />
              <span>a</span>
              <input type="date" value={ate} max={hoje} onChange={e => setAte(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2" />
            </div>
          )}
        </div>
        {periodoInvalido && <p className="text-xs text-rose-500">A data inicial é depois da final.</p>}

        {estado.carregando ? (
          <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : estado.erro ? (
          <div className="flex items-start gap-2 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{estado.erro}</span>
          </div>
        ) : r && r.qtd === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma doação no período ({d.periodo_rotulo || 'todo o histórico'}).</p>
        ) : r ? (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-center">
                <div className="text-[9px] uppercase text-emerald-700 dark:text-emerald-400">Total</div>
                <div className="text-sm font-bold tabular-nums">{fmtMoney(r.total)}</div>
              </div>
              <div className="rounded border border-border bg-muted/20 p-2 text-center">
                <div className="text-[9px] uppercase text-muted-foreground">Lançamentos</div>
                <div className="text-sm font-bold tabular-nums">{r.qtd}</div>
              </div>
              <div className="rounded border border-border bg-muted/20 p-2 text-center">
                <div className="text-[9px] uppercase text-muted-foreground">Primeira</div>
                <div className="text-xs font-bold">{dataBr(r.primeira)}</div>
              </div>
              <div className="rounded border border-border bg-muted/20 p-2 text-center">
                <div className="text-[9px] uppercase text-muted-foreground">Última</div>
                <div className="text-xs font-bold">{dataBr(r.ultima)}</div>
              </div>
            </div>

            {r.descartadas > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {r.descartadas} lançamento(s) fora da régua de doação ficaram de fora deste histórico.
              </p>
            )}

            {d.base?.truncado && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                O período tem {d.base.qtd_total} lançamentos; aparecem os {d.base.limite} mais recentes. Escolha um período menor para ver todos.
              </p>
            )}

            <div className="flex flex-wrap gap-1.5">
              {r.por_tipo.map(t => (
                <Badge key={t.tipo} variant="outline" className="text-[11px]">
                  {t.rotulo}: {fmtMoney(t.total)} ({t.qtd})
                </Badge>
              ))}
            </div>

            {r.por_ano.length > 1 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                      <th className="text-left py-2 px-2 font-medium">Ano</th>
                      <th className="text-right py-2 px-2 font-medium">Lançamentos</th>
                      <th className="text-right py-2 px-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.por_ano.map(a => (
                      <tr key={a.ano} className="border-b border-border/50">
                        <td className="py-1.5 px-2">{a.ano}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{a.qtd}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{fmtMoney(a.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={baixarPlanilha} disabled={!!baixando}>
                {baixando === 'xlsx' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                Baixar planilha
              </Button>
              <Button size="sm" variant="outline" onClick={imprimir} disabled={!!baixando}>
                {baixando === 'impressao' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Printer className="mr-1.5 h-4 w-4" />}
                Imprimir ou salvar PDF
              </Button>
            </div>
            {erroDownload && <p className="text-xs text-rose-500">{erroDownload}</p>}
            <p className="text-[11px] text-muted-foreground">
              Relatório interno (não é comprovante fiscal). Cada download fica registrado com quem baixou.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">Data</th>
                    <th className="text-right py-2 px-2 font-medium">Valor</th>
                    <th className="text-left py-2 px-2 font-medium">Tipo</th>
                    <th className="text-left py-2 px-2 font-medium">Forma</th>
                    <th className="text-left py-2 px-2 font-medium">Nome no extrato</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map(l => (
                    <tr key={l.id} className="border-b border-border/50">
                      <td className="py-1.5 px-2 text-xs whitespace-nowrap">{dataBr(l.data)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{fmtMoney(l.valor)}</td>
                      <td className="py-1.5 px-2 text-xs" title={[l.plano_codigo, l.plano_nome].filter(Boolean).join(' · ')}>{l.tipo_rotulo || l.plano_nome || '—'}</td>
                      <td className="py-1.5 px-2 text-xs">{l.forma_pagamento || '—'}</td>
                      <td className="py-1.5 px-2 text-xs">{l.nome || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {paginas > 1 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Página {pagina} de {paginas} · {linhas.length} lançamentos</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}>Anterior</Button>
                  <Button size="sm" variant="outline" disabled={pagina >= paginas} onClick={() => setPagina(p => p + 1)}>Próxima</Button>
                </div>
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

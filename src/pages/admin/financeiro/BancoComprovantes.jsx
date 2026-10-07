










import { useState, useEffect, useCallback, useRef } from 'react';
import { financeiro } from '../../../api';
import { DatePicker } from '../../../components/ui/date-picker';
import {
  FileText, Download, ExternalLink, Search, Receipt, Folder, FolderOpen, ArrowLeft,
  Wallet, ShoppingCart, Banknote, AlertTriangle, RefreshCw, Loader2,
} from 'lucide-react';
import { safeHref } from '../../../lib/safeHref';
import { rotuloForma } from '@/lib/conclusaoPagamentoTela';

const C = {
  card: 'var(--cbrio-card)', text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)',
  text3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)', primary: '#00B39D',
  green: '#10b981', greenBg: '#10b98118', blue: '#3b82f6', blueBg: '#3b82f618',
  amber: '#f59e0b', amberBg: '#f59e0b18',
};
const fmtMoney = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const fmtDate = (d) => (d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—');

function BancoTransacoes() {
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const params = {};
      if (q.trim()) params.q = q.trim();
      if (inicio) params.inicio = inicio;
      if (fim) params.fim = fim;
      const r = await financeiro.comprovantes(params);
      setItens(r?.itens || []);
    } catch (e) { setItens([]); setErro(e?.message || 'Erro ao carregar os comprovantes.'); }
    finally { setLoading(false); }
  }, [q, inicio, fim]);

  useEffect(() => { const t = setTimeout(carregar, 300); return () => clearTimeout(t); }, [carregar]);

  const th = { textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: '.04em', borderBottom: `1px solid ${C.border}` };
  const td = { padding: '10px 12px', fontSize: 13, color: C.text, borderBottom: `1px solid ${C.border}`, verticalAlign: 'middle' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 13, color: C.text2 }}>
        Comprovantes anexados às transações + notas fiscais com arquivo. Abra ou baixe cada um em PDF.
      </div>

      {             }
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', minWidth: 240, flex: 1 }}>
          <Search style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: C.text3 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por descrição, fornecedor ou nº da nota…"
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm" />
        </div>
        <span style={{ fontSize: 12, color: C.text3 }}>Vencimento/competência de</span>
        <div style={{ minWidth: 150 }}><DatePicker value={inicio} onChange={setInicio} placeholder="Início" className="h-9" /></div>
        <span style={{ fontSize: 12, color: C.text3 }}>até</span>
        <div style={{ minWidth: 150 }}><DatePicker value={fim} onChange={setFim} placeholder="Fim" className="h-9" /></div>
        {(q || inicio || fim) && (
          <button onClick={() => { setQ(''); setInicio(''); setFim(''); }}
            style={{ fontSize: 12, color: C.text3, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
            Limpar
          </button>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: C.text3 }}>{itens.length} comprovante(s)</div>
      </div>

      {           }
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        {erro ? (
          <div className="m-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-3 text-xs text-rose-600 dark:text-rose-400">
            Não foi possível carregar os comprovantes: {erro}
          </div>
        ) : loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.text3 }}>Carregando…</div>
        ) : itens.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <Receipt style={{ width: 40, height: 40, color: C.text3, opacity: 0.4, margin: '0 auto 10px' }} />
            <div style={{ color: C.text2, fontWeight: 600 }}>Nenhum comprovante ainda</div>
            <div style={{ color: C.text3, fontSize: 13, marginTop: 4 }}>
              Anexe comprovantes numa transação (aba Transações → abrir a transação) ou escaneie uma nota fiscal.
              O upload em massa com casamento por IA chega na próxima fase.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Data</th>
                  <th style={th}>Descrição</th>
                  <th style={th}>Origem</th>
                  <th style={{ ...th, textAlign: 'right' }}>Valor</th>
                  <th style={{ ...th, textAlign: 'right' }}>Arquivo</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it, i) => {
                  const nota = it.origem === 'nota';
                  return (
                    <tr key={i}>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(it.data)}</td>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{it.descricao || '—'}</div>
                        {it.conta && <div style={{ fontSize: 11, color: C.text3 }}>{it.conta}</div>}
                        <div style={{ fontSize: 11, color: C.text3 }}>{it.arquivo}</div>
                      </td>
                      <td style={td}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999,
                          color: nota ? C.amber : C.blue, background: nota ? C.amberBg : C.blueBg }}>
                          {nota ? 'Nota fiscal' : 'Comprovante'}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(it.valor)}</td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: 8 }}>
                          <a href={safeHref(it.url)} target="_blank" rel="noreferrer" title="Abrir"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.primary, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                            <ExternalLink style={{ width: 14, height: 14 }} /> Abrir
                          </a>
                          <a href={safeHref(it.url)} download={it.arquivo || 'comprovante'} title="Baixar"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.text2, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                            <Download style={{ width: 14, height: 14 }} /> Baixar
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: C.text3, display: 'flex', alignItems: 'center', gap: 6 }}>
        <FileText style={{ width: 13, height: 13 }} /> Os arquivos abrem direto do storage (bucket log-arquivos).
      </div>
    </div>
  );
}


const ICONE_PASTA = { reembolso: Wallet, pagamento: Banknote, compra: ShoppingCart, boleto: FileText, transacoes: Receipt };
const PASTA_LEGADO = { pasta: 'transacoes', titulo: 'Transações e notas fiscais', legado: true };

const VALIDADE_LINK_MS = 14 * 60 * 1000;

const fmtTamanho = (b) => (b == null ? '' : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function BancoComprovantes({ pastaInicial = null }) {
  const [pasta, setPasta] = useState(pastaInicial);
  const [pastas, setPastas] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => { if (pastaInicial) setPasta(pastaInicial); }, [pastaInicial]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await financeiro.comprovantesPastas();
      setPastas(Array.isArray(r?.pastas) ? r.pastas : []);
    } catch (e) {
      setPastas(null);
      setErro(e?.status === 403
        ? 'As pastas de comprovantes exigem nível 3 no módulo Financeiro (os comprovantes trazem CPF e dados bancários).'
        : (e?.message || 'Erro ao carregar as pastas.'));
    } finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const todas = [...(pastas || []), PASTA_LEGADO];
  const atual = pasta ? todas.find(p => p.pasta === pasta) || (pasta === 'transacoes' ? PASTA_LEGADO : { pasta, titulo: pasta }) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.text }} className="flex items-center gap-2">
            {atual && (
              <button type="button" onClick={() => setPasta(null)} className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" /> Pastas
              </button>
            )}
            {atual ? <span>{atual.titulo}</span> : <span>Comprovantes</span>}
          </div>
          {!atual && (
            <div style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>
              Comprovantes de pagamento separados por pasta. Clique numa pasta para abrir.
            </div>
          )}
        </div>
        {!atual && (
          <button type="button" onClick={carregar} disabled={carregando} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        )}
      </div>

      {atual ? (
        atual.legado ? <BancoTransacoes /> : <ConteudoPasta pasta={atual.pasta} />
      ) : (
        <>
          {erro && (
            <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-3 text-xs text-rose-600 dark:text-rose-400">{erro}</div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(carregando && !pastas ? [] : todas).map(p => {
              if (!pastas && !p.legado) return null;
              const Icon = ICONE_PASTA[p.pasta] || Folder;
              return (
                <button
                  key={p.pasta}
                  type="button"
                  onClick={() => setPasta(p.pasta)}
                  className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-semibold">
                      <FolderOpen className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" /> {p.titulo}
                    </div>
                    {p.legado ? (
                      <div className="mt-1 text-xs text-muted-foreground">Anexos das transações e notas fiscais com arquivo</div>
                    ) : (
                      <>
                        <div className="mt-1 text-xs text-muted-foreground">{p.total} comprovante(s)</div>
                        {p.pagos_em_dinheiro > 0 && (
                          <div className="text-[11px] text-amber-700 dark:text-amber-400">{p.pagos_em_dinheiro} pago(s) em dinheiro, sem comprovante</div>
                        )}
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {carregando && !pastas && (
            <div className="py-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" /></div>
          )}
        </>
      )}
    </div>
  );
}

function ConteudoPasta({ pasta }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState(null);
  const [q, setQ] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const carregadoEm = useRef(0);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const params = {};
      if (q.trim()) params.q = q.trim();
      if (inicio) params.inicio = inicio;
      if (fim) params.fim = fim;
      const r = await financeiro.comprovantesPasta(pasta, Object.keys(params).length ? params : undefined);
      setDados(r || null);
      carregadoEm.current = Date.now();
    } catch (e) {
      setDados(null);
      setErro(e?.status === 403 ? 'Sem permissão para abrir esta pasta.' : (e?.message || 'Erro ao abrir a pasta.'));
    } finally { setCarregando(false); }
  }, [pasta, q, inicio, fim]);

  useEffect(() => { const t = setTimeout(carregar, 300); return () => clearTimeout(t); }, [carregar]);


  const linkValido = (e) => {
    if (Date.now() - carregadoEm.current > VALIDADE_LINK_MS) {
      e.preventDefault();
      setAviso('Os links venceram (valem 15 minutos). Recarregamos a lista — clique de novo.');
      carregar();
      return false;
    }
    return true;
  };

  const itens = dados?.itens || [];
  const semArquivo = dados?.sem_arquivo || [];

  return (
    <div className="space-y-3">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative', minWidth: 240, flex: 1 }}>
          <Search style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: C.text3 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título, favorecido ou solicitante…"
            className="h-9 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm" />
        </div>
        <span style={{ fontSize: 12, color: C.text3 }}>Pago de</span>
        <div style={{ minWidth: 150 }}><DatePicker value={inicio} onChange={setInicio} placeholder="Início" className="h-9" /></div>
        <span style={{ fontSize: 12, color: C.text3 }}>até</span>
        <div style={{ minWidth: 150 }}><DatePicker value={fim} onChange={setFim} placeholder="Fim" className="h-9" /></div>
        {(q || inicio || fim) && (
          <button onClick={() => { setQ(''); setInicio(''); setFim(''); }}
            style={{ fontSize: 12, color: C.text3, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
            Limpar
          </button>
        )}
        {!erro && dados && <div style={{ marginLeft: 'auto', fontSize: 12, color: C.text3 }}>{itens.length} comprovante(s)</div>}
      </div>

      {aviso && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">{aviso}</div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
        {erro ? (
          <div className="m-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-3 text-xs text-rose-600 dark:text-rose-400">{erro}</div>
        ) : carregando && !dados ? (
          <div style={{ padding: 40, textAlign: 'center', color: C.text3 }}>Carregando…</div>
        ) : itens.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <Folder style={{ width: 36, height: 36, color: C.text3, opacity: 0.4, margin: '0 auto 8px' }} />
            <div style={{ color: C.text2, fontWeight: 600 }}>{q || inicio || fim ? 'Nenhum comprovante com estes filtros' : 'Nenhum comprovante nesta pasta ainda'}</div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {itens.map(it => {
              const o = it.origem || {};
              return (
                <div key={it.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                      <span className="truncate">{o.titulo || (o.ausente ? 'Origem não encontrada' : '—')}</span>
                      {o.apagada && <span className="rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">origem apagada</span>}
                      {o.ausente && <span className="rounded bg-amber-500/15 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">origem ausente</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                      {o.favorecido && <span>Para: {o.favorecido}</span>}
                      {o.forma && <span>{rotuloForma(o.forma)}</span>}
                      {o.data && <span>{fmtDate(o.data)}</span>}
                      {o.pago_por && <span>Pago por {o.pago_por}</span>}
                      <span className="truncate">{it.nome}{it.tamanho ? ` · ${fmtTamanho(Number(it.tamanho))}` : ''}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-semibold tabular-nums">{fmtMoney(o.valor)}</div>
                  <div className="flex shrink-0 gap-3">
                    {it.url ? (
                      <>
                        <a href={safeHref(it.url)} target="_blank" rel="noreferrer" onClick={linkValido}
                           className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                          <ExternalLink className="h-3.5 w-3.5" /> Abrir
                        </a>
                        <a href={safeHref(it.url)} download={it.nome || 'comprovante'} onClick={linkValido}
                           className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                          <Download className="h-3.5 w-3.5" /> Baixar
                        </a>
                      </>
                    ) : (
                      <span className="text-[11px] text-amber-700 dark:text-amber-400">link indisponível</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {semArquivo.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Pagos em dinheiro · sem comprovante ({semArquivo.length})
          </div>
          <div className="divide-y divide-border">
            {semArquivo.map(o => (
              <div key={o.id} className="flex flex-wrap items-center gap-3 py-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate font-medium">{o.titulo}</span>
                {o.favorecido && <span className="text-muted-foreground">Para: {o.favorecido}</span>}
                {o.data && <span className="text-muted-foreground">{fmtDate(o.data)}</span>}
                {o.pago_por && <span className="text-muted-foreground">Pago por {o.pago_por}</span>}
                <span className="font-semibold tabular-nums">{fmtMoney(o.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

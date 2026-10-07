









import { useEffect, useRef, useState } from 'react';
import {
  Loader2, RefreshCw, Check, Wallet, ShoppingCart, Receipt, Wrench, Flame,
  ExternalLink, AlertTriangle, X, Info, FolderOpen,
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import ConcluirPagamento from '../../../components/financeiro/ConcluirPagamento';
import { solicitacoes } from '../../../api';
import { safeHref } from '../../../lib/safeHref';
import { ehImagem, nomeDoArquivo, rotuloTipo } from '@/lib/anexoSolicitacao';
import { rotuloForma } from '@/lib/conclusaoPagamentoTela';

const fmtMoney = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const fmtDia = (iso) => (iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—');

const CAT = {
  reembolso: { label: 'Reembolso', icon: Wallet, cor: '#10b981' },
  pagamento: { label: 'Pagamento', icon: Receipt, cor: '#8b5cf6' },
  compras: { label: 'Compra', icon: ShoppingCart, cor: '#3b82f6' },
  servico: { label: 'Serviço', icon: Wrench, cor: '#f59e0b' },
};

function anexosDe(s) {
  return [
    ...(Array.isArray(s.imagens_url) ? s.imagens_url : []),
    s.documento_url, s.nota_fiscal_url,
  ].filter(Boolean);
}

export default function PagarSolicitacoes({ solicitacaoId = null, onVerComprovantes }) {
  const [itens, setItens] = useState([]);
  const [escopo, setEscopo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [aberta, setAberta] = useState(null);
  const [feito, setFeito] = useState(null);
  const [avisoLink, setAvisoLink] = useState(null);
  const linkAbertoRef = useRef(null);

  const carregar = () => {
    setCarregando(true);
    setErro(null);
    solicitacoes.aPagar()
      .then(r => {
        const lista = Array.isArray(r?.itens) ? r.itens : [];
        setItens(lista);
        setEscopo(r?.escopo || null);
        if (solicitacaoId && linkAbertoRef.current !== solicitacaoId) {
          linkAbertoRef.current = solicitacaoId;
          const alvo = lista.find(i => i.id === solicitacaoId);
          if (alvo) setAberta(alvo);
          else setAvisoLink('Esta solicitação não está mais aguardando pagamento (já foi paga ou saiu da fila).');
        }
      })
      .catch(e => setErro(e?.message || 'Erro ao carregar a fila de pagamento.'))
      .finally(() => setCarregando(false));
  };
  useEffect(() => { carregar(); }, [solicitacaoId]);

  const aoConcluir = (s, resposta) => {
    setItens(prev => prev.filter(i => i.id !== s.id));
    setAberta(null);
    setFeito({ titulo: s.titulo, status: resposta?.solicitacao?.status, avisos: Array.isArray(resposta?.avisos) ? resposta.avisos : [] });
  };

  const total = itens.reduce((acc, s) => acc + (Number(s.valor_cotado ?? s.valor_estimado) || 0), 0);

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Pagar solicitações</h3>
              {!carregando && !erro && <Badge variant="outline" className="text-[10px]">{itens.length}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              Reembolsos, pagamentos e compras sem cartão já aprovados. Dinheiro dispensa comprovante; as demais formas exigem.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onVerComprovantes && (
              <Button size="sm" variant="outline" onClick={onVerComprovantes}>
                <FolderOpen className="mr-1 h-3.5 w-3.5" /> Comprovantes
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={carregar} disabled={carregando}>
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </div>
        </div>

        {escopo === 'atribuidas' && (
          <div className="flex items-start gap-2 rounded border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Você vê só as solicitações atribuídas a você. A fila inteira aparece para quem responde pela área financeira.
          </div>
        )}

        {avisoLink && (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">{avisoLink}</div>
        )}

        {feito && (
          <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 text-emerald-700 dark:text-emerald-400">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Pagamento registrado: <strong>{feito.titulo}</strong>
                  {feito.status === 'aguardando_entrega' ? ' · a compra segue para a entrega.' : ' · solicitação concluída.'}
                </span>
              </div>
              <button type="button" onClick={() => setFeito(null)} className="text-muted-foreground hover:text-foreground" aria-label="Fechar">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {feito.avisos.map((a, i) => (
              <div key={i} className="mt-1 flex items-start gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{a}</span>
              </div>
            ))}
          </div>
        )}

        {erro ? (
          <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-3 text-xs text-rose-600 dark:text-rose-400">
            Não foi possível carregar a fila de pagamento: {erro}
          </div>
        ) : carregando ? (
          <div className="py-8 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : itens.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Check className="mx-auto mb-2 h-10 w-10 text-emerald-500/40" />
            Nada aguardando pagamento.
          </div>
        ) : (
          <>
            <div className="text-[11px] text-muted-foreground">Total a pagar: <strong className="text-foreground">{fmtMoney(total)}</strong></div>
            <div className="space-y-2">
              {itens.map(s => {
                const cat = CAT[s.categoria] || { label: s.categoria, icon: Receipt, cor: '#6b7280' };
                const Icon = cat.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setAberta(s)}
                    className="w-full rounded-lg border border-border p-3 text-left hover:bg-muted/30"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md" style={{ background: cat.cor + '20', color: cat.cor }}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold">{s.titulo}</span>
                          <Badge variant="outline" className="text-[9px]" style={{ borderColor: cat.cor, color: cat.cor }}>{cat.label}</Badge>
                          {s.eh_urgente && (
                            <Badge className="bg-rose-500/15 text-[9px] text-rose-600"><Flame className="mr-0.5 h-2.5 w-2.5" /> URGENTE</Badge>
                          )}
                          {s.pode_pagar === false && (
                            <Badge variant="outline" className="text-[9px]">Você é o solicitante</Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                          <strong className="text-foreground tabular-nums">{fmtMoney(s.valor_cotado ?? s.valor_estimado)}</strong>
                          {(s.favorecido_nome || s.solicitante_nome) && <span>Para: {s.favorecido_nome || s.solicitante_nome}</span>}
                          {s.forma_pagamento && <span>Pediu: {rotuloForma(s.forma_pagamento)}</span>}
                          {s.data_necessaria && <span>Até {fmtDia(s.data_necessaria)}</span>}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={!!aberta} onOpenChange={o => { if (!o) setAberta(null); }}>
        <DialogContent className="flex max-h-[90vh] max-w-lg flex-col">
          {aberta && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6 text-base">{aberta.titulo}</DialogTitle>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                <DadosDoPagamento s={aberta} />
                <ConcluirPagamento solicitacao={aberta} onConcluido={r => aoConcluir(aberta, r)} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Linha({ rotulo, children }) {
  if (children == null || children === '' || children === false) return null;
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{rotulo}</div>
      <div className="break-words text-sm">{children}</div>
    </div>
  );
}

function DadosDoPagamento({ s }) {
  const cat = CAT[s.categoria] || { label: s.categoria, cor: '#6b7280' };
  const anexos = anexosDe(s);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px]" style={{ borderColor: cat.cor, color: cat.cor }}>{cat.label}</Badge>
        {s.eh_urgente && <Badge className="bg-rose-500/15 text-[10px] text-rose-600">URGENTE</Badge>}
      </div>
      {s.descricao && <p className="text-sm text-muted-foreground">{s.descricao}</p>}

      <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/30 p-3">
        <Linha rotulo="Valor">{<strong className="tabular-nums">{fmtMoney(s.valor_cotado ?? s.valor_estimado)}</strong>}</Linha>
        <Linha rotulo="Solicitante">{s.solicitante_nome || s.solicitante_email}</Linha>
        <Linha rotulo="Favorecido">{s.favorecido_nome}</Linha>
        <Linha rotulo="CPF/CNPJ do favorecido">{s.favorecido_documento}</Linha>
        <Linha rotulo="Forma pedida">{s.forma_pagamento ? rotuloForma(s.forma_pagamento) : null}</Linha>
        <Linha rotulo="Chave Pix">{s.chave_pix ? <code className="text-[12px]">{s.chave_pix}</code> : null}</Linha>
        <Linha rotulo="Banco">{s.banco ? `${s.banco}${s.agencia ? ` · ag ${s.agencia}` : ''}${s.conta ? ` · c/c ${s.conta}` : ''}` : null}</Linha>
        <Linha rotulo="Data necessária">{s.data_necessaria ? fmtDia(s.data_necessaria) : null}</Linha>
        <Linha rotulo="Fornecedor (cotação)">{s.cotacao_fornecedor}</Linha>
        <Linha rotulo="Motivo do reembolso">{s.motivo_reembolso}</Linha>
        <Linha rotulo="Data da compra">{s.data_compra ? fmtDia(s.data_compra) : null}</Linha>
      </div>

      {anexos.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-border bg-muted/30 p-3">
          <div className="text-[10px] font-semibold uppercase text-muted-foreground">Anexos da solicitação</div>
          <div className="flex flex-wrap gap-1.5">
            {anexos.map((url, i) => (
              <a key={i} href={safeHref(url)} target="_blank" rel="noopener noreferrer" title={nomeDoArquivo(url)}
                 className="inline-flex max-w-[220px] items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:border-primary/50">
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{nomeDoArquivo(url)}</span>
                {!ehImagem(url) && <span className="shrink-0 text-[9px] text-muted-foreground">{rotuloTipo(url)}</span>}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

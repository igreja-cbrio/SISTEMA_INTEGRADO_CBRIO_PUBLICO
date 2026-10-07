












import { useMemo, useRef, useState } from 'react';
import { Loader2, Paperclip, X, Check, AlertTriangle, FileText } from 'lucide-react';
import { Button } from '../ui/button';
import { DatePicker } from '../ui/date-picker';
import { solicitacoes } from '../../api';
import { prepararArquivoParaEnvio } from '@/lib/arquivoParaEnvio';
import {
  rotuloForma, exigeComprovante, formaInicial, hojeBrtIso,
  motivoBloqueio, textoBotao, valorSugerido,
} from '@/lib/conclusaoPagamentoTela';

const fmtTamanho = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function ConcluirPagamento({ solicitacao: s, onConcluido }) {
  const permitidas = Array.isArray(s.formas_permitidas) ? s.formas_permitidas : [];
  const hoje = useMemo(() => hojeBrtIso(), []);
  const [forma, setForma] = useState(() => formaInicial(s.forma_pagamento, permitidas));
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState(() => valorSugerido(s));
  const [observacao, setObservacao] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [preparando, setPreparando] = useState(false);
  const [erroArquivo, setErroArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef(null);

  const precisaArquivo = exigeComprovante(forma);
  const bloqueio = motivoBloqueio({
    forma, data, temArquivo: !!arquivo, podePagar: s.pode_pagar !== false, permitidas, hojeIso: hoje,
  });

  const escolher = async (file) => {
    if (!file) return;
    setErroArquivo(null);
    setPreparando(true);
    try {
      const r = await prepararArquivoParaEnvio(file);
      if (r.ok) setArquivo(r.arquivo);
      else { setArquivo(null); setErroArquivo(r.erro); }
    } finally {
      setPreparando(false);
    }
  };

  const aoColar = (e) => {
    const item = Array.from(e.clipboardData?.items || []).find(i => i.kind === 'file');
    const file = item?.getAsFile();
    if (file) { e.preventDefault(); escolher(file); }
  };

  const concluir = async () => {
    if (bloqueio || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await solicitacoes.concluirPagamento(s.id, {
        forma, data, valor, observacao: observacao.trim() || undefined, arquivo: arquivo || undefined,
      });
      onConcluido?.(r);
    } catch (e) {
      if (e?.code === 'API_UPLOAD_TIMEOUT') {
        setErro('O servidor demorou para responder e o pagamento PODE ter sido registrado. Atualize a fila antes de tentar de novo.');
      } else if (e?.status === 409) {
        setErro(e.message || 'Esta solicitação foi alterada por outra pessoa. Atualize a fila.');
      } else {
        setErro(e?.message || 'Erro ao registrar o pagamento.');
      }
    } finally {
      setEnviando(false);
    }
  };

  if (!permitidas.length) {
    return (
      <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2">
        Esta categoria não tem forma de pagamento pelo financeiro.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3" onPaste={aoColar}>
      <div className="text-[10px] font-semibold uppercase text-primary">Registrar o pagamento</div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Forma de pagamento *</label>
          <select
            value={forma}
            onChange={e => { setForma(e.target.value); setErro(null); }}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Selecione…</option>
            {permitidas.map(f => <option key={f} value={f}>{rotuloForma(f)}</option>)}
          </select>
          {s.forma_pagamento && forma && formaInicial(s.forma_pagamento, permitidas) !== forma && (
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
              O solicitante pediu {rotuloForma(s.forma_pagamento)}. A forma usada fica registrada.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Data do pagamento</label>
          <DatePicker value={data} onChange={v => setData(v || hoje)} max={hoje} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor pago (R$)</label>
          <input
            value={valor}
            onChange={e => setValor(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm tabular-nums"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Observação (opcional)</label>
          <textarea
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
            rows={2}
            maxLength={1000}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      {forma && (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {precisaArquivo ? 'Comprovante *' : 'Recibo (opcional)'}
          </label>
          {arquivo ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{arquivo.name}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{fmtTamanho(arquivo.size)}</span>
              <button type="button" onClick={() => setArquivo(null)} className="text-muted-foreground hover:text-foreground" aria-label="Remover arquivo">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={e => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files?.[0]); }}
              className={`flex w-full flex-col items-center gap-1 rounded-md border-2 border-dashed px-3 py-4 text-xs transition-colors ${
                arrastando ? 'border-primary bg-primary/10' : precisaArquivo ? 'border-primary/40 hover:border-primary' : 'border-border hover:border-primary/50'
              }`}
            >
              {preparando
                ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                : <Paperclip className="h-5 w-5 text-muted-foreground" />}
              <span className="font-medium">{preparando ? 'Preparando o arquivo…' : 'Clique, arraste ou cole (Ctrl+V) o comprovante'}</span>
              <span className="text-[11px] text-muted-foreground">PDF ou imagem · até 4 MB</span>
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/*,.heic,.heif"
            className="hidden"
            onChange={e => { escolher(e.target.files?.[0]); e.target.value = ''; }}
          />
          {erroArquivo && <p className="mt-1 text-[11px] text-rose-500">{erroArquivo}</p>}
          {!precisaArquivo && (
            <p className="mt-1 text-[11px] text-muted-foreground">Pagamento em dinheiro não exige comprovante. Se houver recibo assinado, vale anexar.</p>
          )}
        </div>
      )}

      {erro && (
        <div className="flex items-start gap-2 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{erro}</span>
        </div>
      )}

      <div>
        <Button onClick={concluir} disabled={!!bloqueio || enviando || preparando} className="w-full">
          {enviando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
          {textoBotao(s.status_apos_pagamento)}
        </Button>
        {bloqueio && <p className="mt-1 text-center text-[11px] text-muted-foreground">{bloqueio}</p>}
        {!bloqueio && s.status_apos_pagamento && s.status_apos_pagamento !== 'concluido' && (
          <p className="mt-1 text-center text-[11px] text-muted-foreground">A compra segue para a entrega depois do pagamento.</p>
        )}
      </div>
    </div>
  );
}

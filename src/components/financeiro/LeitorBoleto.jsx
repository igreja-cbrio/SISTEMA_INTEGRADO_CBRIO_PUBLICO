












import { useRef, useState } from 'react';
import { Loader2, Paperclip, ScanLine, AlertTriangle, Check, X, RotateCcw } from 'lucide-react';
import { Button } from '../ui/button';
import { financeiroV2 } from '../../api';
import { prepararArquivoParaEnvio } from '@/lib/arquivoParaEnvio';
import { formatarLinha, mensagemMotivo, soDigitos } from '@/lib/boletoTela';

const fmtMoney = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const fmtDia = (iso) => (iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—');

export default function LeitorBoleto({ onResultado, onLimpar }) {
  const [arquivo, setArquivo] = useState(null);
  const [linha, setLinha] = useState('');
  const [etapa, setEtapa] = useState(null);
  const [resp, setResp] = useState(null);
  const [erro, setErro] = useState(null);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef(null);

  const ocupado = !!etapa;

  const terminar = (r, arq) => {
    setResp(r);
    onResultado?.(r, arq);
  };

  const lerArquivo = async (file) => {
    if (!file || ocupado) return;
    setErro(null);
    setResp(null);
    setEtapa('Preparando o arquivo…');
    try {
      const prep = await prepararArquivoParaEnvio(file);
      if (!prep.ok) { setErro(prep.erro); return; }
      setArquivo(prep.arquivo);
      setEtapa('Lendo o boleto…');
      let r = await financeiroV2.contasPagar.lerBoleto({ arquivo: prep.arquivo });
      if (!r.ok && r.ler_codigo_de_barras) {
        setEtapa('Lendo o código de barras…');
        const { lerCodigoDeBarras } = await import('@/lib/leituraBoletoNavegador');

        const cod = await lerCodigoDeBarras(file);
        if (cod.ok) {
          setEtapa('Conferindo o código…');
          r = await financeiroV2.contasPagar.lerBoleto({ arquivo: prep.arquivo, linha: cod.codigo, origem: 'leitura_codigo' });
        }
      }
      terminar(r, prep.arquivo);
    } catch (e) {
      setErro(e?.message || 'Erro ao ler o boleto.');
    } finally {
      setEtapa(null);
    }
  };

  const lerLinha = async () => {
    const d = soDigitos(linha);
    if (!d || ocupado) return;
    setErro(null);
    setEtapa('Conferindo a linha digitável…');
    try {
      const r = await financeiroV2.contasPagar.lerBoleto({ arquivo: arquivo || undefined, linha: d, origem: 'linha_digitada' });
      terminar(r, arquivo);
    } catch (e) {
      setErro(e?.message || 'Erro ao conferir a linha digitável.');
    } finally {
      setEtapa(null);
    }
  };

  const limpar = () => {
    setArquivo(null); setLinha(''); setResp(null); setErro(null);
    onLimpar?.();
  };

  const aoColar = (e) => {
    const item = Array.from(e.clipboardData?.items || []).find(i => i.kind === 'file');
    const file = item?.getAsFile();
    if (file) { e.preventDefault(); lerArquivo(file); }
  };

  const extras = resp?.extras || null;
  const campos = resp?.campos || {};
  const avisos = Array.isArray(resp?.avisos) ? resp.avisos : [];

  return (
    <div className="mb-3 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3" onPaste={aoColar}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
          <ScanLine className="h-4 w-4" /> Preencher a partir do boleto
        </div>
        {(resp || arquivo) && (
          <button type="button" onClick={limpar} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
            <RotateCcw className="h-3 w-3" /> Ler outro
          </button>
        )}
      </div>

      {!resp?.ok && (
        <>
          {arquivo ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-xs">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{arquivo.name}</span>
            </div>
          ) : (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={e => { e.preventDefault(); setArrastando(false); lerArquivo(e.dataTransfer.files?.[0]); }}
              className={`flex w-full flex-col items-center gap-1 rounded-md border-2 border-dashed px-3 py-3 text-xs transition-colors ${arrastando ? 'border-primary bg-primary/10' : 'border-primary/40 hover:border-primary'}`}
            >
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Anexar boleto (PDF ou foto) · clique, arraste ou cole</span>
              <span className="text-[11px] text-muted-foreground">Os campos são preenchidos para você conferir antes de lançar</span>
            </button>
          )}
          <input ref={inputRef} type="file" accept="application/pdf,image/*,.heic,.heif" className="hidden"
                 onChange={e => { lerArquivo(e.target.files?.[0]); e.target.value = ''; }} />
          <div className="flex gap-2">
            <input
              value={linha}
              onChange={e => setLinha(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lerLinha(); } }}
              placeholder="ou digite/cole a linha digitável"
              inputMode="numeric"
              className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-xs tabular-nums"
            />
            <Button type="button" size="sm" variant="outline" onClick={lerLinha} disabled={ocupado || !soDigitos(linha)}>Ler</Button>
          </div>
        </>
      )}

      {etapa && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {etapa}</div>
      )}
      {erro && (
        <div className="flex items-start gap-2 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
          <X className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{erro}</span>
        </div>
      )}
      {resp && !resp.ok && !etapa && (
        <div className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{mensagemMotivo(resp.motivo, { escaneado: resp.escaneado })}</span>
        </div>
      )}

      {resp?.ok && (
        <div className="space-y-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" /> {resp.tipo === 'arrecadacao' ? 'Conta de consumo / tributo lida' : 'Boleto lido'} · campos preenchidos abaixo
          </div>
          <div className="break-all font-mono text-[11px] text-muted-foreground">{formatarLinha(campos.linha_digitavel)}</div>
          <div className="flex flex-wrap gap-x-3 text-muted-foreground">
            <span>Valor: <strong className="text-foreground">{fmtMoney(campos.valor)}</strong></span>
            <span>Vencimento: <strong className="text-foreground">{fmtDia(campos.data_vencimento)}</strong></span>
            {campos.fornecedor && <span>Beneficiário: <strong className="text-foreground">{campos.fornecedor}</strong></span>}
          </div>
        </div>
      )}

      {extras?.mesmo_boleto?.length > 0 && (
        <div className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
          <div className="font-semibold">Este boleto já foi lançado:</div>
          {extras.mesmo_boleto.map(c => (
            <div key={c.id}>{c.descricao || c.fornecedor || 'Conta'} · {fmtMoney(c.valor)} · venc. {fmtDia(c.data_vencimento)} · {c.status}</div>
          ))}
        </div>
      )}
      {extras?.mesmo_valor_data?.length > 0 && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <div className="font-semibold">Já existe conta com o mesmo valor e vencimento — confira se não é a mesma:</div>
          {extras.mesmo_valor_data.slice(0, 5).map(c => (
            <div key={c.id}>{c.descricao || c.fornecedor || 'Conta'} · {fmtMoney(c.valor)} · {c.status}</div>
          ))}
        </div>
      )}
      {avisos.length > 0 && (
        <ul className="space-y-1">
          {avisos.map((a, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> <span>{a.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}












import { useMemo, useRef, useState } from 'react';
import { Loader2, Paperclip, X, Check, AlertTriangle, FileText } from 'lucide-react';
import { Button } from '../ui/button';
import { DatePicker } from '../ui/date-picker';
import { solicitacoes } from '../../api';
import { prepararArquivoParaEnvio } from '@/lib/arquivoParaEnvio';
import { rotuloForma, formasDaCategoria, exigeComprovante, hojeBrtIso } from '@/lib/conclusaoPagamentoTela';
import {
  camposCorrigiveis, formInicial, camposAlterados, motivoBloqueioCorrecao, ROTULO_CAMPO, MOTIVO_MIN,
} from '@/lib/correcaoSolicitacaoTela';

const fmtTamanho = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const inputCls = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm';

export default function CorrigirSolicitacao({ item, temComprovanteAtual, onSalvo, onCancelar }) {
  const hoje = useMemo(() => hojeBrtIso(), []);
  const permitidos = useMemo(() => camposCorrigiveis(item), [item]);
  const formas = formasDaCategoria(item.categoria);
  const [form, setForm] = useState(() => formInicial(item));
  const [arquivo, setArquivo] = useState(null);
  const [preparando, setPreparando] = useState(false);
  const [erroArquivo, setErroArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const inputRef = useRef(null);

  const set = (campo, valor) => { setForm(f => ({ ...f, [campo]: valor })); setErro(null); };
  const alterados = camposAlterados(item, form);
  const bloqueio = motivoBloqueioCorrecao({ sol: item, form, temArquivo: !!arquivo, temComprovanteAtual, hojeIso: hoje });
  const formaFinal = alterados.pagamento_forma || item.pagamento_forma || '';

  const escolher = async (file) => {
    if (!file) return;
    setErroArquivo(null);
    setPreparando(true);
    try {
      const r = await prepararArquivoParaEnvio(file);
      if (r.ok) setArquivo(r.arquivo);
      else { setArquivo(null); setErroArquivo(r.erro); }
    } finally { setPreparando(false); }
  };

  const salvar = async () => {
    if (bloqueio || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await solicitacoes.corrigir(item.id, {
        campos: alterados,
        motivo: form.motivo.trim(),
        esperado: item.updated_at || null,
        arquivo: arquivo || undefined,
      });
      onSalvo?.(r);
    } catch (e) {
      if (e?.code === 'API_UPLOAD_TIMEOUT') {
        setErro('O servidor demorou para responder e a correção PODE ter sido salva. Feche e abra a solicitação antes de tentar de novo.');
      } else {
        setErro(e?.message || 'Erro ao salvar a correção.');
      }
    } finally { setEnviando(false); }
  };

  const tem = (c) => permitidos.includes(c);

  return (
    <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
      <div>
        <div className="text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-400">Corrigir depois do pagamento</div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          A correção não reabre a solicitação. O motivo e o que mudou ficam na linha do tempo, e o solicitante é avisado.
          Favorecido, Pix, banco e o valor aprovado não mudam: se o pagamento saiu diferente, registre na observação.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Título</label>
          <input value={form.titulo} onChange={e => set('titulo', e.target.value)} maxLength={300} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Descrição</label>
          <textarea value={form.descricao} onChange={e => set('descricao', e.target.value)} rows={2} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Justificativa</label>
          <textarea value={form.justificativa} onChange={e => set('justificativa', e.target.value)} rows={2} className={inputCls} />
        </div>
        {tem('motivo_reembolso') && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Motivo do reembolso</label>
            <textarea value={form.motivo_reembolso} onChange={e => set('motivo_reembolso', e.target.value)} rows={2} className={inputCls} />
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Forma de pagamento</label>
          <select value={form.pagamento_forma} onChange={e => set('pagamento_forma', e.target.value)} className={inputCls}>
            {!form.pagamento_forma && <option value="">Selecione…</option>}
            {formas.map(f => <option key={f} value={f}>{rotuloForma(f)}</option>)}
          </select>
        </div>
        {tem('pagamento_data') ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Data do pagamento</label>
            <DatePicker value={form.pagamento_data} onChange={v => set('pagamento_data', v || '')} max={hoje} />
          </div>
        ) : null}
        {tem('pago_valor') ? (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor pago (R$)</label>
            <input value={form.pago_valor} onChange={e => set('pago_valor', e.target.value)} inputMode="decimal" placeholder="0,00" className={`${inputCls} tabular-nums`} />
          </div>
        ) : null}
        {!tem('pago_valor') && (
          <p className="sm:col-span-2 text-[11px] text-muted-foreground">
            Esta solicitação já foi lançada no financeiro: valor e data do pagamento se corrigem no lançamento.
          </p>
        )}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Observação do pagamento</label>
          <textarea value={form.pago_observacao} onChange={e => set('pago_observacao', e.target.value)} rows={2} maxLength={1000} className={inputCls} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          {exigeComprovante(formaFinal) && !temComprovanteAtual ? 'Comprovante *' : 'Trocar o comprovante (opcional)'}
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
          <button type="button" onClick={() => inputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-border px-3 py-3 text-xs hover:border-primary/50">
            {preparando ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Paperclip className="h-4 w-4 text-muted-foreground" />}
            <span>{preparando ? 'Preparando o arquivo…' : 'Anexar comprovante (PDF ou imagem · até 4 MB)'}</span>
          </button>
        )}
        <input ref={inputRef} type="file" accept="application/pdf,image/*,.heic,.heif" className="hidden"
          onChange={e => { escolher(e.target.files?.[0]); e.target.value = ''; }} />
        {erroArquivo && <p className="mt-1 text-[11px] text-rose-500">{erroArquivo}</p>}
        {temComprovanteAtual && arquivo && (
          <p className="mt-1 text-[11px] text-muted-foreground">O comprovante atual fica guardado no histórico; o novo passa a valer.</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Motivo da correção *</label>
        <textarea value={form.motivo} onChange={e => set('motivo', e.target.value)} rows={2} maxLength={1000}
          placeholder="Ex.: o pagamento foi por transferência, não por Pix" className={inputCls} />
        <p className="mt-1 text-[11px] text-muted-foreground">Mínimo de {MOTIVO_MIN} caracteres. Aparece para o solicitante.</p>
      </div>

      {Object.keys(alterados).length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Vai mudar: {[...Object.keys(alterados), ...(arquivo ? ['comprovante'] : [])].map(k => ROTULO_CAMPO[k] || k).join(', ')}.
        </p>
      )}

      {erro && (
        <div className="flex items-start gap-2 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{erro}</span>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button onClick={salvar} disabled={!!bloqueio || enviando || preparando} className="sm:flex-1">
          {enviando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
          Salvar correção
        </Button>
        <Button variant="ghost" onClick={onCancelar} disabled={enviando}>Cancelar</Button>
      </div>
      {bloqueio && <p className="text-center text-[11px] text-muted-foreground">{bloqueio}</p>}
    </div>
  );
}

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, Paperclip, Upload } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { marketingLinha } from '../../../api';
import { enviarParaSharePoint } from '../../../lib/enviarParaSharePoint';
















const tamanhoLegivel = (b) => {
  const n = Number(b) || 0;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
};

const EntregaArquivos = forwardRef(function EntregaArquivos(
  { item, alvo, bloqueado = false, onChanged, onFaltaRegistro }, ref,
) {
  const inputRef = useRef(null);
  const [progresso, setProgresso] = useState(null);
  const [erro, setErro] = useState(null);
  const [tirando, setTirando] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  useImperativeHandle(ref, () => ({ abrir: () => inputRef.current?.click() }), []);

  const arquivos = item.arquivos || [];
  const exige = item.exige_arquivo === true;

  async function enviar(arquivo) {
    if (!arquivo) return;
    setErro(null);
    setProgresso(0);
    try {
      const s = await marketingLinha.entregas.sessao(alvo, arquivo);
      const sp = await enviarParaSharePoint({ uploadUrl: s.upload_url, arquivo, onProgresso: setProgresso });
      const r = await marketingLinha.entregas.registrar(alvo, { drive_id: s.drive_id, sharepoint_item_id: sp.id });
      if (r?.falta_registro) onFaltaRegistro?.();
      await onChanged?.();
    } catch (e) {
      setErro(e?.message || 'Não foi possível enviar o arquivo.');
    } finally {
      setProgresso(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function tirar(a) {
    setErro(null);
    setOcupado(true);
    try {
      await marketingLinha.entregas.remover(a.id);
      setTirando(null);
      await onChanged?.();
    } catch (e) {
      setErro(e?.message || 'Não foi possível tirar o arquivo.');
    } finally {
      setOcupado(false);
    }
  }

  const enviando = progresso !== null;
  return (
    <div className="mt-2 pl-7 space-y-1.5">
      {arquivos.length > 0 && (
        <ul className="space-y-1" aria-label={`Arquivos de: ${item.texto || 'subtarefa'}`}>
          {arquivos.map(a => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <a href={a.web_url} target="_blank" rel="noreferrer" className="underline underline-offset-2 break-all">{a.nome}</a>
              {a.tamanho ? <span className="text-muted-foreground">{tamanhoLegivel(a.tamanho)}</span> : null}
              {!bloqueado && (tirando === a.id ? (
                <span className="flex items-center gap-1">
                  <span className="text-muted-foreground">Tirar este arquivo?</span>
                  <Button type="button" size="sm" variant="destructive" className="h-7 px-2" disabled={ocupado} onClick={() => tirar(a)}>Tirar</Button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2" disabled={ocupado} onClick={() => setTirando(null)}>Manter</Button>
                </span>
              ) : (
                <button type="button" className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  onClick={() => setTirando(a.id)} aria-label={`Tirar ${a.nome}`}>
                  tirar
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}
      {!bloqueado && (
        <>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            aria-label={`Arquivo de: ${item.texto || 'subtarefa'}`}
            onChange={(e) => enviar(e.target.files?.[0])}
          />
          <Button type="button" size="sm" variant={exige ? 'outline' : 'ghost'}
            className={exige ? 'h-8' : 'h-7 px-2 text-xs text-muted-foreground'}
            disabled={enviando} onClick={() => inputRef.current?.click()}>
            {enviando ? (
              <><Loader2 className="animate-spin" aria-hidden="true" /> Enviando… {progresso}%</>
            ) : exige ? (
              <><Upload aria-hidden="true" /> {arquivos.length ? 'Enviar outro arquivo' : 'Enviar arquivo'}</>
            ) : (
              <><Paperclip aria-hidden="true" /> {arquivos.length ? 'Anexar outro' : 'Anexar arquivo'}</>
            )}
          </Button>
        </>
      )}
      {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
    </div>
  );
});

export default EntregaArquivos;

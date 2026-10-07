












import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { links as linksApi } from '../api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Link2, QrCode as QrCodeIcon, RefreshCw, Loader2, Presentation } from 'lucide-react';

type Props = {
  link: string;
  titulo?: string;
  nomeArquivo?: string;
  descricao?: string;

  semDinamico?: boolean;








  chamada?: string;
  onClose: () => void;
};

export default function QrLinkDialog({
  link: linkOriginal, titulo, nomeArquivo = 'qr-code', descricao, semDinamico, chamada, onClose,
}: Props) {
  const [qrTela, setQrTela] = useState('');
  const [qrDownload, setQrDownload] = useState('');
  const [erro, setErro] = useState('');

  const [curto, setCurto] = useState<string | null>(null);
  const [criandoCurto, setCriandoCurto] = useState(false);

  const link = curto || linkOriginal;

  async function tornarDinamico() {
    setCriandoCurto(true);
    try {
      const r = await linksApi.paraDestino({ destino: linkOriginal, titulo: titulo || nomeArquivo });
      setCurto(`https://www.cbrio.org/r/${r.slug}`);
      toast.success(r.reusado
        ? 'Já existia um link curto para este destino — reusei'
        : 'QR dinâmico criado. Agora o destino pode mudar sem reimprimir.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não consegui criar o link curto');
    } finally { setCriandoCurto(false); }
  }

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { width: 320, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQrTela)
      .catch(() => setErro('Não foi possível gerar o QR code'));

    QRCode.toDataURL(link, { width: 1024, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQrDownload)
      .catch(() => {});
  }, [link]);

  function copiar() {
    navigator.clipboard.writeText(link);
    toast.success('Link copiado');
  }













  async function baixarCartaz() {
    try {
      const L = 1920, A = 1080;
      const c = document.createElement('canvas');
      c.width = L; c.height = A;
      const g = c.getContext('2d');
      if (!g) throw new Error('canvas indisponível');

      const grad = g.createLinearGradient(0, 0, L, A);
      grad.addColorStop(0, '#00B39D');
      grad.addColorStop(1, '#007E70');
      g.fillStyle = grad;
      g.fillRect(0, 0, L, A);



      const cardL = 620, cardX = L - cardL - 110, cardY = (A - cardL) / 2;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.roundRect(cardX, cardY, cardL, cardL, 32);
      g.fill();

      const qr = new Image();
      qr.src = qrDownload || qrTela;
      await new Promise((ok, fail) => { qr.onload = ok; qr.onerror = fail; });
      const qrL = cardL - 72;
      g.drawImage(qr, cardX + 36, cardY + 36, qrL, qrL);


      const tx = 110;
      g.fillStyle = '#ffffff';
      g.font = 'bold 82px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      g.fillText(titulo || 'Aponte a câmera', tx, 400);

      g.font = '44px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';


      const larguraMax = cardX - tx - 90;
      const linhas: string[] = [];
      let atual = '';
      for (const palavra of (chamada || '').split(/\s+/)) {
        const teste = atual ? `${atual} ${palavra}` : palavra;
        if (g.measureText(teste).width > larguraMax && atual) { linhas.push(atual); atual = palavra; }
        else atual = teste;
      }
      if (atual) linhas.push(atual);
      linhas.slice(0, 4).forEach((l, i) => g.fillText(l, tx, 490 + i * 62));

      g.font = '36px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
      g.globalAlpha = 0.85;
      g.fillText('Aponte a câmera do celular para o QR', tx, 500 + Math.min(linhas.length, 4) * 62 + 40);
      g.globalAlpha = 1;

      const url = c.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${nomeArquivo}-cartaz.png`;
      a.click();
      toast.success('Cartaz baixado · 1920×1080, pronto para o telão');
    } catch {


      toast.error('Não consegui montar o cartaz. O "Baixar PNG" e o link continuam valendo.');
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      {












                                                          }
      <DialogContent className="max-w-md flex flex-col max-h-[90vh]" style={{ zIndex: 1100 }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCodeIcon className="h-5 w-5 text-primary" />
            {titulo ? `QR code · ${titulo}` : 'QR code do link'}
          </DialogTitle>
        </DialogHeader>
        {erro ? (
          <p className="text-sm text-destructive text-center py-6">{erro}</p>
        ) : (
          <div className="space-y-3 flex-1 min-h-0 min-w-0 overflow-y-auto">
            <p className="text-xs text-muted-foreground">
              {descricao || 'Aponte a câmera do celular pro QR pra abrir o formulário de inscrição.'}
            </p>
            {qrTela && (
              <img
                src={qrTela}
                alt="QR code do link de inscrição"
                className="mx-auto rounded-lg border border-border bg-white"
                style={{ width: 240, height: 240 }}
              />
            )}
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="block text-center text-xs text-primary truncate px-4"
            >
              {link}
            </a>
            {!semDinamico && (
              curto ? (
                <p className="text-[11px] text-center text-emerald-600 px-4">
                  QR dinâmico: pode imprimir à vontade. Se o destino mudar, você troca em
                  Links e QR e este papel continua valendo.
                </p>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-[11px] text-muted-foreground mb-2">
                    Este QR grava o endereço final. Se ele vai ser <strong>impresso</strong>,
                    gere a versão dinâmica: o papel aponta para um endereço estável e o destino
                    passa a ser editável — sem reimprimir nada.
                  </p>
                  <Button size="sm" variant="outline" className="w-full"
                    onClick={tornarDinamico} disabled={criandoCurto}>
                    {criandoCurto ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                    Gerar QR dinâmico
                  </Button>
                </div>
              )
            )}
            <div className="flex justify-center gap-2 pt-1">
              <a href={qrDownload || qrTela} download={`${nomeArquivo}.png`}>
                <Button size="sm" disabled={!qrDownload && !qrTela}>
                  <Download className="h-3.5 w-3.5 mr-1" /> Baixar PNG
                </Button>
              </a>
              <Button size="sm" variant="outline" onClick={copiar}>
                <Link2 className="h-3.5 w-3.5 mr-1" /> Copiar link
              </Button>
            </div>
            {chamada && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-[11px] text-muted-foreground mb-2">
                  Para mandar à produção: o cartaz sai em 1920×1080 já com o QR e
                  a frase <em>“{chamada}”</em> — é o que vai na tela no momento do apelo.
                </p>
                <Button size="sm" variant="outline" className="w-full"
                  onClick={baixarCartaz} disabled={!qrDownload && !qrTela}>
                  <Presentation className="h-3.5 w-3.5 mr-1" /> Baixar cartaz para o telão
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

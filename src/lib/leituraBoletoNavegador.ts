













import { codigoConfirmado } from './boletoTela';

export type ResultadoLeitura =
  | { ok: true; codigo: string; leituras: number }
  | { ok: false; motivo: 'sem_codigo' | 'erro'; leituras: number; erro?: string };

const LARGURA_ALVO = 2400;
const MAX_PAGINAS = 2;

function ehPdf(file: File) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
}

function novoCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

async function paginasDoPdf(file: File): Promise<HTMLCanvasElement[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const saida: HTMLCanvasElement[] = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGINAS); n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: LARGURA_ALVO / base.width });
      const canvas = novoCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      saida.push(canvas);
    }
  } finally {
    doc.destroy();
  }
  return saida;
}

async function imagemEmCanvas(file: File): Promise<HTMLCanvasElement[]> {
  const bmp = await createImageBitmap(file);
  const escala = Math.min(1, LARGURA_ALVO / bmp.width) || 1;
  const canvas = novoCanvas(bmp.width * escala, bmp.height * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return [canvas];
}




function faixas(canvas: HTMLCanvasElement): HTMLCanvasElement[] {
  const out: HTMLCanvasElement[] = [];
  const alt = Math.round(canvas.height * 0.2);
  const passo = Math.round(canvas.height * 0.1);
  for (let y = 0; y + alt <= canvas.height + passo; y += passo) {
    const h = Math.min(alt, canvas.height - y);
    if (h <= 10) break;
    const f = novoCanvas(canvas.width, h);
    f.getContext('2d')?.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    out.push(f);
  }
  return out;
}

type Detector = { detect: (img: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };

async function detectorNativo(): Promise<Detector | null> {
  const BD = (globalThis as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (!BD) return null;
  try {
    const formatos = BD.getSupportedFormats ? await BD.getSupportedFormats() : [];
    if (!formatos.includes('itf')) return null;
    return new BD({ formats: ['itf'] });
  } catch {
    return null;
  }
}

async function leitorZxing() {
  const [lib, browser] = await Promise.all([import('@zxing/library'), import('@zxing/browser')]);
  const hints = new Map();
  hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, [lib.BarcodeFormat.ITF]);
  hints.set(lib.DecodeHintType.ALLOWED_LENGTHS, [44]);
  hints.set(lib.DecodeHintType.TRY_HARDER, true);
  const reader = new lib.ITFReader();
  return (canvas: HTMLCanvasElement): string | null => {
    try {
      const fonte = new browser.HTMLCanvasElementLuminanceSource(canvas);
      const bitmap = new lib.BinaryBitmap(new lib.HybridBinarizer(fonte));
      return reader.decode(bitmap, hints).getText();
    } catch {
      return null;
    }
  };
}

export async function lerCodigoDeBarras(file: File): Promise<ResultadoLeitura> {
  const leituras: string[] = [];
  try {
    const paginas = ehPdf(file) ? await paginasDoPdf(file) : await imagemEmCanvas(file);
    const nativo = await detectorNativo();
    const zxing = await leitorZxing();
    for (const pagina of paginas) {
      for (const faixa of [...faixas(pagina), pagina]) {
        if (nativo) {
          try {
            for (const r of await nativo.detect(faixa)) leituras.push(r.rawValue);
          } catch {                        }
        }
        const z = zxing(faixa);
        if (z) leituras.push(z);
        const confirmado = codigoConfirmado(leituras);
        if (confirmado) return { ok: true, codigo: confirmado, leituras: leituras.length };
      }
    }
    return { ok: false, motivo: 'sem_codigo', leituras: leituras.length };
  } catch (e) {
    return { ok: false, motivo: 'erro', leituras: leituras.length, erro: e instanceof Error ? e.message : String(e) };
  }
}

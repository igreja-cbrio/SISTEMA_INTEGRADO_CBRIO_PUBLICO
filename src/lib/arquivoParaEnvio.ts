










import { arquivoParaDataUrl } from './imagemParaEnvio';


export const TETO_ENVIO_BYTES = 4 * 1024 * 1024;

const TIPOS_ACEITOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export function tipoAceito(file: Pick<File, 'type' | 'name'>): boolean {
  if (TIPOS_ACEITOS.includes(file.type)) return true;

  return /\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(file.name || '');
}

export function ehPdf(file: Pick<File, 'type' | 'name'>): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
}

export type Preparado = { ok: true; arquivo: File } | { ok: false; erro: string };

async function dataUrlParaArquivo(dataUrl: string, nomeBase: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  const nome = `${nomeBase.replace(/\.[^.]+$/, '') || 'comprovante'}.jpg`;
  return new File([blob], nome, { type: blob.type || 'image/jpeg' });
}

export async function prepararArquivoParaEnvio(file: File, { tetoBytes = TETO_ENVIO_BYTES } = {}): Promise<Preparado> {
  if (!file) return { ok: false, erro: 'Nenhum arquivo escolhido.' };
  if (!tipoAceito(file)) return { ok: false, erro: 'Envie um PDF ou uma imagem (JPG, PNG, WEBP ou HEIC).' };
  if (ehPdf(file)) {
    if (file.size > tetoBytes) {
      return { ok: false, erro: `Este PDF tem ${(file.size / 1024 / 1024).toFixed(1)} MB e o limite é ${Math.round(tetoBytes / 1024 / 1024)} MB. Envie uma versão menor (ou uma foto).` };
    }
    return { ok: true, arquivo: file };
  }
  try {
    const dataUrl = await arquivoParaDataUrl(file, { ladoMax: 2000, qualidade: 0.85 });
    const reduzido = await dataUrlParaArquivo(dataUrl, file.name);
    if (reduzido.size <= tetoBytes) return { ok: true, arquivo: reduzido };
  } catch {                              }
  if (file.size <= tetoBytes) return { ok: true, arquivo: file };
  return { ok: false, erro: 'Esta imagem é pesada demais mesmo reduzida. Tente outra foto ou um PDF.' };
}

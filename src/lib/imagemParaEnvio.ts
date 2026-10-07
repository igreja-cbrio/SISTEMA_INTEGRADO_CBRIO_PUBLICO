


















export const LADO_MAX_PADRAO = 1024;
export const QUALIDADE_PADRAO = 0.85;

export const TETO_DATAURL = 900 * 1024;











export function dimensoesReduzidas(
  largura: number,
  altura: number,
  ladoMax: number = LADO_MAX_PADRAO,
): { largura: number; altura: number } {
  const l = Number(largura);
  const a = Number(altura);


  if (!Number.isFinite(l) || !Number.isFinite(a) || l <= 0 || a <= 0) {
    return { largura: l, altura: a };
  }
  const maior = Math.max(l, a);
  if (!Number.isFinite(ladoMax) || ladoMax <= 0 || maior <= ladoMax) {
    return { largura: Math.round(l), altura: Math.round(a) };
  }
  const fator = ladoMax / maior;
  return {

    largura: Math.max(1, Math.round(l * fator)),
    altura: Math.max(1, Math.round(a * fator)),
  };
}

function lerComoDataUrl(file: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ''));
    r.onerror = () => rej(new Error('Não consegui ler o arquivo.'));
    r.readAsDataURL(file);
  });
}

function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Não consegui abrir esta imagem.'));
    img.src = url;
  });
}








export async function arquivoParaDataUrl(
  file: File,
  { ladoMax = LADO_MAX_PADRAO, qualidade = QUALIDADE_PADRAO }: { ladoMax?: number; qualidade?: number } = {},
): Promise<string> {
  const original = await lerComoDataUrl(file);
  try {
    const img = await carregarImagem(original);
    const { largura, altura } = dimensoesReduzidas(img.naturalWidth, img.naturalHeight, ladoMax);
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas indisponível');
    ctx.drawImage(img, 0, 0, largura, altura);




    let saida = canvas.toDataURL('image/jpeg', qualidade);
    for (const q of [0.7, 0.55, 0.4]) {
      if (saida.length <= TETO_DATAURL) break;
      saida = canvas.toDataURL('image/jpeg', q);
    }
    if (saida.length > TETO_DATAURL) {
      throw new Error('Esta imagem é pesada demais mesmo reduzida. Tente outra foto.');
    }
    return saida;
  } catch (e) {
    if (original.length <= TETO_DATAURL) return original;
    throw e instanceof Error ? e : new Error('Não consegui preparar esta imagem.');
  }
}

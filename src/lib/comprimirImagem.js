



export async function comprimirImagem(file, { maxLado = 1920, qualidade = 0.85 } = {}) {
  if (!file?.type?.startsWith('image/')) return file;
  try {

    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', qualidade));
    if (!blob) return file;


    if (blob.size >= file.size && file.size < 4 * 1024 * 1024) return file;
    const nome = (file.name || 'foto').replace(/\.\w+$/, '') + '.jpg';
    return new File([blob], nome, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

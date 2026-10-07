










const BUCKET = 'devocional-videos';
const LIMITE_BYTES = 500 * 1024 * 1024;
const TIPOS = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };


function validarVideo({ tipo, tamanho } = {}) {
  const ext = TIPOS[String(tipo || '').toLowerCase()];
  if (!ext) return { erro: 'Formato não aceito. Envie um vídeo MP4 (ou MOV/WEBM).' };
  const n = Number(tamanho);
  if (!Number.isFinite(n) || n <= 0) return { erro: 'Tamanho do arquivo inválido.' };
  if (n > LIMITE_BYTES) return { erro: `O vídeo passa de ${LIMITE_BYTES / 1024 / 1024} MB. Comprima antes de enviar.` };
  return { ext };
}


function caminhoDoVideo(itemId, ext, carimbo) {
  return `itens/${itemId}/${carimbo}.${ext}`;
}


function caminhoEhDoItem(itemId, caminho) {
  if (typeof caminho !== 'string' || !itemId) return false;
  const prefixo = `itens/${itemId}/`;
  if (!caminho.startsWith(prefixo)) return false;
  const resto = caminho.slice(prefixo.length);
  return /^[0-9]+\.(mp4|mov|webm)$/.test(resto);
}







function linkDoYoutube(url) {
  if (typeof url !== 'string') return null;
  const m = url.trim().match(/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/i);
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : null;
}

module.exports = { BUCKET, LIMITE_BYTES, validarVideo, caminhoDoVideo, caminhoEhDoItem, linkDoYoutube };

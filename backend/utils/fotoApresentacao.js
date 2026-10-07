














const PREFIXO_FOTO = 'apresentacao-foto/';


const RE_CAMINHO = /^apresentacao-foto\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/;

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};


function extensaoDeMime(mime) {
  return MIME_EXT[String(mime || '').toLowerCase()] || null;
}






function caminhoFotoValido(caminho) {
  return typeof caminho === 'string' && RE_CAMINHO.test(caminho);
}












function nomeArquivoFoto(nomeCrianca, dataApresentacao, ext) {
  const base = String(nomeCrianca || 'crianca')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'crianca';
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(dataApresentacao || '')) ? `_${dataApresentacao}` : '';
  return `${base}${data}.${ext || 'jpg'}`;
}


function extensaoDoCaminho(caminho) {
  const m = String(caminho || '').match(/\.(jpg|png|webp)$/);
  return m ? m[1] : 'jpg';
}

module.exports = {
  PREFIXO_FOTO,
  extensaoDeMime,
  caminhoFotoValido,
  nomeArquivoFoto,
  extensaoDoCaminho,
};

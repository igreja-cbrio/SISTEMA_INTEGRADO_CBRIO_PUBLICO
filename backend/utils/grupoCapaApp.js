



















const MARCA_BUCKET = '/storage/v1/object/public/grupos/';















function caminhoDaCapa(fotoUrl) {
  if (typeof fotoUrl !== 'string') return null;
  const s = fotoUrl.trim();
  if (!s) return null;

  const i = s.indexOf(MARCA_BUCKET);
  if (i < 0) return null;


  const corte = s.search(/[?#]/);
  if (corte >= 0 && corte < i) return null;

  let bruto = s.slice(i + MARCA_BUCKET.length).split(/[?#]/)[0];
  if (!bruto) return null;

  try {
    bruto = decodeURIComponent(bruto);
  } catch {
    return null;
  }

  if (!bruto || bruto.split('/').some((p) => p === '..')) return null;
  return bruto;
}









const EXT_POR_MIME = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});


const MIMES_CAPA = Object.freeze(Object.keys(EXT_POR_MIME));


function extensaoDaCapa(mimetype) {
  if (typeof mimetype !== 'string') return null;
  return EXT_POR_MIME[mimetype.trim().toLowerCase()] ?? null;
}










function caminhoNovoDaCapa(grupoId, ext, agoraMs) {
  return `${grupoId}/${agoraMs}.${ext}`;
}

module.exports = {
  MARCA_BUCKET,
  MIMES_CAPA,
  caminhoDaCapa,
  extensaoDaCapa,
  caminhoNovoDaCapa,
};

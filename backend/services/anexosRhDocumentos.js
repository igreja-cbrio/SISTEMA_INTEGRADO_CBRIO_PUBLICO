
























const { supabase } = require('../utils/supabase');
const { separarCaminhosPorBucket, aplicarAssinaturas } = require('../utils/storagePath');

const BUCKET_DOCS_RH = 'documentos-rh';










const BUCKET_DOCS_RH_LEGADO = 'rh-fotos';



const DOCS_RH_TTL_SEG = 60 * 60;





async function assinarDocumentosRh(linhas) {
  if (!Array.isArray(linhas) || !linhas.length) return linhas;



  const { atual, legado } = separarCaminhosPorBucket(
    linhas.map((l) => l?.storage_path), BUCKET_DOCS_RH, BUCKET_DOCS_RH_LEGADO,
  );
  if (!legado.length && !atual.length) return linhas;



  const [mapaAtual, mapaLegado] = await Promise.all([
    assinarNoBucket(BUCKET_DOCS_RH, atual),
    assinarNoBucket(BUCKET_DOCS_RH_LEGADO, legado),
  ]);

  if (!Object.keys(mapaAtual).length && !Object.keys(mapaLegado).length) return linhas;

  return linhas.map((l) => {
    const comLegado = aplicarAssinaturas(l, ['storage_path'], BUCKET_DOCS_RH_LEGADO, mapaLegado);


    return aplicarAssinaturas(comLegado, ['storage_path'], BUCKET_DOCS_RH, mapaAtual);
  });
}








async function assinarNoBucket(bucket, caminhos) {
  if (!caminhos.length) return {};
  const { data, error } = await supabase.storage
    .from(bucket).createSignedUrls(caminhos, DOCS_RH_TTL_SEG);
  if (error) {
    console.warn(`[anexosRhDocumentos] createSignedUrls falhou em ${bucket}:`, error.message);
    return {};
  }
  const mapa = {};
  for (const item of (data || [])) {
    const url = item?.signedUrl || item?.signedURL;
    if (item?.path && url && !item.error) mapa[item.path] = url;
  }
  return mapa;
}

module.exports = { BUCKET_DOCS_RH, BUCKET_DOCS_RH_LEGADO, DOCS_RH_TTL_SEG, assinarDocumentosRh };

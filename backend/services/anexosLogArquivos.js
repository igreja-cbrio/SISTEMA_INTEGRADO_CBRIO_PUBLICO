'use strict';





















const { supabase } = require('../utils/supabase');
const { caminhoNoBucket, aplicarAssinaturas } = require('../utils/storagePath');

const BUCKET = 'log-arquivos';




const VALIDADE_SEGUNDOS = 60 * 60;







async function mapaAssinado(caminhos) {
  const unicos = [...new Set((caminhos || []).filter(Boolean))];
  if (!unicos.length) return {};

  const { data, error } = await supabase.storage
    .from(BUCKET).createSignedUrls(unicos, VALIDADE_SEGUNDOS);




  if (error) {
    console.warn('[anexosLogArquivos] createSignedUrls falhou:', error.message);
    return {};
  }

  const mapa = {};
  for (const item of (data || [])) {
    const p = item?.path;
    const url = item?.signedUrl || item?.signedURL;
    if (p && url && !item.error) mapa[p] = url;
  }
  return mapa;
}








async function assinarLinhas(linhas, campos) {
  if (!Array.isArray(linhas) || !linhas.length) return linhas;

  const caminhos = [];
  for (const linha of linhas) {
    for (const campo of campos) {
      const p = caminhoNoBucket(linha?.[campo], BUCKET);
      if (p) caminhos.push(p);
    }
  }
  const mapa = await mapaAssinado(caminhos);
  if (!Object.keys(mapa).length) return linhas;

  return linhas.map((l) => aplicarAssinaturas(l, campos, BUCKET, mapa));
}






async function assinarAnexosDeObjetos(linhas, campo) {
  if (!Array.isArray(linhas) || !linhas.length) return linhas;

  const caminhos = [];
  for (const linha of linhas) {
    for (const anexo of (Array.isArray(linha?.[campo]) ? linha[campo] : [])) {
      const p = caminhoNoBucket(anexo?.url, BUCKET);
      if (p) caminhos.push(p);
    }
  }
  const mapa = await mapaAssinado(caminhos);
  if (!Object.keys(mapa).length) return linhas;

  return linhas.map((linha) => {
    if (!Array.isArray(linha?.[campo])) return linha;
    return {
      ...linha,
      [campo]: linha[campo].map((anexo) => {
        const p = caminhoNoBucket(anexo?.url, BUCKET);
        return (p && mapa[p]) ? { ...anexo, url: mapa[p] } : anexo;
      }),
    };
  });
}

module.exports = {
  BUCKET,
  VALIDADE_SEGUNDOS,
  mapaAssinado,
  assinarLinhas,
  assinarAnexosDeObjetos,
};

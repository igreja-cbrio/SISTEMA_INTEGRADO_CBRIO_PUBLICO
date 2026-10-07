
























const { supabase } = require('../utils/supabase');
const {
  caminhosDosCampos,
  aplicarAssinaturas,
} = require('../utils/storagePath');

const BUCKET = 'solicitacoes';


const CAMPOS_SOLICITACAO = ['imagens_url', 'documento_url', 'nota_fiscal_url'];

const CAMPOS_ITEM = ['imagem_url'];







const CAMPOS_COTACAO = ['anexo_url'];




const VALIDADE_SEGUNDOS = 60 * 60;








async function assinarAnexosSolicitacoes(linhas) {
  if (!Array.isArray(linhas) || linhas.length === 0) return linhas;


  const todos = new Set();
  for (const linha of linhas) {
    for (const p of caminhosDosCampos(linha, CAMPOS_SOLICITACAO, BUCKET)) todos.add(p);
    for (const item of (linha?.solicitacao_itens || [])) {
      for (const p of caminhosDosCampos(item, CAMPOS_ITEM, BUCKET)) todos.add(p);
    }
    for (const cot of (linha?.solicitacao_cotacoes || [])) {
      for (const p of caminhosDosCampos(cot, CAMPOS_COTACAO, BUCKET)) todos.add(p);
    }
  }
  if (todos.size === 0) return linhas;


  const caminhos = [...todos];
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(caminhos, VALIDADE_SEGUNDOS);




  if (error) {
    console.warn('[anexosSolicitacao] createSignedUrls falhou:', error.message);
    return linhas;
  }






  const mapa = {};
  for (const item of (data || [])) {
    const p = item?.path;
    const url = item?.signedUrl || item?.signedURL;
    if (p && url && !item.error) mapa[p] = url;
  }
  if (Object.keys(mapa).length === 0) return linhas;


  return linhas.map((linha) => {
    const saida = aplicarAssinaturas(linha, CAMPOS_SOLICITACAO, BUCKET, mapa);
    if (Array.isArray(linha?.solicitacao_itens)) {
      saida.solicitacao_itens = linha.solicitacao_itens.map((item) =>
        aplicarAssinaturas(item, CAMPOS_ITEM, BUCKET, mapa)
      );
    }
    if (Array.isArray(linha?.solicitacao_cotacoes)) {
      saida.solicitacao_cotacoes = linha.solicitacao_cotacoes.map((cot) =>
        aplicarAssinaturas(cot, CAMPOS_COTACAO, BUCKET, mapa)
      );
    }
    return saida;
  });
}

module.exports = {
  BUCKET,
  CAMPOS_SOLICITACAO,
  CAMPOS_ITEM,
  CAMPOS_COTACAO,
  VALIDADE_SEGUNDOS,
  assinarAnexosSolicitacoes,
};

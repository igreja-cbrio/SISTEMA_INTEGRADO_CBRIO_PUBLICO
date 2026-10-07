'use strict';

































const PADRAO_PEDIDO = /(?:^|[\\/])invoice[-_](\d{6,})\.(xml|pdf)$/i;








const PADRAO_CHAVE = /(?<!\d)(\d{44})(?!\d)/;


function extensaoDe(s) {
  const b = String(s || '').toLowerCase();
  if (b.endsWith('.pdf')) return 'pdf';
  if (b.endsWith('.xml')) return 'xml';
  return null;
}







function lerNomeArquivo(nome) {
  const s = String(nome || '').trim();
  if (!s) return null;

  const tipo = extensaoDe(s);
  if (!tipo) return null;

  const mPedido = s.match(PADRAO_PEDIDO);


  const mChave = s.match(PADRAO_CHAVE);

  return {
    orderId: mPedido ? mPedido[1] : null,
    chaveAcesso: mChave ? mChave[1] : null,
    tipo,
  };
}


function pedidoDoNome(nome) {
  return lerNomeArquivo(nome)?.orderId || null;
}


function chaveDoNome(nome) {
  return lerNomeArquivo(nome)?.chaveAcesso || null;
}

module.exports = { lerNomeArquivo, pedidoDoNome, chaveDoNome };

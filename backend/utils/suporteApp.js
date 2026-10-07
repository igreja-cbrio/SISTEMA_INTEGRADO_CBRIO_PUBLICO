









const MIN_MENSAGEM = 5;
const MAX_MENSAGEM = 1000;


const MAX_PARAM = 600;







function paraParametro(texto, max = MAX_PARAM) {
  const limpo = String(texto == null ? '' : texto)
    .replace(/[\r\n]+/g, ' · ')
    .replace(/\t/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (limpo.length <= max) return limpo;
  return `${limpo.slice(0, max - 1).trimEnd()}…`;
}


function validarMensagem(texto) {
  const limpo = String(texto == null ? '' : texto).trim();
  if (limpo.length < MIN_MENSAGEM) {
    return { ok: false, erro: 'Escreva sua dúvida com um pouco mais de detalhe.' };
  }
  return { ok: true, mensagem: limpo.slice(0, MAX_MENSAGEM) };
}


function digitos(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (d.length >= 12 && d.length <= 13 && d.startsWith('55')) return d.slice(2);
  return d;
}


function telefoneLegivel(tel) {
  const d = digitos(tel);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d || '';
}








function montarParams({ nome, telefone, mensagem }) {
  return [
    paraParametro(nome, 80) || 'Alguém do app',
    telefoneLegivel(telefone) || 'sem telefone no cadastro',
    paraParametro(mensagem),
  ];
}

module.exports = {
  validarMensagem, montarParams, paraParametro, telefoneLegivel, digitos,
  MIN_MENSAGEM, MAX_MENSAGEM, MAX_PARAM,
};

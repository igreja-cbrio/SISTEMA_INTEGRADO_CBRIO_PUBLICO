





























const CONTATO_FEITO = new Set([
  'contactada', 'respondeu', 'atendido_respondido', 'nao_respondeu',
  'nao_compareceu', 'nao_atendido',
]);















const INALCANCAVEL = new Set(['numero_errado', 'contato_impossivel']);


const ENCERRADO = new Set([...CONTATO_FEITO, ...INALCANCAVEL]);


function contatoFoiFeito(c) {
  return !!(c && c.primeiro_contato_em) || CONTATO_FEITO.has(c && c.primeiro_contato_status);
}


function ehInalcancavel(c) {
  return INALCANCAVEL.has(c && c.primeiro_contato_status);
}






function precisaDeContato(c) {
  if (!c) return false;
  if (c.primeiro_contato_em) return false;
  return !ENCERRADO.has(c.primeiro_contato_status);
}






function totalAlcancavel(lista) {
  const arr = Array.isArray(lista) ? lista : [];
  return Math.max(0, arr.length - arr.filter(ehInalcancavel).length);
}


function pctAlcancavel(n, totalBruto, inalcancaveis) {
  const d = Math.max(0, Number(totalBruto || 0) - Number(inalcancaveis || 0));
  if (!d) return null;
  return Math.round((Number(n || 0) / d) * 100);
}

module.exports = {
  CONTATO_FEITO, INALCANCAVEL, ENCERRADO,
  contatoFoiFeito, ehInalcancavel, precisaDeContato,
  totalAlcancavel, pctAlcancavel,
};





















function digitos(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}










function cpfMascarado(cpf) {
  const d = digitos(cpf);
  if (d.length !== 11) return null;
  return `***.***.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}


function telefoneMascarado(tel) {
  const d = digitos(tel);
  if (d.length < 10 || d.length > 11) return null;
  const ddd = d.slice(0, 2);
  return `(${ddd}) *****-${d.slice(-4)}`;
}












function prefillDoCadastro(membro) {
  if (!membro || !membro.id) return null;
  const cpf = digitos(membro.cpf);
  return {
    nome: typeof membro.nome === 'string' ? membro.nome.trim() : null,
    email: typeof membro.email === 'string' ? membro.email.trim() || null : null,

    cpf_mascarado: cpfMascarado(cpf),
    telefone_mascarado: telefoneMascarado(membro.telefone),
    tem_cpf: cpf.length === 11,
    tem_telefone: (() => { const d = digitos(membro.telefone); return d.length >= 10 && d.length <= 11; })(),
  };
}












function pagadorParaCobranca({ membro, corpo } = {}) {
  const doCorpo = corpo || {};
  const cpfCadastro = digitos(membro?.cpf);
  const cpfDigitado = digitos(doCorpo.cpf);
  return {
    nome: (typeof doCorpo.nome === 'string' && doCorpo.nome.trim())
      || (typeof membro?.nome === 'string' ? membro.nome.trim() : '') || null,
    email: (typeof doCorpo.email === 'string' && doCorpo.email.trim())
      || (typeof membro?.email === 'string' ? membro.email.trim() : '') || null,
    telefone: digitos(doCorpo.telefone) || digitos(membro?.telefone) || null,

    cpf: cpfCadastro.length === 11 ? cpfCadastro : (cpfDigitado.length === 11 ? cpfDigitado : null),
    cpf_veio_do_cadastro: cpfCadastro.length === 11,
  };
}

module.exports = {
  digitos,
  cpfMascarado,
  telefoneMascarado,
  prefillDoCadastro,
  pagadorParaCobranca,
};

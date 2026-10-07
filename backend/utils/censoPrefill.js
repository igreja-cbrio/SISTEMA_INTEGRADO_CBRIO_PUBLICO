






































const CAMPOS_COM_TOKEN = Object.freeze([
  'cpf', 'nome', 'data_nascimento', 'telefone', 'email',
  'estado_civil', 'cidade', 'bairro', 'profissao',
]);
















const CAMPOS_SEM_TOKEN = Object.freeze([
  'cpf', 'nome', 'data_nascimento', 'estado_civil', 'cidade', 'bairro', 'profissao',
]);








function podeIdentificarPorCpf({ cpfValido, temNascimento }) {
  return cpfValido === true && temNascimento === true;
}









function camposDoCadastro(membro, { viaToken } = {}) {
  const permitidos = viaToken ? CAMPOS_COM_TOKEN : CAMPOS_SEM_TOKEN;
  const fonte = membro || {};
  const saida = {};
  for (const campo of permitidos) {
    const v = fonte[campo];
    saida[campo] = v === undefined ? null : v;
  }


  if (saida.cpf) saida.cpf = String(saida.cpf).replace(/\D/g, '') || null;
  return saida;
}

module.exports = {
  CAMPOS_COM_TOKEN,
  CAMPOS_SEM_TOKEN,
  podeIdentificarPorCpf,
  camposDoCadastro,
};

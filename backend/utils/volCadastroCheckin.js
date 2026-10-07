
























const { cpfValido, normalizarCpf } = require('./cpf');
const {
  soDigitos, tirarCodigoPaisTelefone, emailValido, validarNascimento, temAbreviacaoNome,
} = require('./camposContato');
const { sexoPara } = require('./dadosDoCadastro');


const CAMPOS_BASE = ['nome', 'telefone', 'cpf', 'data_nascimento', 'email', 'sexo'];

const SEXOS = ['masculino', 'feminino'];

const vazio = (v) => v === null || v === undefined || String(v).trim() === '';










function faltandoNoCadastro(perfil, membro) {
  if (!perfil) return [];
  const p = perfil || {};
  const m = membro || {};
  const falta = [];
  if (vazio(p.full_name) && vazio(m.nome)) falta.push('nome');
  if (vazio(p.phone) && vazio(m.telefone)) falta.push('telefone');
  if (vazio(p.cpf) && vazio(m.cpf)) falta.push('cpf');
  if (vazio(m.data_nascimento)) falta.push('data_nascimento');
  if (vazio(p.email) && vazio(m.email)) falta.push('email');
  if (vazio(m.genero)) falta.push('sexo');
  return falta;
}














function validarParcialCadastro(body = {}) {
  const erros = {};
  const valores = {};

  const bruto = {
    nome: body.full_name ?? body.nome ?? body.nome_completo,
    telefone: body.phone ?? body.telefone,
    cpf: body.cpf,
    nascimento: body.birth_date ?? body.data_nascimento,
    email: body.email,
    sexo: body.gender ?? body.sexo ?? body.genero,
  };

  if (!vazio(bruto.nome)) {
    const n = String(bruto.nome).trim().replace(/\s+/g, ' ');
    if (n.length < 5 || n.split(' ').length < 2) erros.nome = 'Informe o nome completo.';
    else if (temAbreviacaoNome(n)) erros.nome = 'Escreva o nome completo, sem abreviações.';
    else valores.nome = n;
  }

  if (!vazio(bruto.telefone)) {


    const tel = tirarCodigoPaisTelefone(soDigitos(bruto.telefone));
    if (tel.length < 10 || tel.length > 11) erros.telefone = 'Informe um telefone válido com DDD.';
    else valores.telefone = tel;
  }

  if (!vazio(bruto.cpf)) {
    const dig = soDigitos(bruto.cpf);
    if (dig.length !== 11 || !cpfValido(dig)) erros.cpf = 'CPF inválido — confira os dígitos.';
    else valores.cpf = normalizarCpf(dig);
  }

  if (!vazio(bruto.nascimento)) {
    const nasc = validarNascimento(bruto.nascimento);
    if (!nasc) erros.data_nascimento = 'Informe uma data de nascimento válida.';
    else valores.dataNascimento = nasc;
  }

  if (!vazio(bruto.email)) {
    const e = String(bruto.email).trim().toLowerCase();
    if (!emailValido(e)) erros.email = 'E-mail inválido.';
    else valores.email = e;
  }

  if (!vazio(bruto.sexo)) {


    const g = sexoPara('membro', bruto.sexo);
    if (!g || !SEXOS.includes(g)) erros.sexo = 'Selecione masculino ou feminino.';
    else valores.genero = g;
  }

  return { erros, valores };
}

module.exports = { CAMPOS_BASE, SEXOS, faltandoNoCadastro, validarParcialCadastro };

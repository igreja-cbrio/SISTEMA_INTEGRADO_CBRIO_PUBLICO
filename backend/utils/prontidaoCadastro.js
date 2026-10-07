




















const { cpfValido } = require('./cpf');
const { telefoneAlcancavel } = require('../services/contatoPessoa');


const FALTA = {
  nome: 'nome completo',
  cpf: 'CPF válido',
  telefone: 'telefone válido',
  email: 'e-mail',
  nascimento: 'data de nascimento',
  genero: 'sexo',
  termos: 'aceite dos termos (LGPD)',
};


const BLOQUEIO = {
  status: 'não está pendente',
  duplicado: 'possível duplicado — precisa de conferência',
};


function nomeCompleto(nome) {
  const limpo = String(nome || '').trim().replace(/\s+/g, ' ');
  if (!limpo) return false;
  const tokens = limpo.split(' ');
  if (tokens.length < 2) return false;

  return !tokens.some(t => t.replace(/\./g, '').length < 2);
}

function emailOk(email) {
  const e = String(email || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}








function nascimentoOk(iso, hoje = new Date()) {
  const s = String(iso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return false;

  const [a, m, dia] = s.split('-').map(Number);
  if (d.getFullYear() !== a || d.getMonth() + 1 !== m || d.getDate() !== dia) return false;
  if (d.getTime() > hoje.getTime()) return false;
  const anos = (hoje.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return anos <= 120;
}

function generoOk(g) {
  const v = String(g || '').trim().toLowerCase();

  return ['masculino', 'feminino', 'm', 'f'].includes(v);
}






function avaliarProntidao(cad, hoje = new Date()) {
  const c = cad || {};
  const faltando = [];
  const bloqueios = [];

  if (c.status !== 'pendente') bloqueios.push('status');




  if (c.duplicado_de_id) bloqueios.push('duplicado');

  if (!nomeCompleto(c.nome)) faltando.push('nome');
  if (!cpfValido(c.cpf)) faltando.push('cpf');
  if (!telefoneAlcancavel(c.telefone)) faltando.push('telefone');
  if (!emailOk(c.email)) faltando.push('email');
  if (!nascimentoOk(c.data_nascimento, hoje)) faltando.push('nascimento');
  if (!generoOk(c.genero)) faltando.push('genero');

  if (c.aceita_termos !== true) faltando.push('termos');

  return {
    pronto: faltando.length === 0 && bloqueios.length === 0,
    faltando,
    bloqueios,
    rotulos: [
      ...bloqueios.map(b => BLOQUEIO[b] || b),
      ...faltando.map(f => FALTA[f] || f),
    ],
  };
}



























function telefoneDigitosOk(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  return d.length >= 10 && d.length <= 11;
}






function avaliarCadastroPessoa(membro, hoje = new Date()) {
  const m = membro || {};
  const faltando = [];

  if (!nomeCompleto(m.nome)) faltando.push('nome');
  if (!cpfValido(m.cpf)) faltando.push('cpf');
  if (!telefoneDigitosOk(m.telefone)) faltando.push('telefone');
  if (!emailOk(m.email)) faltando.push('email');
  if (!nascimentoOk(m.data_nascimento, hoje)) faltando.push('nascimento');
  if (!generoOk(m.genero)) faltando.push('genero');

  return {
    completo: faltando.length === 0,
    faltando,
    rotulos: faltando.map(f => FALTA[f] || f),
  };
}

module.exports = {
  avaliarProntidao,
  avaliarCadastroPessoa,
  telefoneDigitosOk,
  nomeCompleto,
  nascimentoOk,
  generoOk,
  emailOk,
  FALTA,
  BLOQUEIO,
};

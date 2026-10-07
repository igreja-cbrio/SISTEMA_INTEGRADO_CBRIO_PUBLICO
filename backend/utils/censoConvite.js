








const { telefoneAlcancavel, digitos } = require('../services/contatoPessoa');
const { gerarTokenCenso } = require('./censoToken');







const TETO_RODADA_WHATSAPP = 200;


const TETO_RODADA_EMAIL = 200;














function whatsappPronto(env = process.env) {
  return !!String(env.WHATSAPP_TEMPLATE_CENSO_ATUALIZACAO || '').trim();
}


function semCpf(cpf) {
  return digitos(cpf).length !== 11;
}






function primeiroNome(nome) {
  const limpo = String(nome || '').trim().replace(/\s+/g, ' ');
  if (!limpo) return 'tudo bem';
  return limpo.split(' ')[0];
}

function emailUtilizavel(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;



  if (e.endsWith('privaterelay.appleid.com')) return false;
  return true;
}





function canaisDaPessoa(pessoa, { canais = ['whatsapp', 'email'], optinObrigatorio = false } = {}) {
  const p = pessoa || {};
  const motivos = [];
  const quer = c => canais.includes(c);

  let whatsapp = false;
  if (quer('whatsapp')) {
    if (!digitos(p.telefone)) motivos.push('sem_telefone');
    else if (!telefoneAlcancavel(p.telefone)) motivos.push('numero_errado');
    else if (optinObrigatorio && !p.whatsapp_optin) motivos.push('sem_optin');
    else whatsapp = true;
  }

  let email = false;
  if (quer('email')) {
    if (!emailUtilizavel(p.email)) motivos.push('sem_email');
    else email = true;
  }

  return { whatsapp, email, motivos };
}

















function jaConvidadoEmQualquerCanal(membroId, convidadosPorPessoa) {
  if (!convidadosPorPessoa) return false;
  return convidadosPorPessoa.has ? convidadosPorPessoa.has(membroId) : false;
}







function limitarPorTeto(lista, teto) {
  const arr = Array.isArray(lista) ? lista : [];
  if (!Number.isFinite(teto) || teto <= 0) return { envia: [], adiados: arr.length };
  return { envia: arr.slice(0, teto), adiados: Math.max(0, arr.length - teto) };
}













function montarLinkCenso(baseUrl, membroId = null) {
  const base = String(baseUrl || 'https://cbrio.org').replace(/\/+$/, '');
  const generico = `${base}/cadastro-membresia?censo=1`;
  if (!membroId) return generico;
  const token = gerarTokenCenso(membroId);
  return token ? `${generico}&t=${token}` : generico;
}

module.exports = {
  TETO_RODADA_WHATSAPP,
  TETO_RODADA_EMAIL,
  whatsappPronto,
  jaConvidadoEmQualquerCanal,
  semCpf,
  primeiroNome,
  emailUtilizavel,
  canaisDaPessoa,
  limitarPorTeto,
  montarLinkCenso,
};

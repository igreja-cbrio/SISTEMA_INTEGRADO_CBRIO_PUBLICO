























const { ALFABETO } = require('./totemCerco');

const LOCAIS = [
  { id: 'lounge',        nome: 'Lounge',        chamada: 'Primeira vez aqui? Ganhe um café por nossa conta.' },
  { id: 'banheiro',      nome: 'Banheiro',      chamada: 'É visitante? Um café te espera na cafeteria.' },
  { id: 'estacionamento', nome: 'Estacionamento', chamada: 'Chegou pela primeira vez? Seu café é presente nosso.' },
  { id: 'templo',        nome: 'Templo',        chamada: 'Que bom ter você aqui! Registre sua visita e ganhe um café.' },
  { id: 'outro',         nome: 'Outro / sem local', chamada: 'Primeira vez na CBRio? Ganhe um café por nossa conta.' },
];
const IDS_LOCAIS = LOCAIS.map((l) => l.id);

const CODIGO_LEN = 6;



const MIN_APOS_CULTO = 150;
const MIN_APOS_REGISTRO_SEM_CULTO = 120;


const HORAS_VALIDADE_PESQUISA = 72;

const NOTA_MAX = 3;

const HORAS_MIN_COMENTARIO = 6;

function soDigitos(s) {
  return String(s || '').replace(/\D/g, '');
}


function cpfValido(cpf) {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base, peso) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (peso - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10]);
}

function normalizarLocal(local) {
  const l = String(local || '').trim().toLowerCase();
  return IDS_LOCAIS.includes(l) ? l : 'outro';
}






function validarVisitante(body) {
  const b = body && typeof body === 'object' ? body : {};
  const nome = String(b.nome || '').trim().replace(/\s+/g, ' ');
  if (nome.length < 2) return { ok: false, erro: 'Informe seu nome.', campo: 'nome' };
  if (nome.length > 120) return { ok: false, erro: 'Nome longo demais.', campo: 'nome' };

  let telefone = soDigitos(b.telefone);

  if (telefone.length === 13 && telefone.startsWith('55')) telefone = telefone.slice(2);
  if (telefone.length < 10 || telefone.length > 11) {
    return { ok: false, erro: 'Informe seu WhatsApp com DDD (10 ou 11 dígitos).', campo: 'telefone' };
  }

  const cpf = soDigitos(b.cpf);
  if (cpf.length !== 11) return { ok: false, erro: 'Informe o CPF com 11 dígitos.', campo: 'cpf' };
  if (!cpfValido(cpf)) return { ok: false, erro: 'Esse CPF não é válido — confira os números.', campo: 'cpf' };


  if (b.aceite_lgpd !== true) {
    return { ok: false, erro: 'Para registrar, marque o aceite do tratamento dos seus dados.', campo: 'aceite_lgpd' };
  }

  return {
    ok: true,
    valores: {
      nome,
      telefone,
      cpf,

      whatsapp_optin: b.whatsapp_optin === true,
      local: normalizarLocal(b.local),
    },
  };
}





function gerarCodigoVoucher(rand) {
  const r = typeof rand === 'function' ? rand : defaultRand;
  let out = '';
  for (let i = 0; i < CODIGO_LEN; i++) out += ALFABETO[r(ALFABETO.length)];
  return out;
}
function defaultRand(n) {
  // eslint-disable-next-line global-require
  return require('crypto').randomInt(n);
}


function normalizarCodigoVoucher(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}


function minutosDaHora(hora) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hora || ''));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}








function instanteDevido({ registradoEm, cultoData, cultoHora }) {
  const reg = new Date(registradoEm).getTime();
  const min = minutosDaHora(cultoHora);
  if (cultoData && min != null && /^\d{4}-\d{2}-\d{2}$/.test(String(cultoData))) {
    const inicioUtc = Date.parse(`${cultoData}T00:00:00Z`) + 3 * 3600 * 1000 + min * 60 * 1000;



    const porCulto = inicioUtc + MIN_APOS_CULTO * 60 * 1000;
    return Math.max(porCulto, reg + 30 * 60 * 1000);
  }
  return reg + MIN_APOS_REGISTRO_SEM_CULTO * 60 * 1000;
}









function pesquisaDevida({ registradoEm, cultoData, cultoHora, whatsappOptin, pesquisaEnviadaEm, agora }) {
  if (whatsappOptin !== true) return 'nao_elegivel';
  if (pesquisaEnviadaEm) return 'ja_enviada';
  const now = agora instanceof Date ? agora.getTime() : (typeof agora === 'number' ? agora : Date.now());
  const reg = new Date(registradoEm).getTime();
  if (!Number.isFinite(reg)) return 'nao_elegivel';
  if (now - reg > HORAS_VALIDADE_PESQUISA * 3600 * 1000) return 'expirada';
  return now >= instanteDevido({ registradoEm, cultoData, cultoHora }) ? 'enviar' : 'aguardar';
}


function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || 'Olá';
}











function normalizarNota(n) {
  const v = Number(n);
  return Number.isInteger(v) && v >= 1 && v <= NOTA_MAX ? v : null;
}











function fimDaJanelaComentario(respondidaEm) {
  const t = new Date(respondidaEm).getTime();
  if (!Number.isFinite(t)) return null;


  const brt = t - 3 * 3600 * 1000;
  const viradaBrt = (Math.floor(brt / 86400000) + 1) * 86400000 + 3 * 3600 * 1000;
  return Math.max(viradaBrt, t + HORAS_MIN_COMENTARIO * 3600 * 1000);
}








function comentarioNaJanela({ respondidaEm, agora } = {}) {
  if (respondidaEm == null || respondidaEm === '') return true;
  const fim = fimDaJanelaComentario(respondidaEm);
  if (fim == null) return true;
  const now = agora instanceof Date ? agora.getTime() : (typeof agora === 'number' ? agora : Date.now());
  return now <= fim;
}

module.exports = {
  LOCAIS, IDS_LOCAIS, CODIGO_LEN, MIN_APOS_CULTO, MIN_APOS_REGISTRO_SEM_CULTO, HORAS_VALIDADE_PESQUISA,
  NOTA_MAX, HORAS_MIN_COMENTARIO,
  soDigitos, cpfValido, normalizarLocal, validarVisitante,
  gerarCodigoVoucher, normalizarCodigoVoucher,
  instanteDevido, pesquisaDevida, primeiroNome, normalizarNota,
  fimDaJanelaComentario, comentarioNaJanela,
};

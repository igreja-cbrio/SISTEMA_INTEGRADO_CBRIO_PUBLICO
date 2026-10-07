
























const { cpfValido, cnpjValido } = require('./documentoBr');


function digitos(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}







const REGIMES = ['MEI', 'SIMPLES', 'PRESUMIDO', 'REAL'];


const TIPOS_PIX = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'];

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;













function pixValido(tipo, chave) {
  const t = String(tipo || '').toLowerCase();
  const c = String(chave == null ? '' : chave).trim();
  if (!TIPOS_PIX.includes(t) || !c) return false;
  if (t === 'cpf') return cpfValido(c);
  if (t === 'cnpj') return cnpjValido(c);
  if (t === 'email') return c.length <= 77 && RE_EMAIL.test(c);
  if (t === 'telefone') {
    const d = digitos(c);

    const semPais = d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
    return semPais.length === 10 || semPais.length === 11;
  }
  return RE_UUID.test(c);
}










const OBRIGATORIOS = [
  ['razao_social', 'razão social'],
  ['cnpj', 'CNPJ'],
  ['regime_tributario', 'regime tributário'],
  ['endereco_sede', 'endereço da sede'],
  ['email_contratual', 'e-mail para comunicações'],
  ['rep_nome', 'nome do representante legal'],
  ['rep_cpf', 'CPF do representante legal'],
  ['pix_tipo', 'tipo da chave PIX'],
  ['pix_chave', 'chave PIX'],
  ['conta_titular', 'titular da conta'],
];









function validarFicha(ficha) {
  const f = ficha || {};
  const erros = {};

  for (const [campo, rotulo] of OBRIGATORIOS) {
    if (!String(f[campo] == null ? '' : f[campo]).trim()) erros[campo] = `Informe ${rotulo}.`;
  }

  if (f.cnpj && !cnpjValido(f.cnpj)) erros.cnpj = 'CNPJ inválido (confira os números).';
  if (f.rep_cpf && !cpfValido(f.rep_cpf)) erros.rep_cpf = 'CPF inválido (confira os números).';
  if (f.regime_tributario && !REGIMES.includes(String(f.regime_tributario).toUpperCase())) {
    erros.regime_tributario = 'Escolha um regime da lista.';
  }
  if (f.email_contratual && !RE_EMAIL.test(String(f.email_contratual).trim())) {
    erros.email_contratual = 'E-mail inválido.';
  }
  if (f.pix_tipo && f.pix_chave && !pixValido(f.pix_tipo, f.pix_chave)) {
    erros.pix_chave = 'Chave PIX não confere com o tipo escolhido.';
  }









  if (f.titular_confere === false && !String(f.titular_motivo || '').trim()) {
    erros.titular_motivo = 'Explique por que o titular da conta é diferente da contratada.';
  }
  if (f.titular_confere !== true && f.titular_confere !== false) {
    erros.titular_confere = 'Informe se o titular da conta é a própria contratada.';
  }

  return { ok: Object.keys(erros).length === 0, erros };
}









function normalizarFicha(ficha) {
  const f = ficha || {};
  const texto = (v, max) => {
    const s = String(v == null ? '' : v).trim();
    return s ? s.slice(0, max) : null;
  };
  return {
    razao_social: texto(f.razao_social, 200),
    nome_fantasia: texto(f.nome_fantasia, 200),
    cnpj: digitos(f.cnpj) || null,
    regime_tributario: f.regime_tributario ? String(f.regime_tributario).toUpperCase() : null,
    inscricao_municipal: texto(f.inscricao_municipal, 40),
    endereco_sede: texto(f.endereco_sede, 300),
    telefone_sede: digitos(f.telefone_sede) || null,
    email_contratual: f.email_contratual ? String(f.email_contratual).trim().toLowerCase().slice(0, 150) : null,
    whatsapp_contratual: digitos(f.whatsapp_contratual) || null,
    rep_nome: texto(f.rep_nome, 200),
    rep_cpf: digitos(f.rep_cpf) || null,
    rep_endereco: texto(f.rep_endereco, 300),
    banco: texto(f.banco, 100),
    agencia: texto(f.agencia, 20),
    conta: texto(f.conta, 30),
    conta_tipo: texto(f.conta_tipo, 20),
    pix_tipo: f.pix_tipo ? String(f.pix_tipo).toLowerCase() : null,
    pix_chave: texto(f.pix_chave, 100),
    conta_titular: texto(f.conta_titular, 200),
    titular_confere: f.titular_confere === true ? true : (f.titular_confere === false ? false : null),
    titular_motivo: texto(f.titular_motivo, 300),
  };
}









const NUNCA_NO_PUBLICO = [
  'banco', 'agencia', 'conta', 'conta_tipo', 'pix_chave', 'pix_tipo', 'rep_cpf', 'conta_titular',






  'aceite_ip', 'aceite_user_agent',
];


function semSegredos(ficha) {
  const f = { ...(ficha || {}) };
  for (const c of NUNCA_NO_PUBLICO) delete f[c];
  return f;
}












function ehContratada(tipoContrato) {
  const t = String(tipoContrato || '').toUpperCase().trim();
  return t === 'PJ' || t === 'PJ+';
}










function estadoFicha(funcionario) {
  const f = funcionario || {};
  if (!ehContratada(f.tipo_contrato)) {
    return { aplicavel: false, preenchida: false, completa: false, aceita: false, faltando: [] };
  }
  const ficha = f.ficha_contratada || null;
  if (!ficha) {
    return {
      aplicavel: true, preenchida: false, completa: false, aceita: false,
      faltando: OBRIGATORIOS.map(([, rotulo]) => rotulo),
    };
  }
  const { ok, erros } = validarFicha(ficha);
  const faltando = OBRIGATORIOS.filter(([campo]) => erros[campo]).map(([, rotulo]) => rotulo);
  return {
    aplicavel: true,
    preenchida: true,
    completa: ok,
    aceita: !!ficha.aceite_em,
    faltando,
  };
}













function bloqueioFolha(funcionario) {
  const e = estadoFicha(funcionario);
  if (!e.aplicavel) return { bloqueado: false, motivo: null };
  if (!e.preenchida) return { bloqueado: true, motivo: 'Ficha da contratada não preenchida' };
  if (!e.completa) return { bloqueado: true, motivo: `Ficha incompleta: falta ${e.faltando.join(', ')}` };
  return { bloqueado: false, motivo: null };
}

module.exports = {
  REGIMES,
  TIPOS_PIX,
  OBRIGATORIOS,
  NUNCA_NO_PUBLICO,
  digitos,
  pixValido,
  validarFicha,
  normalizarFicha,
  semSegredos,
  ehContratada,
  estadoFicha,
  bloqueioFolha,
};



























const { cpfValido, soDigitos } = require('./cpf');
const {
  tirarCodigoPaisTelefone, emailValido, temAbreviacaoNome,
} = require('./camposContato');

const MAIORIDADE = 18;


const PARENTESCOS = ['Mãe', 'Pai', 'Avó', 'Avô', 'Tia', 'Tio', 'Irmã', 'Irmão', 'Responsável legal', 'Outro'];









function hojeBRT(agoraMs = Date.now()) {
  return new Date(agoraMs - 3 * 3600 * 1000).toISOString().slice(0, 10);
}







function idadeEmAnos(nascimentoISO, refISO) {
  const nasc = String(nascimentoISO || '').slice(0, 10);
  const ref = String(refISO || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nasc) || !/^\d{4}-\d{2}-\d{2}$/.test(ref)) return null;
  if (nasc > ref) return null;
  let anos = Number(ref.slice(0, 4)) - Number(nasc.slice(0, 4));

  if (ref.slice(5) < nasc.slice(5)) anos -= 1;
  return anos;
}


















function ehMenorDeIdade(nascimentoISO, refISO) {
  const idade = idadeEmAnos(nascimentoISO, refISO || hojeBRT());
  if (idade === null) return false;
  return idade < MAIORIDADE;
}








function exigeResponsavel(evento, nascimentoISO, refISO) {
  if (!evento || !evento.exige_dados_menor) return false;
  return ehMenorDeIdade(nascimentoISO, refISO);
}


function normalizarParentesco(v) {
  const s = String(v ?? '').trim().slice(0, 60);
  return s || null;
}



















function validarResponsavel(body = {}) {
  const erros = {};

  const nome = String(body.responsavel_nome ?? '').trim().replace(/\s+/g, ' ');
  if (nome.length < 5 || nome.split(' ').length < 2) {
    erros.responsavel_nome = 'Informe o nome completo do responsável.';
  } else if (temAbreviacaoNome(nome)) {
    erros.responsavel_nome = 'Escreva o nome do responsável sem abreviações.';
  }

  const cpfDigitos = soDigitos(body.responsavel_cpf);
  if (!cpfValido(cpfDigitos)) erros.responsavel_cpf = 'Informe um CPF válido do responsável.';

  const parentesco = normalizarParentesco(body.responsavel_parentesco);
  if (!parentesco) erros.responsavel_parentesco = 'Informe o grau de parentesco com o menor.';

  const telefone = tirarCodigoPaisTelefone(soDigitos(body.responsavel_telefone));
  if (telefone.length < 10 || telefone.length > 11) {
    erros.responsavel_telefone = 'Informe o celular do responsável, com DDD.';
  }

  const email = String(body.responsavel_email ?? '').trim().toLowerCase();
  if (!emailValido(email)) erros.responsavel_email = 'Informe um e-mail válido do responsável.';


  let autorizaBatismo = null;
  const autorizaBruto = body.responsavel_autoriza_batismo;
  if (autorizaBruto === true || autorizaBruto === false) {
    autorizaBatismo = autorizaBruto;
  } else if (autorizaBruto !== undefined && autorizaBruto !== null && String(autorizaBruto).trim() !== '') {
    const s = String(autorizaBruto).trim().toLowerCase();
    if (s === 'sim' || s === 'true') autorizaBatismo = true;
    else if (s === 'nao' || s === 'não' || s === 'false') autorizaBatismo = false;
    else erros.responsavel_autoriza_batismo = 'Responda sim ou não sobre a autorização de batismo.';
  }

  return {
    erros,
    valores: {
      responsavelNome: nome,
      responsavelCpf: cpfValido(cpfDigitos) ? cpfDigitos : null,
      responsavelParentesco: parentesco,
      responsavelTelefone: telefone.length >= 10 && telefone.length <= 11 ? telefone : null,
      responsavelEmail: emailValido(email) ? email : null,
      responsavelAutorizaBatismo: autorizaBatismo,
    },
  };
}

module.exports = {
  MAIORIDADE,
  PARENTESCOS,
  hojeBRT,
  idadeEmAnos,
  ehMenorDeIdade,
  exigeResponsavel,
  normalizarParentesco,
  validarResponsavel,
};

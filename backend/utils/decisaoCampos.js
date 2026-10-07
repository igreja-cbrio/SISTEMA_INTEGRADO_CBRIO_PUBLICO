














const { validarNascimento } = require('./camposContato');

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');








function validarDecisao(body, { hoje, nascimentoObrigatorio = true } = {}) {
  const nome = String(body?.nome ?? '').trim();
  if (nome.length < 2) {
    return { ok: false, campo: 'nome', erro: 'Informe seu nome.' };
  }











  const dataNascimento = validarNascimento(body?.data_nascimento, hoje);
  if (!dataNascimento && nascimentoObrigatorio) {
    return {
      ok: false,
      campo: 'data_nascimento',
      erro: 'Informe sua data de nascimento (dia, mês e ano).',
    };
  }




  const telefone = soDigitos(body?.telefone);
  if (telefone.length < 10 || telefone.length > 11) {
    return {
      ok: false,
      campo: 'telefone',
      erro: 'Informe seu WhatsApp com DDD (10 ou 11 dígitos) para a equipe falar com você.',
    };
  }




  const cepDigitos = soDigitos(body?.cep);
  const cep = cepDigitos.length === 8 ? cepDigitos : null;





  if (body?.aceite_lgpd !== true) {
    return {
      ok: false,
      campo: 'aceite_lgpd',
      erro: 'Para registrar, é preciso aceitar o tratamento dos seus dados.',
    };
  }

  const email = String(body?.email ?? '').trim() || null;

  return { ok: true, valores: { nome, dataNascimento, telefone, cep, email } };
}

module.exports = { validarDecisao, soDigitos };

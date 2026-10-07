







































const {
  soDigitos, tirarCodigoPaisTelefone, emailValido, validarNascimento,
} = require('./camposContato');

const TELEFONE_MIN = 10;
const TELEFONE_MAX = 11;


function limparTexto(v, max = 200) {
  const s = String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : null;
}







function sanearDadosApp(dados, opts = {}) {
  const d = { ...(dados || {}) };
  const ajustes = [];
  const mudou = (campo, antes, depois) => {
    if (antes !== depois) ajustes.push(campo);
    return depois;
  };

  if ('telefone' in d) {


    const tel = tirarCodigoPaisTelefone(soDigitos(d.telefone));
    const ok = tel.length >= TELEFONE_MIN && tel.length <= TELEFONE_MAX;
    d.telefone = mudou('telefone', d.telefone, ok ? tel : null);
  }

  if ('cpf' in d) {



    const cpf = soDigitos(d.cpf);
    d.cpf = mudou('cpf', d.cpf, cpf || null);
  }

  if ('email' in d) {
    const email = String(d.email == null ? '' : d.email).trim().toLowerCase();
    d.email = mudou('email', d.email, emailValido(email) ? email : null);
  }

  if ('data_nascimento' in d) {
    d.data_nascimento = mudou(
      'data_nascimento', d.data_nascimento, validarNascimento(d.data_nascimento, opts.hoje),
    );
  }

  for (const campo of ['nome', 'sobrenome', 'nome_completo', 'nome_mae']) {
    if (campo in d) d[campo] = mudou(campo, d[campo], limparTexto(d[campo]));
  }

  return { dados: d, ajustes };
}

module.exports = { sanearDadosApp, limparTexto, TELEFONE_MIN, TELEFONE_MAX };

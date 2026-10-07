


const { nomesPodemSerMesmaPessoa, tokensNome } = require('./duplicidadePolicy');

function digits(v) { return String(v || '').replace(/\D/g, ''); }

function sobrenomesEmComum(a, b) {
  const ta = tokensNome(a?.nome).slice(1);
  const tb = new Set(tokensNome(b?.nome).slice(1));
  return [...new Set(ta.filter((t) => t.length >= 3 && tb.has(t)))];
}













function alertaMesmaPessoa(a = {}, b = {}) {
  const emA = String(a.email || '').trim().toLowerCase();
  const emB = String(b.email || '').trim().toLowerCase();
  const emailIgual = emA.length > 3 && emA === emB;
  const nascIgual = !!a.data_nascimento && a.data_nascimento === b.data_nascimento;
  if (!emailIgual || !nascIgual) return null;
  return 'E-mail e nascimento IDÊNTICOS: confira se não é a mesma pessoa (ou gêmeos)';
}

function avaliarRelacaoFamiliar(a = {}, b = {}, { mesmoTelefone = false, mesmoEndereco = false } = {}) {
  const cpfA = digits(a.cpf);
  const cpfB = digits(b.cpf);
  const cpfIgual = cpfA.length === 11 && cpfA === cpfB;
  if (cpfIgual || nomesPodemSerMesmaPessoa(a.nome, b.nome)) {
    return { destino: 'duplicidade', sobrenomes: [], alerta: null };
  }

  const sobrenomes = sobrenomesEmComum(a, b);
  if (mesmoEndereco || (mesmoTelefone && sobrenomes.length > 0)) {
    return { destino: 'familia', sobrenomes, alerta: alertaMesmaPessoa(a, b) };
  }
  return { destino: 'ignorar', sobrenomes, alerta: null };
}

module.exports = { avaliarRelacaoFamiliar, sobrenomesEmComum, alertaMesmaPessoa };

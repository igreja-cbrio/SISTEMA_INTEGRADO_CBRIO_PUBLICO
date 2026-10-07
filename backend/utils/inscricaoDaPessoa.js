















const { soDigitos, cpfValido } = require('./cpf');






function chavesDaPessoa(membro) {
  const membroId = membro && membro.id ? String(membro.id) : null;
  const d = soDigitos(membro && membro.cpf);
  return { membroId, cpf: cpfValido(d) ? d : null };
}










function inscricaoEhDaPessoa(inscricao, chaves) {
  if (!inscricao || !chaves) return false;
  const dono = inscricao.membro_id ? String(inscricao.membro_id) : null;
  if (chaves.membroId && dono === chaves.membroId) return true;
  if (dono) return false;
  if (!chaves.cpf) return false;
  return soDigitos(inscricao.cpf) === chaves.cpf;
}





function mesclarInscricoes(porVinculo = [], porCpf = [], chaves = null) {
  const out = [];
  const vistos = new Set();
  for (const i of porVinculo || []) {
    if (!i || !i.id || vistos.has(i.id)) continue;
    vistos.add(i.id); out.push(i);
  }
  for (const i of porCpf || []) {
    if (!i || !i.id || vistos.has(i.id)) continue;
    if (chaves && !inscricaoEhDaPessoa(i, chaves)) continue;
    vistos.add(i.id); out.push(i);
  }
  return out;
}

module.exports = { chavesDaPessoa, inscricaoEhDaPessoa, mesclarInscricoes };

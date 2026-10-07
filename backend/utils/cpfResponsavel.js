
















const DONOS = ['pai', 'mae'];















function donoDoCpf({ informado, temPai, temMae }) {
  if (temPai && !temMae) return 'pai';
  if (temMae && !temPai) return 'mae';
  const i = String(informado || '').toLowerCase();
  return DONOS.includes(i) ? i : 'mae';
}





function nomeDoDonoDoCpf(dono, nomePai, nomeMae) {
  return dono === 'pai' ? (nomePai || nomeMae || null) : (nomeMae || nomePai || null);
}










function distribuirCpfs({ dono, cpf, cpfOutro }) {
  const principal = cpf || null;
  let outro = cpfOutro || null;
  if (outro && principal && outro === principal) outro = null;
  return dono === 'pai'
    ? { cpf_pai: principal, cpf_mae: outro }
    : { cpf_mae: principal, cpf_pai: outro };
}

module.exports = { DONOS, donoDoCpf, nomeDoDonoDoCpf, distribuirCpfs };

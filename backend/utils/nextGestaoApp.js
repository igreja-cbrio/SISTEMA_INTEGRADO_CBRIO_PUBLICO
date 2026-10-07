










































const NIVEL_MINIMO_NEXT_APP = 2;

function nivelNumero(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}







function podeGerenciarNext({ leitura, escrita, turmasProprias } = {}) {
  const nivel = Math.max(nivelNumero(leitura), nivelNumero(escrita));
  if (nivel >= NIVEL_MINIMO_NEXT_APP) return true;
  return nivelNumero(turmasProprias) > 0;
}










function podeEscreverNext({ escrita, turmasProprias } = {}) {
  if (nivelNumero(escrita) >= NIVEL_MINIMO_NEXT_APP) return true;
  return nivelNumero(turmasProprias) > 0;
}














function podeGerenciarTurmaApp({ leitura, escrita, escrever = false, turma, membroId } = {}) {
  if (!turma) return false;
  const nivel = escrever
    ? nivelNumero(escrita)
    : Math.max(nivelNumero(leitura), nivelNumero(escrita));
  if (nivel >= NIVEL_MINIMO_NEXT_APP) return true;
  const dono = turma.responsavel_id;
  if (!dono || !membroId) return false;
  return String(dono) === String(membroId);
}

module.exports = {
  podeGerenciarNext,
  podeEscreverNext,
  podeGerenciarTurmaApp,
  NIVEL_MINIMO_NEXT_APP,
};

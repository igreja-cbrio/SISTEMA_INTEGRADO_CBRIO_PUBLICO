




















const MS_DIA = 24 * 60 * 60 * 1000;
const MS_SEMANA = 7 * MS_DIA;


function _ts(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  const t = d.getTime();
  return Number.isFinite(t) ? t : null;
}












function semanasSemServir(ultimaEscalaISO, agoraISO) {
  const ultima = _ts(ultimaEscalaISO);
  const agora = _ts(agoraISO);
  if (ultima === null || agora === null) return null;
  const diff = agora - ultima;
  if (diff <= 0) return 0;
  return Math.floor(diff / MS_SEMANA);
}








function rotuloTempoSemServir(semanas) {
  if (semanas === null || semanas === undefined) return 'sem escala recente';
  if (semanas <= 0) return 'serviu esta semana';
  if (semanas === 1) return 'há 1 semana';
  if (semanas >= 52) return 'há mais de um ano';
  return `há ${semanas} semanas`;
}





function _pesoTempo(c) {
  return c.semanas === null || c.semanas === undefined
    ? Number.POSITIVE_INFINITY
    : c.semanas;
}












function ordenarCandidatos(candidatos) {
  return [...(candidatos || [])].sort((a, b) => {
    const ca = a.conflito ? 1 : 0;
    const cb = b.conflito ? 1 : 0;
    if (ca !== cb) return ca - cb;
    const pa = _pesoTempo(a);
    const pb = _pesoTempo(b);
    if (pa !== pb) return pb - pa;
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  });
}










function _vinculoParaVaga(candidato, vaga) {
  const vinculos = (candidato.equipes || []).filter(v => v.team_id === vaga.team_id);
  if (!vinculos.length) return null;
  if (!vaga.position_id) return vinculos[0];
  return (
    vinculos.find(v => v.position_id === vaga.position_id) ||
    vinculos.find(v => !v.position_id) ||
    null
  );
}


function candidatoElegivel(candidato) {
  if (!candidato) return false;
  if (candidato.indisponivel) return false;
  if (candidato.jaEscalado) return false;



  if (candidato.conflito) return false;
  return true;
}











function distribuirVagas({ vagas, candidatos }) {
  const elegiveis = (candidatos || []).filter(candidatoElegivel);
  const ordenados = ordenarCandidatos(elegiveis);
  const usados = new Set();
  const atribuicoes = [];
  const vagasSemCandidato = [];

  for (const vaga of vagas || []) {
    const faltam = Math.max(0, Number(vaga.faltam) || 0);
    for (let i = 0; i < faltam; i++) {
      const escolhido = ordenados.find(c => !usados.has(c.id) && _vinculoParaVaga(c, vaga));
      if (!escolhido) {
        vagasSemCandidato.push({ ...vaga, restantes: faltam - i });
        break;
      }
      usados.add(escolhido.id);
      atribuicoes.push({
        vaga,
        candidato: escolhido,
        vinculo: _vinculoParaVaga(escolhido, vaga),
      });
    }
  }

  return { atribuicoes, vagasSemCandidato };
}

module.exports = {
  semanasSemServir,
  rotuloTempoSemServir,
  ordenarCandidatos,
  candidatoElegivel,
  distribuirVagas,
  MS_SEMANA,
};

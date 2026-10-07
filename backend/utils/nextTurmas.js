



















const HORARIO_NEXT = '09:30';


const ENCONTROS_POR_TURMA = 1;

const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const RE_DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function mesValido(mes) { return RE_MES.test(String(mes || '')); }
function diaValido(dia) { return RE_DIA.test(String(dia || '')); }









function diaDaSemana(dia) {
  if (!diaValido(dia)) return null;
  const [a, m, d] = String(dia).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}


function domingosDoMes(mes) {
  if (!mesValido(mes)) return [];
  const [a, m] = String(mes).split('-').map(Number);
  const ultimoDia = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const out = [];
  for (let d = 1; d <= ultimoDia; d++) {
    if (new Date(Date.UTC(a, m - 1, d)).getUTCDay() === 0) {
      out.push(`${mes}-${String(d).padStart(2, '0')}`);
    }
  }
  return out;
}


function mesDe(dia) { return diaValido(dia) ? String(dia).slice(0, 7) : null; }


function proximoMes(mes) {
  if (!mesValido(mes)) return null;
  const [a, m] = String(mes).split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}


function hojeBRT(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}






function nomeTurma(dia) {
  if (!diaValido(dia)) return null;
  const [a, m, d] = String(dia).split('-');
  return `Next · ${d}/${m}/${a}`;
}













function turmasPlanejadas(mes, agora = new Date()) {
  return domingosInscritiveis(domingosDoMes(mes), agora).map(dia => ({
    data: dia,
    nome: nomeTurma(dia),
    horario: HORARIO_NEXT,
    encontros: [{ numero: 1, data: dia }],
  }));
}








function mesesAGarantir(agora = new Date()) {
  const mes = mesDe(hojeBRT(agora));
  return [mes, proximoMes(mes)];
}










function domingosInscritiveis(dias, agora = new Date()) {
  const hoje = hojeBRT(agora);
  return (Array.isArray(dias) ? dias : [])
    .filter(d => diaValido(d) && d >= hoje)
    .sort();
}











const TURMAS_OFERECIDAS = 3;


















function proximasTurmas(turmas, hoje, n = TURMAS_OFERECIDAS) {
  if (!Array.isArray(turmas) || !diaValido(hoje)) return [];


  const teto = Number.isInteger(n) && n > 0 ? n : 0;
  return turmas
    .filter((t) => t && diaValido(t.data) && t.data >= hoje)
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))
    .slice(0, teto);
}


















function proximaTurma(turmas, hoje) {
  return proximasTurmas(turmas, hoje, 1)[0] || null;
}

module.exports = {
  HORARIO_NEXT, ENCONTROS_POR_TURMA,
  mesValido, diaValido, diaDaSemana, domingosDoMes, mesDe, proximoMes,
  hojeBRT, nomeTurma, turmasPlanejadas, mesesAGarantir, domingosInscritiveis,
  proximaTurma, proximasTurmas, TURMAS_OFERECIDAS,
};









const { isoWeekOf, isoWeekRange } = require('./isoWeek');





function hojeBrt(agora = new Date()) {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
  const [ano, mes, dia] = s.split('-').map(Number);
  return { ano, mes, dia };
}

function ehBissexto(ano) {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}





function corteDoAno(ano, mes, dia) {
  const d = (mes === 2 && dia === 29 && !ehBissexto(ano)) ? 28 : dia;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}




function ultimaSemanaIsoCompleta(hoje) {
  const hojeStr = corteDoAno(hoje.ano, hoje.mes, hoje.dia);
  const { semana, ano } = isoWeekOf(new Date(`${hojeStr}T12:00:00Z`));
  const { fim } = isoWeekRange(ano, semana);
  return fim.toISOString().slice(0, 10) <= hojeStr ? semana : semana - 1;
}

const MES_NOMES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
                         'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MES_NOMES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun',
                         'jul', 'ago', 'set', 'out', 'nov', 'dez'];




const ULTIMO_DIA_DO_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];















function resolverPeriodo({ meses, anos = [], hoje }) {
  const informados = (Array.isArray(meses) ? meses : [])
    .map(Number).filter(m => Number.isInteger(m) && m >= 1 && m <= 12);
  const sel = [...new Set(informados.length ? informados : [1,2,3,4,5,6,7,8,9,10,11,12])]
    .sort((a, b) => a - b);

  const inicioMes = sel[0];
  const ultimoMes = sel[sel.length - 1];
  const parcial = anos.includes(hoje.ano) && ultimoMes >= hoje.mes;
  const fimMes = parcial ? hoje.mes : ultimoMes;
  const dia = parcial ? hoje.dia : ULTIMO_DIA_DO_MES[fimMes - 1];

  const mesesNoPeriodo = sel.filter(m => m <= fimMes);
  const contiguo = mesesNoPeriodo.length === (fimMes - inicioMes + 1);

  let rotulo = `1º de ${MES_NOMES_LONGO[inicioMes - 1]} a ${dia} de ${MES_NOMES_LONGO[fimMes - 1]}`;
  if (!contiguo) {
    rotulo += ` (só ${mesesNoPeriodo.map(m => MES_NOMES_CURTO[m - 1]).join(', ')})`;
  }

  return { meses: mesesNoPeriodo, inicioMes, fimMes, dia, parcial, contiguo, rotulo };
}

module.exports = {
  hojeBrt, ehBissexto, corteDoAno, ultimaSemanaIsoCompleta, resolverPeriodo,
  MES_NOMES_LONGO, MES_NOMES_CURTO,
};

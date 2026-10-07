


























const ANO_INICIAL = 2022;
























function diaLocal(d) {
  const t = d instanceof Date ? d.getTime() : NaN;
  if (!Number.isFinite(t)) {
    throw new Error(`janelaPeriodo.diaLocal: data inválida (${String(d)}) — nunca produzir "NaN-NaN-NaN"`);
  }
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}


function anoValido(ano, agora = Date.now()) {
  const n = Number(ano);
  return Number.isInteger(n) && n >= ANO_INICIAL && n <= new Date(agora).getFullYear();
}














function diaIsoValido(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));

  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}












function periodoLivre(inicio, fim, agora) {
  if (!diaIsoValido(inicio) || !diaIsoValido(fim)) return null;
  const hoje = diaLocal(new Date(agora));


  const fimEfetivo = fim > hoje ? hoje : fim;



  if (inicio > fimEfetivo) return null;
  return {
    inicio,
    fim: fimEfetivo,
    dias: null,
    ano: null,
    livre: true,


    gran: (Date.parse(`${fimEfetivo}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`))
      / 86400000 <= 90 ? 'semana' : 'mes',


    fim_ajustado: fimEfetivo !== fim,
  };
}

function resolverJanelaPeriodo({ dias, ano, inicio, fim, diasValidos, diasPadrao, agora = Date.now() } = {}) {










  const livre = periodoLivre(inicio, fim, agora);
  if (livre) return livre;

  if (anoValido(ano, agora)) {
    const n = Number(ano);
    const fimDoAno = new Date(n, 11, 31, 12, 0, 0);
    const hoje = new Date(agora);



    const fim = fimDoAno.getTime() <= agora ? fimDoAno : hoje;
    return {
      inicio: `${n}-01-01`,
      fim: diaLocal(fim),
      dias: null,
      ano: n,


      gran: 'mes',
    };
  }

  const lista = Array.isArray(diasValidos) && diasValidos.length ? diasValidos : [diasPadrao];
  let d = Number(dias);







  if (!lista.includes(d)) d = diasPadrao;





  if (!Number.isFinite(d) || d <= 0) {
    d = lista.find((x) => Number.isFinite(Number(x)) && Number(x) > 0) ?? 365;
    d = Number(d);
  }
  return {
    inicio: diaLocal(new Date(agora - d * 86400000)),
    fim: null,
    dias: d,
    ano: null,
    gran: d <= 90 ? 'semana' : 'mes',
  };
}


function rotuloJanela(j) {
  if (!j) return '';



  if (j.livre) {
    const br = (iso) => (typeof iso === 'string' && iso.length >= 10
      ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
    return j.inicio === j.fim ? br(j.inicio) : `${br(j.inicio)} a ${br(j.fim)}`;
  }
  if (j.ano) return String(j.ano);
  return `últimos ${j.dias} dias`;
}

module.exports = {
  ANO_INICIAL, diaLocal, anoValido, diaIsoValido, resolverJanelaPeriodo, rotuloJanela,
};

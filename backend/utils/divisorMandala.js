




























function ehDomingo(iso) {
  if (typeof iso !== 'string' || iso.length < 10) return false;
  const dia = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const d = new Date(`${dia}T00:00:00Z`);



  return !Number.isNaN(d.getTime()) && d.getUTCDay() === 0;
}


function domingosNoMes(ano, mes) {
  const y = Number(ano);
  const m = Number(mes);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return 0;
  const diasNoMes = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let n = 0;
  for (let d = 1; d <= diasNoMes; d++) {
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0) n++;
  }
  return n;
}








function divisorDomingos(cultos, { ano, mes } = {}) {
  const datas = new Set();
  for (const c of cultos || []) {
    const iso = typeof c === 'string' ? c : c?.data;
    if (ehDomingo(iso)) datas.add(iso.slice(0, 10));
  }
  return datas.size || domingosNoMes(ano, mes) || 1;
}

module.exports = { ehDomingo, domingosNoMes, divisorDomingos };








function soDigitos(v) {
  return String(v || '').replace(/\D/g, '');
}


function normalizarCpf(v) {
  const d = soDigitos(v);
  return d.length === 11 ? d : null;
}



function cpfValido(v) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(d[n])) return false;
  }
  return true;
}

module.exports = { soDigitos, normalizarCpf, cpfValido };

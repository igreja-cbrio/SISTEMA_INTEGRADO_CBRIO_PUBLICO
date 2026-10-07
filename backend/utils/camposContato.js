













function soDigitos(v) {
  return String(v == null ? '' : v).replace(/\D/g, '');
}










function tirarCodigoPaisTelefone(digitos) {
  const d = String(digitos || '');
  if (d.length >= 12 && d.length <= 13 && d.startsWith('55')) return d.slice(2);
  return d;
}













function mascaraTelefone(v) {
  const d = tirarCodigoPaisTelefone(soDigitos(v)).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}


function emailValido(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
}









function validarNascimento(v, hoje) {
  const s = String(v || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  if (Number(s.slice(0, 4)) < 1900) return null;
  const limite = hoje || new Date().toISOString().slice(0, 10);
  if (s > limite) return null;
  return s;
}







const CONECTIVOS_NOME = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function temAbreviacaoNome(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  return partes.some((p) => {
    const limpa = p.replace(/\./g, '');
    if (CONECTIVOS_NOME.has(limpa.toLowerCase())) return false;
    return p.includes('.') || limpa.length <= 1;
  });
}

module.exports = {
  soDigitos, tirarCodigoPaisTelefone, mascaraTelefone, emailValido, validarNascimento,
  CONECTIVOS_NOME, temAbreviacaoNome,
};

'use strict';



































function parKey(a, b) {
  if (!a || !b) return null;
  const ia = String(a);
  const ib = String(b);
  if (ia === ib) return null;
  return ia < ib ? `${ia}_${ib}` : `${ib}_${ia}`;
}















function dedupPorParKey(linhas, lerChave = (l) => parKey(l?.membro_a_id, l?.membro_b_id)) {
  const vistas = new Set();
  const saida = [];
  let duplicadas = 0;
  let semChave = 0;
  for (const linha of Array.isArray(linhas) ? linhas : []) {
    const chave = lerChave(linha);
    if (!chave) { semChave += 1; continue; }
    if (vistas.has(chave)) { duplicadas += 1; continue; }
    vistas.add(chave);
    saida.push(linha);
  }
  return { linhas: saida, duplicadas, semChave };
}

module.exports = { parKey, dedupPorParKey };

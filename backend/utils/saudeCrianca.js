






























const PERGUNTAS_SAUDE = Object.freeze([
  Object.freeze({
    campo: 'tem_alergia',
    detalhe: 'alergia_qual',
    titulo: 'Tem alergia?',
    ajuda: 'Alimento, medicamento, picada — o que a equipe precisa saber antes do lanche.',
  }),
  Object.freeze({
    campo: 'tem_espectro',
    detalhe: 'espectro_qual',
    titulo: 'É autista (TEA)?',
    ajuda: 'A gente prepara a sala e entrega o pager pra família.',
  }),
  Object.freeze({
    campo: 'tem_limitacao_fisica',
    detalhe: 'limitacao_fisica_qual',
    titulo: 'Tem alguma limitação física?',
    ajuda: 'Pra receber a criança do jeito certo — e a família também leva pager.',
  }),
]);















function normalizarSaude(body) {
  const out = {};
  for (const p of PERGUNTAS_SAUDE) {
    const v = body?.[p.campo];
    if (v !== true && v !== false) continue;
    out[p.campo] = v;
    if (v === true) {
      const txt = String(body?.[p.detalhe] ?? '').trim();
      if (txt) out[p.detalhe] = txt.slice(0, 500);
    } else {
      out[p.detalhe] = null;
    }
  }
  return out;
}









function precisaPagerPorInclusao(saude) {
  return saude?.tem_espectro === true || saude?.tem_limitacao_fisica === true;
}

module.exports = { PERGUNTAS_SAUDE, normalizarSaude, precisaPagerPorInclusao };

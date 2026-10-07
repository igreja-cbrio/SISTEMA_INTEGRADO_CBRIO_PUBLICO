

















const { rotuloHora } = require('./criancaApresentacao');

























function escolherHorarioApresentacao(configurados, ocupacao = {}) {
  const vazio = { horario: null, label: null, transbordou: false, lotado: false };
  if (!Array.isArray(configurados) || !configurados.length) return vazio;

  const n = (h) => {
    const v = ocupacao && (ocupacao.get?.(h) ?? ocupacao[h]);
    return Number.isFinite(+v) ? +v : 0;
  };
  const abertos = configurados
    .filter((c) => c && c.horario && c.aberto !== false)
    .slice()
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.horario).localeCompare(String(b.horario)));
  if (!abertos.length) return vazio;

  for (let i = 0; i < abertos.length; i++) {
    const c = abertos[i];
    const limite = c.limite == null ? null : +c.limite;

    const cheio = limite !== null && n(c.horario) >= limite;
    if (!cheio) {
      return { horario: c.horario, label: c.label || rotuloHora(c.horario) || c.horario, transbordou: i > 0, lotado: false };
    }
  }
  return { ...vazio, lotado: true };
}






function rotuloHorarioApresentacao(horario, configurados = null) {
  if (!horario) return null;
  const c = (configurados || []).find((x) => x && x.horario === horario);
  return c?.label || rotuloHora(horario) || String(horario);
}


function nomeChave(nome) {
  return String(nome ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}









function paisIguais(nomePai, nomeMae) {
  const a = nomeChave(nomePai);
  const b = nomeChave(nomeMae);
  return Boolean(a) && a === b;
}






function nomesDosPaisUnicos(nomePai, nomeMae) {
  const out = [];
  const vistos = new Set();
  for (const n of [nomePai, nomeMae]) {
    const s = String(n ?? '').trim().replace(/\s+/g, ' ');
    if (!s) continue;
    const k = nomeChave(s);
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push(s);
  }
  return out;
}


















function exigeConfirmacaoPaisIguais(nomePai, nomeMae, confirmado) {
  return paisIguais(nomePai, nomeMae) && confirmado !== true;
}

module.exports = {
  escolherHorarioApresentacao,
  rotuloHorarioApresentacao,
  paisIguais,
  exigeConfirmacaoPaisIguais,
  nomesDosPaisUnicos,
  nomeChave,
};






















function turnoPorHorario(hora) {
  const h = String(hora || '').slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(h)) return null;
  return h < '12:00' ? 'manha' : 'noite';
}

const NOME = { manha: 'Dom manhã', noite: 'Dom noite' };







function montarTurnos({
  linhasSemana = [], linhasHist = [], turnoPorTipo = new Map(),
  capacidade = 0, usaOcupacao = false,
} = {}) {
  const naSemana = new Map();
  for (const r of linhasSemana) {
    const t = turnoPorTipo.get(r.service_type_id);
    if (!t) continue;
    const at = naSemana.get(t) || { soma: 0, cultos: 0 };
    at.soma += Number(r.valor) || 0;
    at.cultos += 1;
    naSemana.set(t, at);
  }


  const porSemana = new Map();
  for (const r of linhasHist) {
    const t = turnoPorTipo.get(r.service_type_id);
    if (!t) continue;
    const k = `${t}|${r.semana_iso}`;
    porSemana.set(k, (porSemana.get(k) || 0) + (Number(r.valor) || 0));
  }
  const somas = new Map();
  for (const [k, v] of porSemana) {
    const t = k.slice(0, k.indexOf('|'));
    if (!somas.has(t)) somas.set(t, []);
    somas.get(t).push(v);
  }

  return ['manha', 'noite'].map((t) => {
    const sem = naSemana.get(t);

    if (!sem) return null;
    const hist = somas.get(t) || [];
    return {
      turno: t,
      nome: NOME[t],
      valor_absoluto: sem.soma,
      media: hist.length ? Math.round(hist.reduce((a, v) => a + v, 0) / hist.length) : 0,


      taxa_ocupacao: usaOcupacao && sem.soma > 0 && sem.cultos > 0 && capacidade > 0
        ? Math.round((sem.soma / (capacidade * sem.cultos)) * 1000) / 10
        : null,
      cultos_na_semana: sem.cultos,

      semanas_na_media: hist.length,
    };
  }).filter(Boolean);
}

module.exports = { turnoPorHorario, montarTurnos, NOME_TURNO: NOME };

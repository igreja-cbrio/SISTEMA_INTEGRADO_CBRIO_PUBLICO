
















































function cultoCompativel(escalaCulto, alvoCulto) {
  if (!escalaCulto || !alvoCulto) return true;
  return String(escalaCulto) === String(alvoCulto);
}

function montarCobertura(itens, escalas) {
  const lista = Array.isArray(escalas) ? escalas : [];
  const porItemId = new Map();
  const porPar = new Map();
  const chavePar = (t, p) => `${t || ''}:${p || ''}`;

  for (const s of lista) {
    if (!s || !s.volunteer_id) continue;
    if (s.escala_culto_item_id) {
      if (!porItemId.has(s.escala_culto_item_id)) porItemId.set(s.escala_culto_item_id, []);
      porItemId.get(s.escala_culto_item_id).push(s);
    } else {
      const k = chavePar(s.team_id, s.position_id);
      if (!porPar.has(k)) porPar.set(k, []);
      porPar.get(k).push(s);
    }
  }









  const contaVaga = (s) => !!s && s.confirmation_status !== 'declined';

  const usadas = new Set();
  const resultado = (Array.isArray(itens) ? itens : []).map(a => {
    const diretas = (porItemId.get(a.id) || []).filter(s => !usadas.has(s.id));



    const querFaltando = Math.max(0, (a.quantidade || 0) - diretas.filter(contaVaga).length);
    const doPar = querFaltando > 0
      ? (porPar.get(chavePar(a.team_id, a.position_id)) || [])
        .filter(s => !usadas.has(s.id) && cultoCompativel(s.culto_id, a.culto_id))
        .slice(0, querFaltando)
      : [];
    const pessoas = [...diretas, ...doPar];
    for (const s of pessoas) usadas.add(s.id);

    return {
      id: a.id,
      team_id: a.team_id,
      team: a.team?.name || a.team || null,
      position_id: a.position_id,
      position: a.position?.name || a.position || null,


      culto_id: a.culto_id ?? null,
      fixo: a.fixo,
      alvo: a.quantidade || 0,
      preenchidas: pessoas.filter(contaVaga).length,
      recusadas: pessoas.length - pessoas.filter(contaVaga).length,
      faltam: Math.max(0, (a.quantidade || 0) - pessoas.filter(contaVaga).length),
      pessoas,
    };
  });




  const sobrando = lista.filter(s => s && s.volunteer_id && !usadas.has(s.id));

  const alvo = resultado.reduce((s, i) => s + i.alvo, 0);
  const preenchidas = resultado.reduce((s, i) => s + i.preenchidas, 0);

  return {
    itens: resultado,
    sobrando,
    resumo: {
      alvo,
      preenchidas,
      faltam: Math.max(0, alvo - preenchidas),
      cobertura_pct: alvo ? Math.round((preenchidas / alvo) * 100) : null,
    },
  };
}


function contarStatus(escalas) {
  const r = { total: 0, confirmados: 0, recusados: 0, pendentes: 0 };
  for (const s of Array.isArray(escalas) ? escalas : []) {
    if (!s) continue;
    r.total++;
    if (s.confirmation_status === 'confirmed') r.confirmados++;
    else if (s.confirmation_status === 'declined') r.recusados++;
    else r.pendentes++;
  }
  return r;
}

module.exports = { montarCobertura, contarStatus, cultoCompativel };

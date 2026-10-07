



























function chaveNome(nome) {
  return String(nome == null ? '' : nome)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}












function chaveDaLinha({ team_id: teamId, team_name: teamName, position_id: positionId } = {}) {
  const pos = positionId || '';
  if (teamId) return `id:${teamId}::${pos}`;
  const n = chaveNome(teamName);
  if (n) return `nome:${n}::${pos}`;

  return `sem::${pos}`;
}










function rotuloDaEquipe({ team_id: teamId, team_name: teamName, nome_do_vinculo: nomeVinculo } = {}) {


  if (teamId) {
    return {
      nome: (typeof nomeVinculo === 'string' && nomeVinculo.trim())
        || (typeof teamName === 'string' && teamName.trim())
        || 'Sem equipe',
      vinculada: true,
    };
  }
  const n = typeof teamName === 'string' ? teamName.replace(/\s+/g, ' ').trim() : '';
  if (n) return { nome: n, vinculada: false };
  return { nome: 'Sem equipe', vinculada: false };
}










function areaDaLinha({ area, team_id: teamId } = {}) {
  if (!teamId) return null;
  const a = typeof area === 'string' ? area.trim() : '';
  return a || null;
}


















function chaveExataNome(nome) {
  return String(nome == null ? '' : nome).replace(/\s+/g, ' ').trim();
}

















function indexarEquipesAtivas(equipes) {
  const porExatoAtivas = new Map();
  const porNomeAtivas = new Map();
  for (const t of equipes || []) {
    if (!t || t.is_active === false) continue;
    const ex = chaveExataNome(t.name);
    if (ex) {
      if (!porExatoAtivas.has(ex)) porExatoAtivas.set(ex, []);
      porExatoAtivas.get(ex).push(t.id);
    }
    const k = chaveNome(t.name);
    if (!k) continue;
    if (!porNomeAtivas.has(k)) porNomeAtivas.set(k, []);
    porNomeAtivas.get(k).push(t.id);
  }
  return { porExatoAtivas, porNomeAtivas };
}





function indexarMapaPco(linhas) {
  const mapa = new Map();
  for (const m of linhas || []) {
    if (!m || !m.team_id || m.ignorar) continue;
    const k = chaveNome(m.pco_nome);
    if (k) mapa.set(k, { team_id: m.team_id, position_id: m.position_id || null });
  }
  return mapa;
}
























function destinoDaOrfa(orfa, fontes) {
  const { team_name: teamName, position_id: posAtual } = orfa || {};
  const { mapa, porExatoAtivas, porNomeAtivas } = fontes || {};
  const k = chaveNome(teamName);



  if (!k) return { via: 'nenhum', motivo: 'sem nome de equipe' };


  const doMapa = mapa && mapa.get(k);
  if (doMapa) {
    return {
      team_id: doMapa.team_id,

      position_id: posAtual || doMapa.position_id || null,
      via: 'mapa_pco',
    };
  }


  const ex = porExatoAtivas && porExatoAtivas.get(chaveExataNome(teamName));
  const cand = (ex && ex.length === 1) ? ex : (porNomeAtivas && porNomeAtivas.get(k));
  if (!cand || !cand.length) return { via: 'nenhum', motivo: 'fora do mapa e sem equipe ativa de mesmo nome' };
  if (cand.length > 1) return { via: 'ambiguo', motivo: 'duas equipes ativas com o mesmo nome' };
  return { team_id: cand[0], position_id: posAtual || null, via: 'nome_ativa' };
}

module.exports = {
  chaveNome, chaveExataNome, chaveDaLinha, rotuloDaEquipe, areaDaLinha,
  indexarEquipesAtivas, indexarMapaPco, destinoDaOrfa,
};

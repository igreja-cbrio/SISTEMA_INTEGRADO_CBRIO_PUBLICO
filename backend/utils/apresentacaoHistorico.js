




















function hojeBRT(agoraMs = Date.now()) {



  return new Date(agoraMs - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}












function separar(linhas, hoje = hojeBRT()) {
  const proximas = [];
  const historico = [];
  const semData = [];
  for (const l of linhas || []) {
    const d = l?.data_apresentacao ? String(l.data_apresentacao).slice(0, 10) : null;
    if (!d) { semData.push(l); continue; }
    (d >= hoje ? proximas : historico).push(l);
  }
  proximas.sort((a, b) => String(a.data_apresentacao).localeCompare(String(b.data_apresentacao)));
  historico.sort((a, b) => String(b.data_apresentacao).localeCompare(String(a.data_apresentacao)));
  return { proximas: [...proximas, ...semData], historico };
}



const ORIGENS = Object.freeze(['vinculo', 'cpf', 'ficha_kids']);










function juntar(porCaminho) {
  const vistos = new Map();
  for (const via of ORIGENS) {
    for (const l of porCaminho?.[via] || []) {
      if (!l?.id || vistos.has(l.id)) continue;
      vistos.set(l.id, { ...l, via });
    }
  }
  return [...vistos.values()];
}

module.exports = { hojeBRT, separar, juntar, ORIGENS };

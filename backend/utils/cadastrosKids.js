















const MS_BRT = 3 * 3600 * 1000;


function diaBRT(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t - MS_BRT).toISOString().slice(0, 10);
}








function temMarcaDeImport(linha) {
  const id = linha?.planning_center_id;
  if (id == null) return false;
  return String(id).trim() !== '';
}













function resumirCadastros(linhas = []) {
  const vivas = [];
  let apagadas = 0;
  for (const l of linhas || []) {
    if (!l) continue;
    if (l.deleted_at) { apagadas += 1; continue; }
    vivas.push(l);
  }
























  const importadas = vivas.filter((l) => temMarcaDeImport(l));
  const doCulto = vivas.filter((l) => !temMarcaDeImport(l));

  return {
    total: doCulto.length,
    visitantes: doCulto.filter((l) => l.visitante === true).length,
    membros: doCulto.filter((l) => l.visitante === false).length,
    sem_marcacao: doCulto.filter((l) => l.visitante == null).length,

    importadas: importadas.length,



    importadas_visitante: importadas.filter((l) => l.visitante === true).length,
    apagadas,
    sem_responsavel: doCulto.filter((l) => l.tem_responsavel === false).length,
    sem_nascimento: doCulto.filter((l) => !l.data_nascimento).length,
  };
}








function serieDiaria(linhas = [], inicioISO, fimISO) {
  const t0 = Date.parse(`${inicioISO}T12:00:00Z`);
  const t1 = Date.parse(`${fimISO}T12:00:00Z`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return [];

  const porDia = new Map();
  for (const l of linhas || []) {
    if (!l || l.deleted_at) continue;




    if (temMarcaDeImport(l)) continue;
    const d = diaBRT(l.created_at);
    if (!d) continue;
    porDia.set(d, (porDia.get(d) || 0) + 1);
  }

  const fora = [];
  for (let t = t0; t <= t1; t += 86400000) {
    const dia = new Date(t).toISOString().slice(0, 10);
    fora.push({ dia, total: porDia.get(dia) || 0 });
  }
  return fora;
}











function limitesUtc(inicioISO, fimISO) {
  const t0 = Date.parse(`${inicioISO}T00:00:00Z`);
  const t1 = Date.parse(`${fimISO}T00:00:00Z`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  return {
    desde: new Date(t0 + MS_BRT).toISOString(),
    ate: new Date(t1 + MS_BRT + 86400000).toISOString(),
  };
}

module.exports = { diaBRT, resumirCadastros, serieDiaria, limitesUtc, temMarcaDeImport, MS_BRT };

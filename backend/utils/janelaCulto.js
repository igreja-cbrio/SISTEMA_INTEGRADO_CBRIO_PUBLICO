














const TZ = 'America/Sao_Paulo';


function diaBRT(iso, tz = TZ) {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  return d.toLocaleDateString('en-CA', { timeZone: tz });
}





function ehDiaDoCulto(scheduledAt, agora = new Date(), tz = TZ) {
  const dCulto = diaBRT(scheduledAt, tz);
  const dHoje = diaBRT(agora, tz);
  if (!dCulto || !dHoje) return { ok: false, motivo: 'sem_data', dia: dCulto, hoje: dHoje };
  return dCulto === dHoje
    ? { ok: true, dia: dCulto, hoje: dHoje }
    : { ok: false, motivo: 'fora_do_dia', dia: dCulto, hoje: dHoje };
}

module.exports = { diaBRT, ehDiaDoCulto, TZ };

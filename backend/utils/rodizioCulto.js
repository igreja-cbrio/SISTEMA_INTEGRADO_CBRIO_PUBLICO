





















const TZ = 'America/Sao_Paulo';


function _partesBRT(iso) {




  if (iso === null || iso === undefined || iso === '') return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;


  const ymd = d.toLocaleDateString('en-CA', { timeZone: TZ });
  const hora = Number(d.toLocaleString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).slice(0, 2));
  const [ano, mes, dia] = ymd.split('-').map(Number);


  const semanaDia = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return { ano, mes, dia, hora, semanaDia };
}








function ordinalNoMes(diaDoMes) {
  return Math.ceil(diaDoMes / 7);
}

const SEMANAS_DO_RODIZIO = 4;







function semanaDoRodizio(diaDoMes) {
  const o = ordinalNoMes(diaDoMes);
  return o > SEMANAS_DO_RODIZIO ? 1 : o;
}






function periodoDoCulto(horaBRT) {
  return horaBRT < 14 ? 'manha' : 'noite';
}





const DIA_POR_INDICE = { 0: 'domingo', 3: 'quarta', 6: 'sabado' };
const DIAS_DO_CULTO = Object.freeze(['domingo', 'quarta', 'sabado']);








function classificarCulto(scheduledAt) {
  const p = _partesBRT(scheduledAt);
  if (!p) return null;
  return {
    dia: DIA_POR_INDICE[p.semanaDia] || null,
    periodo: periodoDoCulto(p.hora),
    semana: semanaDoRodizio(p.dia),
    ordinal_real: ordinalNoMes(p.dia),
  };
}










function cultoCoberto(grant, culto) {
  if (!grant) return false;
  const g = {
    dia: grant.culto_dia || null,
    periodo: grant.culto_periodo || null,
    semana: grant.culto_semana || null,
  };
  if (!g.dia && !g.periodo && !g.semana) return true;
  if (!culto) return false;
  if (g.dia && g.dia !== culto.dia) return false;
  if (g.periodo && g.periodo !== culto.periodo) return false;
  if (g.semana && Number(g.semana) !== Number(culto.semana)) return false;
  return true;
}

module.exports = {
  TZ, SEMANAS_DO_RODIZIO, DIAS_DO_CULTO,
  ordinalNoMes, semanaDoRodizio, periodoDoCulto, classificarCulto, cultoCoberto,
};

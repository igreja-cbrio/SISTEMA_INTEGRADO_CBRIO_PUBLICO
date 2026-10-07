
















function chaveArea(v) {
  return String(v == null ? '' : v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}


const CURINGA = 'geral';
const PAPEIS = Object.freeze(['leitor', 'lider', 'admin']);











function equipeSupervisionada(equipe, areasDoSupervisor) {
  if (supervisionaTudo(areasDoSupervisor)) return true;
  const gs = normalizarConcessoes(areasDoSupervisor);


  const id = equipe && equipe.id ? String(equipe.id) : null;
  if (id && gs.some((g) => g.team_id && String(g.team_id) === id)) return true;
  const alvo = chaveArea(equipe && equipe.area);
  if (!alvo) return false;




  return gs.some((g) => !g.team_id && (chaveArea(g.area) === alvo || chaveArea(g.area) === CURINGA));
}


function filtrarPorSupervisao(itens, areasDoSupervisor, lerArea) {
  const ler = lerArea || ((i) => i && i.area);
  if (supervisionaTudo(areasDoSupervisor)) return itens || [];
  const permitidas = new Set(normalizarConcessoes(areasDoSupervisor).map((g) => chaveArea(g.area)).filter(Boolean));
  return (itens || []).filter((i) => {
    const a = chaveArea(ler(i));
    return !!a && permitidas.has(a);
  });
}


















function normalizarConcessoes(entrada) {
  return (entrada || []).map((g) => (
    typeof g === 'string'
      ? { area: g, papel: 'lider', team_id: null, position_id: null, culto_dia: null, culto_periodo: null, culto_semana: null }
      : {
        area: g && g.area,


        papel: (g && PAPEIS.includes(g.papel)) ? g.papel : 'lider',
        team_id: (g && g.team_id) || null,
        position_id: (g && g.position_id) || null,


        culto_dia: (g && g.culto_dia) || null,
        culto_periodo: (g && g.culto_periodo) || null,
        culto_semana: (g && g.culto_semana) || null,
      }
  ));
}








function _semRecorte(g) {
  return !g.team_id && !g.position_id && !g.culto_dia && !g.culto_periodo && !g.culto_semana;
}

function supervisionaTudo(entrada) {
  return normalizarConcessoes(entrada).some((g) => chaveArea(g.area) === CURINGA && _semRecorte(g));
}


function _cobre(g, alvo) {
  if (g.team_id) {



    if (!(alvo.team_id && String(g.team_id) === String(alvo.team_id))) return false;
  } else {
    const areaOk = chaveArea(g.area) === CURINGA || (!!chaveArea(alvo.area) && chaveArea(g.area) === chaveArea(alvo.area));
    if (!areaOk) return false;
  }

  if (g.position_id && !(alvo.position_id && String(g.position_id) === String(alvo.position_id))) return false;


  const { cultoCoberto } = require('./rodizioCulto');
  return cultoCoberto(g, alvo.culto || null);
}









function podeSupervisionar(entrada, alvo) {
  const gs = normalizarConcessoes(entrada);
  if (gs.some((g) => chaveArea(g.area) === CURINGA && _semRecorte(g))) return true;
  return gs.some((g) => _cobre(g, alvo || {}));
}


function subareasNaArea(entrada, area, teamId) {
  const gs = normalizarConcessoes(entrada).filter((g) => (
    g.team_id
      ? (!!teamId && String(g.team_id) === String(teamId))
      : (chaveArea(g.area) === chaveArea(area) || chaveArea(g.area) === CURINGA)
  ));
  if (gs.some((g) => !g.position_id)) return [];
  return [...new Set(gs.map((g) => String(g.position_id)))];
}









function soEditores(entrada) {
  return normalizarConcessoes(entrada).filter((g) => g.papel !== 'leitor');
}


function somenteLeitura(entrada) {
  const gs = normalizarConcessoes(entrada);
  return gs.length > 0 && gs.every((g) => g.papel === 'leitor');
}


function papelMaior(entrada) {
  const gs = normalizarConcessoes(entrada);
  if (!gs.length) return null;
  if (gs.some((g) => g.papel === 'admin' || (chaveArea(g.area) === CURINGA && _semRecorte(g)))) return 'admin';
  if (gs.some((g) => g.papel === 'lider')) return 'lider';
  return 'leitor';
}






function cultoNoEscopo(entrada, culto) {
  const { cultoCoberto } = require('./rodizioCulto');
  return normalizarConcessoes(entrada).some((g) => cultoCoberto(g, culto || null));
}














function gerenciaEstruturaDoTime(entrada, equipe) {
  const gs = normalizarConcessoes(entrada).filter((g) => (
    g.papel !== 'leitor' && !g.position_id && !g.culto_dia && !g.culto_periodo && !g.culto_semana
  ));
  if (gs.some((g) => chaveArea(g.area) === CURINGA && !g.team_id)) return true;
  if (!equipe) return false;
  const id = equipe.id ? String(equipe.id) : null;
  const area = chaveArea(equipe.area);
  return gs.some((g) => (
    g.team_id ? (!!id && String(g.team_id) === id) : (!!area && chaveArea(g.area) === area)
  ));
}


function gerenciaAlgumaEstrutura(entrada) {
  return normalizarConcessoes(entrada).some((g) => (
    g.papel !== 'leitor' && !g.position_id && !g.culto_dia && !g.culto_periodo && !g.culto_semana
  ));
}

module.exports = {
  chaveArea, supervisionaTudo, equipeSupervisionada, filtrarPorSupervisao, CURINGA, PAPEIS,
  normalizarConcessoes, podeSupervisionar, subareasNaArea,
  soEditores, somenteLeitura, papelMaior, cultoNoEscopo,
  gerenciaEstruturaDoTime, gerenciaAlgumaEstrutura,
};

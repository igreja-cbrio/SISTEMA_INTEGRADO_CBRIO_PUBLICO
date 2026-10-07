












const FUSO_BRT_MIN = -180;


function agoraBRT(agora = new Date()) {
  const d = new Date(agora.getTime() + FUSO_BRT_MIN * 60000);
  return {
    ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate(),
    hora: d.getUTCHours(), min: d.getUTCMinutes(), diaSemana: d.getUTCDay(),
  };
}

const pad = n => String(n).padStart(2, '0');
const iso = (a, m, d) => `${a}-${pad(m)}-${pad(d)}`;


function somarDias(dataISO, dias) {
  const [a, m, d] = dataISO.split('-').map(Number);
  const base = new Date(Date.UTC(a, m - 1, d));
  base.setUTCDate(base.getUTCDate() + dias);
  return iso(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}

function diaSemanaDe(dataISO) {
  const [a, m, d] = dataISO.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}


function instanteISO(dataISO, horario) {
  const [a, m, d] = dataISO.split('-').map(Number);
  const [hh, mm] = String(horario || '19:00').split(':').map(x => parseInt(x, 10) || 0);
  return new Date(Date.UTC(a, m - 1, d, hh, mm) - FUSO_BRT_MIN * 60000).toISOString();
}

const hhmm = h => String(h || '19:00').slice(0, 5);










const CADENCIA_DIAS = { diario: 1, semanal: 7, quinzenal: 14, mensal: 28 };
function cadenciaDias(recorrencia) {
  const k = String(recorrencia || '').trim().toLowerCase();
  return CADENCIA_DIAS[k] || 7;
}




















const LIMITE_REMARCA_DIAS = 7;

function janelaRemarcacao({ dataOriginal, anteriorISO = null, proximaISO = null, hojeISO, limiteDias = LIMITE_REMARCA_DIAS }) {
  if (!dataOriginal || !hojeISO) return null;
  const orig = String(dataOriginal).slice(0, 10);

  let de = somarDias(orig, -limiteDias);
  if (de < hojeISO) de = hojeISO;
  if (anteriorISO) {
    const piso = somarDias(String(anteriorISO).slice(0, 10), 1);
    if (piso > de) de = piso;
  }
  let ate = somarDias(orig, limiteDias);
  if (proximaISO) {
    const teto = somarDias(String(proximaISO).slice(0, 10), -1);
    if (teto < ate) ate = teto;
  }

  return { de, ate, pode: de <= ate };
}




function gerarOriginais({ diaSemana, recorrencia, ancoraISO, hojeISO, diaSemanaHoje, janelaDias }) {
  const passo = cadenciaDias(recorrencia);
  const originais = [];
  let ancoraIncerta = false;





  const semDia = diaSemana === null || diaSemana === undefined || diaSemana === '';
  if (semDia && passo !== 1) return { originais, ancoraIncerta };

  if (passo === 1) {
    for (let i = -1; i <= janelaDias; i++) originais.push(somarDias(hojeISO, i));
    return { originais, ancoraIncerta };
  }

  const alvo = Number(diaSemana);
  if (!Number.isInteger(alvo) || alvo < 0 || alvo > 6) return { originais: [], ancoraIncerta };

  if (passo === 7) {
    const delta = (alvo - diaSemanaHoje + 7) % 7;
    for (let i = -1; delta + i * 7 <= janelaDias; i++) originais.push(somarDias(hojeISO, delta + i * 7));
  } else if (ancoraISO) {

    let d = String(ancoraISO).slice(0, 10);
    while (somarDias(d, passo) <= hojeISO) d = somarDias(d, passo);
    originais.push(d);
    for (let k = 1; ; k++) {
      const prox = somarDias(d, k * passo);
      originais.push(prox);
      if (prox > somarDias(hojeISO, janelaDias)) break;
    }
  } else {

    ancoraIncerta = true;
    originais.push(somarDias(hojeISO, (alvo - diaSemanaHoje + 7) % 7));
  }
  return { originais, ancoraIncerta };
}















function janelaCorrecaoPassada({ dataOriginal, anteriorISO = null, proximaISO = null, hojeISO, ocupadas = [] }) {
  if (!dataOriginal || !hojeISO) return null;
  const orig = String(dataOriginal).slice(0, 10);




  const passoFolga = 60;
  let de = anteriorISO
    ? somarDias(String(anteriorISO).slice(0, 10), 1)
    : somarDias(orig, -passoFolga);




  let ate = proximaISO ? somarDias(String(proximaISO).slice(0, 10), -1) : somarDias(orig, passoFolga);
  if (ate > hojeISO) ate = hojeISO;








  const bloqueadas = (ocupadas || [])
    .map(d => String(d).slice(0, 10))
    .filter(d => d >= de && d <= ate && d !== orig);





  const bloq = new Set(bloqueadas);
  let temLivre = false;
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    if (!bloq.has(d)) { temLivre = true; break; }
  }

  return { de, ate, bloqueadas, pode: de <= ate && temLivre };
}







function proximasOcorrencias({
  diaSemana, horario, recorrencia = 'semanal', ancoraISO = null,
  excecoes = [], agora = new Date(), quantas = 8, janelaDias = 180,
}) {
  const n = agoraBRT(agora);
  const hojeISO = iso(n.ano, n.mes, n.dia);

  const porData = new Map();
  for (const e of excecoes || []) if (e && e.data_original) porData.set(String(e.data_original).slice(0, 10), e);


  const { originais, ancoraIncerta } = gerarOriginais({
    diaSemana, recorrencia, ancoraISO, hojeISO,
    diaSemanaHoje: n.diaSemana, janelaDias,
  });


  const out = [];
  for (let i = 0; i < originais.length && out.length < quantas; i++) {
    const dataOrig = originais[i];
    const ex = porData.get(dataOrig);
    const cancelado = ex?.status === 'cancelado';
    const remarcado = ex?.status === 'remarcado';
    const dataFinal = remarcado ? String(ex.nova_data).slice(0, 10) : dataOrig;
    const horaFinal = hhmm(remarcado && ex.novo_horario ? ex.novo_horario : horario);

    const passou = dataFinal < hojeISO
      || (dataFinal === hojeISO && (n.hora * 60 + n.min) > (parseInt(horaFinal.slice(0, 2), 10) * 60 + parseInt(horaFinal.slice(3, 5), 10)));
    if (passou) continue;

    const janela = janelaRemarcacao({
      dataOriginal: dataOrig,
      anteriorISO: originais[i - 1] || null,
      proximaISO: originais[i + 1] || null,
      hojeISO,
    });

    out.push({
      data_original: dataOrig,
      data: dataFinal,
      horario: horaFinal,
      inicio: instanteISO(dataFinal, horaFinal),
      status: cancelado ? 'cancelado' : (remarcado ? 'remarcado' : 'normal'),
      motivo: ex?.motivo || null,
      dia_semana: diaSemanaDe(dataFinal),
      pode_remarcar: !!janela?.pode,
      remarcar_de: janela?.de || null,
      remarcar_ate: janela?.ate || null,
      ancora_incerta: ancoraIncerta,
    });
  }
  return out;
}











function ocorrenciaAnterior({ diaSemana, horario, recorrencia = 'semanal', ancoraISO = null, excecoes = [], agora = new Date() }) {
  const n = agoraBRT(agora);
  const hojeISO = iso(n.ano, n.mes, n.dia);
  const { originais } = gerarOriginais({
    diaSemana, recorrencia, ancoraISO, hojeISO,
    diaSemanaHoje: n.diaSemana, janelaDias: 0,
  });
  const porData = new Map();
  for (const e of excecoes || []) if (e && e.data_original) porData.set(String(e.data_original).slice(0, 10), e);

  let achada = null;
  for (const dataOrig of originais) {
    const ex = porData.get(dataOrig);
    const dataFinal = ex?.status === 'remarcado' ? String(ex.nova_data).slice(0, 10) : dataOrig;
    if (dataFinal > hojeISO) continue;
    if (!achada || dataFinal > achada.data) {
      achada = {
        data_original: dataOrig,
        data: dataFinal,
        status: ex?.status === 'cancelado' ? 'cancelado' : (ex?.status === 'remarcado' ? 'remarcado' : 'normal'),
      };
    }
  }
  if (!achada || achada.status === 'cancelado') return null;
  return achada;
}




function proximoEncontro(args) {
  const lista = proximasOcorrencias(args);
  return lista.find(o => o.status !== 'cancelado') || null;
}











































function ancoraDeInicio({ diaSemana, inicioISO }) {
  if (!inicioISO) return null;
  const ini = String(inicioISO).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ini)) return null;





  if (diaSemana === null || diaSemana === undefined || diaSemana === '') return null;
  const alvo = Number(diaSemana);
  if (!Number.isInteger(alvo) || alvo < 0 || alvo > 6) return null;

  const delta = (alvo - diaSemanaDe(ini) + 7) % 7;
  return somarDias(ini, delta);
}





function gerarOriginaisPassadas({ diaSemana, recorrencia, ancoraISO, hojeISO, diaSemanaHoje, quantas, desdeISO = null }) {
  const passo = cadenciaDias(recorrencia);
  const originais = [];



  const semDia = diaSemana === null || diaSemana === undefined || diaSemana === '';
  if (semDia && passo !== 1) return originais;

  const dentro = (d) => !desdeISO || d >= String(desdeISO).slice(0, 10);

  if (passo === 1) {
    for (let i = 0; i < quantas; i++) {
      const d = somarDias(hojeISO, -i);
      if (!dentro(d)) break;
      originais.push(d);
    }
    return originais;
  }

  const alvo = Number(diaSemana);
  if (!Number.isInteger(alvo) || alvo < 0 || alvo > 6) return originais;

  if (passo === 7) {

    const delta = (diaSemanaHoje - alvo + 7) % 7;
    for (let i = 0; i < quantas; i++) {
      const d = somarDias(hojeISO, -(delta + i * 7));
      if (!dentro(d)) break;
      originais.push(d);
    }
    return originais;
  }





  if (!ancoraISO) return originais;


  let d = String(ancoraISO).slice(0, 10);
  while (somarDias(d, passo) <= hojeISO) d = somarDias(d, passo);
  for (let i = 0; i < quantas; i++) {
    const atual = somarDias(d, -i * passo);
    if (atual > hojeISO) continue;
    if (!dentro(atual)) break;
    originais.push(atual);
  }
  return originais;
}
















function ocorrenciasPassadas({
  diaSemana, horario, recorrencia = 'semanal', ancoraISO = null,
  excecoes = [], registradas = [], agora = new Date(), quantas = 12, desdeISO = null,
  inicioISO = null,
}) {
  const n = agoraBRT(agora);
  const hojeISO = iso(n.ano, n.mes, n.dia);
  const minutosAgora = n.hora * 60 + n.min;




  const passo = cadenciaDias(recorrencia);
  const ancoraDerivada = (!ancoraISO && passo !== 7 && passo !== 1)
    ? ancoraDeInicio({ diaSemana, inicioISO })
    : null;
  const ancoraFinal = ancoraISO || ancoraDerivada;
  const estimada = !ancoraISO && Boolean(ancoraDerivada);

  const porData = new Map();
  for (const e of excecoes || []) if (e && e.data_original) porData.set(String(e.data_original).slice(0, 10), e);
  const jaRegistradas = registradas instanceof Set
    ? registradas
    : new Set((registradas || []).map(d => String(d).slice(0, 10)));



  const originais = gerarOriginaisPassadas({
    diaSemana, recorrencia, ancoraISO: ancoraFinal, hojeISO,
    diaSemanaHoje: n.diaSemana, quantas: quantas + 4, desdeISO,
  });

  const out = [];
  for (const dataOrig of originais) {
    if (out.length >= quantas) break;
    const ex = porData.get(dataOrig);
    const cancelado = ex?.status === 'cancelado';
    const remarcado = ex?.status === 'remarcado';
    const dataFinal = remarcado ? String(ex.nova_data).slice(0, 10) : dataOrig;
    const horaFinal = hhmm(remarcado && ex.novo_horario ? ex.novo_horario : horario);




    const jaPassou = dataFinal < hojeISO
      || (dataFinal === hojeISO
        && minutosAgora > (parseInt(horaFinal.slice(0, 2), 10) * 60 + parseInt(horaFinal.slice(3, 5), 10)));
    if (!jaPassou) continue;

    const registrado = jaRegistradas.has(dataFinal);
    out.push({
      data_original: dataOrig,
      data: dataFinal,
      horario: horaFinal,


      status: registrado ? 'registrado' : (cancelado ? 'cancelado' : 'nao_registrado'),
      motivo: ex?.motivo || null,
      dia_semana: diaSemanaDe(dataFinal),
      registrado,





      remarcado,
      cancelado,






      data_estimada: estimada && !ex,
    });
  }
  return out;
}

module.exports = {
  agoraBRT, proximasOcorrencias, proximoEncontro, ocorrenciaAnterior, ocorrenciasPassadas,
  ancoraDeInicio, janelaCorrecaoPassada, instanteISO, somarDias,
  cadenciaDias, janelaRemarcacao, FUSO_BRT_MIN, LIMITE_REMARCA_DIAS, CADENCIA_DIAS,
};

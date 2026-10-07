

















const MS_DIA = 86400000;


function paraDia(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ms = Date.parse(s + 'T00:00:00Z');
  if (Number.isNaN(ms)) return null;
  return Math.round(ms / MS_DIA);
}


function paraStr(dia) {
  return new Date(dia * MS_DIA).toISOString().slice(0, 10);
}



function hojeBRT(agoraMs) {
  const ms = typeof agoraMs === 'number' ? agoraMs : Date.now();
  return new Date(ms - 3 * 3600 * 1000).toISOString().slice(0, 10);
}


function segundaDa(diaStr) {
  const d = paraDia(diaStr);
  if (d === null) return null;

  const desdeSegunda = ((d + 3) % 7 + 7) % 7;
  return d - desdeSegunda;
}







function montarSemanas(hojeStr, { retro = 1, adiante = 6 } = {}) {
  const seg = segundaDa(hojeStr);
  if (seg === null) return [];
  const r = Number.isFinite(retro) ? Math.max(Math.trunc(retro), 0) : 1;
  const a = Number.isFinite(adiante) ? Math.max(Math.trunc(adiante), 0) : 6;
  const out = [];
  for (let i = -r; i <= a; i++) {
    const ini = seg + i * 7;
    out.push({
      idx: out.length,
      ini: paraStr(ini),
      fim: paraStr(ini + 6),
      eh_atual: i === 0,
      offset: i,
    });
  }
  return out;
}

















function inicioDaSemanaGrade(diaStr, primeiroDiaSemana = 0) {
  const d = paraDia(diaStr);
  if (d === null) return null;

  const dow = ((d + 4) % 7 + 7) % 7;
  const desde = ((dow - primeiroDiaSemana) % 7 + 7) % 7;
  return d - desde;
}


function semanasDoMesGrade(mes, { primeiroDiaSemana = 0, hoje = null } = {}) {
  if (typeof mes !== 'string' || !/^\d{4}-\d{2}$/.test(mes)) return [];
  const primeiroDoMes = `${mes}-01`;
  if (paraDia(primeiroDoMes) === null) return [];

  const ano = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  if (m < 1 || m > 12) return [];

  const ultimoDoMes = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);

  const ini = inicioDaSemanaGrade(primeiroDoMes, primeiroDiaSemana);
  const fim = inicioDaSemanaGrade(ultimoDoMes, primeiroDiaSemana);
  const out = [];
  for (let s = ini; s <= fim; s += 7) {
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const data = paraStr(s + i);
      dias.push({
        data,
        no_mes: data.slice(0, 7) === mes,
        eh_hoje: !!hoje && data === hoje,
      });
    }
    out.push({
      idx: out.length,
      ini: paraStr(s),
      fim: paraStr(s + 6),
      dias,
      eh_semana_atual: dias.some(d => d.eh_hoje),
    });
  }
  return out;
}


function mesVizinho(mes, passo) {
  if (typeof mes !== 'string' || !/^\d{4}-\d{2}$/.test(mes)) return null;
  const ano = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7)) - 1 + passo;
  const d = new Date(Date.UTC(ano, m, 1));
  return d.toISOString().slice(0, 7);
}






function diasSobrepostos(aIni, aFim, bIni, bFim) {
  const ai = paraDia(aIni), af = paraDia(aFim), bi = paraDia(bIni), bf = paraDia(bFim);
  if (ai === null || af === null || bi === null || bf === null) return 0;
  if (af < ai || bf < bi) return 0;
  const i = Math.max(ai, bi);
  const f = Math.min(af, bf);
  if (i > f) return 0;
  return f - i + 1;
}










function faseDaSemana(fases, semana) {
  const candidatas = [];
  for (const f of fases || []) {
    const dias = diasSobrepostos(f.data_inicio_prevista, f.data_fim_prevista, semana.ini, semana.fim);
    if (dias > 0) candidatas.push({ fase: f, dias });
  }
  if (!candidatas.length) return null;

  candidatas.sort((a, b) => (b.dias - a.dias) || (numeroDaFase(b.fase) - numeroDaFase(a.fase)));
  const escolhida = candidatas[0];

  const transicao = candidatas
    .slice(1)
    .filter(c => numeroDaFase(c.fase) > numeroDaFase(escolhida.fase))
    .sort((a, b) => numeroDaFase(a.fase) - numeroDaFase(b.fase))[0] || null;

  return {
    fase: escolhida.fase,
    dias: escolhida.dias,
    transicao: transicao ? { fase: transicao.fase, dias: transicao.dias } : null,
    concorrentes: candidatas.length,
  };
}

function numeroDaFase(f) {
  const n = Number(f?.numero_fase);
  return Number.isFinite(n) ? n : -1;
}












function montarCalendario({ eventos = [], fasesPorEvento = {}, semanas = [] } = {}) {
  const linhas = [];
  let semData = 0;

  for (const ev of eventos) {
    const todas = fasesPorEvento[ev.id] || [];
    const posicionaveis = [];
    for (const f of todas) {
      if (paraDia(f.data_inicio_prevista) === null || paraDia(f.data_fim_prevista) === null) semData++;
      else posicionaveis.push(f);
    }

    const celulas = semanas.map(s => {
      const r = faseDaSemana(posicionaveis, s);
      if (!r) return { semana_idx: s.idx, vazio: true };
      return {
        semana_idx: s.idx,
        vazio: false,
        fase_id: r.fase.id,
        numero_fase: r.fase.numero_fase,
        nome_fase: r.fase.nome_fase,
        area: r.fase.area || null,
        status: r.fase.status || null,
        dias_na_semana: r.dias,
        transicao: r.transicao
          ? { fase_id: r.transicao.fase.id, numero_fase: r.transicao.fase.numero_fase, nome_fase: r.transicao.fase.nome_fase }
          : null,
      };
    });

    if (celulas.every(c => c.vazio)) continue;
    linhas.push({ ...ev, celulas });
  }

  return { linhas, sem_data: semData };
}

module.exports = {
  paraDia, paraStr, hojeBRT, segundaDa, montarSemanas,
  inicioDaSemanaGrade, semanasDoMesGrade, mesVizinho,
  diasSobrepostos, faseDaSemana, montarCalendario,
};

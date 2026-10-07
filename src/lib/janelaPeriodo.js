







































export const ANO_INICIAL = 2022;


export function anosDisponiveis(agora = Date.now()) {
  const atual = new Date(agora).getFullYear();
  const anos = [];
  for (let a = atual; a >= ANO_INICIAL; a--) anos.push(a);
  return anos;
}


export function ehAno(valor) {
  return typeof valor === 'string' && /^ano:\d{4}$/.test(valor);
}


export function anoDe(valor) {
  return ehAno(valor) ? Number(String(valor).slice(4)) : null;
}


export function opcoesAno(agora = Date.now()) {
  return anosDisponiveis(agora).map((a) => ({ dias: `ano:${a}`, label: String(a), ano: a }));
}



const FILTRO_MOVEL = [
  { dias: 'temporada', label: 'Temporada atual' },
  { dias: 7, label: 'Últimos 7 dias' },
  { dias: 30, label: 'Últimos 30 dias' },
  { dias: 60, label: 'Últimos 60 dias' },
  { dias: 90, label: 'Últimos 90 dias' },
  { dias: 180, label: 'Últimos 180 dias' },
  { dias: 365, label: 'Último ano' },
  { dias: 1825, label: 'Últimos 5 anos' },
];





export function filtroPeriodo({ comTemporada = true, agora = Date.now() } = {}) {
  const moveis = comTemporada ? FILTRO_MOVEL : FILTRO_MOVEL.filter((f) => f.dias !== 'temporada');
  return [...moveis, ...opcoesAno(agora)];
}



export const FILTRO_PERIODO = filtroPeriodo();

const DIAS_PADRAO = 180;
const DIAS_FALLBACK_TEMPORADA = 30;









export function resolverJanela({ fPeriodo, temporada = null, agora = Date.now() } = {}) {
  const temporadaIni = temporada?.data_inicio || null;


  if (ehAno(fPeriodo)) {
    const ano = anoDe(fPeriodo);



    const desdeMs = new Date(`${ano}-01-01T00:00:00`).getTime();
    const fimDoAno = new Date(`${ano}-12-31T23:59:59`).getTime();
    return {


      desdeMs,
      ateMs: Math.min(fimDoAno, agora),
      rotulo: String(ano),
      temporadaIni,
      ano,
    };
  }

  if (fPeriodo === 'temporada') {
    if (temporadaIni) {



      return {
        desdeMs: new Date(`${temporadaIni}T12:00:00`).getTime(),
        ateMs: Infinity,
        rotulo: `temporada ${temporada.id || 'atual'}`,
        temporadaIni,
        ano: null,
      };
    }

    return {
      desdeMs: agora - DIAS_FALLBACK_TEMPORADA * 86400000,
      ateMs: Infinity,
      rotulo: `últimos ${DIAS_FALLBACK_TEMPORADA} dias`,
      temporadaIni: null,
      ano: null,
    };
  }

  const dias = Number(fPeriodo) > 0 ? Number(fPeriodo) : DIAS_PADRAO;
  const opcao = FILTRO_MOVEL.find((f) => f.dias === dias);
  return {
    desdeMs: agora - dias * 86400000,
    ateMs: Infinity,
    rotulo: opcao ? opcao.label.toLowerCase() : `últimos ${dias} dias`,
    temporadaIni,
    ano: null,
  };
}





export function janelaIso(args) {
  const j = resolverJanela(args);




  const iso = (ms) => {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  return {
    de: iso(j.desdeMs),
    ate: Number.isFinite(j.ateMs) ? iso(j.ateMs) : null,
    rotulo: j.rotulo,
    ano: j.ano,
  };
}





export function granularidadeDaJanela(fPeriodo) {
  if (ehAno(fPeriodo)) return 'mes';
  if (fPeriodo === 'temporada') return 'semana';
  const dias = Number(fPeriodo) > 0 ? Number(fPeriodo) : DIAS_PADRAO;
  if (dias <= 90) return 'semana';
  return 'mes';
}

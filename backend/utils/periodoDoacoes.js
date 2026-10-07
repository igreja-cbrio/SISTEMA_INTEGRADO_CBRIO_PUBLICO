










const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const RE_DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;


const LIMITE_PADRAO = 20;
const LIMITE_MAX = 100;


function hojeBRT(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}


function diaSeguinte(dia) {
  if (!RE_DIA.test(String(dia || ''))) return null;
  const [a, m, d] = String(dia).split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}



















function parsePeriodoDoacoes(periodo, agora = new Date()) {
  const p = String(periodo || '');

  const faixa = p.split(':');
  if (faixa.length === 2 && RE_DIA.test(faixa[0]) && RE_DIA.test(faixa[1])) {
    const [ini, fim] = faixa[0] <= faixa[1] ? faixa : [faixa[1], faixa[0]];
    return { periodo: `${ini}:${fim}`, desde: ini, ate: diaSeguinte(fim), rotulo: 'intervalo' };
  }

  if (p === 'ano') {
    const hoje = hojeBRT(agora);
    return {
      periodo: 'ano', desde: `${hoje.slice(0, 4)}-01-01`,
      ate: diaSeguinte(hoje), rotulo: 'ano',
    };
  }

  if (RE_MES.test(p)) {
    const [ano, mes] = p.split('-').map(Number);
    return {
      periodo: p, desde: `${p}-01`,
      ate: new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10),
      rotulo: 'mes',
    };
  }

  if (p === 'tudo') return { periodo: 'tudo', desde: null, ate: null, rotulo: 'tudo' };

  const corte = new Date(agora);
  corte.setUTCFullYear(corte.getUTCFullYear() - 1);
  return { periodo: '12m', desde: corte.toISOString().slice(0, 10), ate: null, rotulo: '12m' };
}


function parseLimite(limite) {
  const n = parseInt(String(limite ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return LIMITE_PADRAO;
  return Math.min(n, LIMITE_MAX);
}











function coberturaAtribuicao(base) {
  const total = Number(base?.total_periodo);
  const atribuido = Number(base?.total_atribuido);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(atribuido)) {
    return { pct_valor_atribuido: null, incompleto: false, total_periodo: Number.isFinite(total) ? total : 0, total_atribuido: 0, linhas_por_cpf: 0, linhas_por_nome: 0 };
  }
  const pct = Math.round((Math.min(atribuido, total) / total) * 1000) / 10;
  return {
    pct_valor_atribuido: pct,
    incompleto: pct < 100,
    total_periodo: total,
    total_atribuido: atribuido,
    linhas_por_cpf: Number(base?.linhas_por_cpf) || 0,
    linhas_por_nome: Number(base?.linhas_por_nome) || 0,
  };
}

function previousDay(dia) {
  if (!RE_DIA.test(String(dia || ''))) return null;
  const [a, m, d] = String(dia).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d - 1)).toISOString().slice(0, 10);
}

module.exports = {
  LIMITE_PADRAO, LIMITE_MAX,
  hojeBRT, diaSeguinte, previousDay,
  parsePeriodoDoacoes, parseLimite, coberturaAtribuicao,
};

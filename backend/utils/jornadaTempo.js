








































const MARCOS_TEMPO = [
  {
    chave: 'contato', label: '1º contato', curto: 'CONT', meta_dias: 3, sensivel: false,
    engajamento: false,
    descricao: 'A equipe pastoral conseguiu falar com a pessoa depois da decisão. É ação NOSSA, não engajamento dela — por isso não entra na conta de "engajaram".',
    fonte: 'Marcado no módulo Cuidados (prazo interno: 3 dias).',
  },
  {
    chave: 'next', label: 'Next', curto: 'NEXT', meta_dias: 90, sensivel: false,
    engajamento: true,
    descricao: 'Esteve presente em ao menos UM encontro do Next.',
    fonte: 'Presença registrada no encontro. Esta visão considera a primeira presença; a conclusão do Next segue a régua própria do programa.',
  },
  {
    chave: 'batismo', label: 'Batismo', curto: 'BAT', meta_dias: 90, sensivel: false,
    engajamento: true,
    descricao: 'Batismo realizado (não apenas inscrito).',
    fonte: 'Data do batismo no módulo Integração.',
  },
  {
    chave: 'grupo', label: 'Grupo', curto: 'GRUPO', meta_dias: null, sensivel: false,
    engajamento: true,
    descricao: 'Entrou em um grupo de conexão e o vínculo segue aberto.',
    fonte: 'Data de entrada no grupo. Vínculos importados ou anteriores à decisão aparecem como alcançados, mas não comprovam engajamento após a decisão nem entram na mediana.',
  },
  {
    chave: 'servir', label: 'Voluntariado', curto: 'SERVE', meta_dias: null, sensivel: false,
    engajamento: true,
    descricao: 'Começou a servir como voluntário.',
    fonte: 'Início do vínculo de voluntariado.',
  },
  {
    chave: 'generosidade', label: 'Generosidade', curto: 'CONTRIB', meta_dias: null, sensivel: true,
    engajamento: true,
    descricao: 'Registrou a primeira contribuição (dízimo ou oferta).',
    fonte: 'Lançamento financeiro. Só aparece para quem já pode ver contribuição da pessoa.',
  },
];


const CHAVES_ENGAJAMENTO = MARCOS_TEMPO.filter((m) => m.engajamento).map((m) => m.chave);

const CHAVES_TEMPO = MARCOS_TEMPO.map((m) => m.chave);
const CHAVES_SENSIVEIS_TEMPO = MARCOS_TEMPO.filter((m) => m.sensivel).map((m) => m.chave);




const FMT_DIA_BRT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});


function diaBRT(valor) {
  if (!valor) return null;
  const s = String(valor);

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return FMT_DIA_BRT.format(d);
}





function diasEntre(de, ate) {
  const a = diaBRT(de);
  const b = diaBRT(ate);
  if (!a || !b) return null;
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}














function datasDeImport(datas, opts = {}) {
  const minPessoas = opts.minPessoas ?? 100;
  const contagem = new Map();
  for (const d of datas || []) {
    const dia = diaBRT(d);
    if (!dia) continue;
    contagem.set(dia, (contagem.get(dia) || 0) + 1);
  }
  const out = new Set();
  for (const [dia, n] of contagem) if (n >= minPessoas) out.add(dia);
  return out;
}













function montarMarco(data, dataDecisao, opts = {}) {
  const dia = diaBRT(data);
  const alcancado = opts.alcancado === true || !!dia;
  if (!alcancado) return null;

  if (!dia) {
    return { alcancado: true, data: null, dias: null, aproximada: true, motivo: 'sem_data' };
  }

  const dias = diasEntre(dataDecisao, dia);




  if (dias !== null && dias < 0) {
    return { alcancado: true, data: dia, dias, aproximada: true, motivo: 'antes_da_decisao' };
  }
  if (opts.suspeita) {
    return { alcancado: true, data: dia, dias, aproximada: true, motivo: 'data_de_importacao' };
  }
  return { alcancado: true, data: dia, dias, aproximada: false, motivo: null };
}


function mediana(nums) {
  const a = (nums || []).filter((n) => typeof n === 'number' && Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const meio = Math.floor(a.length / 2);
  return a.length % 2 ? a[meio] : Math.round((a[meio - 1] + a[meio]) / 2);
}


function quantil(nums, p) {
  const a = (nums || []).filter((n) => typeof n === 'number' && Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  if (a.length === 1) return a[0];
  const pos = (a.length - 1) * p;
  const base = Math.floor(pos);
  const resto = pos - base;
  const prox = a[base + 1] === undefined ? a[base] : a[base + 1];
  return Math.round(a[base] + resto * (prox - a[base]));
}










function estatisticaMarco(pessoas, chave) {
  const lista = pessoas || [];
  let alcancaram = 0;
  let aproximados = 0;
  const dias = [];
  for (const p of lista) {
    const m = p?.marcos?.[chave];
    if (!m || !m.alcancado) continue;
    alcancaram += 1;
    if (m.aproximada || m.dias === null) aproximados += 1;
    else dias.push(m.dias);
  }
  const total = lista.length;
  return {
    chave,
    alcancaram,
    pct: total ? Math.round((alcancaram / total) * 100) : 0,
    com_data_confiavel: dias.length,
    aproximados,
    mediana: mediana(dias),
    q1: quantil(dias, 0.25),
    q3: quantil(dias, 0.75),
    min: dias.length ? Math.min(...dias) : null,
    max: dias.length ? Math.max(...dias) : null,
  };
}






function diasParado(pessoa, hoje) {
  const marcos = Object.values(pessoa?.marcos || {}).filter((m) => m && m.alcancado && typeof m.dias === 'number' && m.dias >= 0);
  const ultimoDia = marcos.length ? Math.max(...marcos.map((m) => m.dias)) : 0;
  const desdeDecisao = diasEntre(pessoa?.data_decisao, hoje);
  if (desdeDecisao === null) return null;
  return Math.max(0, desdeDecisao - ultimoDia);
}


function totalMarcos(pessoa) {
  return Object.values(pessoa?.marcos || {}).filter((m) => m && m.alcancado).length;
}








const CHAVES_OUTRO_VALOR = CHAVES_ENGAJAMENTO;















function marcoContaComoEngajamento(marco) {
  if (!marco || marco.alcancado !== true) return false;
  return marco.aproximada !== true || marco.motivo === 'sem_data';
}


function valoresEngajados(pessoa) {
  const marcos = pessoa?.marcos || {};
  return CHAVES_OUTRO_VALOR.filter((c) => marcoContaComoEngajamento(marcos[c]));
}


function engajouEmOutroValor(pessoa) {
  return valoresEngajados(pessoa).length > 0;
}



function totalEngajamento(pessoa) {
  return valoresEngajados(pessoa).length;
}


function diasAteEngajar(pessoa) {
  const marcos = pessoa?.marcos || {};
  const dias = valoresEngajados(pessoa)
    .map((c) => marcos[c])
    .filter((m) => !m.aproximada && Number.isFinite(m.dias) && m.dias >= 0)
    .map((m) => m.dias);
  return dias.length ? Math.min(...dias) : null;
}

module.exports = {
  MARCOS_TEMPO,
  CHAVES_TEMPO,
  CHAVES_SENSIVEIS_TEMPO,
  CHAVES_ENGAJAMENTO,
  diaBRT,
  diasEntre,
  datasDeImport,
  montarMarco,
  mediana,
  quantil,
  estatisticaMarco,
  diasParado,
  totalMarcos,
  CHAVES_OUTRO_VALOR,
  marcoContaComoEngajamento,
  valoresEngajados,
  engajouEmOutroValor,
  totalEngajamento,
  diasAteEngajar,
};























const TIPOS_GRAFICO = Object.freeze([
  'opcao_unica', 'multipla', 'sim_nao', 'escala_5', 'estrelas_5', 'nps', 'numero',
]);



const TIPOS_LISTA_LONGA = Object.freeze(['busca']);


const TIPOS_TEXTO = Object.freeze(['texto_longo']);





const TIPOS_IDENTIFICACAO = Object.freeze(['texto_curto', 'data']);

const TIPOS_NUMERICOS = Object.freeze(['numero', 'escala_5', 'estrelas_5', 'nps']);




const TETO_VALORES = 20;

function classificar(tipo) {
  if (tipo === 'secao') return 'secao';
  if (TIPOS_IDENTIFICACAO.includes(tipo)) return 'identificacao';
  if (TIPOS_TEXTO.includes(tipo)) return 'texto';
  if (TIPOS_LISTA_LONGA.includes(tipo)) return 'lista_longa';
  if (TIPOS_GRAFICO.includes(tipo)) return 'grafico';


  return 'desconhecido';
}




const TIPOS_PARA_BUSCAR = Object.freeze([...TIPOS_GRAFICO, ...TIPOS_LISTA_LONGA]);


function aplicarTeto(valores, teto) {
  const t = Number.isFinite(teto) && teto > 0 ? teto : TETO_VALORES;
  if (!Array.isArray(valores) || valores.length <= t) {
    return { valores: valores || [], ocultos: 0, ocultosTotal: 0 };
  }


  const neutras = valores.filter((v) => v.neutra);
  const resto = valores.filter((v) => !v.neutra);
  const vis = resto.slice(0, t);
  const fora = resto.slice(t);
  const ocultosTotal = fora.reduce((s, v) => s + (Number(v.total) || 0), 0);
  return { valores: [...vis, ...neutras], ocultos: fora.length, ocultosTotal };
}


















const SEM_DADO_DEMOGRAFIA = '(não informado)';
function cortarDemografia(contagem, teto) {
  const t = Number.isFinite(teto) && teto > 0 ? teto : TETO_VALORES;
  const todos = Object.entries(contagem || {})
    .map(([valor, total]) => ({ valor, total: Number(total) || 0 }))
    .sort((a, b) => b.total - a.total);
  if (todos.length <= t) return { valores: todos, ocultos: 0, ocultos_pessoas: 0 };
  const semDado = todos.filter((v) => v.valor === SEM_DADO_DEMOGRAFIA);
  const resto = todos.filter((v) => v.valor !== SEM_DADO_DEMOGRAFIA);
  const vis = resto.slice(0, t);
  const fora = resto.slice(t);
  return {
    valores: [...vis, ...semDado],
    ocultos: fora.length,
    ocultos_pessoas: fora.reduce((s, v) => s + v.total, 0),
  };
}

module.exports = {
  SEM_DADO_DEMOGRAFIA,
  cortarDemografia,
  TIPOS_GRAFICO,
  TIPOS_LISTA_LONGA,
  TIPOS_TEXTO,
  TIPOS_IDENTIFICACAO,
  TIPOS_NUMERICOS,
  TIPOS_PARA_BUSCAR,
  TETO_VALORES,
  classificar,
  aplicarTeto,
};

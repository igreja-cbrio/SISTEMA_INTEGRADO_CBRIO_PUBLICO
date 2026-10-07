























const LIMITES_PADRAO = Object.freeze({ alto: 0.9, baixo: 0.4, divergencia: 0.25 });

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const arred = (v, casas = 2) => (v == null ? null : Math.round(v * 10 ** casas) / 10 ** casas);


function pesoPcsDe(pesos, competenciaId) {
  const p = pesos ? num(pesos[competenciaId]) : null;
  return p == null || p < 0 ? 1 : p;
}







function avisoPcs(pessoa, { escalaMax, pesos = {}, limites = LIMITES_PADRAO } = {}) {
  const N = num(escalaMax);
  const vazio = { nota_pcs: null, pct: null, aviso: null, divergencia: null, criterios_alta: [], criterios_baixa: [] };
  if (!pessoa || !N || N <= 0) return vazio;
  const lim = { ...LIMITES_PADRAO, ...(limites || {}) };

  let soma = 0;
  let pesoTotal = 0;
  const criterios_alta = [];
  const criterios_baixa = [];
  for (const c of pessoa.criterios || []) {
    const nota = num(c.final);
    const peso = pesoPcsDe(pesos, c.competencia_id);
    if (nota == null || peso === 0) continue;
    soma += nota * peso;
    pesoTotal += peso;
    const p = nota / N;
    const item = { competencia_id: c.competencia_id, nome: c.nome, nota: arred(nota) };
    if (p >= lim.alto) criterios_alta.push(item);
    else if (p <= lim.baixo) criterios_baixa.push(item);
  }

  const nota_pcs = pesoTotal > 0 ? soma / pesoTotal : null;
  const pct = nota_pcs == null ? null : nota_pcs / N;
  const aviso = pct == null ? null : pct >= lim.alto ? 'alta' : pct <= lim.baixo ? 'baixa' : null;

  const gestor = num(pessoa.gestor);
  const outros = num(pessoa.outros);
  const divergencia = gestor != null && outros != null && Math.abs(gestor - outros) / N >= lim.divergencia
    ? { gestor: arred(gestor), outros: arred(outros), maior: gestor > outros ? 'gestor' : 'outros' }
    : null;

  return { nota_pcs: arred(nota_pcs), pct: arred(pct, 4), aviso, divergencia, criterios_alta, criterios_baixa };
}


function textoAviso(r) {
  if (!r) return null;
  if (r.aviso === 'alta') return 'Nota alta · verificar enquadramento no PCS';
  if (r.aviso === 'baixa') return 'Nota baixa · verificar enquadramento no PCS';
  if (r.divergencia) return 'Gestor e equipe veem diferente · verificar';
  if (r.criterios_alta.length || r.criterios_baixa.length) return 'Critério fora da curva · verificar';
  return null;
}

module.exports = { LIMITES_PADRAO, avisoPcs, textoAviso, pesoPcsDe };

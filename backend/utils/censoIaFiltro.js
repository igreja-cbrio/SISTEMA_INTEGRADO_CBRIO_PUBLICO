











const MAX_TEXTOS_POR_PERGUNTA = 400;
const MAX_CHARS_POR_TEXTO = 600;


























const TIPOS_PARA_IA = new Set(['texto_longo']);

function ehTextoDeOpiniao(item) {
  return TIPOS_PARA_IA.has(String(item?.tipo || ''));
}

function prepararMaterial(itens) {
  const porPergunta = new Map();
  for (const i of itens || []) {


    if (i?.sensivel === true) continue;


    if (!ehTextoDeOpiniao(i)) continue;
    const t = String(i?.valor_texto || '').trim();
    if (t.length < 3) continue;
    const k = i.pergunta_id;
    if (!porPergunta.has(k)) {
      porPergunta.set(k, { pergunta_id: k, pergunta_texto: i.pergunta_texto || k, textos: [], total: 0 });
    }
    const b = porPergunta.get(k);
    b.total += 1;
    if (b.textos.length < MAX_TEXTOS_POR_PERGUNTA) b.textos.push(t.slice(0, MAX_CHARS_POR_TEXTO));
  }
  const blocos = [...porPergunta.values()].filter((b) => b.textos.length > 0);
  const truncadas = blocos
    .filter((b) => b.total > b.textos.length)
    .map((b) => ({ pergunta_id: b.pergunta_id, lidas: b.textos.length, total: b.total }));
  return { blocos, total_textos: blocos.reduce((s, b) => s + b.textos.length, 0), truncadas };
}

module.exports = {
  TIPOS_PARA_IA,
  ehTextoDeOpiniao,
  prepararMaterial,
  MAX_TEXTOS_POR_PERGUNTA,
  MAX_CHARS_POR_TEXTO,
};

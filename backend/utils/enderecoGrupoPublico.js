


























const SEM_ENDERECO = /^(\(?\s*endere[çc]o\s+n[ãa]o\s+informado\s*\)?|online|remoto|a\s+definir|a\s+confirmar|n[ãa]o\s+informado|sem\s+endere[çc]o|[-–—.\s]*)$/i;



const COMPLEMENTO = 'ap|apt|apto|apart|apartamento|bl|blc|bloco|casa|cs|torre|tr|cob|cobertura|fundos|sala|sl|andar|t[ée]rreo|unidade|un|lote|lt|qd|quadra|cond|condom[íi]nio|edif[íi]cio|ed|port[ãa]o';
const COMPLEMENTO_INICIO = new RegExp(`^(?:${COMPLEMENTO})\\b`, 'i');


const COMPLEMENTO_COLADO = new RegExp(`(\\d)\\s*[-–—/]?\\s*(?:${COMPLEMENTO})\\b.*$`, 'i');



const CONECTORES = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'a', 'na', 'no']);

function destacaixar(txt) {
  const palavras = txt.toLowerCase().split(' ');
  return palavras.map((palavra, i) => {


    if (/^[a-zà-ÿ]$/.test(palavra) && /\d/.test(palavras[i - 1] || '')) return palavra.toUpperCase();
    if (i > 0 && CONECTORES.has(palavra)) return palavra;

    return palavra.split('-').map(p => p.replace(/^([a-zà-ÿ])/, (c) => c.toUpperCase())).join('-');
  }).join(' ');
}



function enderecoPublicoGrupo(grupo) {
  const cru = typeof grupo === 'string' ? grupo : grupo?.endereco;
  if (!cru) return null;
  const limpo = String(cru).replace(/\s+/g, ' ').trim();
  if (!limpo || SEM_ENDERECO.test(limpo)) return null;

  const partes = [];
  limpo.split(',').forEach((bruta, i) => {
    let parte = bruta.trim().replace(/^[-–—]\s*/, '');
    if (!parte) return;


    if (i > 0 && COMPLEMENTO_INICIO.test(parte)) return;
    parte = parte.replace(COMPLEMENTO_COLADO, '$1').trim();
    if (!parte) return;

    if (partes.length && partes[partes.length - 1].toLowerCase() === parte.toLowerCase()) return;
    partes.push(parte);
  });

  let saida = partes.join(', ').replace(/[\s,;.]+$/, '').trim();
  if (!/[a-zà-ÿ]/i.test(saida)) return null;
  if (!/[a-zà-ÿ]/.test(saida)) saida = destacaixar(saida);
  return saida || null;
}



function temNumeroDeRua(grupo) {
  const publico = enderecoPublicoGrupo(grupo);
  return publico != null && /\d/.test(publico);
}










function ondePublicoGrupo(grupo) {
  const partes = [grupo?.local, enderecoPublicoGrupo(grupo), grupo?.bairro]
    .map(p => (p == null ? '' : String(p).trim()))
    .filter(Boolean);

  const vistos = new Set();
  const unicas = partes.filter(p => {
    const k = p.toLowerCase();
    if (vistos.has(k)) return false;
    vistos.add(k); return true;
  });
  return unicas.length ? unicas.join(' — ') : 'a combinar';
}

module.exports = { enderecoPublicoGrupo, temNumeroDeRua, ondePublicoGrupo };

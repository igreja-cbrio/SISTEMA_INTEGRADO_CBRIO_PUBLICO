


















const { PORTAS_INSCRICAO } = require('../services/inscricaoPortas');
















const BASE_PADRAO = 'https://www.cbrio.org';


function basePublica() {
  return BASE_PADRAO;
}











const CHAVES_COMPARTILHAVEIS = Object.freeze([
  'batismo', 'grupos', 'next', 'voluntariado', 'apresentacao',
]);


const CONVITE = Object.freeze({
  batismo: 'Batismo',
  grupos: 'Grupos de conexão',
  next: 'NEXT',
  voluntariado: 'Quero servir',
  apresentacao: 'Apresentação de crianças',
});













function linkDaRota(rota, base = basePublica()) {
  const r = String(rota || '').trim();
  if (!r || !r.startsWith('/')) return null;
  if (r.includes(':') || r.includes('*')) return null;
  return `${base}${r}`;
}





function portasCompartilhaveis() {
  const base = basePublica();
  const porChave = new Map(PORTAS_INSCRICAO.map((p) => [p.chave, p]));
  return CHAVES_COMPARTILHAVEIS
    .map((chave) => {
      const porta = porChave.get(chave);
      const url = linkDaRota(porta?.rotasPublicas?.[0], base);
      if (!url) return null;
      return { chave, nome: CONVITE[chave] || porta.nome, url };
    })
    .filter(Boolean);
}


function linkDoEvento(slug) {
  const s = String(slug || '').trim();
  if (!s) return null;
  return `${basePublica()}/evento/${encodeURIComponent(s)}`;
}

module.exports = {
  basePublica,
  linkDaRota,
  portasCompartilhaveis,
  linkDoEvento,
  CHAVES_COMPARTILHAVEIS,
  BASE_PADRAO,
};

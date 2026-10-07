

















const { estaNoAr } = require('./campanhaProgresso');















function campanhasOfertaveis(campanhas, hoje) {
  return (campanhas || []).filter((c) => c && aceitaOnline(c) && estaNoAr(c, hoje));
}













function aceitaOnline(c) {
  return c?.aceita_online !== false;
}


function paraOApp(c) {
  return {
    id: c.id,
    nome: c.nome,



    descricao_curta: typeof c.descricao_curta === 'string' && c.descricao_curta.trim()
      ? c.descricao_curta.trim().slice(0, 160)
      : null,
  };
}

const CATEGORIAS = ['dizimo', 'oferta', 'campanha'];

















function validarEscolha({ categoria, campanha_id: campanhaId, ofertaveis } = {}) {
  const cat = CATEGORIAS.includes(categoria) ? categoria : null;
  if (!cat) return { ok: false, motivo: 'categoria_invalida' };

  if (cat !== 'campanha') {
    return { ok: true, categoria: cat, campanha_id: null };
  }

  const id = typeof campanhaId === 'string' ? campanhaId.trim() : '';
  if (!id) return { ok: false, motivo: 'campanha_nao_escolhida' };

  const achada = (ofertaveis || []).find((c) => c && String(c.id) === id);
  if (!achada) return { ok: false, motivo: 'campanha_indisponivel' };

  return { ok: true, categoria: cat, campanha_id: id, campanha_nome: achada.nome || null };
}












function metadataDaDoacao({ categoria, campanha_id: campanhaId, campanha_nome: nome, canal, extra } = {}) {
  return {
    ...(extra && typeof extra === 'object' ? extra : {}),
    categoria,
    canal,
    campanha_id: campanhaId || null,
    campanha: nome || null,
  };
}


function descricaoDaDoacao({ categoria, campanha_nome: nome } = {}) {
  if (categoria === 'campanha') return `Campanha: ${nome || 'CBRio'}`.slice(0, 120);
  return categoria === 'dizimo' ? 'Dízimo' : 'Oferta';
}

module.exports = {
  CATEGORIAS,
  campanhasOfertaveis,
  paraOApp,
  validarEscolha,
  metadataDaDoacao,
  descricaoDaDoacao,
};

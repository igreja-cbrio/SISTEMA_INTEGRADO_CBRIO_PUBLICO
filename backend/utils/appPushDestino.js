




















const APP_MEMBROS = '3da60261-4811-458b-90c7-7e81f5511c51';
const APP_STAFF = '5360e6ff-c713-44e4-bf4c-eb8f29a096ee';

const PROJETO_POR_APP = { membros: APP_MEMBROS, staff: APP_STAFF };


function projetoDoToken(linha) {
  const v = linha && linha.projeto_id != null ? String(linha.projeto_id).trim().toLowerCase() : '';
  return v || null;
}


function ehDoApp(linha, app) {
  const alvo = PROJETO_POR_APP[app];
  return !!alvo && projetoDoToken(linha) === alvo;
}


















function filtrarPorApp(tokens, alvo) {
  const lista = Array.isArray(tokens) ? tokens : [];
  if (!PROJETO_POR_APP[alvo]) return lista;
  const outros = Object.keys(PROJETO_POR_APP)
    .filter((k) => k !== alvo)
    .map((k) => PROJETO_POR_APP[k]);
  return lista.filter((linha) => {



    return !outros.includes(projetoDoToken(linha));
  });
}


function contarSemCarimbo(tokens) {
  return (Array.isArray(tokens) ? tokens : []).filter((l) => projetoDoToken(l) === null).length;
}

module.exports = {
  APP_MEMBROS,
  APP_STAFF,
  PROJETO_POR_APP,
  projetoDoToken,
  ehDoApp,
  filtrarPorApp,
  contarSemCarimbo,
};

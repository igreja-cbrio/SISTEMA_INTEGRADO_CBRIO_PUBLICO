
























'use strict';








function podeServirNoTipo(vinculo, serviceTypeId) {
  if (!vinculo) return true;
  const lista = vinculo.service_type_ids;
  if (!Array.isArray(lista) || lista.length === 0) return true;
  if (!serviceTypeId) return true;
  return lista.some((id) => id != null && String(id) === String(serviceTypeId));
}











function pessoaServeNoTipo(vinculos, serviceTypeId) {
  const lista = Array.isArray(vinculos) ? vinculos : [];
  if (!lista.length) return true;
  return lista.some((v) => podeServirNoTipo(v, serviceTypeId));
}
















function normalizarEscolha(escolhidos, todosOsTipos) {
  const sel = [...new Set((Array.isArray(escolhidos) ? escolhidos : []).filter(Boolean).map(String))];
  const todos = [...new Set((Array.isArray(todosOsTipos) ? todosOsTipos : []).filter(Boolean).map(String))];
  if (!sel.length) return null;
  if (todos.length && todos.every((t) => sel.includes(t))) return null;
  return sel;
}

module.exports = { podeServirNoTipo, pessoaServeNoTipo, normalizarEscolha };

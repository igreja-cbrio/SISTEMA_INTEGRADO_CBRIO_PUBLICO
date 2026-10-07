














const TETO_LOTE = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;







function normalizarIds(bruto) {
  const lista = Array.isArray(bruto) ? bruto : [];
  const ids = [];
  const vistos = new Set();
  let ignorados = 0;
  for (const item of lista) {
    const id = String(item || '').trim();
    if (!UUID_RE.test(id)) { ignorados++; continue; }
    if (vistos.has(id)) continue;
    vistos.add(id);
    ids.push(id);
  }
  return { ids: ids.slice(0, TETO_LOTE), ignorados, acimaDoTeto: Math.max(0, ids.length - TETO_LOTE) };
}










function separarExclusaoLote(pedidos, vivas, comPagamento) {
  const porId = new Map((vivas || []).filter(Boolean).map((l) => [l.id, l]));
  const bloqueados = new Set(comPagamento || []);

  const excluir = [];
  const bloqueadas = [];
  const naoEncontradas = [];

  for (const id of pedidos || []) {
    const linha = porId.get(id);




    if (!linha) { naoEncontradas.push(id); continue; }
    if (bloqueados.has(id)) { bloqueadas.push({ id, nome: linha.nome_completo || null }); continue; }
    excluir.push(id);
  }

  return { excluir, comPagamento: bloqueadas, naoEncontradas };
}






function resumoDoLote({ excluidas = 0, comPagamento = 0, naoEncontradas = 0, falhas = 0 } = {}) {
  const partes = [];
  partes.push(excluidas === 1 ? '1 inscrição excluída' : `${excluidas} inscrições excluídas`);
  if (comPagamento) {
    partes.push(comPagamento === 1
      ? '1 tem pagamento e ficou de fora (exclua pela ficha, se for o caso)'
      : `${comPagamento} têm pagamento e ficaram de fora (exclua pela ficha, se for o caso)`);
  }
  if (naoEncontradas) {
    partes.push(naoEncontradas === 1 ? '1 já não estava na lista' : `${naoEncontradas} já não estavam na lista`);
  }
  if (falhas) {
    partes.push(falhas === 1 ? '1 falhou e continua na lista' : `${falhas} falharam e continuam na lista`);
  }
  return `${partes.join(' · ')}.`;
}

module.exports = { normalizarIds, separarExclusaoLote, resumoDoLote, TETO_LOTE };

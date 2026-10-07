




















const dig = (v) => String(v || '').replace(/\D/g, '');
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();





function chavePessoaInscricao(i) {
  if (i?.membro_id) return 'mem:' + i.membro_id;
  const c = dig(i?.cpf);
  if (c.length === 11) return 'cpf:' + c;
  const t = dig(i?.telefone);
  if (t.length >= 10) return 'tel:' + t;
  const n = norm(i?.nome_completo);
  return n ? 'nome:' + n : 'insc:' + i?.id;
}







function elegiveisDoSorteio({ inscritos = [], presentesIds = [], sorteios = [] } = {}) {
  const presentes = new Set(presentesIds);
  const porId = new Map(inscritos.map((i) => [i.id, i]));




  const jaGanharam = new Set();
  for (const s of sorteios) {
    if (s?.substituido_em) continue;
    const i = porId.get(s?.inscricao_id);


    jaGanharam.add(i ? chavePessoaInscricao(i) : 'insc:' + s?.inscricao_id);
  }

  return inscritos.filter((i) => i
    && i.status !== 'cancelada'
    && i.numero_sorte != null
    && presentes.has(i.id)
    && !jaGanharam.has(chavePessoaInscricao(i)));
}





function motivoSemElegivel({ inscritos = [], presentesIds = [], sorteios = [] } = {}) {
  const ativos = inscritos.filter((i) => i.status !== 'cancelada' && i.numero_sorte != null);
  if (!ativos.length) return { motivo: 'sem_inscritos', presentes: 0, ativos: 0 };
  const presentes = ativos.filter((i) => presentesIds.includes(i.id));
  if (!presentes.length) return { motivo: 'ninguem_presente', presentes: 0, ativos: ativos.length };
  return {
    motivo: 'todos_presentes_ja_ganharam',
    presentes: presentes.length,
    ativos: ativos.length,
    sorteios: sorteios.filter((s) => !s.substituido_em).length,
  };
}

module.exports = { chavePessoaInscricao, elegiveisDoSorteio, motivoSemElegivel };

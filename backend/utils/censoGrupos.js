







































const { chavesDeQuemRespondeu, cpfDe, mensagemConvite } = require('./censoVoluntarios');

const SEM_CATEGORIA = 'Sem categoria';

const PAPEL_ROTULO = {
  lider: 'líder',
  lider_treinamento: 'líder em treinamento',
  co_lider: 'líder',
  frequentador: null,
  visitante: 'visitante',
};

function respondeu(pessoa, chaves) {
  if (pessoa.membro_id && chaves.membros.has(String(pessoa.membro_id))) return true;
  for (const c of pessoa.cpfs || []) if (chaves.cpfs.has(c)) return true;
  return false;
}














function montarPessoasEmGrupoSemCenso({
  vinculos, grupos = {}, membros = {}, respostas = [], link = null, titulo = null, nominal = true,
} = {}) {
  const chaves = chavesDeQuemRespondeu(respostas);
  const pessoas = new Map();
  let vinculosGrupoInativo = 0;
  let vinculosSemCadastro = 0;

  for (const v of Array.isArray(vinculos) ? vinculos : []) {
    if (!v || !v.membro_id) continue;
    const grupo = grupos[v.grupo_id];


    if (!grupo) { vinculosGrupoInativo++; continue; }
    const membro = membros[v.membro_id];

    if (!membro) { vinculosSemCadastro++; continue; }

    const id = String(v.membro_id);
    let pessoa = pessoas.get(id);
    if (!pessoa) {
      pessoa = {
        membro_id: id,
        nome: String(membro.nome || '').trim() || null,
        cpfs: [cpfDe(membro.cpf)].filter(Boolean),
        telefone: membro.telefone || null,
        telefone_fonte: membro.telefone_fonte || null,
        grupos: [],
      };
      pessoas.set(id, pessoa);
    }
    if (!pessoa.grupos.some((g) => g.grupo_id === grupo.id)) {
      pessoa.grupos.push({ grupo_id: grupo.id, nome: grupo.nome || null, funcao: v.funcao || null });
    }
  }

  const porGrupo = new Map();
  let totalPessoas = 0;
  let semCensoPessoas = 0;
  let semTelefone = 0;

  const linhaDoGrupo = (grupo) => {
    let g = porGrupo.get(grupo.id);
    if (g) return g;
    const lider = grupo.lider_id ? membros[grupo.lider_id] : null;


    let liderSemCenso = null;
    if (lider) {
      liderSemCenso = !respondeu({ membro_id: grupo.lider_id, cpfs: [cpfDe(lider.cpf)].filter(Boolean) }, chaves);
    }
    g = {
      grupo_id: grupo.id,
      nome: grupo.nome || null,
      categoria: String(grupo.categoria || '').trim() || SEM_CATEGORIA,
      dia_semana: grupo.dia_semana ?? null,
      horario: grupo.horario ?? null,
      lider: {
        membro_id: grupo.lider_id || null,
        nome: lider ? (String(lider.nome || '').trim() || null) : null,
        telefone: nominal && lider ? (lider.telefone || null) : null,
        sem_censo: liderSemCenso,
      },
      total: 0,
      sem_censo: 0,
      pessoas: [],
    };
    porGrupo.set(grupo.id, g);
    return g;
  };

  for (const pessoa of pessoas.values()) {
    const falta = !respondeu(pessoa, chaves);
    totalPessoas++;
    if (falta) {
      semCensoPessoas++;
      if (!pessoa.telefone) semTelefone++;
    }
    for (const pg of pessoa.grupos) {
      const g = linhaDoGrupo(grupos[pg.grupo_id]);
      g.total++;
      if (!falta) continue;
      g.sem_censo++;
      if (nominal) {
        g.pessoas.push({
          membro_id: pessoa.membro_id,
          nome: pessoa.nome,
          telefone: pessoa.telefone,
          telefone_fonte: pessoa.telefone_fonte,
          papel: PAPEL_ROTULO[pg.funcao] ?? null,
          outros_grupos: pessoa.grupos.filter((x) => x.grupo_id !== pg.grupo_id).map((x) => x.nome).filter(Boolean),
          mensagem: mensagemConvite({
            nome: pessoa.nome, link, titulo,
            papel: g.nome ? `como parte do grupo ${g.nome}` : 'como parte de um grupo de conexão',
          }),
        });
      }
    }
  }


  const ordena = (a, b) => String(a).localeCompare(String(b), 'pt-BR');
  const lista = [...porGrupo.values()]
    .sort((a, b) => ordena(a.nome || '', b.nome || ''))
    .map((g) => ({ ...g, pessoas: g.pessoas.sort((x, y) => ordena(x.nome || '', y.nome || '')) }));

  const categorias = new Map();
  for (const g of lista) {
    const c = categorias.get(g.categoria) || (categorias.set(g.categoria, { categoria: g.categoria, grupos: 0, total: 0, sem_censo: 0 }), categorias.get(g.categoria));
    c.grupos++;
    c.total += g.total;
    c.sem_censo += g.sem_censo;
  }



  const lideres = new Map();
  for (const g of lista) {
    if (g.lider.sem_censo !== true || !g.lider.membro_id) continue;
    const id = String(g.lider.membro_id);
    let l = lideres.get(id);
    if (!l) {
      l = {
        membro_id: id,
        nome: g.lider.nome,
        telefone: nominal ? (g.lider.telefone || null) : null,
        telefone_fonte: nominal ? ((membros[id] && membros[id].telefone_fonte) || null) : null,
        grupos: [],
        mensagem: null,
      };
      lideres.set(id, l);
    }
    if (g.nome && !l.grupos.includes(g.nome)) l.grupos.push(g.nome);
  }
  const lideresSemCenso = [...lideres.values()]
    .map((l) => ({
      ...l,
      mensagem: nominal ? mensagemConvite({
        nome: l.nome, link, titulo,
        papel: l.grupos.length === 1 ? `como líder do grupo ${l.grupos[0]}`
          : l.grupos.length > 1 ? `como líder dos grupos ${l.grupos.join(' e ')}`
            : 'como líder de grupo de conexão',
      }) : null,
    }))
    .sort((a, b) => ordena(a.nome || '', b.nome || ''));

  return {
    grupos: lista,
    lideres_sem_censo: lideresSemCenso,


    categorias: [...categorias.values()].sort((a, b) => (a.categoria === SEM_CATEGORIA) - (b.categoria === SEM_CATEGORIA) || ordena(a.categoria, b.categoria)),
    totais: {
      pessoas: totalPessoas,
      sem_censo: semCensoPessoas,
      responderam: totalPessoas - semCensoPessoas,
      sem_telefone: semTelefone,
      grupos: lista.length,
      grupos_com_faltante: lista.filter((g) => g.sem_censo > 0).length,
      lideres_sem_censo: lideresSemCenso.length,
      vinculos_grupo_inativo: vinculosGrupoInativo,
      vinculos_sem_cadastro: vinculosSemCadastro,
    },
    link,
    nominal: !!nominal,
  };
}

module.exports = { SEM_CATEGORIA, PAPEL_ROTULO, montarPessoasEmGrupoSemCenso };

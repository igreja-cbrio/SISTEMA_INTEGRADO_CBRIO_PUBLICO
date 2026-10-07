
































const SEM_AREA = 'Sem área';

function digitos(v) {
  return String(v ?? '').replace(/\D+/g, '');
}

function cpfDe(v) {
  const d = digitos(v);
  return d.length === 11 ? d : null;
}


function primeiroNome(nome) {
  const limpo = String(nome || '').trim().replace(/\s+/g, ' ');
  if (!limpo) return null;
  const t = limpo.split(' ')[0];
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}


function linkPesquisa(base, slug) {
  const b = String(base || '').trim().replace(/\/+$/, '');
  const s = String(slug || '').trim();
  if (!b || !s) return null;
  return `${b}/censo/p/${encodeURIComponent(s)}`;
}







function mensagemConvite({ nome, link, titulo, papel } = {}) {
  if (!link) return null;
  const p = primeiroNome(nome);
  const saud = p ? `Oi, ${p}!` : 'Olá!';
  const oQue = String(titulo || '').trim() || 'o censo da CBRio';



  const porque = String(papel || '').trim() || 'como voluntário(a)';
  return [
    `${saud} Tudo bem?`,
    `A gente está fazendo ${oQue} e a sua resposta, ${porque}, é muito importante para nós.`,
    'Leva uns 3 minutos e ajuda a igreja a cuidar melhor de cada pessoa.',
    `É só entrar aqui: ${link}`,
    'Muito obrigado!',
  ].join('\n');
}





function chavesDeQuemRespondeu(respostas) {
  const membros = new Set();
  const cpfs = new Set();
  for (const r of Array.isArray(respostas) ? respostas : []) {
    if (r?.membro_id) membros.add(String(r.membro_id));
    const c = cpfDe(r?.cpf);
    if (c) cpfs.add(c);
  }
  return { membros, cpfs };
}

function respondeu(pessoa, chaves) {
  if (pessoa.membro_id && chaves.membros.has(String(pessoa.membro_id))) return true;
  for (const c of pessoa.cpfs || []) if (chaves.cpfs.has(c)) return true;
  return false;
}















function montarVoluntariosSemCenso({
  vinculos, perfis = {}, perfilPorPc = {}, membros = {}, contatos = {}, respostas = [],
  link = null, titulo = null, nominal = true,
} = {}) {
  const chaves = chavesDeQuemRespondeu(respostas);
  const pessoas = new Map();
  const semEquipe = { ativos: 0 };

  for (const v of Array.isArray(vinculos) ? vinculos : []) {
    if (!v || v.is_active === false) continue;
    const team = v.team;


    if (!team || team.is_active === false) { semEquipe.ativos++; continue; }

    let perfilId = v.volunteer_profile_id || null;
    if (!perfilId && v.planning_center_person_id) {
      perfilId = perfilPorPc[String(v.planning_center_person_id)] || null;
    }
    const perfil = perfilId ? perfis[perfilId] : null;
    if (perfil && perfil.arquivado === true) continue;




    const chave = perfilId ? `p:${perfilId}`
      : v.planning_center_person_id ? `pc:${v.planning_center_person_id}`
      : `v:${v.id}`;

    let pessoa = pessoas.get(chave);
    if (!pessoa) {
      const membroId = perfil?.membresia_id || contatos[perfilId]?.membro_id || null;
      const membro = membroId ? membros[membroId] : null;
      const cpfs = new Set([cpfDe(perfil?.cpf), cpfDe(membro?.cpf)].filter(Boolean));
      pessoa = {
        perfil_id: perfilId,
        nome: String(perfil?.full_name || v.volunteer_name || '').trim() || null,
        membro_id: membroId,
        cpfs: [...cpfs],
        telefone: contatos[perfilId]?.phone || null,
        telefone_fonte: contatos[perfilId]?.telefone_fonte || null,
        equipes: [],
      };
      pessoas.set(chave, pessoa);
    }
    if (!pessoa.equipes.some((e) => e.team_id === team.id)) {
      pessoa.equipes.push({ team_id: team.id, nome: team.name || null, area: String(team.area || '').trim() || SEM_AREA });
    }
  }


  const areas = new Map();
  let totalPessoas = 0;
  let semCensoPessoas = 0;
  let semTelefone = 0;

  for (const pessoa of pessoas.values()) {
    const falta = !respondeu(pessoa, chaves);
    totalPessoas++;
    if (falta) {
      semCensoPessoas++;
      if (!pessoa.telefone) semTelefone++;
    }


    const areasVistas = new Set();
    for (const e of pessoa.equipes) {
      const area = areas.get(e.area) || (areas.set(e.area, { area: e.area, total: 0, sem_censo: 0, equipes: new Map() }), areas.get(e.area));
      if (!areasVistas.has(e.area)) {
        areasVistas.add(e.area);
        area.total++;
        if (falta) area.sem_censo++;
      }
      const eq = area.equipes.get(e.team_id) || (area.equipes.set(e.team_id, { team_id: e.team_id, nome: e.nome, total: 0, sem_censo: 0, pessoas: [] }), area.equipes.get(e.team_id));
      eq.total++;
      if (falta) {
        eq.sem_censo++;
        if (nominal) {
          eq.pessoas.push({
            perfil_id: pessoa.perfil_id,
            membro_id: pessoa.membro_id,
            nome: pessoa.nome,
            telefone: pessoa.telefone,
            telefone_fonte: pessoa.telefone_fonte,
            equipes: pessoa.equipes.map((x) => x.nome).filter(Boolean),
            mensagem: mensagemConvite({ nome: pessoa.nome, link, titulo }),
          });
        }
      }
    }
  }

  const ordena = (a, b) => String(a).localeCompare(String(b), 'pt-BR');
  const lista = [...areas.values()]
    .sort((a, b) => (a.area === SEM_AREA) - (b.area === SEM_AREA) || ordena(a.area, b.area))
    .map((a) => ({
      area: a.area,
      total: a.total,
      sem_censo: a.sem_censo,
      equipes: [...a.equipes.values()]
        .sort((x, y) => ordena(x.nome || '', y.nome || ''))
        .map((e) => ({ ...e, pessoas: e.pessoas.sort((x, y) => ordena(x.nome || '', y.nome || '')) })),
    }));

  return {
    areas: lista,
    totais: {
      voluntarios: totalPessoas,
      sem_censo: semCensoPessoas,
      responderam: totalPessoas - semCensoPessoas,
      sem_telefone: semTelefone,
      vinculos_sem_equipe_ativa: semEquipe.ativos,
    },
    link,
    nominal: !!nominal,
  };
}

module.exports = {
  SEM_AREA,
  cpfDe,
  primeiroNome,
  linkPesquisa,
  mensagemConvite,
  chavesDeQuemRespondeu,
  montarVoluntariosSemCenso,
};

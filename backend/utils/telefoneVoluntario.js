































const { telefoneAlcancavel, digitos } = require('../services/contatoPessoa');














const { nomesPodemSerMesmaPessoa } = require('../services/duplicidadePolicy');



const ORIGENS = {
  PERFIL: 'perfil',
  MEMBRO: 'membro',
  CPF: 'cpf',
  INSCRICAO: 'inscricao',
  CONTATO: 'contato_secundario',
};




const ROTULO_ORIGEM = {
  [ORIGENS.PERFIL]: 'cadastro do voluntariado',
  [ORIGENS.MEMBRO]: 'cadastro da pessoa',
  [ORIGENS.CPF]: 'cadastro da pessoa (CPF)',
  [ORIGENS.INSCRICAO]: 'formulário de voluntariado',
  [ORIGENS.CONTATO]: 'contato secundário',
};

const MOTIVO_DESCARTE = {
  NUMERO_ERRADO: 'numero_errado',
  NOME_DIVERGENTE: 'nome_divergente',
  SEM_DADO: 'sem_dado',
};














function _nomeVeta(nomeVol, nomeOutro) {
  const a = String(nomeVol || '').trim();
  const b = String(nomeOutro || '').trim();
  if (!a || !b) return false;
  return !nomesPodemSerMesmaPessoa(a, b);
}

function _candidato(origem, telefone, membroId) {
  const t = String(telefone || '').trim();
  if (!t) return null;
  return { origem, telefone: t, membro_id: membroId || null };
}















function resolverTelefoneVoluntario(entrada = {}) {
  const nome = entrada.nome;
  const descartados = [];
  const vazio = { telefone: null, origem: null, rotulo: null, membro_id: null };






  const aceitar = (cand) => {
    if (!cand) return null;
    if (!telefoneAlcancavel(cand.telefone)) {
      descartados.push({ origem: cand.origem, motivo: MOTIVO_DESCARTE.NUMERO_ERRADO, valor: digitos(cand.telefone) });
      return null;
    }
    return {
      telefone: cand.telefone,
      origem: cand.origem,
      rotulo: ROTULO_ORIGEM[cand.origem] || null,
      membro_id: cand.membro_id,
      descartados,
    };
  };



  const doPerfil = aceitar(_candidato(ORIGENS.PERFIL, entrada.perfilTelefone));
  if (doPerfil) return doPerfil;



  const membro = entrada.membro;
  if (membro && membro.telefone) {
    if (_nomeVeta(nome, membro.nome)) {
      descartados.push({ origem: ORIGENS.MEMBRO, motivo: MOTIVO_DESCARTE.NOME_DIVERGENTE, nome_outro: membro.nome });
    } else {
      const r = aceitar(_candidato(ORIGENS.MEMBRO, membro.telefone, membro.id));
      if (r) return r;
    }
  }




  const porCpf = entrada.membroPorCpf;
  if (porCpf && porCpf.telefone) {
    if (_nomeVeta(nome, porCpf.nome)) {
      descartados.push({ origem: ORIGENS.CPF, motivo: MOTIVO_DESCARTE.NOME_DIVERGENTE, nome_outro: porCpf.nome });
    } else {
      const r = aceitar(_candidato(ORIGENS.CPF, porCpf.telefone, porCpf.id));
      if (r) return r;
    }
  }






  for (const insc of Array.isArray(entrada.inscricoes) ? entrada.inscricoes : []) {
    if (!insc || !insc.telefone) continue;
    const a = String(nome || '').trim();
    const b = String(insc.nome || '').trim();
    if (!a || !b || !nomesPodemSerMesmaPessoa(a, b)) {
      descartados.push({ origem: ORIGENS.INSCRICAO, motivo: MOTIVO_DESCARTE.NOME_DIVERGENTE, nome_outro: insc.nome || null });
      continue;
    }
    const r = aceitar(_candidato(ORIGENS.INSCRICAO, insc.telefone, null));
    if (r) return r;
  }





  for (const c of Array.isArray(entrada.contatos) ? entrada.contatos : []) {
    if (!c || !c.telefone) continue;
    const r = aceitar(_candidato(ORIGENS.CONTATO, c.telefone, membro?.id || porCpf?.id || null));
    if (r) return r;
  }

  return { ...vazio, descartados };
}

module.exports = {
  ORIGENS,
  ROTULO_ORIGEM,
  MOTIVO_DESCARTE,
  resolverTelefoneVoluntario,
};

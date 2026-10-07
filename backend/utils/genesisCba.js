








const SLUG_BASE_GENESIS = 'genesis';




const GENESIS_CAMPOS = Object.freeze([
  { key: 'c_genesis_igreja', label: 'Qual o nome da sua igreja ou instituição?', tipo: 'texto', obrigatorio: true, opcoes: [] },
  { key: 'c_genesis_endereco', label: 'Preencha o endereço completo da sua igreja ou instituição:', tipo: 'textarea', obrigatorio: true, opcoes: [] },
  { key: 'c_genesis_cargo', label: 'Qual seu cargo na sua igreja ou instituição?', tipo: 'texto', obrigatorio: true, opcoes: [] },
  { key: 'c_genesis_ja_participou', label: 'Você já participou do Gênesis?', tipo: 'escolha', obrigatorio: true, opcoes: ['Sim', 'Não'] },
  { key: 'c_genesis_como_soube', label: 'Como você ficou sabendo do Gênesis?', tipo: 'texto', obrigatorio: false, opcoes: [] },
]);


function camposGenesis() {
  return GENESIS_CAMPOS.map((c) => ({ ...c, opcoes: [...c.opcoes] }));
}


function nomeEdicao(nomeIgreja) {
  const ig = String(nomeIgreja || '').trim();
  return ig ? `Genesis CBA · ${ig}` : 'Genesis CBA';
}


function rotuloEdicaoGenesis(data) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) ? String(data) : null;
}





function resumoGenesis(edicoes) {
  const lista = Array.isArray(edicoes) ? edicoes : [];
  const igrejas = new Set();
  let inscritos = 0; let ativas = 0;
  for (const e of lista) {
    if (e?.igreja_id) igrejas.add(e.igreja_id);
    inscritos += Number(e?.inscritos) || 0;
    if (e?.status === 'publicado') ativas += 1;
  }
  return { edicoes: lista.length, ativas, igrejas: igrejas.size, inscritos };
}

module.exports = {
  SLUG_BASE_GENESIS, GENESIS_CAMPOS, camposGenesis, nomeEdicao, rotuloEdicaoGenesis, resumoGenesis,
};

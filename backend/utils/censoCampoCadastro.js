





































function chave(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\(a\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}


function slug(v) {
  return chave(v).replace(/\s+/g, '_').slice(0, 40);
}







const ESTADO_CIVIL = {
  solteiro: 'solteiro',
  casado: 'casado',
  casada: 'casado',
  divorciado: 'divorciado',
  separado: 'divorciado',
  'separado judicialmente': 'divorciado',
  desquitado: 'divorciado',
  viuvo: 'viuvo',
  'uniao estavel': 'uniao_estavel',
  amasiado: 'uniao_estavel',
  'mora junto': 'uniao_estavel',
};

const GENERO = {
  masculino: 'masculino', m: 'masculino', homem: 'masculino',
  feminino: 'feminino', f: 'feminino', mulher: 'feminino',



};

const FREQUENTA_AREA = { ami: 'ami', bridge: 'bridge' };





const ESCOLARIDADE = {
  'ensino fundamental': 'fundamental',
  fundamental: 'fundamental',
  'fundamental incompleto': 'fundamental',
  'ensino medio': 'medio',
  medio: 'medio',
  'segundo grau': 'medio',
  tecnico: 'tecnico',
  'ensino tecnico': 'tecnico',










  superior: 'superior_completo',
  'superior completo': 'superior_completo',
  'ensino superior': 'superior_completo',
  'ensino superior completo': 'superior_completo',
  graduacao: 'superior_completo',
  faculdade: 'superior_completo',
  'superior incompleto': 'superior_incompleto',
  'pos graduacao': 'pos_graduacao',
  pos: 'pos_graduacao',
  especializacao: 'pos_graduacao',
  mba: 'pos_graduacao',
  mestrado: 'mestrado',
  doutorado: 'doutorado',
};









const CAMPOS_CADASTRO = {
  nome: { label: 'Nome completo', modo: 'texto' },
  cpf: { label: 'CPF', modo: 'texto' },
  data_nascimento: { label: 'Data de nascimento', modo: 'texto' },
  telefone: { label: 'Telefone', modo: 'texto' },
  email: { label: 'E-mail', modo: 'texto' },
  endereco: { label: 'Endereço', modo: 'texto' },
  bairro: { label: 'Bairro', modo: 'texto' },
  cidade: { label: 'Cidade', modo: 'texto' },
  cep: { label: 'CEP', modo: 'cep' },
  profissao: { label: 'Profissão', modo: 'texto' },
  estado_civil: { label: 'Estado civil', modo: 'vocabulario', mapa: ESTADO_CIVIL },
  escolaridade: { label: 'Escolaridade', modo: 'slugLivre', mapa: ESCOLARIDADE },
  genero: { label: 'Sexo', modo: 'vocabulario', mapa: GENERO },
  frequenta_area: { label: 'Frequenta (AMI/Bridge)', modo: 'vocabulario', mapa: FREQUENTA_AREA },
};

function ehCampoDeCadastro(campo) {
  return Object.prototype.hasOwnProperty.call(CAMPOS_CADASTRO, campo);
}








function traduzirParaCadastro(campo, valorBruto) {
  if (!ehCampoDeCadastro(campo)) return { ok: false, motivo: 'campo_desconhecido' };
  if (Array.isArray(valorBruto)) return { ok: false, motivo: 'nao_reconhecido' };
  if (valorBruto === null || valorBruto === undefined) return { ok: false, motivo: 'vazio' };

  const bruto = String(valorBruto).trim();
  if (!bruto) return { ok: false, motivo: 'vazio' };

  const def = CAMPOS_CADASTRO[campo];

  if (def.modo === 'cep') {
    const d = bruto.replace(/\D+/g, '');


    return d.length === 8 ? { ok: true, valor: d } : { ok: false, motivo: 'cep_invalido' };
  }

  if (def.modo === 'vocabulario' || def.modo === 'slugLivre') {
    const k = chave(bruto);
    if (!k) return { ok: false, motivo: 'vazio' };
    const canonico = def.mapa[k];
    if (canonico) return { ok: true, valor: canonico };
    if (def.modo === 'slugLivre') {
      const s = slug(bruto);
      return s ? { ok: true, valor: s } : { ok: false, motivo: 'nao_reconhecido' };
    }
    return { ok: false, motivo: 'nao_reconhecido' };
  }

  return { ok: true, valor: bruto };
}


function destinosParaUI() {
  return Object.entries(CAMPOS_CADASTRO).map(([campo, def]) => ({ campo, label: def.label }));
}

module.exports = {
  CAMPOS_CADASTRO,
  ehCampoDeCadastro,
  traduzirParaCadastro,
  destinosParaUI,

  chave,
  slug,
};

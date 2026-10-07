





























function chave(v) {
  return String(v ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\([ao]s?\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}







function casarComOpcao(valorDoBanco, opcoes) {
  const alvo = chave(valorDoBanco);
  if (!alvo || !Array.isArray(opcoes)) return null;
  return opcoes.find((o) => chave(o) === alvo) || null;
}



const PARA_BANCO = {
  estado_civil: {
    solteiro: 'solteiro',
    casado: 'casado',
    uniaoestavel: 'uniao_estavel',
    divorciado: 'divorciado',
    viuvo: 'viuvo',
    separado: 'divorciado',
    amasiado: 'uniao_estavel',
  },
};


const TEXTO_LIVRE = new Set([
  'telefone', 'email', 'data_nascimento', 'cidade', 'bairro', 'cep',
  'endereco', 'profissao',
]);







function paraBanco(campo, valorDoFormulario) {
  if (valorDoFormulario === null || valorDoFormulario === undefined) return undefined;
  if (TEXTO_LIVRE.has(campo)) {
    const v = String(valorDoFormulario).trim();
    return v === '' ? undefined : v;
  }
  const mapa = PARA_BANCO[campo];
  if (!mapa) return undefined;
  return mapa[chave(valorDoFormulario)];
}





function loteParaBanco(dados = {}) {
  const out = {};
  for (const [campo, valor] of Object.entries(dados)) {
    const traduzido = paraBanco(campo, valor);
    if (traduzido !== undefined) out[campo] = traduzido;
  }
  return out;
}

module.exports = { chave, casarComOpcao, paraBanco, loteParaBanco, PARA_BANCO, TEXTO_LIVRE };

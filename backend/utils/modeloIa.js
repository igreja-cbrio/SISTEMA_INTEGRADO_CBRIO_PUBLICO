



























const CADEIA_PADRAO = [
  'claude-sonnet-5',
  'claude-haiku-4-5-20251001',
];


const CADEIA_RAPIDA = [
  'claude-haiku-4-5-20251001',
];








function cadeiaDeModelos(preferido, base = CADEIA_PADRAO) {
  const p = String(preferido || '').trim();
  const resto = base.filter((m) => m !== p);
  return p ? [p, ...resto] : [...base];
}









function ehModeloInexistente(erro) {
  if (!erro) return false;
  const tipo = String(erro.type || '').toLowerCase();
  const msg = String(erro.message || '').toLowerCase();
  if (tipo === 'not_found_error') return true;


  return msg.includes('model') && (msg.includes('not found') || msg.includes('not_found') || msg.includes('does not exist'));
}









function mensagemParaUsuario(erro) {
  if (ehModeloInexistente(erro)) {
    return 'O assistente está temporariamente indisponível (atualização de modelo em andamento). A equipe já foi avisada.';
  }
  const tipo = String(erro && erro.type || '').toLowerCase();
  if (tipo === 'rate_limit_error') return 'Muitas perguntas ao mesmo tempo. Tente de novo em alguns segundos.';
  if (tipo === 'authentication_error') return 'O assistente está sem acesso à IA no momento. A equipe já foi avisada.';
  if (tipo === 'overloaded_error') return 'A IA está sobrecarregada agora. Tente de novo em instantes.';
  return 'Não consegui responder agora. Tente de novo em instantes.';
}














function modeloProvado() {
  return CADEIA_PADRAO[CADEIA_PADRAO.length - 1];
}

module.exports = {
  modeloProvado,
  CADEIA_PADRAO,
  CADEIA_RAPIDA,
  cadeiaDeModelos,
  ehModeloInexistente,
  mensagemParaUsuario,
};

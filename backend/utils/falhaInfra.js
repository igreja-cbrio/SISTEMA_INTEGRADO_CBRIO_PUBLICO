






















const NOME_RETRIABLE = 'AuthRetryableFetchError';








const MARCAS_INFRA = [
  'fetch failed', 'network', 'econnrefused', 'econnreset', 'etimedout',
  'enotfound', 'eai_again', 'socket hang up', 'timeout', 'timed out',
  'aborted', 'connection terminated', 'connection closed', 'und_err',
  '502', '503', '504', '522', '524', 'bad gateway', 'service unavailable',
  'gateway timeout', 'upstream',
];











function ehFalhaDeInfra(erro) {
  if (!erro || typeof erro !== 'object') return false;

  if (erro.name === NOME_RETRIABLE) return true;




  const status = Number(erro.status);
  if (Number.isFinite(status) && (status >= 500 || status === 0)) return true;


  const texto = [erro.message, erro.code, erro.cause?.message, erro.cause?.code]
    .filter(Boolean).join(' ').toLowerCase();
  if (!texto) return false;

  return MARCAS_INFRA.some((m) => texto.includes(m));
}







function respostaDeFalhaAuth(erro) {
  if (ehFalhaDeInfra(erro)) {
    return {
      status: 503,
      corpo: {
        error: 'O sistema está temporariamente indisponível. Não é a sua conta — aguarde um instante.',
        reason: 'banco_indisponivel',
        retry_apos_seg: 30,
      },
    };
  }
  return {
    status: 401,
    corpo: { error: 'Token inválido ou expirado', reason: 'invalid_token' },
  };
}

module.exports = { ehFalhaDeInfra, respostaDeFalhaAuth, MARCAS_INFRA };

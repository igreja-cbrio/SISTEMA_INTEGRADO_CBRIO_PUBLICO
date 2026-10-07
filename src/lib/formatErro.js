















export function formatErro(err, contexto = '') {

  if (err instanceof TypeError || /fetch|network/i.test(err?.message || '')) {
    return 'Sem conexão com o servidor. Verifique sua internet.';
  }

  const status = err?.status;

  if (status === 401) return 'Sua sessão expirou. Recarregue a página e entre de novo.';
  if (status === 403) return 'Você não tem permissão para essa ação.';
  if (status === 404) return contexto ? `${contexto} não encontrado.` : 'Recurso não encontrado.';
  if (status === 409) return err?.message || 'Conflito · esse registro já existe.';
  if (status >= 500) return 'Erro no servidor. Tente novamente em alguns segundos.';

  return err?.message || (contexto ? `Erro ao carregar ${contexto.toLowerCase()}.` : 'Erro inesperado.');
}

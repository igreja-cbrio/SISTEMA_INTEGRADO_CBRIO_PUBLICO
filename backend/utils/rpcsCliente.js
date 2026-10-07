
































const RPCS_APP_MEMBROS = [
  {
    nome: 'app_meu_qrcode',
    assinatura: 'public.app_meu_qrcode()',
    tela: 'app/(app)/cartoes.tsx',

    alvo: 'auth.uid()',
  },
  {
    nome: 'app_batismo_checkin',
    assinatura: 'public.app_batismo_checkin(uuid)',
    tela: 'app/(app)/batismo.tsx',

    alvo: 'auth.uid()',
  },
  {
    nome: 'app_marcar_batizado_outra',
    assinatura: 'public.app_marcar_batizado_outra(text)',
    tela: 'app/(app)/batismo.tsx',
    alvo: 'auth.uid()',
  },
  {
    nome: 'app_desmarcar_batizado_outra',
    assinatura: 'public.app_desmarcar_batizado_outra()',
    tela: 'app/(app)/batismo.tsx',
    alvo: 'auth.uid()',
  },
];






const RPCS_FRONT_ERP = [
  {
    nome: 'app_marcar_senha_trocada',
    assinatura: 'public.app_marcar_senha_trocada()',
    tela: 'src/contexts/AuthContext.jsx',
    alvo: 'auth.uid()',
  },
];

const RPCS_CLIENTE = [...RPCS_APP_MEMBROS, ...RPCS_FRONT_ERP];


function nomesRpcsCliente() {
  return RPCS_CLIENTE.map((r) => r.nome);
}







function semComentariosSql(sql) {
  return String(sql || '').replace(/--[^\n]*/g, '');
}






function grantsAuthenticatedNoSql(sql) {
  const achados = new Set();
  const limpo = semComentariosSql(sql);
  const re = /grant\s+execute\s+on\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\([^)]*\)\s+to\s+([^;]+);/gi;
  let m;
  while ((m = re.exec(limpo)) !== null) {
    if (/\bauthenticated\b/i.test(m[2])) achados.add(m[1].toLowerCase());
  }
  return achados;
}

module.exports = {
  RPCS_CLIENTE,
  RPCS_APP_MEMBROS,
  RPCS_FRONT_ERP,
  nomesRpcsCliente,
  grantsAuthenticatedNoSql,
  semComentariosSql,
};

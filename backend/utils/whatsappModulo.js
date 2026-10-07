




















const MAPA = [


  ['app.aniversario', { modulo: 'voluntariado', link: '/voluntariado' }],
  ['app.escala_voluntario', { modulo: 'voluntariado', link: '/voluntariado' }],
  ['app.kids_vinculo', { modulo: 'kids', link: '/ministerial/totem-kids/vinculos' }],
  ['app.kids_precheckin', { modulo: 'kids', link: '/ministerial/totem-kids' }],
  ['app.batismo_lembrete', { modulo: 'integracao', link: '/integracao?tab=batismos' }],
  ['app.familia_convite_aceito', { modulo: 'membresia', link: '/ministerial/membresia' }],



  ['app.suporte', { modulo: 'dashboard', link: '/admin/app-analytics' }],
  ['app.pedido_atualizado', { modulo: 'solicitacoes', link: '/solicitacoes' }],
  ['app.doacao_recebida', { modulo: 'financeiro', link: '/financeiro-v2' }],
  ['app.inscricao_confirmada', { modulo: 'inscricoes', link: '/inscricoes' }],
  ['grupos', { modulo: 'grupos', link: '/grupos' }],
  ['censo', { modulo: 'membresia', link: '/ministerial/membresia?tab=cadastros' }],
  ['membresia', { modulo: 'membresia', link: '/ministerial/membresia?tab=cadastros' }],
  ['inscricoes', { modulo: 'inscricoes', link: '/inscricoes' }],
  ['next', { modulo: 'next', link: '/next' }],
  ['voluntariado', { modulo: 'voluntariado', link: '/voluntariado' }],

  ['cuidados', { modulo: 'cuidados', link: '/ministerial/cuidados' }],
  ['kids', { modulo: 'kids', link: '/ministerial/totem-kids' }],
  ['solicitacoes', { modulo: 'solicitacoes', link: '/solicitacoes' }],
  ['rh', { modulo: 'rh', link: '/rh' }],



  ['comunicacao', { modulo: 'comunicacao', link: '/comunicacao?tab=envios' }],
];



const PADRAO = { modulo: 'integracao', link: null };

function moduloDoContexto(contexto) {
  const c = String(contexto || '').trim().toLowerCase();
  if (!c) return PADRAO;
  for (const [chave, destino] of MAPA) {
    if (c === chave || c.startsWith(`${chave}.`)) return destino;
  }
  return PADRAO;
}


function diaBrt(agora = new Date()) {
  return new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

module.exports = { moduloDoContexto, diaBrt, MAPA, PADRAO };

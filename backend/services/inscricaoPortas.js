













const PORTAS_INSCRICAO = Object.freeze([
  Object.freeze({
    chave: 'eventos',
    nome: 'Eventos e retiros',
    fontes: Object.freeze(['inscricoes', 'eventos_externos']),

    rotasPublicas: Object.freeze(['/evento/:slug', '/genesis/:slug', '/genesis']),
    gestao: '/inscricoes',
    modulo: 'Inscrições',


    escritores: Object.freeze(['inscricoes', 'ext_inscricoes']),
    contrato: 'inscricaoContrato',
    inventario: 'eventos_nativos',
    status: 'por_evento',
  }),
  Object.freeze({
    chave: 'grupos',
    nome: 'Grupos de conexão',
    fontes: Object.freeze(['grupos']),
    rotasPublicas: Object.freeze(['/inscricao-grupos']),
    gestao: '/grupos',
    modulo: 'Grupos',
    escritores: Object.freeze(['mem_grupo_pedidos']),
    contrato: 'inscricaoContrato',
    inventario: 'satelite',
    status: 'temporada',
  }),
  Object.freeze({
    chave: 'grupos_lider',
    nome: 'Líderes e anfitriões',
    fontes: Object.freeze(['grupos_lider']),
    rotasPublicas: Object.freeze(['/inscricao-lideres']),
    gestao: '/grupos',
    modulo: 'Grupos',
    escritores: Object.freeze(['mem_lider_inscricoes']),
    contrato: 'inscricaoContrato',
    inventario: 'satelite',
    status: 'continua',
  }),
  Object.freeze({
    chave: 'next',
    nome: 'Next',




    fontes: Object.freeze(['next']),
    rotasPublicas: Object.freeze(['/next', '/next/inscrever']),
    gestao: '/next',
    modulo: 'Next',
    escritores: Object.freeze(['next_matriculas']),








    escritoresDerivados: Object.freeze([
      'vol_inscricoes', 'batismo_inscricoes', 'jornada_encaminhamentos',
    ]),
    contrato: 'inscricaoContrato',
    inventario: 'satelite',
    status: 'turma',
  }),
  Object.freeze({
    chave: 'batismo',
    nome: 'Batismo',
    fontes: Object.freeze(['batismo']),
    rotasPublicas: Object.freeze(['/inscricao-batismo']),
    gestao: '/integracao',
    modulo: 'Integração',
    escritores: Object.freeze(['batismo_inscricoes']),
    contrato: 'inscricaoContrato',
    inventario: 'satelite',
    status: 'continua',
  }),
  Object.freeze({
    chave: 'apresentacao',
    nome: 'Apresentação de crianças',
    fontes: Object.freeze(['apresentacao_criancas', 'apresentacao_bebes']),
    rotasPublicas: Object.freeze(['/apresentacao-criancas']),
    gestao: '/kids',
    modulo: 'Kids',



    escritores: Object.freeze(['apresentacao_criancas', 'apresentacao_bebes']),
    contrato: 'inscricaoContrato',
    inventario: 'satelite',
    status: 'continua',
  }),
  Object.freeze({
    chave: 'voluntariado',
    nome: 'Voluntariado',
    fontes: Object.freeze(['voluntariado']),
    rotasPublicas: Object.freeze(['/inscricao-voluntariado']),
    gestao: '/ministerial/voluntariado',
    modulo: 'Voluntariado',
    escritores: Object.freeze(['vol_inscricoes']),
    contrato: 'inscricaoContrato',
    inventario: 'satelite',
    status: 'continua',
  }),
]);

function portasSatelites() {
  return PORTAS_INSCRICAO
    .filter((porta) => porta.inventario === 'satelite')
    .map((porta) => ({
      chave: porta.chave,
      nome: porta.nome,
      portas: [...porta.fontes],
      link: porta.rotasPublicas[0],
      aliases: porta.rotasPublicas.slice(1),
      gestao: porta.gestao,
      modulo: porta.modulo,
      continua: porta.status === 'continua',
      status: porta.status,
    }));
}

function fontesUnificadas() {
  return [...new Set(PORTAS_INSCRICAO.flatMap((porta) => porta.fontes))];
}

function catalogoPublico() {
  return PORTAS_INSCRICAO.map((porta) => ({
    chave: porta.chave,
    nome: porta.nome,
    fontes: [...porta.fontes],
    rotas_publicas: [...porta.rotasPublicas],
    gestao: porta.gestao,
    modulo: porta.modulo,
    escritores: [...porta.escritores],
    escritores_derivados: [...(porta.escritoresDerivados || [])],
    contrato: porta.contrato,
    inventario: porta.inventario,
    status: porta.status,
  }));
}

module.exports = {
  PORTAS_INSCRICAO,
  portasSatelites,
  fontesUnificadas,
  catalogoPublico,
};

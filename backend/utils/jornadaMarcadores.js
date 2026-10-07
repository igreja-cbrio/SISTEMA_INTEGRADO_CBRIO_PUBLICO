









































const MARCADORES = [
  {
    chave: 'batismo',
    label: 'Batizado',
    curto: 'BAT',
    descricao: 'Tem batismo realizado registrado (aqui ou em outra igreja).',
    sensivel: false,
  },
  {
    chave: 'next',
    label: 'Fez o Next',
    curto: 'NEXT',
    descricao: 'Concluiu o Next (aula 1 e aula 2, em qualquer turma).',
    sensivel: false,
  },
  {
    chave: 'grupo',
    label: 'Em grupo de conexão',
    curto: 'GRUPO',
    descricao: 'Tem vínculo ativo em algum grupo de conexão.',
    sensivel: false,
  },
  {
    chave: 'servir',
    label: 'Serve como voluntário',
    curto: 'SERVE',
    descricao: 'Tem vínculo de voluntariado em aberto.',
    sensivel: false,
  },
  {
    chave: 'devocional',
    label: 'Devocional em dia',
    curto: 'DEVO',
    descricao: 'Registrou devocional concluído nos últimos 90 dias.',
    sensivel: false,
  },
  {
    chave: 'generosidade',
    label: 'Contribui',
    curto: 'CONTRIB',
    descricao: 'Registrou dízimo ou oferta nos últimos 90 dias.',
    sensivel: true,
  },
];

const CHAVES = MARCADORES.map((m) => m.chave);
const CHAVES_ABERTAS = MARCADORES.filter((m) => !m.sensivel).map((m) => m.chave);
const CHAVES_SENSIVEIS = MARCADORES.filter((m) => m.sensivel).map((m) => m.chave);








const {
  MODULOS_FINANCEIRO: MODULOS_SENSIVEL,
  NIVEL_FINANCEIRO: NIVEL_SENSIVEL,
  podeVerFinanceiroDePessoa,
} = require('./dadosSensiveisPessoa');


const podeVerMarcadorSensivel = podeVerFinanceiroDePessoa;















function montarMarcadores(sinais, opts = {}) {
  const s = sinais || {};
  const incluirSensiveis = opts.incluirSensiveis === true;

  const presente = {

    batismo: !!(s.batismo_cbrio || s.batismo_outra),
    next: !!s.next,
    grupo: !!s.grupo,
    servir: !!s.servir,
    devocional: !!s.devocional,
    generosidade: !!s.generosidade,
  };

  const chaves = [];
  const detalhes = {};
  for (const m of MARCADORES) {
    if (m.sensivel && !incluirSensiveis) continue;
    if (!presente[m.chave]) continue;
    chaves.push(m.chave);
  }



  if (presente.batismo && !s.batismo_cbrio && s.batismo_outra) {
    detalhes.batismo = 'em outra igreja';
  }

  return {
    chaves,
    detalhes,
    sensiveis_ocultos: !incluirSensiveis && CHAVES_SENSIVEIS.length > 0,
  };
}


function marcadoresVazios(opts = {}) {
  return montarMarcadores({}, opts);
}

module.exports = {
  MARCADORES,
  CHAVES,
  CHAVES_ABERTAS,
  CHAVES_SENSIVEIS,
  MODULOS_SENSIVEL,
  NIVEL_SENSIVEL,
  podeVerMarcadorSensivel,
  montarMarcadores,
  marcadoresVazios,
};

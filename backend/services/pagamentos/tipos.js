























const METODOS = Object.freeze({
  PIX: 'pix',
  BOLETO: 'boleto',
  CARTAO: 'cartao',
  APPLE_PAY: 'apple_pay',

  DINHEIRO: 'dinheiro',
  TRANSFERENCIA: 'transferencia',
});

const METODOS_VALIDOS = Object.freeze(Object.values(METODOS));


const STATUS = Object.freeze({
  CRIADA: 'criada',
  AGUARDANDO: 'aguardando_pagamento',
  PAGO_PARCIAL: 'pago_parcial',
  PAGO: 'pago',
  EXPIRADA: 'expirada',
  CANCELADA: 'cancelada',
  FALHOU: 'falhou',
  ESTORNADO_PARCIAL: 'estornado_parcial',
  ESTORNADO: 'estornado',
  CHARGEBACK: 'chargeback',
});

const STATUS_VALIDOS = Object.freeze(Object.values(STATUS));



const STATUS_ABERTOS = Object.freeze([
  STATUS.CRIADA,
  STATUS.AGUARDANDO,
  STATUS.PAGO_PARCIAL,
]);


const STATUS_TERMINAIS = Object.freeze([
  STATUS.EXPIRADA,
  STATUS.CANCELADA,
  STATUS.FALHOU,
  STATUS.ESTORNADO,
  STATUS.CHARGEBACK,
]);



const STATUS_COM_DINHEIRO = Object.freeze([
  STATUS.PAGO_PARCIAL,
  STATUS.PAGO,
]);


const TIPO_PAGAMENTO = Object.freeze({
  LIQUIDACAO: 'liquidacao',
  ESTORNO: 'estorno',
  CHARGEBACK: 'chargeback',
  TARIFA: 'tarifa',
});




const ORIGENS = Object.freeze({
  RETIRO_INSCRICAO: 'retiro_inscricao',
  INSCRICAO: 'inscricao',
  CURSO: 'curso',
  GENEROSIDADE: 'generosidade',
  MANUAL: 'manual',
});










const TRANSICOES = Object.freeze({
  [STATUS.CRIADA]: Object.freeze([
    STATUS.AGUARDANDO, STATUS.PAGO, STATUS.PAGO_PARCIAL,
    STATUS.CANCELADA, STATUS.EXPIRADA, STATUS.FALHOU,
  ]),
  [STATUS.AGUARDANDO]: Object.freeze([
    STATUS.PAGO, STATUS.PAGO_PARCIAL,
    STATUS.CANCELADA, STATUS.EXPIRADA, STATUS.FALHOU,
  ]),
  [STATUS.PAGO_PARCIAL]: Object.freeze([
    STATUS.PAGO, STATUS.CANCELADA, STATUS.EXPIRADA,
    STATUS.ESTORNADO, STATUS.ESTORNADO_PARCIAL, STATUS.CHARGEBACK,
  ]),
  [STATUS.PAGO]: Object.freeze([
    STATUS.ESTORNADO, STATUS.ESTORNADO_PARCIAL, STATUS.CHARGEBACK,
  ]),
  [STATUS.ESTORNADO_PARCIAL]: Object.freeze([
    STATUS.ESTORNADO, STATUS.CHARGEBACK,
  ]),

  [STATUS.EXPIRADA]: Object.freeze([]),
  [STATUS.CANCELADA]: Object.freeze([]),
  [STATUS.FALHOU]: Object.freeze([]),
  [STATUS.ESTORNADO]: Object.freeze([]),
  [STATUS.CHARGEBACK]: Object.freeze([]),
});

module.exports = {
  METODOS,
  METODOS_VALIDOS,
  STATUS,
  STATUS_VALIDOS,
  STATUS_ABERTOS,
  STATUS_TERMINAIS,
  STATUS_COM_DINHEIRO,
  TIPO_PAGAMENTO,
  ORIGENS,
  TRANSICOES,
};

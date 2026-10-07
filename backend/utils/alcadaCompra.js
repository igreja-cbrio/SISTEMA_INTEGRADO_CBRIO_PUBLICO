




























'use strict';




const COMPRA_DIRETA_LIMITE = 1000;



const CATEGORIAS_COMPRA_DIRETA = new Set(['compras', 'servico']);

const DESTINO_FINANCEIRO = 'financeiro';
const DESTINO_COMPRA_DIRETA = 'compra_direta';











function decidirDestinoCotacao({ categoria, valorCotado, limite, forcarFinanceiro } = {}) {
  const teto = Number.isFinite(Number(limite)) && Number(limite) > 0
    ? Number(limite)
    : COMPRA_DIRETA_LIMITE;



  if (forcarFinanceiro === true) {
    return { destino: DESTINO_FINANCEIRO, motivo: 'pedido_explicito', limite: teto };
  }

  if (!CATEGORIAS_COMPRA_DIRETA.has(categoria)) {
    return { destino: DESTINO_FINANCEIRO, motivo: 'categoria_fora_da_regra', limite: teto };
  }




  if (valorCotado === null || valorCotado === undefined || valorCotado === '') {
    return { destino: DESTINO_FINANCEIRO, motivo: 'sem_valor_cotado', limite: teto };
  }
  const valor = Number(valorCotado);
  if (!Number.isFinite(valor) || valor < 0) {
    return { destino: DESTINO_FINANCEIRO, motivo: 'valor_invalido', limite: teto };
  }

  if (valor > teto) {
    return { destino: DESTINO_FINANCEIRO, motivo: 'acima_do_limite', limite: teto };
  }

  return { destino: DESTINO_COMPRA_DIRETA, motivo: 'dentro_do_limite', limite: teto };
}


function dispensaFinanceiro(p) {
  return decidirDestinoCotacao(p).destino === DESTINO_COMPRA_DIRETA;
}


function motivoDispensaTexto(limite) {
  const teto = Number.isFinite(Number(limite)) && Number(limite) > 0
    ? Number(limite)
    : COMPRA_DIRETA_LIMITE;
  return `Compra de até R$ ${teto.toLocaleString('pt-BR')} · a logística executa sem aprovação financeira`;
}

module.exports = {
  COMPRA_DIRETA_LIMITE,
  CATEGORIAS_COMPRA_DIRETA,
  DESTINO_FINANCEIRO,
  DESTINO_COMPRA_DIRETA,
  decidirDestinoCotacao,
  dispensaFinanceiro,
  motivoDispensaTexto,
};

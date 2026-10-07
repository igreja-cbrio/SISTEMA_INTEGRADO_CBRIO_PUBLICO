














const ROTULO_FORMA = {
  pix: 'Pix',
  transferencia_bancaria: 'Transferência bancária',
  boleto: 'Boleto',
  dinheiro: 'Dinheiro',
};




const FORMAS_POR_CATEGORIA = {
  reembolso: ['pix', 'transferencia_bancaria', 'dinheiro'],
  pagamento: ['pix', 'transferencia_bancaria', 'boleto', 'dinheiro'],
  compras: ['pix', 'transferencia_bancaria', 'boleto', 'dinheiro'],
  servico: ['pix', 'transferencia_bancaria', 'boleto', 'dinheiro'],
};

const CATEGORIAS_PAGAS_PELO_FINANCEIRO = Object.keys(FORMAS_POR_CATEGORIA);




const CATEGORIAS_SO_CONCLUEM_PAGANDO = ['reembolso', 'pagamento'];


const PASTA_POR_CATEGORIA = {
  reembolso: 'reembolso',
  pagamento: 'pagamento',
  compras: 'compra',
  servico: 'compra',
};



function statusAposPagamento(categoria) {
  return CATEGORIAS_SO_CONCLUEM_PAGANDO.includes(categoria) ? 'concluido' : 'aguardando_entrega';
}

function formasDaCategoria(categoria) {
  return FORMAS_POR_CATEGORIA[categoria] || [];
}

function exigeComprovante(forma) {
  return !!forma && forma !== 'dinheiro';
}



function prontaParaPagar(sol) {
  if (!sol || sol.deleted_at) return { ok: false, motivo: 'nao_encontrada', erro: 'Solicitação não encontrada.' };
  if (!CATEGORIAS_PAGAS_PELO_FINANCEIRO.includes(sol.categoria)) {
    return { ok: false, motivo: 'categoria', erro: 'Esta categoria não é paga pelo financeiro.' };
  }
  if (sol.pago_em) return { ok: false, motivo: 'ja_pago', erro: 'O pagamento desta solicitação já foi registrado.' };
  if (sol.status !== 'em_atendimento' || sol.area_responsavel !== 'financeiro') {
    return { ok: false, motivo: 'status', erro: 'A solicitação não está na fila de pagamento do financeiro.' };
  }
  if (sol.precisa_aprovacao_financeira && !sol.aprovado_financeiro_em) {
    return { ok: false, motivo: 'sem_aprovacao', erro: 'A solicitação ainda não tem a aprovação financeira.' };
  }
  return { ok: true };
}




function validarConclusao({ categoria, forma, temArquivo, valorPagoCentavos, dataPagamento, hojeIso, executorId, solicitanteId }) {
  if (!formasDaCategoria(categoria).includes(forma)) {
    return { ok: false, campo: 'forma', erro: 'Escolha a forma de pagamento.' };
  }
  if (exigeComprovante(forma) && !temArquivo) {
    return { ok: false, campo: 'arquivo', erro: `Pagamento por ${ROTULO_FORMA[forma]} exige o comprovante anexado.` };
  }

  if (executorId && solicitanteId && executorId === solicitanteId) {
    return { ok: false, campo: 'executor', erro: 'Quem fez a solicitação não pode registrar o próprio pagamento.' };
  }
  if (valorPagoCentavos != null && (!Number.isInteger(valorPagoCentavos) || valorPagoCentavos <= 0)) {
    return { ok: false, campo: 'valor', erro: 'Valor pago inválido.' };
  }
  if (dataPagamento != null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento) || Number.isNaN(Date.parse(`${dataPagamento}T12:00:00Z`))) {
      return { ok: false, campo: 'data', erro: 'Data do pagamento inválida.' };
    }
    if (hojeIso && dataPagamento > hojeIso) {
      return { ok: false, campo: 'data', erro: 'A data do pagamento não pode ser no futuro.' };
    }
  }
  return { ok: true };
}



function reaisParaCentavos(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : NaN;
  const s = String(v).trim().replace(/[R$\s]/g, '');
  if (!s) return null;
  const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  if (!/^-?\d+(\.\d+)?$/.test(normal)) return NaN;
  return Math.round(Number(normal) * 100);
}



function divergeDaPreferencia(formaUsada, preferencia) {
  if (!formaUsada || !preferencia) return false;
  const pref = preferencia === 'transferencia' ? 'transferencia_bancaria' : preferencia;
  return pref !== formaUsada;
}

module.exports = {
  ROTULO_FORMA,
  FORMAS_POR_CATEGORIA,
  CATEGORIAS_PAGAS_PELO_FINANCEIRO,
  CATEGORIAS_SO_CONCLUEM_PAGANDO,
  PASTA_POR_CATEGORIA,
  statusAposPagamento,
  formasDaCategoria,
  exigeComprovante,
  prontaParaPagar,
  validarConclusao,
  reaisParaCentavos,
  divergeDaPreferencia,
};

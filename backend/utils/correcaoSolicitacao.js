


























const conclusaoPag = require('./conclusaoPagamento');

const STATUS_CORRIGIVEIS = ['concluido', 'avaliado', 'aguardando_entrega'];

const CAMPOS_TEXTO = ['titulo', 'descricao', 'justificativa', 'motivo_reembolso'];
const CAMPOS_PAGAMENTO = ['pagamento_forma', 'pagamento_data', 'pago_valor', 'pago_observacao'];
const CAMPOS_CORRIGIVEIS = [...CAMPOS_TEXTO, ...CAMPOS_PAGAMENTO];



const CAMPOS_TRAVADOS = [
  'favorecido_nome', 'favorecido_documento', 'chave_pix', 'banco', 'agencia', 'conta',
  'forma_pagamento', 'valor_estimado', 'valor_cotado', 'status', 'concluido_em', 'pago_em', 'pago_por',
];

const ROTULO_CAMPO = {
  titulo: 'título',
  descricao: 'descrição',
  justificativa: 'justificativa',
  motivo_reembolso: 'motivo do reembolso',
  pagamento_forma: 'forma de pagamento',
  pagamento_data: 'data do pagamento',
  pago_valor: 'valor pago',
  pago_observacao: 'observação do pagamento',
  comprovante: 'comprovante',
};

const MOTIVO_MIN = 10;








function temAutoridadeDeCorrecao({ role, superAdmin, finPerm, ehResponsavelFinanceiro }) {
  if (superAdmin === true) return true;
  if (['admin', 'diretor'].includes(role)) return true;
  if (ehResponsavelFinanceiro === true) return true;
  return Number(finPerm?.escrita) >= 3;
}


function categoriaNoEscopo(categoriasAutorizadas, categoria) {
  const lista = categoriasAutorizadas instanceof Set ? [...categoriasAutorizadas] : (categoriasAutorizadas || []);
  return lista.length === 0 || lista.includes(categoria);
}



function elegivelParaCorrecao(sol) {
  if (!sol || sol.deleted_at) return { ok: false, motivo: 'nao_encontrada', erro: 'Solicitação não encontrada.' };
  if (!conclusaoPag.CATEGORIAS_PAGAS_PELO_FINANCEIRO.includes(sol.categoria)) {
    return { ok: false, motivo: 'categoria', erro: 'Só solicitações pagas pelo financeiro podem ser corrigidas por aqui.' };
  }
  if (['rejeitado', 'cancelado'].includes(sol.status)) {
    return { ok: false, motivo: 'imutavel', erro: 'Solicitação rejeitada ou cancelada não muda. Abra uma nova.' };
  }
  if (!sol.pago_em) {
    return { ok: false, motivo: 'sem_pagamento', erro: 'A correção vale só depois que o pagamento foi registrado.' };
  }
  if (!STATUS_CORRIGIVEIS.includes(sol.status)) {
    return { ok: false, motivo: 'status', erro: 'Esta solicitação não está num estado que aceita correção.' };
  }
  return { ok: true };
}


function camposCorrigiveis(sol) {
  const lancada = !!sol?.fin_transacao_id;
  return CAMPOS_CORRIGIVEIS.filter((c) => {
    if (c === 'motivo_reembolso' && sol?.categoria !== 'reembolso') return false;
    if (lancada && (c === 'pago_valor' || c === 'pagamento_data')) return false;
    return true;
  });
}

function textoOuNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}


function dataReal(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function centavosDe(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}



function normalizarCampo(campo, bruto, sol, hojeIso) {
  if (CAMPOS_TEXTO.includes(campo) || campo === 'pago_observacao') {
    const novo = textoOuNull(bruto);
    if (campo === 'titulo' && !novo) return { erro: 'O título não pode ficar vazio.' };
    const limite = campo === 'titulo' ? 300 : 4000;
    const depois = novo ? novo.slice(0, limite) : null;
    const antes = textoOuNull(sol[campo]);
    return { antes, depois, valorBanco: depois, chaveComparacao: depois, chaveAtual: antes };
  }
  if (campo === 'pagamento_forma') {
    const forma = String(bruto || '').trim();
    if (!conclusaoPag.formasDaCategoria(sol.categoria).includes(forma)) {
      return { erro: 'Escolha uma forma de pagamento válida.' };
    }
    const antes = sol.pagamento_forma || null;
    return { antes, depois: forma, valorBanco: forma, chaveComparacao: forma, chaveAtual: antes };
  }
  if (campo === 'pagamento_data') {
    const d = String(bruto || '').trim();
    if (!dataReal(d)) return { erro: 'Data do pagamento inválida.' };
    if (hojeIso && d > hojeIso) return { erro: 'A data do pagamento não pode ser no futuro.' };
    const antes = sol.pagamento_data ? String(sol.pagamento_data).slice(0, 10) : null;
    return { antes, depois: d, valorBanco: d, chaveComparacao: d, chaveAtual: antes };
  }
  if (campo === 'pago_valor') {
    const cent = conclusaoPag.reaisParaCentavos(bruto);
    if (cent == null || !Number.isInteger(cent) || cent <= 0) return { erro: 'Valor pago inválido.' };
    const antesCent = centavosDe(sol.pago_valor);
    return {
      antes: antesCent != null ? antesCent / 100 : null,
      depois: cent / 100,
      valorBanco: cent / 100,
      chaveComparacao: cent,
      chaveAtual: antesCent,
    };
  }
  return { erro: 'Campo desconhecido.' };
}















function montarCorrecao({ sol, corpo, temArquivo, temComprovanteAtual, executorId, hojeIso }) {
  const eleg = elegivelParaCorrecao(sol);
  if (!eleg.ok) return { ok: false, campo: 'solicitacao', erro: eleg.erro, motivo: eleg.motivo };

  if (executorId && sol.solicitante_id && executorId === sol.solicitante_id) {
    return { ok: false, campo: 'executor', erro: 'Quem fez a solicitação não pode corrigir o próprio pagamento.' };
  }

  const c = corpo || {};
  for (const travado of CAMPOS_TRAVADOS) {
    if (c[travado] !== undefined) {
      return { ok: false, campo: travado, erro: 'Favorecido, dados bancários, valor aprovado e situação não mudam depois do pagamento. Registre a diferença na observação do pagamento.' };
    }
  }

  const motivo = String(c.motivo || '').trim();
  if (motivo.length < MOTIVO_MIN) {
    return { ok: false, campo: 'motivo', erro: `Explique o motivo da correção (mínimo ${MOTIVO_MIN} caracteres). Ele fica na linha do tempo.` };
  }

  const permitidos = camposCorrigiveis(sol);
  const campos = {};
  const alteracoes = {};

  for (const campo of CAMPOS_CORRIGIVEIS) {
    if (c[campo] === undefined) continue;
    const n = normalizarCampo(campo, c[campo], sol, hojeIso);
    if (n.erro) return { ok: false, campo, erro: n.erro };

    if (n.chaveComparacao === n.chaveAtual) continue;
    if (!permitidos.includes(campo)) {
      return {
        ok: false, campo,
        erro: (campo === 'pago_valor' || campo === 'pagamento_data')
          ? 'Esta solicitação já foi lançada no financeiro: valor e data do pagamento se corrigem no lançamento.'
          : 'Este campo não se aplica a esta solicitação.',
      };
    }
    campos[campo] = n.valorBanco;
    alteracoes[campo] = { antes: n.antes ?? null, depois: n.depois ?? null };
  }


  const formaFinal = campos.pagamento_forma || sol.pagamento_forma || null;
  if (conclusaoPag.exigeComprovante(formaFinal) && !temArquivo && !temComprovanteAtual) {
    return { ok: false, campo: 'arquivo', erro: `Pagamento por ${conclusaoPag.ROTULO_FORMA[formaFinal] || formaFinal} exige o comprovante anexado.` };
  }

  if (!Object.keys(campos).length && !temArquivo) {
    return { ok: false, campo: 'corpo', erro: 'Nada mudou: altere algum campo ou anexe o comprovante novo.' };
  }

  const rotulos = [...Object.keys(campos), ...(temArquivo ? ['comprovante'] : [])].map((k) => ROTULO_CAMPO[k] || k);
  return { ok: true, campos, alteracoes, rotulos, motivo };
}


function observacaoDoEvento({ rotulos, temArquivo, temComprovanteAtual }) {
  const campos = (rotulos || []).filter((r) => r !== ROTULO_CAMPO.comprovante);
  const partes = ['Correção depois do pagamento'];
  if (campos.length) partes.push(campos.join(', '));
  if (temArquivo) partes.push(temComprovanteAtual ? 'comprovante substituído' : 'comprovante anexado');
  return partes.join(' · ');
}

module.exports = {
  temAutoridadeDeCorrecao,
  categoriaNoEscopo,
  observacaoDoEvento,
  STATUS_CORRIGIVEIS,
  CAMPOS_CORRIGIVEIS,
  CAMPOS_TRAVADOS,
  ROTULO_CAMPO,
  MOTIVO_MIN,
  elegivelParaCorrecao,
  camposCorrigiveis,
  montarCorrecao,
};

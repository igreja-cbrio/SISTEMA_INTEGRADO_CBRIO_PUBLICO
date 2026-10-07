




























const MAX_NOME = 80;

const MAX_DESCRICAO_CURTA = 160;










function validarNome(valor) {
  if (valor === undefined) return { ok: true, nome: undefined };
  if (typeof valor !== 'string') return { ok: false, motivo: 'nome_invalido' };



  const t = valor.replace(/\s+/g, ' ').trim();
  if (!t) return { ok: false, motivo: 'nome_vazio' };
  if (t.length > MAX_NOME) return { ok: false, motivo: 'nome_longo' };
  return { ok: true, nome: t };
}


function validarDescricaoCurta(valor) {
  if (valor === undefined) return { ok: true, descricao_curta: undefined };
  if (valor === null) return { ok: true, descricao_curta: null };
  if (typeof valor !== 'string') return { ok: false, motivo: 'descricao_invalida' };
  const t = valor.replace(/\s+/g, ' ').trim();



  if (!t) return { ok: true, descricao_curta: null };
  if (t.length > MAX_DESCRICAO_CURTA) return { ok: false, motivo: 'descricao_longa' };
  return { ok: true, descricao_curta: t };
}

const MENSAGEM = {
  nome_invalido: 'O nome da campanha precisa ser um texto.',
  nome_vazio: 'Dê um nome à campanha.',
  nome_longo: `O nome cabe em até ${MAX_NOME} caracteres.`,
  descricao_invalida: 'A descrição precisa ser um texto.',
  descricao_longa: `A descrição curta cabe em até ${MAX_DESCRICAO_CURTA} caracteres.`,
};


function mensagemDoMotivo(motivo) {
  return MENSAGEM[motivo] || 'Não foi possível salvar.';
}

module.exports = {
  MAX_NOME,
  MAX_DESCRICAO_CURTA,
  validarNome,
  validarDescricaoCurta,
  mensagemDoMotivo,
};

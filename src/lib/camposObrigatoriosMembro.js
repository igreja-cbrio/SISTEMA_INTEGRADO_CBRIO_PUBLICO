



























export const CAMPOS_CRIACAO = ['nome', 'sobrenome', 'cpf', 'data_nascimento'];


export const CAMPOS_EDICAO = ['nome'];

export const ROTULO_CAMPO = {
  nome: 'Nome',
  sobrenome: 'Sobrenome',
  cpf: 'CPF',
  data_nascimento: 'Data de nascimento',
};


function vazio(v) {
  return v == null || String(v).trim() === '';
}








export function faltandoParaSalvar(form, opts = {}) {
  const exigidos = opts.edicao ? CAMPOS_EDICAO : CAMPOS_CRIACAO;
  const f = form || {};
  return exigidos.filter((k) => vazio(f[k]));
}


export function podeSalvar(form, opts = {}) {
  return faltandoParaSalvar(form, opts).length === 0;
}


export function frasePendencias(faltando) {
  const nomes = (faltando || []).map((k) => ROTULO_CAMPO[k] || k);
  if (!nomes.length) return '';
  if (nomes.length === 1) return `${nomes[0]} é obrigatório.`;
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]} são obrigatórios.`;
}





export function pendenciasInformativas(form) {
  return faltandoParaSalvar(form, { edicao: false }).filter((k) => !CAMPOS_EDICAO.includes(k));
}

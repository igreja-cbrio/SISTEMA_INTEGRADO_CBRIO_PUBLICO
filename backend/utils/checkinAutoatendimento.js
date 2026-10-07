






















const RE_DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;


function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }












function mascararNome(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0];
  const resto = partes.slice(1).map(p => `${p[0].toUpperCase()}.`).join(' ');
  return `${partes[0]} ${resto}`;
}










function validarEntrada({ cpf, nascimento } = {}) {
  const c = soDigitos(cpf);
  if (c.length !== 11) return { ok: false, motivo: 'cpf_incompleto' };
  if (!RE_DIA.test(String(nascimento || ''))) return { ok: false, motivo: 'nascimento_invalido' };
  return { ok: true, cpf: c, nascimento: String(nascimento) };
}















function escolherInscricao(candidatas, nascimento) {
  const lista = Array.isArray(candidatas) ? candidatas : [];
  const casam = lista.filter(i => i && i.data_nascimento && String(i.data_nascimento) === String(nascimento));
  if (casam.length === 0) return { situacao: 'nao_encontrada' };
  if (casam.length > 1) return { situacao: 'ambiguo' };
  return { situacao: 'ok', inscricao: casam[0] };
}








function resumoPublico(inscricao) {
  if (!inscricao) return null;
  return {
    id: inscricao.id,
    nome_mascarado: mascararNome(inscricao.nome_completo),
    ja_fez_checkin: !!inscricao.checkin_em,
  };
}










































function normalizarNomeChave(nome) {
  return String(nome || '')





    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')






    .replace(/[^\p{L}\p{N}]+/gu, ' ')

    .toLowerCase().replace(/\s+/g, ' ').trim();
}










function telefoneChave(telefone) {
  let d = soDigitos(telefone);


  if (d.length >= 12 && d.length <= 13 && d.startsWith('55')) d = d.slice(2);
  return d.length >= 8 ? d.slice(-8) : '';
}









function validarEntradaNome({ nome, telefone } = {}) {
  const n = normalizarNomeChave(nome);
  if (n.split(' ').filter(Boolean).length < 2) return { ok: false, motivo: 'nome_incompleto' };
  const d = soDigitos(telefone);
  const semDdi = (d.length >= 12 && d.length <= 13 && d.startsWith('55')) ? d.slice(2) : d;
  if (semDdi.length < 10 || semDdi.length > 11) return { ok: false, motivo: 'telefone_invalido' };
  return { ok: true, nome: n, telefone: semDdi };
}










function escolherPorNomeTelefone(candidatas, { nome, telefone }) {
  const chaveNome = normalizarNomeChave(nome);
  const chaveTel = telefoneChave(telefone);
  if (!chaveNome || !chaveTel) return { situacao: 'nao_encontrada' };
  const casam = (Array.isArray(candidatas) ? candidatas : []).filter(i =>
    i && normalizarNomeChave(i.nome_completo) === chaveNome
      && telefoneChave(i.telefone) === chaveTel);
  if (casam.length === 0) return { situacao: 'nao_encontrada' };
  if (casam.length > 1) return { situacao: 'ambiguo' };
  return { situacao: 'ok', inscricao: casam[0] };
}

module.exports = {
  soDigitos, mascararNome, validarEntrada, escolherInscricao, resumoPublico,
  normalizarNomeChave, telefoneChave, validarEntradaNome, escolherPorNomeTelefone,
};

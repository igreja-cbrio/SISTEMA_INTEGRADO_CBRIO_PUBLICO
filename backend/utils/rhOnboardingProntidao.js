







'use strict';

function vazio(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

function avaliarProntidaoFuncionario(func) {
  const faltando = [];
  if (vazio(func?.telefone)) faltando.push('telefone');
  if (vazio(func?.cpf)) faltando.push('cpf');
  if (vazio(func?.data_nascimento)) faltando.push('data_nascimento');
  if (vazio(func?.endereco)) faltando.push('endereco');
  return { completo: faltando.length === 0, faltando };
}

module.exports = { avaliarProntidaoFuncionario };

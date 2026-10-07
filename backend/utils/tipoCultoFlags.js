'use strict';


















































const FLAGS_BOOLEANAS = Object.freeze(['has_kids', 'has_online', 'has_online_stream']);







const DEFAULT_AO_CRIAR = Object.freeze({ has_online_stream: false });

const ehBooleanoReal = (v) => v === true || v === false;








function normalizarFlagsTipoCulto(body, opcoes) {
  const modo = opcoes && opcoes.modo;
  if (modo !== 'criar' && modo !== 'atualizar') {

    throw new Error("normalizarFlagsTipoCulto: modo tem que ser 'criar' ou 'atualizar'");
  }

  const origem = body && typeof body === 'object' ? body : {};
  const patch = {};

  for (const flag of FLAGS_BOOLEANAS) {
    const bruto = origem[flag];
    if (bruto === undefined) continue;
    if (!ehBooleanoReal(bruto)) {
      return {
        ok: false,
        campo: flag,
        erro: `${flag} tem que ser true ou false (recebi ${JSON.stringify(bruto)}).`,
      };
    }
    patch[flag] = bruto;
  }

  if (origem.presencial_label !== undefined) {
    const bruto = origem.presencial_label;
    if (typeof bruto !== 'string') {
      return {
        ok: false,
        campo: 'presencial_label',
        erro: `presencial_label tem que ser texto (recebi ${JSON.stringify(bruto)}).`,
      };
    }
    const limpo = bruto.trim();
    if (!limpo) {


      return {
        ok: false,
        campo: 'presencial_label',
        erro: 'presencial_label não pode ficar em branco.',
      };
    }
    patch.presencial_label = limpo;
  }

  if (modo === 'criar') {
    for (const chave of Object.keys(DEFAULT_AO_CRIAR)) {
      if (patch[chave] === undefined) patch[chave] = DEFAULT_AO_CRIAR[chave];
    }
  }

  return { ok: true, patch };
}

module.exports = { normalizarFlagsTipoCulto, FLAGS_BOOLEANAS, DEFAULT_AO_CRIAR };

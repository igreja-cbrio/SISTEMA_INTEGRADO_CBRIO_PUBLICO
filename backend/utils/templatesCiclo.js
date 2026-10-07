'use strict';









function escolherTemplates(daCategoria, padrao) {
  if (Array.isArray(daCategoria) && daCategoria.length > 0) {
    return { templates: daCategoria, origem: 'categoria' };
  }
  return { templates: Array.isArray(padrao) ? padrao : [], origem: 'padrao' };
}

module.exports = { escolherTemplates };

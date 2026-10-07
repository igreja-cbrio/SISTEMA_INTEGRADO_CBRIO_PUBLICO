















const { supabase } = require('../utils/supabase');
const { getEffectiveLevel } = require('../middleware/auth');
const { extractTerms } = require('./cerebroSearch');

const MAX_RESULTS_DEFAULT = 6;







function canReadRouteKey(req, routeKey) {
  if (!req || !req.user) return false;
  if (!routeKey) return true;
  if (['admin', 'diretor'].includes(req.user.role)) return true;
  return getEffectiveLevel(req, routeKey) >= 1;
}






function buildTsQuery(query) {
  const terms = extractTerms(query);
  if (!terms.length) return null;
  return terms.join(' | ');
}








async function searchConhecimento(query, req, limit = MAX_RESULTS_DEFAULT) {
  const tsQuery = buildTsQuery(query);
  if (!tsQuery) return [];

  try {
    const { data, error } = await supabase
      .from('cerebro_conhecimento')
      .select('titulo, secao, conteudo, fonte, tags, route_key')
      .eq('ativo', true)
      .textSearch('tsv', tsQuery, { config: 'portuguese' })
      .limit(limit * 3);

    if (error) throw error;

    const results = [];
    for (const row of data || []) {
      if (!canReadRouteKey(req, row.route_key)) continue;
      results.push({
        titulo: row.titulo,
        secao: row.secao || null,
        conteudo: row.conteudo,
        fonte: row.fonte,
        tags: row.tags || [],
      });
      if (results.length >= limit) break;
    }
    return results;
  } catch (e) {
    console.warn('[CONHECIMENTO] busca falhou:', e.message);
    return [];
  }
}

module.exports = { searchConhecimento };

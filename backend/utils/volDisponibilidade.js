





























function diaBRT(quando) {
  if (!quando) return null;
  const d = quando instanceof Date ? quando : new Date(quando);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}








function avaliarIndisponibilidade(alvo = {}, linhas = []) {
  const { serviceId, dia } = alvo;
  const lista = Array.isArray(linhas) ? linhas : [];



  for (const l of lista) {
    if (l && l.service_id && serviceId && l.service_id === serviceId) {
      return { indisponivel: true, origem: 'culto', motivo: l.reason || null };
    }
  }




  if (dia) {
    for (const l of lista) {
      if (!l || l.service_id) continue;
      const de = l.unavailable_from;
      const ate = l.unavailable_to;
      if (!de || !ate) continue;

      if (de <= dia && dia <= ate) {
        return { indisponivel: true, origem: 'periodo', motivo: l.reason || null };
      }
    }
  }

  return { indisponivel: false, origem: null, motivo: null };
}


function textoIndisponibilidade({ origem, motivo } = {}) {
  if (!origem) return null;
  const base = origem === 'culto'
    ? 'marcou que não pode neste culto'
    : 'está com ausência registrada nesta data';
  return motivo ? `${base} (${motivo})` : base;
}








function indexarPorPessoa(linhas = []) {
  const mapa = new Map();
  const add = (k, l) => {
    if (!k) return;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(l);
  };
  for (const l of Array.isArray(linhas) ? linhas : []) {
    if (!l) continue;
    add(l.volunteer_profile_id, l);
    add(l.planning_center_person_id, l);
  }
  return mapa;
}

















const CONTAS_SISTEMA = /^(adm|admin|administra(c|ç)(a|ã)o|teste|test|totem|sistema|suporte)\b/i;

function ehPessoaEscalavel(nome) {
  const n = String(nome || '').trim();
  if (n.length < 2) return false;

  const letras = n.replace(/[^\p{L}]/gu, '');
  if (letras.length < 2) return false;
  if (CONTAS_SISTEMA.test(n)) return false;
  if (/^contribuinte\b/i.test(n)) return false;
  return true;
}

module.exports = {
  diaBRT,
  avaliarIndisponibilidade,
  textoIndisponibilidade,
  indexarPorPessoa,
  ehPessoaEscalavel,
};

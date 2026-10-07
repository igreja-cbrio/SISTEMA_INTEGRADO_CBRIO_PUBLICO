



















const { supabase } = require('../utils/supabase');
const { escapePostgrestValue } = require('../utils/sanitize');
const { sexoPara } = require('../utils/dadosDoCadastro');
const { nomeEhVersaoAbreviada } = require('./duplicidadePolicy');
const {
  normalizarCpf, normalizarTelefone, normalizarEmail, nomeNormalizado: normalizarNome,
  registrarObservacaoIdentidade,
} = require('./identidadeProgressiva');

const COLS = 'id, nome, email, telefone, cpf, data_nascimento, status, foto_url, familia_id';


const PESO = { cpf: 100, telefone: 90, email: 85 };

async function _observar(membroId, entrada, matchedBy, created) {
  try {
    await registrarObservacaoIdentidade({
      membroId,
      origem: entrada.origem || 'matcher',
      origemId: entrada.origemId || null,
      nome: entrada.nome,
      cpf: entrada.cpf,
      telefone: entrada.telefone,
      email: entrada.email,
      dataNascimento: entrada.dataNascimento || entrada.extra?.data_nascimento || null,
      dados: { matched_by: matchedBy || null, created: !!created },
    });
  } catch (error) {


    console.error('[membroMatch] evidência de identidade não registrada:', error.message);
  }
}






function _registrarContatoNoMatch(membroId, { telefone, email } = {}, fonte) {
  if (!membroId || (!telefone && !email)) return;
  supabase.rpc('fn_registrar_contato', {
    p_membro_id: membroId,
    p_telefone: telefone || null,
    p_email: email || null,
    p_fonte: fonte || 'porta',
  }).then(({ error }) => {
    if (error && !/fn_registrar_contato/.test(error.message || '')) {
      console.warn('[membroMatch] contato não registrado:', error.message);
    }
  });
}





async function _candidatosPorContatoSecundario({ email, telefone } = {}) {
  const em = normalizarEmail(email);
  const tel = normalizarTelefone(telefone);
  const hits = new Map();
  if (!em && !tel) return hits;
  try {
    const ors = [];
    if (tel) ors.push(`and(tipo.eq.telefone,valor.eq.${tel})`);
    if (em) ors.push(`and(tipo.eq.email,valor.eq.${escapePostgrestValue(em)})`);
    const { data, error } = await supabase
      .from('mem_contatos')
      .select('membro_id, tipo')
      .or(ors.join(','))
      .is('deleted_at', null)
      .limit(30);
    if (error) return hits;
    for (const c of data || []) {
      if (!hits.has(c.membro_id)) hits.set(c.membro_id, new Set());
      hits.get(c.membro_id).add(c.tipo);
    }
  } catch {                                                 }
  return hits;
}















function telefoneComparavel(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length >= 12 && d.length <= 13 && d.startsWith('55')) return d.slice(2);
  return d.length >= 10 ? d : null;
}





async function buscarCandidatos({ cpf, email, telefone } = {}, { limit = 5 } = {}) {
  const c = normalizarCpf(cpf);
  const em = normalizarEmail(email);
  const tel = normalizarTelefone(telefone);

  const telCmp = telefoneComparavel(telefone);

  const base = [];
  if (c) base.push(`cpf.eq.${c}`);
  if (em) base.push(`email.ilike.${escapePostgrestValue(em)}`);
  if (base.length === 0 && !telCmp && !tel) return [];

  const consulta = (ors) => supabase
    .from('mem_membros')
    .select(COLS)
    .or(ors.join(','))
    .is('deleted_at', null)
    .limit(Math.max(limit, 5) * 2);





  const orsNovo = [...base, ...(telCmp ? [`telefone_digits.eq.${telCmp}`] : [])];
  const orsAntigo = [...base, ...(tel ? [`telefone.ilike.%${tel}%`] : [])];



  const [primeira, secundarios] = await Promise.all([
    orsNovo.length ? consulta(orsNovo) : Promise.resolve({ data: [], error: null }),
    _candidatosPorContatoSecundario({ email, telefone }),
  ]);
  let resultado = primeira;
  if (resultado.error && /telefone_digits/.test(String(resultado.error.message || ''))) {
    console.warn('[membroMatch] telefone_digits ausente (migration 20260817160000 não aplicada) — a busca por telefone caiu no ilike, que é cego a número mascarado');
    resultado = orsAntigo.length ? await consulta(orsAntigo) : { data: [], error: null };
  }
  const { data, error } = resultado;
  if (error) throw error;

  let rows = data || [];
  const jaTem = new Set(rows.map((m) => m.id));
  const idsExtras = [...secundarios.keys()].filter((id) => !jaTem.has(id));
  if (idsExtras.length) {
    const { data: extras } = await supabase
      .from('mem_membros')
      .select(COLS)
      .in('id', idsExtras.slice(0, 20))
      .is('deleted_at', null);
    rows = rows.concat(extras || []);
  }

  return rows
    .map((m) => {
      const motivos = [];
      const sec = secundarios.get(m.id);
      if (c && normalizarCpf(m.cpf) === c) motivos.push('cpf');
      if (tel && (normalizarTelefone(m.telefone) === tel || sec?.has('telefone'))) motivos.push('telefone');
      if (em && (normalizarEmail(m.email) === em || sec?.has('email'))) motivos.push('email');
      const score = motivos.reduce((s, k) => Math.max(s, PESO[k] || 0), 0);
      return { ...m, motivos, score };
    })
    .filter((m) => m.motivos.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}




async function acharOuCriar(entrada = {}) {


  return acharOuCriarGuardado(entrada);
}


function _bigrams(s) {
  const m = new Map();
  for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); }
  return m;
}
function _dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ba = _bigrams(a), bb = _bigrams(b);
  let inter = 0, ta = 0, tb = 0;
  for (const v of ba.values()) ta += v;
  for (const [g, v] of bb) { tb += v; if (ba.has(g)) inter += Math.min(v, ba.get(g)); }
  return ta + tb === 0 ? 0 : (2 * inter) / (ta + tb);
}


function nomesMesmaPessoa(a, b) {
  const x = normalizarNome(a), y = normalizarNome(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return _dice(x, y) >= 0.90;
}



















function nomeAutorizaLigar(a, b) {
  return nomesMesmaPessoa(a, b) || nomeEhVersaoAbreviada(a, b);
}






function ehNomePlaceholder(nome) {
  return /^contribuinte\b/i.test(String(nome || '').trim());
}










function ehNomeDerivadoDeEmail(nome, email) {
  const n = String(nome || '').trim();
  const em = String(email || '').trim();
  if (!n || !em || !em.includes('@')) return false;
  const prefixo = em.split('@')[0];
  if (!prefixo) return false;
  const norm = (v) => String(v).toLowerCase().replace(/[\s._-]+/g, '');


  if (norm(n) === norm(prefixo)) return true;
  return /@privaterelay\.appleid\.com$/i.test(em) && norm(n) === norm(prefixo);
}









function nomeEhEnderecoDeEmail(nome) {
  const n = String(nome || '').trim();
  if (!n || /\s/.test(n)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(n);
}













async function _consolidarCpfNoMatch(membroId, cpf11, matchedBy, dataNascimento) {
  if (!cpf11) return;
  try {
    const { reconciliarCpfTardio } = require('./cpfReconciliar');
    await reconciliarCpfTardio({
      membroId, cpf: cpf11, origem: `matcher:${matchedBy}`, dataNascimento,
      confianca: matchedBy === 'nome+nascimento' ? 'forte' : 'fraca',
    });
  } catch (e) {
    console.error('[membroMatch] consolidar cpf pós-match:', e.message);
  }
}










async function acharOuCriarGuardado({ cpf, email, telefone, nome, dataNascimento, genero, status = 'visitante', extra = {}, origem = 'matcher', origemId = null } = {}, { soChaveForte = false, permitirMatchPerfeito = false } = {}) {
  const entrada = { cpf, email, telefone, nome, dataNascimento, genero, status, extra, origem, origemId };
  const cpf11 = normalizarCpf(cpf);
  const emailLc = normalizarEmail(email);
  const tel = normalizarTelefone(telefone);
  const nasc = dataNascimento || extra.data_nascimento || null;





  const generoCanon = sexoPara('membro', genero) || sexoPara('membro', extra.genero) || null;



  const candidatoCompativel = (c) => nomeAutorizaLigar(c.nome, nome)
    && (!cpf11 || (!!nasc && !!c.data_nascimento && nasc === c.data_nascimento));

  if (cpf11) {
    const { data } = await supabase.from('mem_membros').select('id, nome')
      .eq('cpf', cpf11).is('deleted_at', null).maybeSingle();
    if (data?.id) {




      if (ehNomePlaceholder(data.nome) && nome && String(nome).trim().length >= 3 && !ehNomePlaceholder(nome)) {
        const { error: eNome } = await supabase.from('mem_membros')
          .update({ nome: String(nome).trim() }).eq('id', data.id);
        if (!eNome) console.log(`[membroMatch] placeholder renomeado via ${origem}: ${data.nome} -> ${String(nome).trim()} (${data.id})`);
      }
      _registrarContatoNoMatch(data.id, { telefone: tel, email: emailLc }, 'porta');
      await _observar(data.id, entrada, 'cpf', false);
      return { membro_id: data.id, created: false, matched_by: 'cpf' };
    }
  }
  if (!soChaveForte && emailLc && nome) {





    const cands = await buscarCandidatos({ email: emailLc }, { limit: 8 });
    const hit = cands.find(candidatoCompativel);
    if (hit?.id) {
      await _consolidarCpfNoMatch(hit.id, cpf11, 'email', nasc);
      _registrarContatoNoMatch(hit.id, { telefone: tel, email: emailLc }, 'porta');
      await _observar(hit.id, entrada, 'email+nome', false);
      return { membro_id: hit.id, created: false, matched_by: 'email' };
    }
  }
  if (soChaveForte) {

  } else if (tel && nome) {
    const cands = await buscarCandidatos({ telefone }, { limit: 8 });
    const hit = cands.find(candidatoCompativel);
    if (hit) {
      await _consolidarCpfNoMatch(hit.id, cpf11, 'telefone+nome', nasc);
      _registrarContatoNoMatch(hit.id, { telefone: tel, email: emailLc }, 'porta');
      await _observar(hit.id, entrada, 'telefone+nome', false);
      return { membro_id: hit.id, created: false, matched_by: 'telefone+nome' };
    }
  }



  if (!soChaveForte && nasc && nome) {
    const { data } = await supabase.from('mem_membros')
      .select('id, nome').eq('data_nascimento', nasc).is('deleted_at', null).limit(30);
    const hit = (data || []).find((c) => nomesMesmaPessoa(c.nome, nome));
    if (hit) {
      await _consolidarCpfNoMatch(hit.id, cpf11, 'nome+nascimento', nasc);
      _registrarContatoNoMatch(hit.id, { telefone: tel, email: emailLc }, 'porta');
      await _observar(hit.id, entrada, 'nome+nascimento', false);
      return { membro_id: hit.id, created: false, matched_by: 'nome+nascimento' };
    }
  }





























  if (soChaveForte && permitirMatchPerfeito && nasc && nome) {
    const alvo = normalizarNome(nome);
    const { data: cands } = await supabase.from('mem_membros')
      .select('id, nome, cpf').eq('data_nascimento', nasc).is('deleted_at', null).limit(30);
    const perfeitos = (cands || []).filter((c) => {
      if (normalizarNome(c.nome) !== alvo) return false;
      const cCpf = normalizarCpf(c.cpf);
      if (cpf11 && cCpf && cpf11 !== cCpf) return false;
      return true;
    });
    if (perfeitos.length === 1) {
      const hit = perfeitos[0];
      await _consolidarCpfNoMatch(hit.id, cpf11, 'nome+nascimento', nasc);
      _registrarContatoNoMatch(hit.id, { telefone: tel, email: emailLc }, 'porta');
      await _observar(hit.id, entrada, 'nome+nascimento_exato', false);
      return { membro_id: hit.id, created: false, matched_by: 'nome+nascimento_exato' };
    }
    if (perfeitos.length > 1) {
      console.log(`[membroMatch] match perfeito AMBÍGUO em ${origem}: ${perfeitos.length} cadastros com "${nome}" e ${nasc} — criando e deixando pra fila`);
    }
  }






  const origemSlug = String(origem || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const origemCadastro = extra.origem_cadastro
    || (origemSlug && origemSlug !== 'matcher' ? origemSlug.slice(0, 60) : null);























  const { data, error } = await supabase.from('mem_membros').insert({
    ...extra,
    nome: nome || 'Sem nome',
    email: emailLc || null,
    telefone: tel || null,
    cpf: cpf11,
    status,
    active: true,
    ...(nasc ? { data_nascimento: nasc } : {}),
    ...(generoCanon ? { genero: generoCanon } : {}),
    ...(origemCadastro ? { origem_cadastro: origemCadastro } : {}),
  }).select('id').single();
  if (error) {


    if (error.code === '23505' && cpf11) {
      const { data: d2 } = await supabase.from('mem_membros')
        .select('id').eq('cpf', cpf11).is('deleted_at', null).maybeSingle();
      if (d2?.id) {
        await _observar(d2.id, entrada, 'cpf', false);
        return { membro_id: d2.id, created: false, matched_by: 'cpf' };
      }
    }
    throw error;
  }
  await _observar(data.id, entrada, null, true);
  return { membro_id: data.id, created: true, matched_by: null };
}











async function acharMembroGuardado({ cpf, email, telefone, nome, dataNascimento } = {}, { soChaveForte = false } = {}) {
  const cpf11 = normalizarCpf(cpf);
  const emailLc = normalizarEmail(email);
  const tel = normalizarTelefone(telefone);
  const nasc = dataNascimento || null;
  const candidatoCompativel = (c) => nomeAutorizaLigar(c.nome, nome)
    && (!cpf11 || (!!nasc && !!c.data_nascimento && nasc === c.data_nascimento));

  if (cpf11) {
    const { data } = await supabase.from('mem_membros').select('id')
      .eq('cpf', cpf11).is('deleted_at', null).maybeSingle();
    if (data?.id) return { membro_id: data.id, matched_by: 'cpf' };
  }
  if (soChaveForte) return null;
  if (emailLc && nome) {



    const cands = await buscarCandidatos({ email: emailLc }, { limit: 8 });
    const hit = cands.find(candidatoCompativel);
    if (hit?.id) return { membro_id: hit.id, matched_by: 'email' };
  }
  if (tel && nome) {
    const cands = await buscarCandidatos({ telefone }, { limit: 8 });
    const hit = cands.find(candidatoCompativel);
    if (hit) return { membro_id: hit.id, matched_by: 'telefone+nome' };
  }
  if (nasc && nome) {
    const { data } = await supabase.from('mem_membros')
      .select('id, nome').eq('data_nascimento', nasc).is('deleted_at', null).limit(30);
    const hit = (data || []).find((c) => nomesMesmaPessoa(c.nome, nome));
    if (hit) return { membro_id: hit.id, matched_by: 'nome+nascimento' };
  }
  return null;
}

module.exports = {
  normalizarCpf,
  normalizarTelefone,
  normalizarEmail,
  normalizarNome,
  nomesMesmaPessoa,
  ehNomePlaceholder,
  ehNomeDerivadoDeEmail,
  nomeEhEnderecoDeEmail,
  buscarCandidatos,
  acharOuCriar,
  acharOuCriarGuardado,
  acharMembroGuardado,




  registrarContatoDaPorta: _registrarContatoNoMatch,
};

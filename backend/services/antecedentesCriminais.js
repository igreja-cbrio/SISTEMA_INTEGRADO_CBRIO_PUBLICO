















const { supabase } = require('../utils/supabase');



const INFOSIMPLES_URL =
  process.env.INFOSIMPLES_ANTECEDENTES_URL ||
  'https://api.infosimples.com/api/v2/consultas/antecedentes-criminais/pf/emit';
const TIMEOUT_MS = Number(process.env.INFOSIMPLES_TIMEOUT_MS || 60000);

function isConfigured() {
  return !!process.env.INFOSIMPLES_API_TOKEN;
}


function isoDate(d) {
  if (!d) return null;
  return String(d).slice(0, 10);
}





async function consultarInfosimplesPF({ nome, cpf, nome_mae, nome_pai, data_nascimento, uf_nascimento }) {
  if (!isConfigured()) {
    return { ok: false, status: 'pendente', erro: 'INFOSIMPLES_API_TOKEN ausente' };
  }




  const apiTimeoutSec = Math.max(30, Math.floor(TIMEOUT_MS / 1000) - 10);
  const body = new URLSearchParams({
    token: process.env.INFOSIMPLES_API_TOKEN,
    nome: nome || '',
    birthdate: isoDate(data_nascimento) || '',
    cpf: (cpf || '').replace(/\D+/g, ''),
    nome_mae: nome_mae || '',
    nome_pai: nome_pai || '',
    uf_nascimento: uf_nascimento || '',
    timeout: String(apiTimeoutSec),
  });

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let json;
  try {
    const resp = await fetch(INFOSIMPLES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      signal: ctrl.signal,
    });
    json = await resp.json().catch(() => ({ code: resp.status, code_message: 'Resposta não-JSON do provedor' }));
  } catch (e) {
    clearTimeout(t);
    return { ok: false, status: 'erro', erro: e.name === 'AbortError' ? 'Tempo de consulta excedido' : e.message };
  }
  clearTimeout(t);


  const code = Number(json?.code);
  const receipt = Array.isArray(json?.site_receipts) ? json.site_receipts[0] : null;






  if (code === 606 || code === 607 || code === 608) {
    const detalhe = Array.isArray(json?.errors) && json.errors[0] ? String(json.errors[0]) : null;
    const base = code === 608
      ? (detalhe || 'Os dados não conferem com o CPF informado')
      : (detalhe || 'A fonte recusou os dados informados (verifique CPF, data de nascimento e nome da mãe)');
    return {
      ok: false,
      status: 'erro',
      certidaoUrl: receipt || null,
      raw: json,
      erro: `${base} — confira/corrija em "Editar dados" e refaça a consulta, ou faça a triagem manual.`,
    };
  }

  if (code !== 200) {



    const detalhe = Array.isArray(json?.errors) && json.errors[0] ? String(json.errors[0]) : null;
    return {
      ok: false,
      status: 'erro',
      certidaoUrl: receipt || null,
      raw: json,
      erro: detalhe || json?.code_message || `Falha na consulta (code ${code || '??'})`,
    };
  }

  const d = Array.isArray(json?.data) ? (json.data[0] || {}) : {};

  let negativa = d.conseguiu_emitir_certidao_negativa;
  if (typeof negativa !== 'boolean') {

    const blob = JSON.stringify(d || {}).toLowerCase() + ' ' + String(json?.code_message || '').toLowerCase();
    if (/nada consta|n[aã]o consta|sem registro|negativa/.test(blob)) negativa = true;
    else negativa = null;
  }

  if (negativa === true) {
    return { ok: true, resultado: 'nada_consta', status: 'nada_consta', certidaoUrl: receipt || null, raw: json };
  }

  return { ok: true, resultado: 'indeterminado', status: 'possivel_registro', certidaoUrl: receipt || null, raw: json };
}






async function criarCheckParaInscricao(inscricao, { consentimento = false, origem = null } = {}) {
  if (!inscricao?.id) return null;
  const area = String(inscricao.area || '').toLowerCase();
  if (area !== 'kids' && area !== 'bridge') return null;

  const { data: existente } = await supabase
    .from('vol_background_checks')
    .select('id, status, consentimento')
    .eq('inscricao_id', inscricao.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existente) {

    if (consentimento && !existente.consentimento) {
      await supabase.from('vol_background_checks')
        .update({
          consentimento: true,
          consentimento_em: new Date().toISOString(),
          consentimento_origem: origem,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existente.id);
    }
    return existente;
  }

  const { data, error } = await supabase
    .from('vol_background_checks')
    .insert({
      inscricao_id: inscricao.id,
      membro_id: inscricao.membro_id || null,
      area,
      nome_completo: inscricao.nome_completo || [inscricao.nome, inscricao.sobrenome].filter(Boolean).join(' '),
      cpf: inscricao.cpf || null,
      nome_mae: inscricao.nome_mae || null,
      data_nascimento: inscricao.data_nascimento || null,
      consentimento: !!consentimento,
      consentimento_em: consentimento ? new Date().toISOString() : null,
      consentimento_origem: origem,
      status: 'pendente',
      fonte: 'infosimples_pf',
    })
    .select('id, status, consentimento')
    .single();
  if (error) {
    console.error('[antecedentes] criarCheck:', error.message);
    return null;
  }
  return data;
}





async function processarCheck(checkId) {
  const { data: chk, error } = await supabase
    .from('vol_background_checks')
    .select('*')
    .eq('id', checkId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error || !chk) return { ok: false, erro: 'Triagem não encontrada' };

  if (!chk.consentimento) {
    return { ok: false, status: chk.status, erro: 'Sem consentimento do voluntário pra consulta de antecedentes' };
  }
  if (!isConfigured()) {
    return { ok: false, status: chk.status, erro: 'Consulta automática indisponível (token não configurado) — faça a triagem manual' };
  }

  await supabase.from('vol_background_checks')
    .update({ status: 'consultando', consulta_em: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', checkId);

  const r = await consultarInfosimplesPF({
    nome: chk.nome_completo,
    cpf: chk.cpf,
    nome_mae: chk.nome_mae,
    nome_pai: chk.nome_pai,
    data_nascimento: chk.data_nascimento,
    uf_nascimento: chk.uf_nascimento,
  });

  const patch = {
    status: r.status,
    resultado: r.resultado || null,
    certidao_url: r.certidaoUrl || null,
    consulta_raw: r.raw || null,
    consulta_erro: r.erro || null,
    consulta_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await supabase.from('vol_background_checks').update(patch).eq('id', checkId);


  if (r.status === 'possivel_registro' || r.status === 'erro') {
    try {
      const { notificar } = require('./notificar');
      const nomeMasc = (chk.nome_completo || 'Voluntário').split(' ')[0];
      await notificar({
        modulo: 'voluntariado',
        tipo: 'antecedentes_revisar',
        titulo: r.status === 'possivel_registro'
          ? 'Antecedentes: conferência necessária'
          : 'Antecedentes: falha na consulta',
        mensagem: r.status === 'possivel_registro'
          ? `A consulta de antecedentes de ${nomeMasc} (${chk.area}) não emitiu certidão negativa. Confira manualmente antes de integrar.`
          : `A consulta automática de antecedentes de ${nomeMasc} (${chk.area}) falhou. Refaça ou faça a triagem manual.`,
        link: '/ministerial/voluntariado/inscricoes',
        severidade: r.status === 'possivel_registro' ? 'alta' : 'media',
        chaveDedup: `antecedentes_${chk.id}_${r.status}`,
      });
    } catch (e) {
      console.warn('[antecedentes] notificar:', e.message);
    }
  }

  return { ok: r.ok, status: r.status, erro: r.erro || null };
}




async function processarPendentes({ limite = 25 } = {}) {
  if (!isConfigured()) return { processadas: 0, motivo: 'token ausente' };
  const staleIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: rows } = await supabase
    .from('vol_background_checks')
    .select('id')
    .is('deleted_at', null)
    .eq('consentimento', true)
    .or(`status.eq.pendente,and(status.eq.consultando,consulta_em.lt.${staleIso})`)
    .order('created_at', { ascending: true })
    .limit(limite);

  let processadas = 0;
  for (const r of rows || []) {
    try {
      await processarCheck(r.id);
      processadas += 1;
    } catch (e) {
      console.warn('[antecedentes] cron item:', e.message);
    }
  }
  return { processadas };
}


const STATUS_LIBERADOS = new Set(['nada_consta', 'aprovado_manual', 'dispensado']);

module.exports = {
  isConfigured,
  consultarInfosimplesPF,
  criarCheckParaInscricao,
  processarCheck,
  processarPendentes,
  STATUS_LIBERADOS,
};

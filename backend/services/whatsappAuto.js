







const { supabase } = require('../utils/supabase');

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}


function render(msg, nome) {
  const pn = primeiroNome(nome) || 'tudo bem';
  return String(msg || '').replace(/\{nome\}/gi, pn).trim();
}

async function getConfig(chave) {
  const { data } = await supabase
    .from('whatsapp_auto_config').select('*').eq('chave', chave).maybeSingle();
  return data || null;
}

function soDigitos(t) { return String(t || '').replace(/\D/g, ''); }


function normalizarBR(raw) {
  const d = soDigitos(raw);
  if (!d) return '';
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  if (d.length === 10 || d.length === 11) return '55' + d;
  return d;
}


async function enviarPorConfig(cfg, telefone, nome) {


  const { flexionarPorNome } = require('./generoNome');
  const texto = await flexionarPorNome(render(cfg.mensagem, nome), nome);
  if (cfg.modo === 'texto') {
    const { enviarTexto } = require('./whatsappSend');
    const r = await enviarTexto(telefone, texto);
    return { sent: !!r.ok, message_id: r.message_id || null, erro: r.ok ? null : (r.error || 'erro') };
  }


  if (!cfg.template_nome) return { sent: false, message_id: null, erro: 'template_nao_configurado' };
  const { enfileirar } = require('./whatsappFila');
  const params = cfg.usa_nome
    ? [primeiroNome(nome) || 'tudo bem', texto]
    : [texto];
  const r = await enfileirar({
    telefone, template: cfg.template_nome, params, idioma: cfg.idioma || 'pt_BR',
    contexto: `auto.${cfg.chave || 'config'}`,
  });
  return { sent: !!r.sent, message_id: r.messageId || null, erro: r.sent ? null : (r.queued ? 'na_fila' : (r.reason || 'erro')) };
}

async function registrar(chave, { refId, telefone, nome, origem, status, message_id, erro }) {
  try {
    await supabase.from('whatsapp_auto_envios').insert({
      chave, ref_id: refId || null, telefone: telefone || null, nome: nome || null,
      origem: origem || null, status, message_id: message_id || null, erro: erro || null,
    });
  } catch (e) {

    if (!String(e.message || '').includes('duplicate')) console.warn('[whatsappAuto] log:', e.message);
  }
}



async function dispararAuto(chave, opts = {}) {
  try {
    const cfg = await getConfig(chave);
    if (!cfg || !cfg.ativo) return { sent: false, reason: 'desabilitado' };

    const tel = normalizarBR(opts.telefone);
    if (!tel) {
      await registrar(chave, { ...opts, telefone: null, status: 'sem_telefone' });
      return { sent: false, reason: 'sem_telefone' };
    }


    if (opts.refId) {
      const { data: ja } = await supabase
        .from('whatsapp_auto_envios').select('id')
        .eq('chave', chave).eq('ref_id', opts.refId).eq('status', 'enviado').maybeSingle();
      if (ja) return { sent: false, reason: 'ja_enviado' };
    }

    const r = await enviarPorConfig(cfg, tel, opts.nome);
    await registrar(chave, {
      refId: opts.refId, telefone: tel, nome: opts.nome, origem: opts.origem,
      status: r.sent ? 'enviado' : 'erro', message_id: r.message_id, erro: r.erro,
    });
    return r;
  } catch (e) {
    console.warn(`[whatsappAuto:${chave}]`, e.message);
    return { sent: false, reason: 'exception', erro: e.message };
  }
}


async function enviarTeste(chave, telefone, nome) {
  const cfg = await getConfig(chave);
  if (!cfg) return { sent: false, erro: 'sem_config' };
  const tel = normalizarBR(telefone);
  if (!tel) return { sent: false, erro: 'sem_telefone' };
  const r = await enviarPorConfig(cfg, tel, nome || 'Fulano de Tal');
  await registrar(chave, {
    refId: null, telefone: tel, nome: nome || '(teste)', origem: 'teste',
    status: r.sent ? 'enviado' : 'erro', message_id: r.message_id, erro: r.erro,
  });
  return r;
}

module.exports = { dispararAuto, enviarTeste, getConfig, render };

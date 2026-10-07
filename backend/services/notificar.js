const { supabase } = require('../utils/supabase');
const { enviarPushParaUsers } = require('./webpush');
const { pushExpoParaUsers } = require('./appPush');
const { enviarEmail, isConfigured: emailConfigurado } = require('./email');

function escapeHtmlNotif(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}




async function enviarEmailNotificacao(userIds, { titulo, mensagem, link, emailsExtra }) {
  const extra = (emailsExtra || []).filter(e => e && /@/.test(e));
  if (!emailConfigurado() || (!userIds?.length && !extra.length)) return;
  try {
    let emailsProfiles = [];
    if (userIds?.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('email')
        .in('id', userIds);
      emailsProfiles = (profs || []).map(p => p.email);
    }

    const tos = [...new Set([...emailsProfiles, ...extra].filter(e => e && /@/.test(e)))];
    if (!tos.length) return;
    const base = process.env.FRONTEND_URL || '';
    const url = link ? (/^https?:\/\//.test(link) ? link : base + link) : base;
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.5;max-width:600px">
        <p style="margin:0 0 10px"><strong>${escapeHtmlNotif(titulo)}</strong></p>
        <p style="margin:0 0 16px">${escapeHtmlNotif(mensagem || '')}</p>
        ${url ? `<p style="margin:0 0 16px"><a href="${escapeHtmlNotif(url)}" style="background:#00B39D;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none;display:inline-block">Abrir no sistema</a></p>` : ''}
        <p style="margin:0;color:#999;font-size:12px">Mensagem automática do sistema CBRio.</p>
      </div>`;
    const r = await enviarEmail({
      to: tos,
      subject: titulo,
      html,
      text: `${titulo}\n\n${mensagem || ''}${url ? `\n\n${url}` : ''}`,
    });
    if (!r?.ok) console.warn('[notificar email] falhou:', r?.error);
  } catch (e) {
    console.warn('[notificar email] exceção:', e.message);
  }
}






async function resolverDestinatarios(modulo, tipo = null) {














  let regras = null;
  const comTipo = await supabase
    .from('notificacao_regras')
    .select('profile_id, tipo')
    .eq('modulo', modulo)
    .eq('ativo', true);

  if (!comTipo.error) {
    const todas = comTipo.data || [];
    const doTipo = tipo ? todas.filter(r => r.tipo === tipo) : [];


    regras = doTipo.length ? doTipo : todas.filter(r => !r.tipo);
  } else {
    console.warn('[notificar] sem a coluna tipo em notificacao_regras — usando regra por módulo:', comTipo.error.message);
    const { data } = await supabase
      .from('notificacao_regras')
      .select('profile_id')
      .eq('modulo', modulo)
      .eq('ativo', true);
    regras = data || [];
  }

  if (regras?.length) return regras.map(r => r.profile_id);




















  const comFlag = await supabase
    .from('profiles')
    .select('id, is_servico')
    .in('role', ['admin', 'diretor'])
    .eq('active', true);

  if (!comFlag.error) {
    return (comFlag.data || []).filter(a => a.is_servico !== true).map(a => a.id);
  }

  console.warn('[notificar] sem a coluna is_servico — usando o fallback antigo:', comFlag.error.message);
  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'diretor'])
    .eq('active', true);
  return (admins || []).map(a => a.id);
}





async function notificar({ modulo, tipo, titulo, mensagem, link, severidade = 'info', chaveDedup, targetIds, extraTargetIds, email = false, emailsExtra }) {
  let destinatarios = targetIds || await resolverDestinatarios(modulo, tipo);
  if (extraTargetIds?.length) {
    destinatarios = [...new Set([...(destinatarios || []), ...extraTargetIds.filter(Boolean)])];
  }
  if (!destinatarios.length) {
    console.warn(`[notificar] sem destinatarios · modulo=${modulo} · titulo="${titulo}"`);
    return 0;
  }

  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  const usersInseridos = [];
  const erros = [];





  const CHUNK = 8;
  async function processarUm(userId) {

    if (chaveDedup) {
      const { count } = await supabase
        .from('notificacoes')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', userId)
        .eq('chave_dedup', chaveDedup)
        .eq('lida', false);
      if (count > 0) return { status: 'skipped' };
    }

    const { error } = await supabase.from('notificacoes').insert({
      usuario_id: userId,
      titulo,
      mensagem,
      tipo: tipo || modulo,
      link,
      modulo,
      severidade,
      chave_dedup: chaveDedup,
      lida: false,
    });
    if (!error) return { status: 'inserted', userId };
    return { status: 'failed', erro: `${userId.slice(0, 8)}: ${error.message}` };
  }

  for (let i = 0; i < destinatarios.length; i += CHUNK) {
    const slice = destinatarios.slice(i, i + CHUNK);
    const resultados = await Promise.all(slice.map(processarUm));
    for (const r of resultados) {
      if (r.status === 'inserted') { inserted++; usersInseridos.push(r.userId); }
      else if (r.status === 'skipped') { skipped++; }
      else { failed++; erros.push(r.erro); }
    }
  }

  console.log(`[notificar] modulo=${modulo} alvos=${destinatarios.length} inseridos=${inserted} pulados=${skipped} falhas=${failed}${failed ? ' erros=' + erros.slice(0, 3).join('; ') : ''}`);


  if (usersInseridos.length) {
    enviarPushParaUsers(usersInseridos, {
      title: titulo,
      body: mensagem,
      url: link || '/',
      tag: chaveDedup || `${modulo}-${Date.now()}`,
    }).catch(e => console.warn('[notificar push]', e.message));









    pushExpoParaUsers(usersInseridos, {
      title: titulo,
      body: mensagem,
      data: { tipo: tipo || modulo, modulo, link: link || null },
      app: 'staff',
    }).catch(e => console.warn('[notificar push expo]', e.message));
  }



  if (email && (usersInseridos.length || emailsExtra?.length)) {
    enviarEmailNotificacao(usersInseridos, { titulo, mensagem, link, emailsExtra })
      .catch(e => console.warn('[notificar email bg]', e.message));
  }

  return inserted;
}

module.exports = { notificar, resolverDestinatarios };

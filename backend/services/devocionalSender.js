







const { supabase } = require('../utils/supabase');
const wpp = require('./whatsappService');

function getFrontendUrl() {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:5173';
}

function primeiroNome(nome) {
  if (!nome) return 'Ola';
  return String(nome).trim().split(/\s+/)[0];
}



async function listarDestinatarios() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, membro_id, mem_membros!inner(id, nome, telefone, active)')
    .eq('is_membro_only', true)
    .not('membro_id', 'is', null)
    .eq('mem_membros.active', true)
    .not('mem_membros.telefone', 'is', null);
  if (error) throw error;
  return (data || [])
    .filter(p => p.mem_membros?.telefone)
    .map(p => ({
      membro_id: p.membro_id,
      nome: p.mem_membros.nome,
      telefone: p.mem_membros.telefone,
    }));
}


async function buscarItemDoDia(dataAlvo) {
  const hoje = dataAlvo || new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('devocional_itens')
    .select('id, plano_id, titulo, passagem, data, devocional_planos!inner(id, titulo, ativo)')
    .eq('data', hoje)
    .eq('devocional_planos.ativo', true)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data || [])[0] || null;
}




async function enviarDoDia(opts = {}) {
  const item = opts.item || await buscarItemDoDia(opts.data);
  if (!item) {
    return { motivo: 'sem_item_hoje', enviados: 0, ja_existentes: 0, erros: 0, total: 0 };
  }

  const destinatarios = await listarDestinatarios();
  if (destinatarios.length === 0) {
    return { motivo: 'sem_destinatarios', item_id: item.id, enviados: 0, ja_existentes: 0, erros: 0, total: 0 };
  }


  const membroIds = destinatarios.map(d => d.membro_id);
  const { data: existentes } = await supabase
    .from('devocional_envios')
    .select('membro_id')
    .eq('item_id', item.id)
    .in('membro_id', membroIds);
  const jaEnviadosSet = new Set((existentes || []).map(r => r.membro_id));

  const pendentes = destinatarios.filter(d => !jaEnviadosSet.has(d.membro_id));
  const link = `${getFrontendUrl()}/devocional/hoje`;

  let enviados = 0;
  let erros = 0;
  let naFila = 0;
  const rows = [];




  const { enfileirar } = require('./whatsappFila');
  const TEMPLATE_DEVOCIONAL = process.env.WHATSAPP_TEMPLATE_DEVOCIONAL || 'devocional_diario';








  try {
    const { count: temCatalogo } = await supabase.from('wa_templates')
      .select('id', { count: 'exact', head: true });
    if ((temCatalogo || 0) > 0) {
      const { data: tpl } = await supabase.from('wa_templates')
        .select('status_meta').eq('nome', TEMPLATE_DEVOCIONAL).limit(1).maybeSingle();
      if (!tpl || String(tpl.status_meta || '').toUpperCase() !== 'APPROVED') {
        return {
          item_id: item.id, plano_id: item.plano_id,
          total: destinatarios.length, ja_existentes: jaEnviadosSet.size,
          enviados: 0, na_fila: 0, erros: 0,
          motivo: `template_nao_aprovado_na_meta (${TEMPLATE_DEVOCIONAL} · crie/aprove na Meta ou ajuste WHATSAPP_TEMPLATE_DEVOCIONAL)`,
        };
      }
    }
  } catch {                                                                     }
  for (const d of pendentes) {
    const r = await enfileirar({
      telefone: d.telefone,
      template: TEMPLATE_DEVOCIONAL,
      params: [primeiroNome(d.nome) || 'Ola', item.titulo || 'devocional do dia', link],
      contexto: 'cuidados.devocional_diario',
      refId: d.membro_id,
    });
    rows.push({
      item_id: item.id,
      plano_id: item.plano_id,
      membro_id: d.membro_id,
      telefone: d.telefone,
      canal: 'whatsapp',
      enviado: !!r.sent,
      message_id: r.messageId || null,
      motivo: r.sent ? null : (r.queued ? 'na_fila' : (r.reason || 'erro_desconhecido')),
      enviado_em: r.sent ? new Date().toISOString() : null,
    });
    if (r.sent) enviados++;
    else if (r.queued) naFila++;
    else erros++;
  }

  if (rows.length > 0) {
    const { error: insErr } = await supabase.from('devocional_envios').insert(rows);
    if (insErr) console.error('[devocionalSender] insert envios:', insErr.message);
  }

  return {
    item_id: item.id,
    plano_id: item.plano_id,
    total: destinatarios.length,
    ja_existentes: jaEnviadosSet.size,
    enviados,
    na_fila: naFila,
    erros,
    motivo: !wpp.configurado() ? 'whatsapp_desabilitado' : null,
  };
}

module.exports = { enviarDoDia, buscarItemDoDia, listarDestinatarios };

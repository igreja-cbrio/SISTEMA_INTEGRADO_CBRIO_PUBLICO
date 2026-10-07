













const { supabase } = require('../utils/supabase');
const { enviarTexto } = require('./whatsappSend');
const { flowsConfigurados, enviarFlow } = require('./whatsappFlows');

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function primeiroNome(nome) {
  return (nome || '').trim().split(/\s+/)[0] || '';
}





function pedeFormulario(texto) {
  const t = (texto || '').trim();
  if (!t) return false;
  return !/\d/.test(t);
}


function parseReply(m) {
  try {
    const raw = m?.interactive?.nfm_reply?.response_json;
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}


function tituloCulto(c) {
  if (!c) return 'o culto';
  return `${c.service_type?.name || 'Culto'} · ${c.data.split('-').reverse().slice(0, 2).join('/')}`;
}





async function enviarFormularioCulto(telefone, nome) {
  const hoje = new Date().toISOString().slice(0, 10);
  const limite = new Date(); limite.setDate(limite.getDate() - 14);
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, service_type:vol_service_types(name)')
    .gte('data', limite.toISOString().slice(0, 10)).lte('data', hoje)
    .order('data', { ascending: false })
    .limit(20);
  const opcoes = (cultos || []).map(c => ({ id: c.id, title: tituloCulto(c) }));
  if (!opcoes.length) {
    await enviarTexto(telefone, 'Não achei cultos recentes pra lançar aqui. Avisa a equipe, por favor. 🙏');
    return { ok: false, error: 'sem_cultos' };
  }
  const oi = primeiroNome(nome) ? `Oi, ${primeiroNome(nome)}! 👋 ` : 'Oi! 👋 ';
  const res = await enviarFlow(telefone, {
    flowId: process.env.WHATSAPP_FLOW_CULTO_ID,
    flowToken: 'culto',
    cta: 'Lançar culto',
    screen: 'FREQUENCIA',
    data: { cultos: opcoes },
    body: `${oi}Bora lançar o culto? Toque aqui e preencha as presenças e as decisões 👇`,
  });
  if (!res.ok) {
    console.error('[flowColeta] enviarFlow(culto) falhou:', res.error);
    await enviarTexto(telefone,
      'Não consegui abrir o formulário agora 😕. Sem problema — me manda os números por texto, '
      + 'ex: "1100 presencial, 30 kids, 12 decisões". Eu registro. 🙏');
  }
  return res;
}




async function tratarFlowReply(m, telefone, lider) {
  const token = m?.interactive?.nfm_reply?.flow_token || '';
  const resp = parseReply(m);
  if (!resp || token !== 'culto') return false;

  const freq = { presencial: numOrNull(resp.presencial), kids: numOrNull(resp.kids) };
  const dec = {
    presencial: numOrNull(resp.dec_presencial) || 0,
    online: numOrNull(resp.dec_online) || 0,
    kids: numOrNull(resp.dec_kids) || 0,
  };
  const totalDec = dec.presencial + dec.online + dec.kids;


  let cultoNome = 'o culto';
  if (resp.culto_id) {
    const { data: c } = await supabase
      .from('cultos')
      .select('data, service_type:vol_service_types(name)')
      .eq('id', resp.culto_id).maybeSingle();
    if (c) cultoNome = tituloCulto(c);
  }

  const partes = [];
  if (freq.presencial != null) partes.push(`${freq.presencial} presencial`);
  if (freq.kids != null) partes.push(`${freq.kids} kids`);
  if (totalDec) partes.push(`${totalDec} decisões`);
  const resumo = `${cultoNome}${partes.length ? ' · ' + partes.join(' · ') : ''}`;

  const parsed = {
    fonte: 'flow',
    culto_id: resp.culto_id || null,
    freq, dec,
    a_cadastrar: totalDec,
    resumo,
  };
  const { error } = await supabase.from('whatsapp_coletas').insert({
    whatsapp_message_id: m.id,
    telefone,
    lider_id: lider?.id || null,
    raw_text: 'Formulário do culto (Flow)',
    parsed,
    modulo_destino: 'integracao',
    status: 'parseado',
  });
  if (error) {
    if (error.code === '23505') return true;
    console.error('[flowColeta] insert culto', error.message);
    await enviarTexto(telefone, 'Recebi os dados, mas tive um problema ao salvar. Pode tentar de novo? 🙏');
    return true;
  }

  const oi = primeiroNome(lider?.nome_exibicao)
    ? `Recebido, ${primeiroNome(lider.nome_exibicao)}! ✅`
    : 'Recebido! ✅';
  let msg = `${oi}\n${resumo}\nJá está na fila do coordenador pra conferir e lançar.`;
  if (totalDec > 0) msg += ` As ${totalDec} pessoa(s) que decidiram são cadastradas no sistema, pelo computador.`;
  msg += ' Valeu! 🙌';
  await enviarTexto(telefone, msg);
  return true;
}

module.exports = { flowsConfigurados, pedeFormulario, enviarFormularioCulto, tratarFlowReply };

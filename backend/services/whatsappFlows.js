






const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';

function flowsConfigurados() {
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN
    && process.env.WHATSAPP_FLOW_CULTO_ID);
}

function soDigitos(raw) { return (raw || '').toString().replace(/\D+/g, ''); }



async function enviarFlow(telefone, opts) {
  const to = soDigitos(telefone);
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'flow',
      body: { text: opts.body || 'Toque pra preencher 👇' },
      ...(opts.footer ? { footer: { text: opts.footer } } : {}),
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: opts.flowToken,
          flow_id: opts.flowId,
          flow_cta: opts.cta || 'Preencher',
          flow_action: 'navigate',



          ...(process.env.WHATSAPP_FLOW_MODE === 'draft' ? { mode: 'draft' } : {}),
          flow_action_payload: {
            screen: opts.screen,
            ...(opts.data ? { data: opts.data } : {}),
          },
        },
      },
    },
  };
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = data?.error || {};

      const detalhe = err.error_data?.details || err.message || `HTTP ${resp.status}`;
      console.error('[whatsappFlows] erro Graph API:', resp.status, JSON.stringify(data));
      return { ok: false, error: detalhe, code: err.code, status: resp.status };
    }
    return { ok: true, message_id: data?.messages?.[0]?.id || null };
  } catch (e) {
    console.error('[whatsappFlows] excecao:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { flowsConfigurados, enviarFlow };

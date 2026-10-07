











const { getGraphToken } = require('./storageService');
const { nomeDeExibicao, remetenteResend } = require('../utils/remetenteEmail');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function graphConfigurado() {
  return !!(
    process.env.MICROSOFT_TENANT_ID &&
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET
  );
}

function resendConfigurado() {
  return !!process.env.RESEND_API_KEY;
}

function isConfigured() {
  return graphConfigurado() || resendConfigurado();
}

function remetenteGraph() {
  return process.env.GRAPH_MAIL_SENDER || process.env.MERGE_MAIL_SENDER || 'noreply@cbrio.org';
}








const TETO_ANEXOS_BYTES = 3 * 1024 * 1024;

function anexosDentroDoTeto(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) return [];
  const ok = [];
  let total = 0;
  for (const a of attachments) {
    if (!a || !a.base64 || !a.nome) continue;
    total += a.base64.length;
    if (total > TETO_ANEXOS_BYTES) {
      console.warn(`[email] anexo "${a.nome}" descartado (estourou o teto de anexos do e-mail)`);
      continue;
    }
    ok.push(a);
  }
  return ok;
}

async function enviarViaGraph({ to, subject, html, text, from, fromName, attachments }) {
  const sender = from || remetenteGraph();
  const recipients = (Array.isArray(to) ? to : [to])
    .filter(Boolean)
    .map(address => ({ emailAddress: { address } }));
  const anexos = anexosDentroDoTeto(attachments);
  const body = JSON.stringify({
    message: {
      subject: String(subject || '(sem assunto)'),
      body: { contentType: html ? 'HTML' : 'Text', content: html || text || '' },
      toRecipients: recipients,




      from: { emailAddress: { address: sender, name: nomeDeExibicao(fromName) } },
      ...(anexos.length ? {
        attachments: anexos.map(a => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: String(a.nome).slice(0, 200),
          contentType: a.tipo || 'application/octet-stream',
          contentBytes: a.base64,
        })),
      } : {}),
    },
    saveToSentItems: true,
  });
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`;




  const TENTATIVAS = 3;
  let ultimoErro = 'Graph falhou';
  for (let n = 1; n <= TENTATIVAS; n += 1) {
    try {
      const token = await getGraphToken();
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body,
      });
      if (resp.status === 202) return { ok: true };
      const txt = await resp.text().catch(() => '');
      ultimoErro = `Graph HTTP ${resp.status}`;
      console.error('[email] Graph sendMail falhou', resp.status, txt.slice(0, 300), `(tentativa ${n}/${TENTATIVAS})`);

      if (resp.status !== 429 && resp.status < 500) return { ok: false, error: ultimoErro };
    } catch (e) {
      ultimoErro = e.message || 'exceção Graph';
      console.error('[email] Graph exceção', ultimoErro, `(tentativa ${n}/${TENTATIVAS})`);
    }
    if (n < TENTATIVAS) await sleep(1500 * n);
  }
  return { ok: false, error: ultimoErro };
}

async function enviarViaResend({ to, subject, html, text, from, fromName, attachments }) {
  const key = process.env.RESEND_API_KEY;



  const remetente = from
    || remetenteResend(process.env.RESEND_FROM || (process.env.CBRIO_PRIVATE_4E69D735BAAF || 'unconfigured@example.invalid'), fromName);
  const anexos = anexosDentroDoTeto(attachments);
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remetente,
        to: Array.isArray(to) ? to : [to],
        subject: String(subject || '(sem assunto)'),
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
        ...(anexos.length ? {
          attachments: anexos.map(a => ({ filename: String(a.nome).slice(0, 200), content: a.base64 })),
        } : {}),
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[email] Resend erro', resp.status, JSON.stringify(data));
      return { ok: false, error: data?.message || `HTTP ${resp.status}` };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    console.error('[email] Resend exceção', e.message);
    return { ok: false, error: e.message };
  }
}

async function enviarEmail({ to, subject, html, text, from, fromName, attachments } = {}) {
  if (!to || (Array.isArray(to) && !to.length)) return { ok: false, error: 'destinatário ausente' };







  const resendFallbackAtivo = resendConfigurado() && process.env.RESEND_FALLBACK === '1';

  if (graphConfigurado()) {
    const r = await enviarViaGraph({ to, subject, html, text, from, fromName, attachments });
    if (r.ok) return r;
    if (resendFallbackAtivo) return enviarViaResend({ to, subject, html, text, from, fromName, attachments });
    return r;
  }

  if (resendConfigurado()) return enviarViaResend({ to, subject, html, text, from, fromName, attachments });
  return { ok: false, error: 'nenhum canal de e-mail configurado (MICROSOFT_* ou RESEND_API_KEY)' };
}

module.exports = { enviarEmail, isConfigured };






















const { supabase } = require('./supabase');
const { enviarEmail } = require('../services/email');

function corpo({ nome, link, chamada, textoBotao, rodape }) {
  const ola = nome ? `Olá, ${nome}!` : 'Olá!';
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
    <p style="font-size:16px">${ola}</p>
    <p style="font-size:15px;line-height:1.5">${chamada}</p>
    <p style="margin:28px 0">
      <a href="${link}" style="background:#00B39D;color:#fff;text-decoration:none;padding:13px 22px;border-radius:8px;font-size:15px;font-weight:bold;display:inline-block">${textoBotao}</a>
    </p>
    <p style="font-size:13px;color:#6b7280;line-height:1.5">
      Se o botão não abrir, copie e cole este endereço no navegador:<br>
      <span style="word-break:break-all">${link}</span>
    </p>
    <p style="font-size:13px;color:#6b7280;line-height:1.5">${rodape}</p>
    <p style="font-size:12px;color:#9ca3af;margin-top:28px">Comunidade Batista do Rio</p>
  </div>`;
  const text = `${ola}\n\n${chamada}\n\n${link}\n\n${rodape}\n\nComunidade Batista do Rio`;
  return { html, text };
}









async function enviarLinkDeAcesso({ email, redirectTo, nome, assunto, chamada, textoBotao, rodape, tag }) {
  const marca = tag ? `[${tag}]` : '[magicLink]';
  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    });
    if (error) {
      console.error(`${marca} generateLink:`, error.message);
      return { ok: false, motivo: 'gerar' };
    }
    const link = data?.properties?.action_link;
    if (!link) {


      console.error(`${marca} generateLink sem action_link — contrato do GoTrue mudou`);
      return { ok: false, motivo: 'sem_link' };
    }
    const { html, text } = corpo({ nome, link, chamada, textoBotao, rodape });
    const envio = await enviarEmail({ to: email, subject: assunto, html, text });
    if (!envio?.ok) {

      console.error(`${marca} e-mail NÃO saiu:`, envio?.motivo || envio?.error || 'canal indisponível');
      return { ok: false, motivo: 'envio' };
    }
    return { ok: true };
  } catch (e) {
    console.error(`${marca} falha inesperada:`, e.message);
    return { ok: false, motivo: 'excecao' };
  }
}

module.exports = { enviarLinkDeAcesso };

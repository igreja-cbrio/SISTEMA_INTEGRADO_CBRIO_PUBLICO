



















function destinatarioDaInscricao(insc, membro) {
  const cand = [insc && insc.email, membro && membro.email];
  for (const c of cand) {
    const e = String(c || '').trim().toLowerCase();


    if (e.length >= 6 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return e;
  }
  return null;
}






function tokenConfereComInscricao(token, inscricaoId, verificar) {
  if (!token || !inscricaoId || typeof verificar !== 'function') return false;
  let id = null;
  try { id = verificar(token); } catch { return false; }
  if (!id) return false;
  return String(id).toLowerCase() === String(inscricaoId).toLowerCase();
}

function escapar(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}


function montarAviso({ inscricao, evento, link, quando }) {
  const nome = String(inscricao?.nome_completo || '').trim();
  const ev = String(evento?.nome || 'o evento').trim();
  const num = inscricao?.numero_sorte;
  const temNumero = evento?.tem_sorteio && num != null;

  const subject = nome ? `${ev} · comprovante de ${nome}` : `${ev} · seu comprovante`;

  const blocoNumero = temNumero ? `
    <div style="margin:22px 0;text-align:center">
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280">Seu número da sorte</div>
      <div style="font-size:38px;font-weight:800;color:#00B39D;line-height:1.1">${escapar(num)}</div>
    </div>` : '';

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;color:#111827">
    <p style="font-size:16px">Olá, ${escapar(primeiroNome(nome) || 'tudo bem')}!</p>
    <p style="font-size:15px;line-height:1.6">
      Este é o <strong>seu</strong> comprovante de <strong>${escapar(ev)}</strong>${quando ? ` — ${escapar(quando)}` : ''}.
      Apresente o QR na entrada.
    </p>
    <p style="font-size:13px;color:#6b7280;line-height:1.6">
      O QR está no anexo desta mensagem e também abre no link abaixo.
      Ele é pessoal: vale para <strong>${escapar(nome)}</strong>.
    </p>
    ${blocoNumero}
    <p style="text-align:center;margin:26px 0">
      <a href="${escapar(link)}" style="background:#00B39D;color:#fff;text-decoration:none;padding:13px 22px;border-radius:10px;font-weight:700;display:inline-block">Abrir meu comprovante</a>
    </p>
    <p style="font-size:12px;color:#9ca3af;line-height:1.6">
      Se o botão não abrir, copie e cole: ${escapar(link)}
    </p>
  </div>`;

  const text = [
    `Ola, ${primeiroNome(nome) || ''}!`.trim(),
    ``,
    `Este e o SEU comprovante de ${ev}${quando ? ` - ${quando}` : ''}. Apresente o QR na entrada.`,
    `Ele e pessoal: vale para ${nome}.`,
    temNumero ? `` : null,
    temNumero ? `Seu numero da sorte: ${num}` : null,
    ``,
    `Abrir o comprovante: ${link}`,
  ].filter(l => l !== null).join('\n');

  return { subject, html, text };
}

module.exports = { destinatarioDaInscricao, tokenConfereComInscricao, montarAviso, primeiroNome };

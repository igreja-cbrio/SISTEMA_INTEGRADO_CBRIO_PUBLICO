








export const PEDACO_BYTES = 10 * 1024 * 1024;

export async function enviarParaSharePoint({ uploadUrl, arquivo, onProgresso, fetchImpl = fetch }) {
  const total = arquivo.size;
  let enviado = 0;
  let resposta = null;
  while (enviado < total) {
    const fim = Math.min(enviado + PEDACO_BYTES, total);
    const r = await fetchImpl(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes ${enviado}-${fim - 1}/${total}` },
      body: arquivo.slice(enviado, fim),
    });
    if (!r.ok) {
      throw new Error(`O SharePoint recusou o envio (${r.status}). Tente de novo.`);
    }
    enviado = fim;
    onProgresso?.(Math.round((enviado / total) * 100));

    if (r.status === 200 || r.status === 201) resposta = await r.json();
  }
  if (!resposta || !resposta.id) throw new Error('O SharePoint não confirmou o arquivo. Tente de novo.');
  return resposta;
}

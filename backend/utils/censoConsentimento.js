



























const TIPOS_CONSENTIMENTO = Object.freeze(['whatsapp', 'imagem', 'termos_lgpd']);

function chave(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}









function tipoDeConsentimento(pergunta) {
  if (!pergunta || String(pergunta.acao || '').trim() !== 'consentimento') return null;
  const t = String(pergunta.consentimento_tipo || '').trim();
  return TIPOS_CONSENTIMENTO.includes(t) ? t : null;
}












function interpretarResposta(valor) {

  const bruto = Array.isArray(valor) ? valor[0] : valor;
  if (bruto === true) return true;
  if (bruto === false) return false;

  const s = chave(bruto);
  if (!s) return null;


  if (/(^| )(nao|nunca|recuso|discordo)( |$)/.test(s)) return false;
  if (/(^| )(sim|autorizo|aceito|concordo|permito|quero)( |$)/.test(s)) return true;
  return null;
}








function textoDaProva(pergunta) {
  const partes = [
    String(pergunta?.texto || '').trim(),
    String(pergunta?.descricao || '').trim(),
  ].filter(Boolean);
  return partes.join(' — ').slice(0, 2000);
}








function consentimentosDaResposta(perguntas, respostas) {
  const consentimentos = [];
  const indefinidos = [];
  const vistos = new Set();

  for (const p of perguntas || []) {
    const tipo = tipoDeConsentimento(p);
    if (!tipo) continue;



    if (vistos.has(tipo)) continue;
    vistos.add(tipo);

    const aceito = interpretarResposta(respostas?.[p.id]);
    if (aceito === null) { indefinidos.push({ tipo, pergunta_id: p.id }); continue; }
    consentimentos.push({ tipo, aceito, texto: textoDaProva(p) });
  }

  return { consentimentos, indefinidos };
}











function patchDoCadastro(consentimentos, em = null) {
  const wpp = (consentimentos || []).find((c) => c.tipo === 'whatsapp');
  if (!wpp || wpp.aceito !== true) return null;
  const patch = { whatsapp_optin: true };



  if (em) patch.whatsapp_optin_em = em;
  return patch;
}

module.exports = {
  TIPOS_CONSENTIMENTO,
  tipoDeConsentimento,
  interpretarResposta,
  textoDaProva,
  consentimentosDaResposta,
  patchDoCadastro,
};

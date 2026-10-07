





















const GENERICA = 'respondido pela rota (sem exceção · ver logs da função)';



const EH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;








function sanitizarMotivo(valor, tetoChars = 1200) {
  return String(valor == null ? '' : valor)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[cpf]')
    .replace(/\b\d{11}\b/g, '[cpf]')







    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, (m) => (EH_UUID.test(m) ? m : '[segredo]'))
    .replace(/\b\d{12,}\b/g, '[numero]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, tetoChars);
}










function montarMensagemFalha({ status, motivo, codigo, tetoChars } = {}) {
  const st = Number(status) || 500;
  const limpo = sanitizarMotivo(motivo, tetoChars);
  if (!limpo) return `HTTP ${st} ${GENERICA}`;
  const cod = String(codigo || '').trim();
  return `HTTP ${st}: ${cod ? `[${sanitizarMotivo(cod, 40)}] ` : ''}${limpo}`;
}








function motivoDeErroPostgrest(corpo) {
  if (!corpo || typeof corpo !== 'object') return '';
  const partes = [corpo.message, corpo.details, corpo.hint]
    .map((x) => String(x == null ? '' : x).trim())
    .filter(Boolean);
  return [...new Set(partes)].join(' · ');
}

module.exports = {
  GENERICA,
  sanitizarMotivo,
  montarMensagemFalha,
  motivoDeErroPostgrest,
};

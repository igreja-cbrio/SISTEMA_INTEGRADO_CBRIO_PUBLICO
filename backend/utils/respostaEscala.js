































function _norm(v) {
  return String(v || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}


















const NEGACAO_INICIO = /^(?:infelizmente|desculpa|desculpe|oi|ola|bom dia|boa tarde|boa noite)?[\s,.!]*\b(?:nao|n|nunca)\b[\s,.!]*(?:vou|posso|consigo|conseguirei|poderei|irei|estarei|dara|darei|vai dar|da pra|da)?\b/;


const ENCHIMENTO = new Set([
  '', 'poder', 'ir', 'comparecer', 'servir', 'estar', 'dar', 'conseguir', 'vir',
  'hoje', 'amanha', 'domingo', 'sabado', 'quarta', 'nesse', 'neste', 'nessa',
  'nesta', 'dessa', 'desta', 'vez', 'culto', 'semana', 'dia', 'no', 'na', 'de',
  'do', 'da', 'pra', 'para', 'a', 'o', 'que', 'mas', 'infelizmente', 'desculpa',
  'desculpe', 'obrigado', 'obrigada', 'sinto', 'muito', 'agora', 'esse', 'este',
  'e', 'eu', 'me', 'mim', 'ainda', 'oi', 'ola', 'bom', 'boa', 'tarde', 'noite',
  'graca', 'deus', 'abraco', 'bjs', 'bj', 'valeu', 'ok',
]);




const CANCELAMENTO = /\b(cancelar|desmarcar|negativo)\b/;

const AFIRMACAO = /\b(vou|confirmo|confirmar|confirmado|sim|ok|okay|blz|beleza|certo|estarei|irei|posso|consigo|contar comigo|presente|to dentro|tou dentro|estou dentro)\b/;








function ehNegacaoInteira(t) {
  if (CANCELAMENTO.test(t)) return true;
  const m = NEGACAO_INICIO.exec(t);
  if (!m) return false;
  const resto = t.slice(m[0].length).replace(/[.,!?;:]/g, ' ');
  return resto.split(/\s+/).every((w) => ENCHIMENTO.has(w));
}




function interpretarRespostaEscala(bruto) {
  const t = _norm(bruto);
  if (!t) return null;


  if (/^2[.\)]?$/.test(t)) return 'declined';
  if (/^1[.\)]?$/.test(t)) return 'confirmed';

  if (ehNegacaoInteira(t)) return 'declined';
  if (AFIRMACAO.test(t)) return 'confirmed';
  return null;
}


function textoDaResposta(m) {
  if (!m) return '';
  if (m.type === 'button') return m.button?.text || m.button?.payload || '';
  if (m.type === 'interactive') {
    return m.interactive?.button_reply?.title
      || m.interactive?.button_reply?.id
      || m.interactive?.list_reply?.title
      || '';
  }
  return m.text?.body || '';
}








function wamidRespondido(m) {
  return m?.context?.id || null;
}

module.exports = {
  ehNegacaoInteira, interpretarRespostaEscala, textoDaResposta, wamidRespondido };

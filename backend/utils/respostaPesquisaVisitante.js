

































const BOTOES_TEXTO = [
  { nota: 3, rotulo: 'Amei o culto, me senti em casa' },
  { nota: 2, rotulo: 'Eu gostei, o culto foi bom' },
  { nota: 1, rotulo: 'Não gostei, poderia ser melhor' },
];


const NOTA_MAX = 3;

function _norm(v) {
  return String(v || '').trim().toLowerCase();
}

function _semAcento(v) {
  return String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}


function rotuloDaNota(nota) {
  const b = BOTOES_TEXTO.find((x) => x.nota === Number(nota));
  return b ? b.rotulo : null;
}









function interpretarNotaVisitante(bruto) {
  const t = _norm(bruto);
  if (!t) return null;



  const alvo = _semAcento(t);
  for (const b of BOTOES_TEXTO) {
    if (_semAcento(_norm(b.rotulo)) === alvo) return b.nota;
  }

  const estrelas = (t.match(/[⭐★]/gu) || []).length;
  if (estrelas && t.replace(/[⭐★\s]/gu, '') === '') return estrelas >= 1 && estrelas <= NOTA_MAX ? estrelas : null;

  const m = /^(?:nota\s*)?([1-3])(?:\s*[.)·\-–:]\s*[a-záéíóúãõâêôç ]{0,20}|\s*estrelas?)?$/u.exec(t);
  return m ? Number(m[1]) : null;
}


function ehComentario(bruto) {
  const t = String(bruto || '').trim();
  if (t.length < 2) return false;
  if (interpretarNotaVisitante(t) != null) return false;
  return /[a-záéíóúãõâêôç]/iu.test(t);
}


const CONVITE_FEEDBACK = 'Caso tenha mais algum feedback, pode digitar aqui na mensagem — a gente lê tudo, ainda hoje.';

const CONVITE_O_QUE_FALTOU = 'Conta pra gente o que faltou? É só digitar aqui na mensagem — a gente lê e leva pra equipe, ainda hoje.';
















function textoObrigado(primeiroNome, nota) {
  const nome = String(primeiroNome || '').trim() || 'obrigado';
  if (nota === 1) {
    return `Obrigado pela sinceridade, ${nome} 🙏 Sentimos muito que a visita não tenha sido o que você esperava. ${CONVITE_O_QUE_FALTOU}`;
  }
  const voto = rotuloDaNota(nota);
  const eco = voto ? ` Você marcou “${voto}”.` : '';
  if (nota >= 3) return `Que alegria, ${nome}! 💚${eco} ${CONVITE_FEEDBACK}`;
  if (nota === 2) return `Que bom, ${nome}! 💚${eco} ${CONVITE_FEEDBACK}`;

  return `Obrigado por responder, ${nome}! 💚 ${CONVITE_FEEDBACK}`;
}










function textoComentarioRecebido(primeiroNome, nota) {
  const nome = String(primeiroNome || '').trim() || 'obrigado';
  if (nota === 1) {
    return `Recebi, ${nome}. Obrigado por confiar e contar 🙏 Vou levar isso pra equipe que recebe quem chega — é assim que a gente melhora.`;
  }
  return `Anotado, ${nome}. Obrigado de coração 💚 Esperamos te ver de novo!`;
}











function interpretarRespostaFlowVisitante(responseJson) {
  let obj = responseJson;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  const n = Number(obj.nota);
  if (!Number.isInteger(n) || n < 1 || n > NOTA_MAX) return null;
  const c = String(obj.comentario ?? '').trim().slice(0, 1000);
  return { nota: n, comentario: c || null };
}





module.exports = {
  BOTOES_TEXTO, NOTA_MAX, CONVITE_FEEDBACK, CONVITE_O_QUE_FALTOU, rotuloDaNota,
  interpretarNotaVisitante, ehComentario, textoObrigado, textoComentarioRecebido,
  interpretarRespostaFlowVisitante,
};

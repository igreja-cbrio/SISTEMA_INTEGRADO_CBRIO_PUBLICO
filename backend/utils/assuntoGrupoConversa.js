





























function normalizar(t) {
  return String(t || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}





const JA_RESOLVEU = /\b(ja (consegui|recebi|entrei|achei|to no|estou no)|consegui (o |a )?(link|acesso|entrar)|recebi (o |a )?link|obrigad[oa] pelo link)\b/;


const PEDE_LINK = [
  /\blink\b/,
  /\bcade\b.*\b(link|reuniao|encontro)\b/,
  /\bcomo (eu )?(faco|entro|participo|acesso)\b/,
  /\b(devo|posso|preciso) (fazer contato|falar|chamar|procurar)\b.*\b(lider|liderança|lideranca)\b/,
  /\b(entrar|acesso) (na|no) (reuniao|encontro|grupo|sala)\b/,
];


const PEDE_AGENDA = [
  /\bquando\b/,
  /\b(que|qual) (dia|horario|hora)\b/,




  /\b(comec|inici)/,
  /\be hoje\b/,
  /\bhoje tem\b/,
  /\btudo (certo|ok)\b.*\bhoje\b/,
  /\bsemana que vem\b/,
];

function casaAlguma(texto, lista) {
  return lista.some((re) => re.test(texto));
}











function assuntoDaMensagem(texto) {
  const t = normalizar(texto);
  if (!t) return null;
  if (JA_RESOLVEU.test(t)) return null;
  if (casaAlguma(t, PEDE_LINK)) return 'link';
  if (casaAlguma(t, PEDE_AGENDA)) return 'agenda';
  return null;
}

module.exports = { assuntoDaMensagem, normalizar };

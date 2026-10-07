



















const AGRADECER = new Set([
  'obrigado', 'obrigada', 'obrigadao', 'obrigadinha', 'obg', 'obgda', 'obgd',
  'vlw', 'valeu', 'agradeco', 'agradecida', 'agradecido', 'agradecemos',
  'gratidao', 'grata', 'grato', 'gratos',
  'amem', 'gloria', 'aleluia', 'abencoe', 'abencoado', 'abencoada', 'deus',
]);


const CIENTE = new Set([
  'ok', 'okay', 'certo', 'certinho', 'entendi', 'ciente', 'beleza', 'blz',
  'tmj', 'perfeito', 'otimo', 'otima', 'maravilha', 'combinado', 'isso',
]);







const SAUDACAO = new Set([
  'oi', 'ola', 'ei', 'eai', 'bom', 'boa', 'dia', 'tarde', 'noite', 'pessoal',
  'irmaos', 'irmao', 'irma', 'gente', 'querida', 'querido',
]);


const LIGACAO = new Set([
  'muito', 'mto', 'muinto', 'por', 'pela', 'pelo', 'pelos', 'pelas', 'tudo',
  'de', 'da', 'do', 'a', 'o', 'e', 'ai', 'entao', 'ta', 'sim', 'ja', 'mesmo',
  'demais', 'viu', 'ne', 'que', 'voce', 'vc', 'vcs', 'tb', 'tbm', 'tambem',
  'nos', 'me', 'mim', 'sua', 'seu', 'atencao', 'carinho', 'retorno', 'resposta',
]);


const EMOJI_GRATO = /[\u{1F64F}\u{2764}\u{1F970}\u{1F60A}\u{1F44D}\u{1F495}\u{1F49B}\u{1F49A}\u{1F499}\u{1F49C}\u{263A}\u{1F642}\u{1F607}\u{1F917}\u{1F44F}\u{2728}\u{1F525}]/u;


function normalizar(t) {
  return String(t || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}















function ehSoAgradecimento(texto) {
  const bruto = String(texto || '').trim();
  if (!bruto) return false;
  if (bruto.length > 60) return false;
  if (/[?¿]/.test(bruto)) return false;

  const norm = normalizar(bruto);

  const palavras = norm.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);



  if (!palavras.length) return EMOJI_GRATO.test(bruto);


  if (palavras.some((p) => /^\d+$/.test(p))) return false;

  let temNucleo = false;
  for (const p of palavras) {
    const ehAgradecer = AGRADECER.has(p);
    const ehCiente = CIENTE.has(p);
    if (ehAgradecer || ehCiente) { temNucleo = true; continue; }
    if (SAUDACAO.has(p) || LIGACAO.has(p)) continue;
    return false;
  }
  return temNucleo;
}

module.exports = { ehSoAgradecimento, AGRADECER, CIENTE, SAUDACAO };





























const EXT_IMAGEM = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'heic', 'heif']);


function semQuery(url) {
  return String(url || '').trim().split('?')[0].split('#')[0].replace(/\/+$/, '');
}


function ultimoSegmento(url) {
  let limpo = semQuery(url);
  if (!limpo) return '';



  const abs = limpo.match(/^https?:\/\/[^/]+(\/.*)?$/i);
  if (abs) limpo = (abs[1] || '').replace(/^\/+/, '');
  if (!limpo) return '';
  const bruto = limpo.split('/').pop() || '';
  try {
    return decodeURIComponent(bruto);
  } catch {
    return bruto;
  }
}


function extensaoDe(url) {
  const nome = ultimoSegmento(url);
  const i = nome.lastIndexOf('.');
  if (i <= 0 || i === nome.length - 1) return '';
  return nome.slice(i + 1).toLowerCase();
}








export function ehImagem(url) {
  return EXT_IMAGEM.has(extensaoDe(url));
}









export function nomeDoArquivo(url) {
  const nome = ultimoSegmento(url);
  if (!nome) return 'arquivo';

  const semPrefixo = nome.replace(/^\d{10,}-[a-z0-9]{4,}-/i, '');
  return (semPrefixo || nome).slice(0, 80);
}





export function rotuloTipo(url) {
  const ext = extensaoDe(url);
  return ext ? ext.toUpperCase().slice(0, 5) : 'ARQUIVO';
}









export const MAX_ANEXOS = 5;






export const LIMITE_ARQUIVO_MB = 10;
const LIMITE_BYTES = LIMITE_ARQUIVO_MB * 1024 * 1024;


const EXT_ACEITAS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp']);
export const ACCEPT_ANEXOS = '.pdf,.jpg,.jpeg,.png,.webp';











export function validarAnexos(arquivos, opcoes) {
  const lista = Array.isArray(arquivos) ? arquivos.filter(Boolean) : [];





  const maxPedido = opcoes ? opcoes.max : undefined;
  const max = typeof maxPedido === 'number' && !Number.isNaN(maxPedido) && maxPedido > 0
    ? maxPedido
    : MAX_ANEXOS;
  if (lista.length > max) {
    return { ok: false, erro: `Máximo de ${max} anexos por solicitação (você escolheu ${lista.length}).` };
  }
  for (const f of lista) {
    const nome = String(f?.name || 'arquivo');
    const ext = nome.includes('.') ? nome.split('.').pop().toLowerCase() : '';
    if (!EXT_ACEITAS.has(ext)) {
      return { ok: false, erro: `"${nome}": formato não aceito. Envie PDF, JPG, PNG ou WEBP.` };
    }



    if (Number.isFinite(f?.size) && f.size > LIMITE_BYTES) {
      const mb = (f.size / 1024 / 1024).toFixed(1);
      return { ok: false, erro: `"${nome}" tem ${mb} MB — o limite é ${LIMITE_ARQUIVO_MB} MB por arquivo.` };
    }
  }
  return { ok: true, erro: null };
}






export function sanitizarNome(nome) {
  const bruto = String(nome || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const limpo = bruto
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+/, '')
    .toLowerCase();
  return limpo.slice(0, 60) || 'arquivo';
}










export function caminhoDeUpload(pasta, nome, agoraMs, aleatorio) {
  const ts = Number.isFinite(agoraMs) ? agoraMs : Date.now();
  const rnd = aleatorio || Math.random().toString(36).slice(2, 8);
  return `${pasta}/${ts}-${rnd}-${sanitizarNome(nome)}`;
}

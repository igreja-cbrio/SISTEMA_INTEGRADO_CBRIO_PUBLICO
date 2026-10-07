














const crypto = require('crypto');

const TETO_BYTES = 10 * 1024 * 1024;


function tipoPelosBytes(buf) {
  if (!buf || buf.length < 12) return null;
  const b = buf;

  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return { mime: 'application/pdf', ext: 'pdf' };

  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };

  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', ext: 'png' };

  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };

  if (b.toString('ascii', 4, 8) === 'ftyp') {
    const marca = b.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(marca)) return { mime: 'image/heic', ext: 'heic' };
  }
  return null;
}



function validarArquivoComprovante(arquivo, { tetoBytes = TETO_BYTES } = {}) {
  if (!arquivo || !arquivo.buffer || !arquivo.buffer.length) {
    return { ok: false, erro: 'Arquivo vazio.' };
  }
  if (arquivo.buffer.length > tetoBytes) {
    return { ok: false, erro: `Arquivo maior que ${Math.round(tetoBytes / 1024 / 1024)} MB.` };
  }
  const tipo = tipoPelosBytes(arquivo.buffer);
  if (!tipo) {
    return { ok: false, erro: 'O arquivo não é um PDF ou uma imagem válida (JPG, PNG, WEBP, HEIC).' };
  }
  return {
    ok: true,
    mime: tipo.mime,
    ext: tipo.ext,
    tamanho: arquivo.buffer.length,
    sha256: crypto.createHash('sha256').update(arquivo.buffer).digest('hex'),
  };
}



function nomeExibicao(original, ext) {
  const base = String(original || '').split(/[\\/]/).pop() || '';
  const limpo = base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
  return limpo || `comprovante.${ext || 'pdf'}`;
}



function caminhoNoBucket(origemTipo, origemId, ext) {
  const tipo = String(origemTipo || '').replace(/[^a-z_]/g, '');
  const id = String(origemId || '').replace(/[^0-9a-fA-F-]/g, '');
  if (!tipo || !id) throw new Error('caminhoNoBucket: origem inválida');
  return `${tipo}/${id}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
}

module.exports = {
  TETO_BYTES,
  tipoPelosBytes,
  validarArquivoComprovante,
  nomeExibicao,
  caminhoNoBucket,
};

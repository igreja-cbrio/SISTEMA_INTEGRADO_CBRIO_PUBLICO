






















const { IMAGE_TYPES } = require('./textExtractor');


function semConteudoUtil(texto) {
  const t = String(texto || '');

  return t === '[IMAGEM]' || t.startsWith('[') || t.trim().length < 50;
}




function montarEnvioHaiku({ mimeType, texto, base64, prompt }) {

  if (IMAGE_TYPES.includes(mimeType)) {
    return {
      modo: 'imagem',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: prompt },
      ],
    };
  }

  if (semConteudoUtil(texto)) {


    if (mimeType === 'application/pdf') {
      return {
        modo: 'documento',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: prompt },
        ],
      };
    }


    return { modo: 'ignorar', motivo: `Sem conteúdo extraível (${mimeType})` };
  }

  return { modo: 'texto', content: prompt + '\n\nConteudo:\n---\n' + texto + '\n---' };
}

module.exports = { montarEnvioHaiku, semConteudoUtil };
